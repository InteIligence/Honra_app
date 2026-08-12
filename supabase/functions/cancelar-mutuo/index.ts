// HONRA — Cancelamento mútuo (honroso).
// Depois de haver aperto de mão selado, qualquer parte pode PEDIR para cancelar;
// o negócio só se desfaz quando a OUTRA parte confirma. Aí libertam-se os dois
// holds (nada cobrado) e fecha em 'cancelado' — SEM marca de incumprimento.
// Afunila o cancelamento (exige acordo) e mantém a honra intacta dos dois lados.
//
// Primeiro toque  → regista quem pediu (cancel_por).
// Segundo toque   → se for o OUTRO a chamar, liberta holds e fecha 'cancelado'.
//
// Precisa de STRIPE_SECRET_KEY + SUPABASE_SERVICE_ROLE_KEY.

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

async function libertarHold(stripeKey: string, paymentIntentId: string) {
  const res = await fetch(
    `https://api.stripe.com/v1/payment_intents/${paymentIntentId}/cancel`,
    { method: 'POST', headers: { Authorization: `Bearer ${stripeKey}` } },
  );
  return res.ok ? null : (await res.json())?.error?.message ?? 'erro ao libertar';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'não autenticado' }, 401);

  let orcamento_id: string | undefined;
  try {
    orcamento_id = (await req.json())?.orcamento_id;
  } catch {
    // sem corpo
  }
  if (!orcamento_id) return json({ error: 'falta o orcamento_id' }, 400);

  const { data: orc, error: erroOrc } = await supabase
    .from('orcamentos')
    .select('id, de_perfil, para_perfil, estado, hold_a, hold_b, cancel_por')
    .eq('id', orcamento_id)
    .single();
  if (erroOrc || !orc) return json({ error: 'orçamento não encontrado' }, 404);

  if (user.id !== orc.de_perfil && user.id !== orc.para_perfil) {
    return json({ error: 'não fazes parte deste orçamento' }, 403);
  }
  if (orc.estado !== 'selado') {
    return json({ error: 'só se cancela um aperto de mão selado' }, 400);
  }

  // 065 — PAGAMENTO NA ENTREGA: com dinheiro retido ou congelado, o negócio
  // não se desfaz por baixo do pagamento — primeiro decide-se a entrega
  // (confirmar/contestar; congelado espera o veredito da revisão). Consulta
  // tolerante: sem a migração 065 na BD, o cancelamento segue como sempre.
  {
    const { data: pag } = await supabase
      .from('orcamentos')
      .select('pagamento_estado')
      .eq('id', orcamento_id)
      .maybeSingle();
    const pe = (pag as { pagamento_estado?: string } | null)?.pagamento_estado;
    if (pe === 'pago_retido' || pe === 'congelado') {
      return json(
        { error: 'O pagamento da entrega está no ciclo — decide a entrega primeiro (confirmar ou contestar). Um pagamento congelado espera o veredito da revisão.' },
        409,
      );
    }
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Primeiro toque, ou o mesmo a repetir → só regista o pedido e espera o outro.
  if (!orc.cancel_por || orc.cancel_por === user.id) {
    const { error } = await admin
      .from('orcamentos')
      .update({ cancel_por: user.id })
      .eq('id', orc.id)
      .eq('estado', 'selado');
    if (error) return json({ error: 'não consegui registar o pedido' }, 500);
    return json({ ok: true, estado: 'selado', aguarda_o_outro: true });
  }

  // Segundo toque, pela OUTRA parte → acordo → libertar holds e fechar.
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
  if (orc.hold_b) await libertarHold(stripeKey, orc.hold_b);
  if (orc.hold_a) await libertarHold(stripeKey, orc.hold_a);

  const { error } = await admin
    .from('orcamentos')
    .update({ estado: 'cancelado' })
    .eq('id', orc.id)
    .eq('estado', 'selado');
  if (error) {
    return json({ error: 'holds libertados mas não consegui fechar o estado' }, 500);
  }

  return json({ ok: true, estado: 'cancelado' });
});
