// HONRA — Fatia 2: recebe o "telefonema de volta" (webhook) do Stripe.
// Quando o Stripe termina a verificação, bate a esta porta. Se foi aprovada,
// acendemos a aba "identidade" do selo a VERDE na base de dados.
// Usa a service_role (poder de admin) para escrever, ignorando o RLS.
//
// 065 — PAGAMENTO NA ENTREGA: o MESMO endpoint (um webhook de plataforma, não
// dois às cegas) trata também as Checkout Sessions do fluxo novo, marcadas com
// metadata.finalidade='pagamento_entrega':
//   · checkout.session.completed → 'pago_retido' + pago_em + confirmar_ate
//     (pago_em + PRAZO_CONFIRMACAO_DIAS). Os avisos às duas partes disparam
//     sozinhos no trigger notificar_ciclo (migração 065).
//   · checkout.session.expired  → volta a 'sem_pagamento' (a sessão morreu
//     sem pagamento; o botão de pagar volta a estar vivo — sem becos).
// O fluxo LEGADO da caução (metadata.lado) fica intacto.
// NOTA de configuração: o endpoint na Stripe precisa dos eventos
// checkout.session.completed E checkout.session.expired.

import Stripe from 'https://esm.sh/stripe@16?target=deno';
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { PRAZO_CONFIRMACAO_DIAS } from '../_shared/pagamentos.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
});

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  // Confirmar que é MESMO o Stripe (assinatura), não um impostor.
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig!,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
    );
  } catch (err) {
    return new Response(`assinatura inválida: ${(err as Error).message}`, { status: 400 });
  }

  // Verificação aprovada → acender a aba "identidade".
  if (event.type === 'identity.verification_session.verified') {
    const vs = event.data.object as Stripe.Identity.VerificationSession;
    const perfilId = vs.metadata?.perfil_id;
    if (perfilId) {
      await admin
        .from('verificacoes')
        .update({ estado: 'verificado', verificado_em: new Date().toISOString() })
        .eq('perfil_id', perfilId)
        .eq('aba', 'identidade');
    }
  }

  // Caução SEGURA (hold autorizado, não cobrado) → avançar o aperto de mão.
  // A sessão completa quando a pessoa autoriza o cartão na página (SCA). O
  // PaymentIntent fica em `requires_capture` — guardamo-lo (é a "chave" para
  // capturar ou libertar depois, server-side) e avançamos o estado conforme o
  // LADO que acabou de segurar:
  //   lado 'b' (B aceitou) → estado 'aceite'  + hold_b + aceite_em
  //   lado 'a' (A selou)   → estado 'selado'  + hold_a + selado_em (arranca o
  //                          relógio de 7 dias do aperto de mão)
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const orcamentoId = session.metadata?.orcamento_id;
    const lado = session.metadata?.lado;
    const finalidade = session.metadata?.finalidade;
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    // 065 — PAGAMENTO NA ENTREGA: captura real confirmada → o dinheiro fica
    // retido na plataforma e o relógio de confirmação de A arranca. Idempotente:
    // só avança a partir de 'aguarda_pagamento' (ou 'sem_pagamento', se o
    // webhook ganhar a corrida à própria função). Os avisos (B: retido; A:
    // relógio) disparam no trigger notificar_ciclo da 065.
    if (finalidade === 'pagamento_entrega' && orcamentoId && paymentIntentId) {
      const pagoEm = new Date();
      const confirmarAte = new Date(
        pagoEm.getTime() + PRAZO_CONFIRMACAO_DIAS * 86_400_000,
      );
      const { data: upd } = await admin
        .from('orcamentos')
        .update({
          pagamento_estado: 'pago_retido',
          pagamento_intent: paymentIntentId,
          pago_em: pagoEm.toISOString(),
          confirmar_ate: confirmarAte.toISOString(),
        })
        .eq('id', orcamentoId)
        .in('pagamento_estado', ['aguarda_pagamento', 'sem_pagamento'])
        .select('id');

      // PAGAMENTO EM DUPLICADO (red-team): se a transição já tinha sido ganha
      // por OUTRA sessão (duas abas do Checkout, dois pagamentos), o segundo
      // dinheiro não pode ficar órfão na Stripe — devolve-se JÁ, na íntegra.
      // Idempotente pela própria API de refunds (um PI só se reembolsa uma vez).
      if ((!upd || upd.length === 0) && paymentIntentId) {
        const { data: atual } = await admin
          .from('orcamentos')
          .select('pagamento_intent')
          .eq('id', orcamentoId)
          .maybeSingle();
        const piRegistado = (atual as { pagamento_intent?: string | null } | null)
          ?.pagamento_intent;
        if (piRegistado && piRegistado !== paymentIntentId) {
          try {
            await stripe.refunds.create({
              payment_intent: paymentIntentId,
              metadata: { orcamento_id: orcamentoId, finalidade: 'pagamento_duplicado' },
            });
          } catch (err) {
            console.error('refund de pagamento duplicado falhou', orcamentoId, (err as Error).message);
          }
        }
      }
      return new Response('ok', { status: 200 });
    }

    if (orcamentoId && paymentIntentId && (lado === 'a' || lado === 'b')) {
      const agora = new Date().toISOString();
      if (lado === 'b') {
        await admin
          .from('orcamentos')
          .update({ estado: 'aceite', hold_b: paymentIntentId, aceite_em: agora })
          .eq('id', orcamentoId)
          .eq('estado', 'pedido'); // idempotente: só avança a partir do estado certo
      } else {
        await admin
          .from('orcamentos')
          .update({ estado: 'selado', hold_a: paymentIntentId, selado_em: agora })
          .eq('id', orcamentoId)
          .eq('estado', 'aceite');
      }
    }
  }

  // 065 — Sessão de Checkout do pagamento na entrega EXPIRADA sem pagamento →
  // o negócio volta a 'sem_pagamento' (o botão de pagar renasce; sem becos).
  // Idempotente: só recua a partir de 'aguarda_pagamento' — se entretanto o
  // completed chegou (pago_retido), este evento não toca em nada.
  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session;
    const orcamentoId = session.metadata?.orcamento_id;
    if (session.metadata?.finalidade === 'pagamento_entrega' && orcamentoId) {
      await admin
        .from('orcamentos')
        .update({ pagamento_estado: 'sem_pagamento' })
        .eq('id', orcamentoId)
        .eq('pagamento_estado', 'aguarda_pagamento');
    }
  }

  return new Response('ok', { status: 200 });
});
