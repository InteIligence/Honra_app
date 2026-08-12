// HONRA — Contrato-convite (Fatia C-1): WEBHOOK das contas Connect.
//
// PORQUÊ um endpoint PRÓPRIO (e não estender o stripe-webhook): os eventos das
// contas LIGADAS (Connect) chegam por um endpoint de webhook Connect separado,
// com um segredo de assinatura PRÓPRIO (STRIPE_CONNECT_WEBHOOK_SECRET). Misturá-
// los com o webhook da plataforma (STRIPE_WEBHOOK_SECRET) partiria a verificação
// de assinatura. Ver DESENHO-CONTRATO-CONVITE.md §7.3 e §9.
//
// O QUE OUVE (nesta fatia): `account.updated`. Quando P avança/conclui o
// onboarding Express, a Stripe manda este evento com a Account atualizada.
// Atualizamos `contas_connect`:
//   • charges_enabled / payouts_enabled (as capabilities reais)
//   • estado: 'ativa' (charges_enabled) | 'restrita' (rejeitada/desativada) |
//     'pendente' (ainda a decorrer)
//   • detalhes_em_falta: os requirements que a Stripe ainda espera (para o ecrã
//     de P mostrar "faltam estes dados" com honestidade)
//
// O charges_enabled = true é o GATE dos níveis ii/iii do contrato-convite
// (pode_nivel_protecao_avancado na migração 035).
//
// A assinatura de eventos Connect valida-se com STRIPE_CONNECT_WEBHOOK_SECRET; o
// id da conta ligada vem em `event.account`. Deploy com --no-verify-jwt
// (é a Stripe que chama; protege-se pela assinatura).

import Stripe from 'https://esm.sh/stripe@16?target=deno';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? 'sk_placeholder', {
  apiVersion: '2024-06-20',
});

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Deriva o estado do onboarding a partir da Account da Stripe.
function derivarEstado(acct: Stripe.Account): 'ativa' | 'restrita' | 'pendente' {
  if (acct.charges_enabled) return 'ativa';
  const motivo = acct.requirements?.disabled_reason ?? '';
  // Rejeição/revisão/atraso grave → restrita (a app diz a P o que aconteceu).
  if (/^rejected/.test(motivo) || motivo === 'requirements.past_due' || motivo === 'under_review') {
    return 'restrita';
  }
  return 'pendente';
}

Deno.serve(async (req) => {
  const segredo = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET');
  if (!segredo) {
    // Dependência de dashboard: o endpoint de webhook Connect ainda não foi
    // criado/ligado. Honesto — não finge que processou.
    return new Response('STRIPE_CONNECT_WEBHOOK_SECRET em falta', { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  // Confirmar que é MESMO a Stripe (assinatura do endpoint Connect).
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, segredo);
  } catch (err) {
    return new Response(`assinatura inválida: ${(err as Error).message}`, { status: 400 });
  }

  if (event.type === 'account.updated') {
    const acct = event.data.object as Stripe.Account;
    // O id da conta ligada: no evento Connect vem em event.account; acct.id é o
    // mesmo. Preferimos event.account (é o canónico do evento Connect).
    const accountId = event.account ?? acct.id;
    if (accountId) {
      // CONTAS V2 (migração 038): as contas criadas via /v2/core/accounts
      // TAMBÉM emitem `account.updated` v1 para este destino (emissão dupla,
      // provada ao vivo 16/07/2026) — mas a autoridade sobre estado/detalhes
      // delas é o connect-webhook-v2 (thin events, semântica v2: nascem com
      // requirements past_due e isso NÃO é 'restrita'). Aqui só se aproveitam
      // os booleanos do snapshot v1 (cinto-e-suspensórios: o gate ii/iii
      // acende mesmo que o event destination v2 ainda não exista) — nunca se
      // escreve 'restrita'/detalhes com semântica v1 numa linha v2.
      const { data: linha } = await admin
        .from('contas_connect')
        .select('api_versao')
        .eq('stripe_account_id', accountId)
        .maybeSingle();
      if (linha?.api_versao === 'v2') {
        const upd: Record<string, unknown> = {
          charges_enabled: !!acct.charges_enabled,
          payouts_enabled: !!acct.payouts_enabled,
        };
        if (acct.charges_enabled) upd.estado = 'ativa';
        await admin.from('contas_connect').update(upd).eq('stripe_account_id', accountId);
        return new Response('ok (conta v2 — booleanos)', { status: 200 });
      }
      const estado = derivarEstado(acct);
      const req_ = acct.requirements;
      const detalhes = {
        currently_due: req_?.currently_due ?? [],
        eventually_due: req_?.eventually_due ?? [],
        past_due: req_?.past_due ?? [],
        disabled_reason: req_?.disabled_reason ?? null,
      };
      await admin
        .from('contas_connect')
        .update({
          charges_enabled: !!acct.charges_enabled,
          payouts_enabled: !!acct.payouts_enabled,
          estado,
          detalhes_em_falta: detalhes,
        })
        .eq('stripe_account_id', accountId);
      // Se não houver linha com este account_id, o update não afeta nada — é
      // idempotente e seguro (nunca criamos aqui: a linha nasce no onboarding).
    }
  }

  return new Response('ok', { status: 200 });
});
