// HONRA — Fatia D: a mecânica partilhada do DINHEIRO do contrato-convite.
// Reutilizada por resolver-convites, convite-checkpoint e convite-cancelar —
// a MESMA verdade em todos os caminhos (como os escalões em contrato.ts).
//
// Regras fechadas pela investigação (docs/PAGAMENTOS-HOLD-METRICAS.md):
//   • hold = PaymentIntent manual-capture MIT na conta Connect de P, SÓ em
//     cartões de CRÉDITO; validar `capture_before` em runtime; NUNCA capturar
//     acima do autorizado (overcapture está excluído no EEE);
//   • fee do Honra na penalização: 5% do capturado, mínimo 0,60 € — e nunca
//     acima do próprio valor capturado (a fee tem de caber no capturado);
//     PERDÃO = fee 0; (subiu de 3%→5% em 17/07, decisão do Vítor: taxa justa
//     pelo esforço proporcionado e não aproveitado — ganha-se COM a proteção
//     executada, nunca com o falhanço em si)
//   • dunning gated por decline code: authentication_required NUNCA se
//     re-tenta por máquina; hard declines param já; o resto segue D+1/D+3/D+7.
//
// Sem segredos impressos: as chaves entram por parâmetro e nunca saem em logs.

import type { createClient } from 'jsr:@supabase/supabase-js@2';

const STRIPE = 'https://api.stripe.com/v1';

export type RespostaStripe = { ok: boolean; corpo: Record<string, unknown> };

// ============================================================
// PAGAMENTO NA ENTREGA (migração 065) — as constantes e a mecânica partilhada
// do dinheiro do fluxo INTERNO: captura real via Checkout na conta da
// PLATAFORMA (separate charges & transfers), retenção até à decisão de A,
// transfer ao Connect de B na libertação, refund só por veredito da revisão.
// ============================================================

/** Prazo de confirmação do cliente após o pagamento (dias). A constante da
 *  lei do silêncio: sem resposta de A até `pago_em + PRAZO`, o resolver
 *  liberta ao profissional — avisado + relembrado, nunca emboscada. */
export const PRAZO_CONFIRMACAO_DIAS = 5;

/** Estados do orçamento em que a entrega/pagamento fazem sentido: pós-selo,
 *  incluindo o tail legado (entregue/concluido) para não criar becos. */
export const ESTADOS_POS_SELO = ['selado', 'honrado', 'entregue', 'concluido'];

/** Chamada v1 à Stripe NA CONTA DA PLATAFORMA (sem header Stripe-Account).
 *  `idem` = Idempotency-Key — obrigatória em transfers/refunds re-tentáveis:
 *  a re-tentativa do resolver NUNCA pode duplicar dinheiro. */
export async function stripePlataforma(
  key: string,
  metodo: 'POST' | 'GET',
  caminho: string,
  params?: URLSearchParams,
  idem?: string,
): Promise<RespostaStripe> {
  const url = metodo === 'GET' && params ? `${STRIPE}${caminho}?${params}` : `${STRIPE}${caminho}`;
  const res = await fetch(url, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(metodo === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idem ? { 'Idempotency-Key': idem } : {}),
    },
    body: metodo === 'POST' ? params : undefined,
  });
  const corpo = await res.json().catch(() => ({}));
  return { ok: res.ok, corpo };
}

/**
 * TRANSFER da entrega ao Connect de B (libertação). Usa `source_transaction`
 * (a charge da captura): prende a transferência aos fundos DESSA cobrança —
 * sem depender do saldo disponível da plataforma e ao ritmo do settlement.
 * Idempotente por orçamento: `entrega-tr-{orcamento_id}`.
 */
export async function transferirEntrega(args: {
  stripeKey: string;
  contaDestino: string; // acct_… de B
  piId: string; // PaymentIntent da captura (pagamento_intent)
  valorCentimos: number;
  orcamentoId: string;
}): Promise<{ ok: boolean; transferId: string | null; erro: string | null }> {
  // 1) A charge da captura (latest_charge vem como id por omissão).
  const pi = await stripePlataforma(args.stripeKey, 'GET', `/payment_intents/${args.piId}`);
  const charge = (pi.corpo as { latest_charge?: string }).latest_charge;
  if (!pi.ok || !charge) {
    return {
      ok: false,
      transferId: null,
      erro:
        (pi.corpo as { error?: { message?: string } }).error?.message ??
        'não encontrei a cobrança do pagamento',
    };
  }
  // 2) O transfer, amarrado à charge e idempotente por orçamento.
  const pp = new URLSearchParams();
  pp.set('amount', String(args.valorCentimos));
  pp.set('currency', 'eur');
  pp.set('destination', args.contaDestino);
  pp.set('source_transaction', charge);
  pp.set('transfer_group', args.orcamentoId);
  pp.set('metadata[orcamento_id]', args.orcamentoId);
  pp.set('metadata[finalidade]', 'pagamento_entrega');
  const r = await stripePlataforma(
    args.stripeKey,
    'POST',
    '/transfers',
    pp,
    `entrega-tr-${args.orcamentoId}`,
  );
  if (!r.ok) {
    return {
      ok: false,
      transferId: null,
      erro:
        (r.corpo as { error?: { message?: string } }).error?.message ?? 'erro na transferência',
    };
  }
  return { ok: true, transferId: String((r.corpo as { id?: string }).id ?? '') || null, erro: null };
}

/**
 * REFUND total da entrega (devolução ao cliente). SÓ chamado pelo veredito da
 * revisão — nunca é um botão do cliente. Idempotente: `entrega-rf-{orcamento_id}`.
 */
export async function reembolsarEntrega(args: {
  stripeKey: string;
  piId: string;
  orcamentoId: string;
}): Promise<{ ok: boolean; erro: string | null }> {
  const pp = new URLSearchParams();
  pp.set('payment_intent', args.piId);
  pp.set('metadata[orcamento_id]', args.orcamentoId);
  pp.set('metadata[finalidade]', 'devolucao_entrega');
  const r = await stripePlataforma(
    args.stripeKey,
    'POST',
    '/refunds',
    pp,
    `entrega-rf-${args.orcamentoId}`,
  );
  if (!r.ok) {
    return {
      ok: false,
      erro: (r.corpo as { error?: { message?: string } }).error?.message ?? 'erro no reembolso',
    };
  }
  return { ok: true, erro: null };
}

/** Chamada v1 à Stripe NA conta Connect de P (direct objects). */
export async function stripeNaConta(
  key: string,
  conta: string,
  metodo: 'POST' | 'GET',
  caminho: string,
  params?: URLSearchParams,
): Promise<RespostaStripe> {
  const url = metodo === 'GET' && params ? `${STRIPE}${caminho}?${params}` : `${STRIPE}${caminho}`;
  const res = await fetch(url, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${key}`,
      'Stripe-Account': conta,
      ...(metodo === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: metodo === 'POST' ? params : undefined,
  });
  const corpo = await res.json().catch(() => ({}));
  return { ok: res.ok, corpo };
}

/**
 * A fee do Honra numa penalização COBRADA: 5% do capturado, mínimo 0,60 €,
 * nunca acima do capturado (a Stripe recusaria). Perdão = 0 (não passa por aqui).
 */
export function feePenalizacao(valorCentimos: number): number {
  return Math.min(valorCentimos, Math.max(Math.round(valorCentimos * 0.05), 60));
}

/**
 * Gating do dunning por decline code (PAGAMENTOS §3):
 *   'sca'  — authentication_required: NUNCA re-tentar por máquina → fallback
 *            SCA on-session (magic link, prazo 72h).
 *   'hard' — cartão perdido/roubado/conta inexistente/revogação (Visa Cat.1,
 *            MAC 03/21): parar já; re-tentar é multa.
 *   'soft' — o resto (insufficient_funds, try_again_later, do_not_honor,
 *            generic_decline…): cadência D+1/D+3/D+7. NOTA: do_not_honor
 *            PERSISTENTE (2 tentativas seguidas) pára cedo — decisão do caller.
 */
export type ClasseDecline = 'sca' | 'hard' | 'soft';
const DECLINES_HARD = new Set([
  'lost_card',
  'stolen_card',
  'pickup_card',
  'invalid_account',
  'no_such_account',
  'revocation_of_all_authorizations', // MAC 03 (Mastercard "do not try again")
  'revocation_of_authorization', // MAC 21 ("payment cancelled")
  'stop_payment_order',
  'fraudulent',
  'merchant_blacklist',
]);
export function classificarDecline(code: string | null | undefined): ClasseDecline {
  if (!code) return 'soft';
  if (code === 'authentication_required') return 'sca';
  return DECLINES_HARD.has(code) ? 'hard' : 'soft';
}

/** Uma linha imutável em metricas_pagamento (append-only; nunca rebenta o fluxo). */
export type Metrica = {
  evento: string;
  contrato_id?: string | null;
  profissional_id?: string | null;
  valor?: number | null;
  fee_centimos?: number | null;
  decline_code?: string | null;
  rede?: string | null;
  funding?: string | null;
  pi_id?: string | null;
  payload?: Record<string, unknown> | null;
};
export async function registarMetrica(
  admin: ReturnType<typeof createClient>,
  m: Metrica,
): Promise<void> {
  const { error } = await admin.from('metricas_pagamento').insert(m);
  if (error) console.error('metrica falhou', m.evento, error.message);
}

/** O funding do cartão gravado ('credit'|'debit'|'prepaid'|'unknown') + rede. */
export async function obterFundingCartao(
  stripeKey: string,
  conta: string,
  paymentMethodId: string,
): Promise<{ funding: string; rede: string | null }> {
  const r = await stripeNaConta(stripeKey, conta, 'GET', `/payment_methods/${paymentMethodId}`);
  const card = (r.corpo as { card?: { funding?: string; brand?: string } }).card;
  const funding = r.ok && card?.funding ? String(card.funding) : 'unknown';
  return { funding, rede: card?.brand ?? null };
}

export type ResultadoCobranca = {
  ok: boolean;
  pi_id: string | null;
  status: string; // status Stripe ou código do erro
  decline_code: string | null;
  rede: string | null;
  funding: string | null;
  erro: string | null;
};

function lerErroPi(corpo: Record<string, unknown>): {
  pi_id: string | null;
  decline_code: string | null;
  erro: string | null;
  codigo: string;
} {
  const e = (corpo as {
    error?: {
      code?: string;
      decline_code?: string;
      message?: string;
      payment_intent?: { id?: string };
    };
  }).error;
  // authentication_required vem em error.code; os declines em error.decline_code.
  const decline =
    e?.code === 'authentication_required'
      ? 'authentication_required'
      : (e?.decline_code ?? e?.code ?? null);
  return {
    pi_id: e?.payment_intent?.id ?? null,
    decline_code: decline,
    erro: e?.message ?? 'erro na Stripe',
    codigo: e?.code ?? 'erro',
  };
}

function lerCartaoPi(pi: Record<string, unknown>): { rede: string | null; funding: string | null } {
  const charge = pi.latest_charge as
    | { payment_method_details?: { card?: { brand?: string; funding?: string } } }
    | string
    | null
    | undefined;
  if (charge && typeof charge === 'object') {
    const card = charge.payment_method_details?.card;
    return { rede: card?.brand ?? null, funding: card?.funding ?? null };
  }
  return { rede: null, funding: null };
}

/**
 * ARMA o hold: PaymentIntent manual-capture MIT (off-session) na conta de P.
 * Devolve também o `capture_before` REAL (a única verdade sobre a janela).
 * A application fee NÃO se define aqui — define-se NA CAPTURA (acompanha
 * capturas parciais; PAGAMENTOS §7).
 */
export async function armarHold(args: {
  stripeKey: string;
  conta: string;
  customer: string;
  paymentMethod: string;
  valor: number;
  descricao: string;
  contratoId: string;
}): Promise<ResultadoCobranca & { capture_before: string | null }> {
  const pp = new URLSearchParams();
  pp.set('amount', String(args.valor));
  pp.set('currency', 'eur');
  pp.set('customer', args.customer);
  pp.set('payment_method', args.paymentMethod);
  pp.set('capture_method', 'manual'); // o HOLD: autoriza sem capturar
  pp.set('off_session', 'true'); // MIT ao abrigo do mandato do setup
  pp.set('confirm', 'true');
  pp.set('description', args.descricao);
  pp.set('metadata[contrato_id]', args.contratoId);
  pp.set('metadata[finalidade]', 'hold_caucao');
  pp.set('expand[]', 'latest_charge');

  const r = await stripeNaConta(args.stripeKey, args.conta, 'POST', '/payment_intents', pp);
  if (!r.ok) {
    const e = lerErroPi(r.corpo);
    return {
      ok: false,
      pi_id: e.pi_id,
      status: e.codigo,
      decline_code: e.decline_code,
      rede: null,
      funding: null,
      erro: e.erro,
      capture_before: null,
    };
  }
  const pi = r.corpo as Record<string, unknown>;
  const { rede, funding } = lerCartaoPi(pi);
  const charge = pi.latest_charge as
    | { payment_method_details?: { card?: { capture_before?: number } } }
    | undefined;
  const cb = charge?.payment_method_details?.card?.capture_before;
  return {
    ok: pi.status === 'requires_capture',
    pi_id: String(pi.id ?? '') || null,
    status: String(pi.status ?? 'erro'),
    decline_code: null,
    rede,
    funding,
    erro: null,
    capture_before: typeof cb === 'number' ? new Date(cb * 1000).toISOString() : null,
  };
}

/**
 * CAPTURA o hold — parcial se devido < autorizado (under-capture nativa; o
 * resto liberta-se sozinho). NUNCA acima do autorizado. Fee definida AQUI.
 */
export async function capturarHold(args: {
  stripeKey: string;
  conta: string;
  piId: string;
  valor: number; // a capturar (≤ autorizado)
  fee: number;
}): Promise<ResultadoCobranca> {
  const pp = new URLSearchParams();
  pp.set('amount_to_capture', String(args.valor));
  pp.set('application_fee_amount', String(args.fee));
  pp.set('expand[]', 'latest_charge');
  const r = await stripeNaConta(
    args.stripeKey,
    args.conta,
    'POST',
    `/payment_intents/${args.piId}/capture`,
    pp,
  );
  if (!r.ok) {
    const e = lerErroPi(r.corpo);
    return {
      ok: false,
      pi_id: args.piId,
      status: e.codigo,
      decline_code: e.decline_code,
      rede: null,
      funding: null,
      erro: e.erro,
    };
  }
  const pi = r.corpo as Record<string, unknown>;
  const { rede, funding } = lerCartaoPi(pi);
  return {
    ok: pi.status === 'succeeded',
    pi_id: String(pi.id ?? '') || null,
    status: String(pi.status ?? 'erro'),
    decline_code: null,
    rede,
    funding,
    erro: null,
  };
}

/** LIBERTA um hold (cancel, 0€). Best-effort: já cancelado/expirado não rebenta. */
export async function libertarHold(
  stripeKey: string,
  conta: string,
  piId: string,
): Promise<{ ok: boolean; erro: string | null }> {
  const r = await stripeNaConta(
    stripeKey,
    conta,
    'POST',
    `/payment_intents/${piId}/cancel`,
    new URLSearchParams(),
  );
  if (r.ok) return { ok: true, erro: null };
  const e = lerErroPi(r.corpo);
  return { ok: false, erro: e.erro };
}

/**
 * COBRANÇA MIT direta (sem hold): PaymentIntent off-session confirmada já, com
 * a fee do Honra definida na criação (PAGAMENTOS §7.2). É o modelo Fresha para
 * débito e o fallback quando o hold não existe/expirou.
 */
export async function cobrarMit(args: {
  stripeKey: string;
  conta: string;
  customer: string;
  paymentMethod: string;
  valor: number;
  fee: number;
  descricao: string;
  contratoId: string;
  motivo: string;
}): Promise<ResultadoCobranca> {
  const pp = new URLSearchParams();
  pp.set('amount', String(args.valor));
  pp.set('currency', 'eur');
  pp.set('customer', args.customer);
  pp.set('payment_method', args.paymentMethod);
  pp.set('off_session', 'true');
  pp.set('confirm', 'true');
  pp.set('application_fee_amount', String(args.fee));
  pp.set('description', args.descricao);
  pp.set('metadata[contrato_id]', args.contratoId);
  pp.set('metadata[finalidade]', args.motivo);
  pp.set('expand[]', 'latest_charge');
  const r = await stripeNaConta(args.stripeKey, args.conta, 'POST', '/payment_intents', pp);
  if (!r.ok) {
    const e = lerErroPi(r.corpo);
    return {
      ok: false,
      pi_id: e.pi_id,
      status: e.codigo,
      decline_code: e.decline_code,
      rede: null,
      funding: null,
      erro: e.erro,
    };
  }
  const pi = r.corpo as Record<string, unknown>;
  const { rede, funding } = lerCartaoPi(pi);
  return {
    ok: pi.status === 'succeeded',
    pi_id: String(pi.id ?? '') || null,
    status: String(pi.status ?? 'erro'),
    decline_code: null,
    rede,
    funding,
    erro: null,
  };
}

/**
 * RE-TENTA uma cobrança pendente (retry do dunning): re-confirma a MESMA
 * PaymentIntent se ela ainda aceitar confirmação; senão cria uma nova (com o
 * payment method gravado — clonado de fresco pela Stripe na hora, beneficiando
 * do Card Account Updater). Devolve o resultado como cobrarMit.
 */
export async function retentarCobranca(args: {
  stripeKey: string;
  conta: string;
  piIdAnterior: string | null;
  customer: string;
  paymentMethod: string;
  valor: number;
  fee: number;
  descricao: string;
  contratoId: string;
  motivo: string;
}): Promise<ResultadoCobranca> {
  if (args.piIdAnterior) {
    const estado = await stripeNaConta(
      args.stripeKey,
      args.conta,
      'GET',
      `/payment_intents/${args.piIdAnterior}`,
    );
    const status = String((estado.corpo as { status?: string }).status ?? '');
    if (estado.ok && (status === 'requires_payment_method' || status === 'requires_confirmation')) {
      const pp = new URLSearchParams();
      pp.set('payment_method', args.paymentMethod);
      pp.set('off_session', 'true');
      pp.set('expand[]', 'latest_charge');
      const r = await stripeNaConta(
        args.stripeKey,
        args.conta,
        'POST',
        `/payment_intents/${args.piIdAnterior}/confirm`,
        pp,
      );
      if (!r.ok) {
        const e = lerErroPi(r.corpo);
        return {
          ok: false,
          pi_id: args.piIdAnterior,
          status: e.codigo,
          decline_code: e.decline_code,
          rede: null,
          funding: null,
          erro: e.erro,
        };
      }
      const pi = r.corpo as Record<string, unknown>;
      const { rede, funding } = lerCartaoPi(pi);
      return {
        ok: pi.status === 'succeeded',
        pi_id: String(pi.id ?? '') || null,
        status: String(pi.status ?? 'erro'),
        decline_code: null,
        rede,
        funding,
        erro: null,
      };
    }
  }
  // PI anterior morta/cancelada/inexistente → nova, com a fee na criação.
  return cobrarMit(args);
}
