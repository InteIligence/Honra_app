// ⚠️ LEGADO no fluxo interno desde 15/07: a reputação é a caução — o aperto
// de mão do marketplace passou a ser sem dinheiro (ver `aperto-agir` +
// migração 032). Os holds vivem só no contrato-convite (convite-*). Esta
// função fica no servidor como referência do padrão hold/capture e pelo
// historial de testes — o fluxo interno já NÃO a chama.
//
// HONRA — Caução por HOLD (aperto de mão em dois toques).
// Esta função SEGURA (autoriza) os 2€ do lado certo — NUNCA cobra. Usa uma
// Checkout Session em modo `payment` com `capture_method=manual`: o Stripe pede
// SCA na página (a pessoa está presente, condição para segurar um cartão na UE),
// autoriza o PaymentIntent (fica em `requires_capture`) e NÃO captura. O webhook
// guarda o payment_intent e faz avançar o estado. Capturar/cancelar depois é
// server-side, sem re-SCA (dentro dos 7 dias do hold).
//
// Quem chama, e quando:
//   B (para_perfil) com estado 'pedido'  → lado 'b' (ACEITAR: segura o hold de B)
//   A (de_perfil)   com estado 'aceite'  → lado 'a' (SELAR:   segura o hold de A)
//
// Precisa do segredo STRIPE_SECRET_KEY. Corre no Supabase Edge Functions (Deno).

import { createClient } from 'jsr:@supabase/supabase-js@2';

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
// Só aceitamos http(s) — o Stripe exige-o para success_url — e evita open-redirect.
// Na web isto é a origem da app (inclui a build na LAN, ex. http://192.168.x:8095).
function returnValido(u: unknown): string | null {
  return typeof u === 'string' && /^https?:\/\//.test(u) ? u : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // 1) Quem és tu? (o Porteiro confirma pela tua sessão)
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'não autenticado' }, 401);

  // 2) Que orçamento?
  let orcamento_id: string | undefined;
  let return_url: string | undefined;
  try {
    const body = await req.json();
    orcamento_id = body?.orcamento_id;
    return_url = body?.return_url;
  } catch {
    // sem corpo válido
  }
  if (!orcamento_id) return json({ error: 'falta o orcamento_id' }, 400);

  // 3) Ir buscar o orçamento (o RLS já limita às duas partes; validamos na mesma).
  const { data: orc, error: erroOrc } = await supabase
    .from('orcamentos')
    .select('id, de_perfil, para_perfil, estado, valor_taxa, hold_a, hold_b')
    .eq('id', orcamento_id)
    .single();
  if (erroOrc || !orc) return json({ error: 'orçamento não encontrado' }, 404);

  // 4) Descobrir o LADO a partir de quem chama + do estado. Um só caminho válido
  //    por combinação → impossível segurar duas vezes o mesmo lado.
  let lado: 'a' | 'b';
  if (user.id === orc.para_perfil && orc.estado === 'pedido') {
    lado = 'b'; // B aceita → segura o hold de B
  } else if (user.id === orc.de_perfil && orc.estado === 'aceite') {
    lado = 'a'; // A sela → segura o hold de A
  } else {
    return json({ error: 'não é a tua vez de segurar a caução neste orçamento' }, 400);
  }

  // Já há hold deste lado? (proteção extra contra duplo-toque)
  if ((lado === 'b' && orc.hold_b) || (lado === 'a' && orc.hold_a)) {
    return json({ error: 'a caução deste lado já está segura' }, 409);
  }

  // 5) Se é B a aceitar, tem de estar verificado (a honra começa na identidade
  //    real). Falhamos aqui — melhor do que rebentar no webhook.
  if (lado === 'b') {
    const { data: verif } = await supabase
      .from('verificacoes')
      .select('estado')
      .eq('perfil_id', user.id)
      .eq('aba', 'identidade')
      .eq('estado', 'verificado')
      .maybeSingle();
    if (!verif) {
      return json({ error: 'Precisas de verificar a identidade para aceitar.' }, 403);
    }
  }

  // 5.5) PAR DE CONFIANÇA — a "cenoura" anti-desintermediação. Se as duas partes
  //      JÁ honraram um negócio juntas, dispensamos a caução: a confiança está
  //      provada. O aperto de mão fecha-se num toque (sem os 2€), direto a
  //      'selado'. Quanto mais honras cá dentro, mais leve fica — sair = abdicar
  //      desta fluidez E da credencial. Pau nenhum; só cenoura.
  if (lado === 'b') {
    const { data: prior } = await supabase
      .from('orcamentos')
      .select('id')
      .in('estado', ['honrado', 'concluido'])
      .or(
        `and(de_perfil.eq.${orc.de_perfil},para_perfil.eq.${orc.para_perfil}),` +
          `and(de_perfil.eq.${orc.para_perfil},para_perfil.eq.${orc.de_perfil})`,
      )
      .limit(1);
    if (prior && prior.length > 0) {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const agora = new Date().toISOString();
      const { error: erroSelo } = await admin
        .from('orcamentos')
        .update({ estado: 'selado', selado_em: agora })
        .eq('id', orc.id)
        .eq('estado', 'pedido');
      if (erroSelo) {
        return json({ error: 'não consegui fechar o aperto de mão de confiança' }, 500);
      }
      // Avisa A (quem pediu) que o pedido foi aceite — sem caução.
      await admin.rpc('criar_aviso', {
        p_perfil: orc.de_perfil,
        p_tipo: 'selado',
        p_orcamento: orc.id,
        p_titulo: 'Aceite sem caução',
        p_corpo: 'Já se conhecem — o aperto de mão fechou sem os 2€. O projeto arrancou.',
        p_prazo: new Date(Date.now() + 6 * 86400000).toISOString(),
        p_urgente: false,
      });
      return json({ sealed: true, trusted: true });
    }
  }

  // 6) Pedir ao Stripe uma Checkout Session que AUTORIZA (não cobra).
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
  const returnBase =
    returnValido(return_url) ?? Deno.env.get('PAG_RETURN_URL') ?? 'https://honraapp.com/pago';
  // Leva o id do negócio no retorno → a app volta direta ao negócio certo.
  const returnUrl = `${returnBase}${returnBase.includes('?') ? '&' : '?'}orcamento=${orc.id}`;
  const centimos = Math.round((Number(orc.valor_taxa) || 2) * 100);

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', returnUrl);
  params.set('cancel_url', returnUrl);
  // A CHAVE do modelo: segurar, não cobrar.
  params.set('payment_intent_data[capture_method]', 'manual');
  params.set('payment_intent_data[metadata][orcamento_id]', orc.id);
  params.set('payment_intent_data[metadata][lado]', lado);
  params.set('metadata[orcamento_id]', orc.id);
  params.set('metadata[lado]', lado);
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'eur');
  params.set('line_items[0][price_data][unit_amount]', String(centimos));
  params.set(
    'line_items[0][price_data][product_data][name]',
    'Honra — caução de compromisso (segura, não cobrada)',
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

  return json({ url: cs.url, id: cs.id, lado });
});
