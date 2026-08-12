// HONRA — PAGAMENTO NA ENTREGA (migração 065): o cliente paga a entrega.
//
// O desenho aprovado 27/07: o dinheiro entra no ciclo NA ENTREGA. Esta função
// cria uma Checkout Session de CAPTURA REAL (mode=payment, captura normal) —
// NUNCA um hold de capture_method=manual: os holds expiram em 4d18h–7 dias
// (docs/PAGAMENTOS-HOLD-METRICAS.md §1) e o prazo de confirmação de 5 dias +
// uma eventual disputa rebentariam sempre essa janela.
//
// O dinheiro fica RETIDO NA CONTA DA PLATAFORMA (Stripe Connect — separate
// charges & transfers): NÃO se define transfer_data aqui; a transferência ao
// Connect de B só acontece na libertação (entrega-decidir / resolver), e a
// devolução só por veredito da revisão (checkpoint-disputa).
//
// Quem chama: A (de_perfil), com a entrega apresentada por B e valor combinado.
//   · estado pós-selo ('selado','honrado','entregue','concluido' — o tail
//     legado entra para não criar becos);
//   · pagamento_estado 'sem_pagamento' (primeira vez) ou 'aguarda_pagamento'
//     (sessão anterior abandonada/expirada → nova sessão, sem beco);
//   · existe entrega (entrega_limpa + entrega_em);
//   · existe valor: valor_proposta (062). Sem valor → erro honesto.
//
// O webhook (stripe-webhook) é quem marca 'pago_retido' + confirmar_ate.
// Precisa de STRIPE_SECRET_KEY. JWT obrigatório (deploy SEM --no-verify-jwt).

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { ESTADOS_POS_SELO } from '../_shared/pagamentos.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// O cliente diz para onde o Stripe deve voltar (a app, não uma página morta).
// Só http(s) — o Stripe exige-o para success_url — e evita open-redirect.
// (Mesmo padrão de autorizar-caucao / connect-onboarding.)
function returnValido(u: unknown): string | null {
  return typeof u === 'string' && /^https?:\/\//.test(u) ? u : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    // Dependência de configuração — honesto, não finge.
    return json({ error: 'Pagamentos indisponíveis: falta a chave da Stripe.' }, 503);
  }

  // 1) Quem és tu? (o Porteiro confirma pela tua sessão)
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'não autenticado' }, 401);

  // 2) Que orçamento, e para onde voltar?
  let orcamento_id: string | undefined;
  let return_url: unknown;
  try {
    const body = await req.json();
    orcamento_id = body?.orcamento_id;
    return_url = body?.return_url;
  } catch {
    // sem corpo válido
  }
  if (!orcamento_id) return json({ error: 'falta o orcamento_id' }, 400);

  // 3) O orçamento (o RLS já limita às duas partes; validamos na mesma).
  //    Tolerância de migração: se as colunas da 065 ainda não existirem na BD,
  //    dizemo-lo com todas as letras — nunca um erro de servidor mudo.
  const { data: orc, error: erroOrc } = await supabase
    .from('orcamentos')
    .select(
      'id, de_perfil, para_perfil, estado, valor_proposta, pagamento_estado, entrega_limpa, entrega_em',
    )
    .eq('id', orcamento_id)
    .single();
  if (erroOrc) {
    if (/column|pagamento_estado|entrega_/i.test(erroOrc.message ?? '')) {
      return json(
        { error: 'O pagamento na entrega ainda não está ativo nesta base de dados (migração 065 por aplicar).' },
        503,
      );
    }
    return json({ error: 'orçamento não encontrado' }, 404);
  }
  if (!orc) return json({ error: 'orçamento não encontrado' }, 404);

  // 4) Validações — cada recusa com a razão real.
  if (user.id !== orc.de_perfil) {
    return json({ error: 'Só o cliente deste negócio paga a entrega.' }, 403);
  }
  if (!ESTADOS_POS_SELO.includes(orc.estado)) {
    return json({ error: 'O pagamento só se faz com o aperto de mão selado.' }, 400);
  }
  if (orc.pagamento_estado !== 'sem_pagamento' && orc.pagamento_estado !== 'aguarda_pagamento') {
    return json({ error: 'Este pagamento já entrou no ciclo — recarrega o negócio.' }, 409);
  }
  if (!orc.entrega_limpa || !orc.entrega_em) {
    return json({ error: 'Ainda não há entrega para pagar — o profissional apresenta-a primeiro.' }, 400);
  }
  const valor = Number(orc.valor_proposta);
  if (!Number.isFinite(valor) || valor <= 0) {
    return json(
      { error: 'Este negócio não tem valor combinado. Define o valor da proposta antes do selo — sem valor, o pagamento na entrega não se aplica.' },
      400,
    );
  }
  const centimos = Math.round(valor * 100);

  // 5) A Checkout Session — captura normal, na conta da PLATAFORMA (o dinheiro
  //    fica retido; a transferência é decisão posterior). Sem transfer_data.
  const returnBase =
    returnValido(return_url) ?? Deno.env.get('PAG_RETURN_URL') ?? 'https://honraapp.com/pago';
  const returnUrl = `${returnBase}${returnBase.includes('?') ? '&' : '?'}orcamento=${orc.id}`;

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', returnUrl);
  params.set('cancel_url', returnUrl);
  params.set('payment_intent_data[metadata][orcamento_id]', orc.id);
  params.set('payment_intent_data[metadata][finalidade]', 'pagamento_entrega');
  // O transfer_group ata a cobrança à futura transferência (separate charges & transfers).
  params.set('payment_intent_data[transfer_group]', orc.id);
  params.set('metadata[orcamento_id]', orc.id);
  params.set('metadata[finalidade]', 'pagamento_entrega');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'eur');
  params.set('line_items[0][price_data][unit_amount]', String(centimos));
  params.set(
    'line_items[0][price_data][product_data][name]',
    'Honra — pagamento na entrega (retido até confirmares)',
  );

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  const cs = await res.json();
  if (!res.ok) return json({ error: cs.error?.message ?? 'erro no Stripe' }, 400);

  // 6) Marca 'aguarda_pagamento' (idempotente: só a partir dos estados certos;
  //    perder esta corrida significa que o webhook já marcou pago_retido — e
  //    nesse caso a sessão nova morre sozinha sem tocar em nada).
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  await admin
    .from('orcamentos')
    .update({ pagamento_estado: 'aguarda_pagamento' })
    .eq('id', orc.id)
    .in('pagamento_estado', ['sem_pagamento', 'aguarda_pagamento']);

  return json({ url: cs.url, id: cs.id });
});
