// HONRA — Contrato-convite: WEBHOOK das contas Connect criadas via ACCOUNTS V2.
//
// PORQUÊ um endpoint PRÓPRIO (e não estender o connect-webhook):
//   • As contas v2 (POST /v2/core/accounts) NÃO emitem o `account.updated` v1
//     para o event destination de "Contas conectadas" — emitem THIN EVENTS
//     `v2.core.account[...]` que a Stripe entrega aos destinos de "A SUA CONTA"
//     (a plataforma é a dona destas contas v2)
//     — docs.stripe.com/connect/marketplace/tasks/onboard.
//   • O destino tem o seu PRÓPRIO segredo de assinatura
//     (STRIPE_CONNECT_V2_WEBHOOK_SECRET) e o payload é outro: um thin event
//     traz só {type, related_object{id,…}} — o estado atual vai-se BUSCAR à
//     API (pull), nunca se confia num snapshot embutido.
//
// O QUE OUVE: qualquer `v2.core.account*` — na prática interessam:
//   • v2.core.account[requirements].updated           (P avançou no onboarding)
//   • v2.core.account[configuration.merchant].capability_status_updated
//     (card_payments/stripe_balance.payouts passou a active/restricted)
//   • v2.core.account[configuration.merchant].updated / .updated / .closed
// Em todos faz o MESMO: pull do estado real da conta e atualiza contas_connect
// (charges_enabled, payouts_enabled, estado, detalhes_em_falta) — idempotente.
//
// MAPA DO ESTADO (difere do v1 de propósito): uma conta v2 NASCE com os
// requirements em `past_due` (semântica nova da Stripe), por isso past_due
// pré-onboarding NÃO é 'restrita' — é 'pendente'. Só é 'restrita' quando a
// Stripe aponta um bloqueio real (restricted_other, unsupported_*, conta
// fechada). 'ativa' = card_payments active (o GATE ii/iii, como no v1).
//
// A assinatura verifica-se com o MESMO esquema HMAC do Stripe-Signature de
// sempre (docs.stripe.com/webhooks — thin e snapshot partilham o esquema).
// Deploy com --no-verify-jwt (é a Stripe que chama; protege a assinatura).

import Stripe from 'https://esm.sh/stripe@16?target=deno';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? 'sk_placeholder', {
  apiVersion: '2024-06-20',
});

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const STRIPE_V2_VERSION = '2025-12-15.clover';

// O que um thin event traz no corpo (formato provado + docs
// docs.stripe.com/api/v2/core/events): referência ao objeto, nunca o snapshot.
type ThinEvent = {
  id?: string;
  type?: string;
  related_object?: { id?: string; type?: string; url?: string } | null;
};

type Capability = {
  status?: string;
  status_details?: { code?: string; resolution?: string }[];
} | null;

type AccountV2 = {
  id: string;
  closed?: boolean;
  configuration?: {
    merchant?: {
      capabilities?: {
        card_payments?: Capability;
        stripe_balance?: { payouts?: Capability } | null;
      };
    } | null;
  } | null;
  requirements?: {
    entries?: {
      description?: string;
      minimum_deadline?: { status?: string };
    }[];
  } | null;
};

// Códigos de status_details que significam "onboarding a decorrer", não bloqueio
// (docs.stripe.com/api/v2/core/accounts/object → capabilities.status_details).
const CODIGOS_PENDENTES = new Set([
  'requirements_past_due',
  'requirements_pending_verification',
  'determining_status',
]);

function derivarEstado(acct: AccountV2): 'ativa' | 'restrita' | 'pendente' {
  if (acct.closed) return 'restrita';
  const card = acct.configuration?.merchant?.capabilities?.card_payments;
  if (card?.status === 'active') return 'ativa';
  const codigos = (card?.status_details ?? []).map((d) => d.code ?? '');
  // 'pending' da Stripe, ou 'restricted' só por falta de dados → 'pendente'.
  if (
    card?.status === 'pending' ||
    (card?.status === 'restricted' && codigos.every((c) => CODIGOS_PENDENTES.has(c)))
  ) {
    return 'pendente';
  }
  // restricted_other / unsupported_* / sem capability → bloqueio real.
  return card ? 'restrita' : 'pendente';
}

// Traduz os requirements v2 (entries[] com minimum_deadline.status) para a
// forma que o ecrã de P já lê (a mesma do webhook v1): listas por urgência.
function detalhesEmFalta(acct: AccountV2) {
  const listas: Record<string, string[]> = {
    currently_due: [],
    eventually_due: [],
    past_due: [],
  };
  for (const e of acct.requirements?.entries ?? []) {
    const desc = e.description ?? 'desconhecido';
    const st = e.minimum_deadline?.status ?? '';
    if (st in listas) listas[st].push(desc);
    else listas.currently_due.push(desc);
  }
  const card = acct.configuration?.merchant?.capabilities?.card_payments;
  const disabled_reason =
    acct.closed
      ? 'account_closed'
      : card && card.status !== 'active'
        ? (card.status_details ?? []).map((d) => d.code).filter(Boolean).join(',') || null
        : null;
  return { ...listas, disabled_reason };
}

Deno.serve(async (req) => {
  const segredo = Deno.env.get('STRIPE_CONNECT_V2_WEBHOOK_SECRET');
  if (!segredo) {
    // Dependência de dashboard: o event destination "A sua conta" (thin events
    // v2.core.account…) ainda não foi criado/ligado. Honesto — não finge.
    return new Response('STRIPE_CONNECT_V2_WEBHOOK_SECRET em falta', { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  // Confirmar que é MESMO a Stripe. O esquema de assinatura dos thin events é o
  // mesmo dos snapshot — constructEventAsync valida o HMAC e devolve o JSON
  // (que aqui é um thin event, não um Stripe.Event clássico → cast).
  let evento: ThinEvent;
  try {
    evento = (await stripe.webhooks.constructEventAsync(
      body,
      sig!,
      segredo,
    )) as unknown as ThinEvent;
  } catch (err) {
    return new Response(`assinatura inválida: ${(err as Error).message}`, { status: 400 });
  }

  // Só nos interessam eventos de contas v2.
  if (!evento.type?.startsWith('v2.core.account')) {
    return new Response('ok (ignorado)', { status: 200 });
  }

  // O thin event traz a referência; se faltar, vai-se buscar o evento completo
  // (pull) a /v2/core/events/{id} — nunca se adivinha.
  let accountId = evento.related_object?.type === 'v2.core.account'
    ? evento.related_object?.id ?? null
    : null;
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
  if (!accountId && evento.id) {
    const evRes = await fetch(`https://api.stripe.com/v2/core/events/${evento.id}`, {
      headers: { Authorization: `Bearer ${stripeKey}`, 'Stripe-Version': STRIPE_V2_VERSION },
    });
    if (evRes.ok) {
      const ev = (await evRes.json()) as ThinEvent;
      if (ev.related_object?.type === 'v2.core.account') accountId = ev.related_object.id ?? null;
    }
  }
  if (!accountId) return new Response('ok (sem conta)', { status: 200 });

  // Posse das linhas: as contas v1 (acct provado da C-1) são do connect-webhook
  // v1 — se um dia os thin events também dispararem para elas (emissão dupla da
  // Stripe), não lhes tocamos, para não misturar semânticas.
  const { data: linha } = await admin
    .from('contas_connect')
    .select('api_versao')
    .eq('stripe_account_id', accountId)
    .maybeSingle();
  if (!linha) return new Response('ok (conta desconhecida)', { status: 200 });
  if (linha.api_versao !== 'v2') return new Response('ok (conta v1 — ignorada)', { status: 200 });

  // PULL do estado real da conta (thin event não traz snapshot).
  const acctRes = await fetch(
    `https://api.stripe.com/v2/core/accounts/${accountId}?include=configuration.merchant&include=requirements`,
    { headers: { Authorization: `Bearer ${stripeKey}`, 'Stripe-Version': STRIPE_V2_VERSION } },
  );
  if (!acctRes.ok) {
    // 500 → a Stripe reenvia o evento mais tarde (retry).
    return new Response('falha a ler a conta na Stripe', { status: 500 });
  }
  const acct = (await acctRes.json()) as AccountV2;

  const caps = acct.configuration?.merchant?.capabilities;
  const charges = caps?.card_payments?.status === 'active';
  const payouts = caps?.stripe_balance?.payouts?.status === 'active';

  const { error } = await admin
    .from('contas_connect')
    .update({
      charges_enabled: charges,
      payouts_enabled: payouts,
      estado: derivarEstado(acct),
      detalhes_em_falta: detalhesEmFalta(acct),
    })
    .eq('stripe_account_id', accountId);
  if (error) return new Response('falha a atualizar contas_connect', { status: 500 });
  // Se não houver linha com este account_id, o update não afeta nada — é
  // idempotente e seguro (nunca criamos aqui: a linha nasce no onboarding).

  return new Response('ok', { status: 200 });
});
