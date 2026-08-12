// HONRA — PAGAMENTO NA ENTREGA (065): a decisão do cliente.
//
// Com o pagamento retido ('pago_retido'), A (de_perfil) tem DOIS — e só dois —
// poderes unilaterais:
//
//   { acao:'confirmar' }        → o dinheiro TRANSFERE-SE ao Connect de B
//       ('libertado'). Se B ainda não tem conta Connect ativa, a confirmação
//       NÃO bloqueia: fica 'libertado' com transferência pendente
//       (pagamento_transfer=null) + aviso claro a B; o resolver re-tenta
//       (idempotente — nunca duplica).
//   { acao:'contestar', texto } → o dinheiro CONGELA ('congelado') — não anda
//       para lado nenhum. O texto de evidência é OBRIGATÓRIO. Entra na fila da
//       revisão existente (checkpoint-disputa lista os congelados); só o
//       veredito da revisão o tira dali. A DEVOLUÇÃO NUNCA É BOTÃO DE A.
//
// CORRIDAS: a transição é reclamada com UPDATE … WHERE pagamento_estado=
// 'pago_retido' — confirmar e contestar em simultâneo, só um ganha; o segundo
// recebe 409 honesto. O resolver usa a mesma cláusula.
//
// Precisa de STRIPE_SECRET_KEY (transfer) + SUPABASE_SERVICE_ROLE_KEY.
// JWT obrigatório (deploy SEM --no-verify-jwt).

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { transferirEntrega } from '../_shared/pagamentos.ts';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // 1) Quem és tu?
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'não autenticado' }, 401);

  // 2) Corpo.
  let orcamento_id: string | undefined;
  let acao: string | undefined;
  let texto: string | undefined;
  try {
    const body = await req.json();
    orcamento_id = body?.orcamento_id;
    acao = typeof body?.acao === 'string' ? body.acao.trim() : undefined;
    texto = typeof body?.texto === 'string' ? body.texto.trim() : undefined;
  } catch {
    // sem corpo válido
  }
  if (!orcamento_id) return json({ error: 'falta o orcamento_id' }, 400);
  if (acao !== 'confirmar' && acao !== 'contestar') {
    return json({ error: 'ação inválida (confirmar ou contestar)' }, 400);
  }

  // 3) O orçamento (RLS limita às partes; validamos na mesma). Tolerância de
  //    migração: colunas em falta → resposta honesta, nunca crash.
  const { data: orc, error: erroOrc } = await supabase
    .from('orcamentos')
    .select('id, de_perfil, para_perfil, estado, valor_proposta, pagamento_estado, pagamento_intent')
    .eq('id', orcamento_id)
    .single();
  if (erroOrc) {
    if (/column|pagamento_/i.test(erroOrc.message ?? '')) {
      return json(
        { error: 'O pagamento na entrega ainda não está ativo nesta base de dados (migração 065 por aplicar).' },
        503,
      );
    }
    return json({ error: 'orçamento não encontrado' }, 404);
  }
  if (!orc) return json({ error: 'orçamento não encontrado' }, 404);

  if (user.id !== orc.de_perfil) {
    return json({ error: 'Só o cliente deste negócio decide a entrega.' }, 403);
  }
  if (orc.pagamento_estado !== 'pago_retido') {
    return json({ error: 'Este pagamento já não está à espera da tua decisão — recarrega o negócio.' }, 409);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const agora = new Date().toISOString();

  // ============================================================
  // CONTESTAR — congela. Texto de evidência OBRIGATÓRIO. O aviso às duas
  // partes (e a fila da revisão) disparam no trigger notificar_ciclo.
  // ============================================================
  if (acao === 'contestar') {
    if (!texto) {
      return json(
        { error: 'A contestação precisa de evidência escrita: diz o que não corresponde ao combinado.' },
        400,
      );
    }
    const { data: upd, error: eUp } = await admin
      .from('orcamentos')
      .update({
        pagamento_estado: 'congelado',
        pagamento_contestacao: texto.slice(0, 2000),
        pagamento_contestado_em: agora,
      })
      .eq('id', orc.id)
      .eq('pagamento_estado', 'pago_retido') // reclama a transição — corridas perdem aqui
      .select('id');
    if (eUp) return json({ error: 'não consegui registar a contestação' }, 500);
    if (!upd || upd.length === 0) {
      return json({ error: 'o pagamento mudou entretanto — recarrega e tenta de novo' }, 409);
    }
    return json({ ok: true, pagamento: 'congelado' });
  }

  // ============================================================
  // CONFIRMAR — liberta. Primeiro reclama-se a transição (o dinheiro fica
  // juridicamente decidido); a transferência vem a seguir e, se falhar, fica
  // PENDENTE com re-tentativa do resolver — nunca um beco, nunca um duplo.
  // ============================================================
  const { data: upd, error: eUp } = await admin
    .from('orcamentos')
    .update({ pagamento_estado: 'libertado', libertado_em: agora })
    .eq('id', orc.id)
    .eq('pagamento_estado', 'pago_retido')
    .select('id');
  if (eUp) return json({ error: 'não consegui registar a confirmação' }, 500);
  if (!upd || upd.length === 0) {
    return json({ error: 'o pagamento mudou entretanto — recarrega e tenta de novo' }, 409);
  }

  // A conta Connect de B — se existir e a chave estiver montada, transfere já.
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  let transferido = false;
  let semConta = false;
  if (stripeKey && orc.pagamento_intent) {
    const { data: conta } = await admin
      .from('contas_connect')
      .select('stripe_account_id, estado')
      .eq('perfil_id', orc.para_perfil)
      .maybeSingle();
    const destino = (conta as { stripe_account_id?: string | null } | null)?.stripe_account_id;
    if (!destino) {
      semConta = true;
    } else {
      const r = await transferirEntrega({
        stripeKey,
        contaDestino: destino,
        piId: orc.pagamento_intent,
        valorCentimos: Math.round(Number(orc.valor_proposta) * 100),
        orcamentoId: orc.id,
      });
      if (r.ok && r.transferId) {
        await admin
          .from('orcamentos')
          .update({ pagamento_transfer: r.transferId })
          .eq('id', orc.id)
          .eq('pagamento_estado', 'libertado');
        transferido = true;
      }
      // Falha transitória → fica pendente em silêncio; o resolver re-tenta
      // (idempotente). O aviso "falta a tua conta" seria mentira aqui.
    }
  }

  // SEM CONTA → B fica a saber COM CLAREZA o que falta, sem a confirmação de A
  // ficar refém disso. O resolver re-tenta todos os dias quando a conta nascer.
  if (semConta) {
    await admin.rpc('criar_aviso', {
      p_perfil: orc.para_perfil,
      p_tipo: 'pag_pendente',
      p_orcamento: orc.id,
      p_titulo: 'Pagamento libertado — falta a tua conta',
      p_corpo:
        'O cliente confirmou a entrega e o pagamento está libertado para ti. Para o receberes, ativa os pagamentos nas Definições (Ativar pagamentos) — a transferência segue sozinha assim que a conta estiver pronta.',
      p_prazo: null,
      p_urgente: true,
    });
  }

  return json({ ok: true, pagamento: 'libertado', transferido });
});
