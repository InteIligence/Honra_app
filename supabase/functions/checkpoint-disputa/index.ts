// HONRA — Checkpoint interno (fatia D, camada 3): REVISÃO admin. SEM dinheiro.
// Espelha o convite-disputa, mas o interno não tem cobrança — a moeda é a marca.
//
// Só o resíduo he-said/she-said chega aqui: checkpoints 'contestado' (o recetor
// disse "não recebi / não corresponde"). O ónus da prova é do PRESTADOR (quem
// apresentou). Um ADMIN decide:
//
//   { acao:'listar' }                              → checkpoints contestados
//       + (065) entregas com pagamento CONGELADO (a contestação do dinheiro).
//   { acao:'resolver', checkpoint_id, decisao }    → 'prestador' | 'recetor':
//       'prestador' → dá razão ao PRESTADOR (a evidência corresponde): checkpoint
//         → 'confirmado', sem marca. Se todos ficarem confirmados, o orçamento
//         fecha 'honrado'.
//       'recetor'   → dá razão ao RECETOR (não recebeu / não corresponde): o
//         prestador falhou → checkpoint 'incumprido' (quem_falhou='prestador') →
//         o orçamento fecha 'incumprido' com a marca no prestador.
//
//   (065) { acao:'resolver_entrega', orcamento_id, decisao } — o VEREDITO sobre
//   o dinheiro congelado do pagamento na entrega. É a ÚNICA porta de saída do
//   estado 'congelado' (deliberado: sem automatismo; o destino do congelado é
//   decisão pendente com o advogado — o resolver nunca lhe toca):
//       'profissional' → contestação INFUNDADA: transfer ao Connect de B
//         ('libertado'; sem conta ativa → pendente + re-tentativa do resolver)
//         e MARCA NO CARRIL DO CONTRATANTE (registar_infracao, 048).
//       'cliente'      → devolução: refund total ao cartão de A ('devolvido').
//         O cliente nunca teve acesso ao limpo — devolve-se sem ter levado a obra.
//
// Deploy COM JWT (o admin está autenticado). Só is_admin passa.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { reembolsarEntrega, transferirEntrega } from '../_shared/pagamentos.ts';

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
  if (req.method !== 'POST') return json({ error: 'método não suportado' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'não autenticado' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Só ADMIN passa (mesmo padrão do convite-disputa / profissao-rever).
  const { data: eu } = await admin.from('perfis').select('is_admin').eq('id', user.id).maybeSingle();
  if (!(eu as { is_admin?: boolean } | null)?.is_admin) return json({ error: 'sem permissão' }, 403);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    return json({ error: 'corpo inválido' }, 400);
  }
  const acao = String(body.acao ?? '').trim();
  const agora = new Date().toISOString();

  // ---------- 'listar' → os checkpoints contestados (para o ecrã admin). ----------
  if (acao === 'listar') {
    const { data: disputas } = await admin
      .from('checkpoints_orcamento')
      .select(
        'id, descricao, contestacao_texto, contestado_em, evidencia_ficheiro, evidencia_texto, ' +
        'orc:orcamentos!inner(id, descricao, de_perfil, para_perfil, ' +
        'de:perfis!de_perfil(nome), para:perfis!para_perfil(nome))',
      )
      .eq('estado', 'contestado')
      .order('contestado_em', { ascending: true });

    // (065) Entregas com o pagamento CONGELADO — a fila do dinheiro. Tolerante
    // à migração: colunas em falta → lista vazia, o resto do ecrã vive.
    let entregas: unknown[] = [];
    {
      const { data, error } = await admin
        .from('orcamentos')
        .select(
          'id, descricao, valor_proposta, pagamento_contestacao, pagamento_contestado_em, entrega_prova, ' +
          'de:perfis!de_perfil(nome), para:perfis!para_perfil(nome)',
        )
        .eq('pagamento_estado', 'congelado')
        .order('pagamento_contestado_em', { ascending: true });
      if (!error && data) entregas = data;
    }

    return json({ ok: true, disputas: disputas ?? [], entregas });
  }

  // ---------- (065) 'resolver_entrega' → o veredito sobre o dinheiro congelado. ----------
  if (acao === 'resolver_entrega') {
    const decisao = String(body.decisao ?? '').trim();
    if (decisao !== 'profissional' && decisao !== 'cliente') {
      return json({ error: 'decisão inválida' }, 400);
    }
    const { data: orc } = await admin
      .from('orcamentos')
      .select('id, de_perfil, para_perfil, valor_proposta, pagamento_estado, pagamento_intent')
      .eq('id', String(body.orcamento_id ?? ''))
      .maybeSingle();
    if (!orc) return json({ error: 'orçamento não encontrado' }, 404);
    if (orc.pagamento_estado !== 'congelado') {
      return json({ error: 'este pagamento não está congelado' }, 409);
    }
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey || !orc.pagamento_intent) {
      return json({ error: 'Pagamentos indisponíveis: falta a chave da Stripe ou a referência do pagamento.' }, 503);
    }

    if (decisao === 'cliente') {
      // DEVOLUÇÃO — só existe aqui, como veredito. Refund total; o estado só
      // muda DEPOIS de o dinheiro voltar (falha → continua congelado, honesto).
      const r = await reembolsarEntrega({
        stripeKey,
        piId: orc.pagamento_intent,
        orcamentoId: orc.id,
      });
      if (!r.ok) return json({ error: `não consegui devolver: ${r.erro}` }, 502);
      const { data: upd } = await admin
        .from('orcamentos')
        .update({ pagamento_estado: 'devolvido' })
        .eq('id', orc.id)
        .eq('pagamento_estado', 'congelado')
        .select('id');
      if (!upd || upd.length === 0) {
        return json({ error: 'o pagamento mudou entretanto — recarrega' }, 409);
      }
      return json({ ok: true, pagamento: 'devolvido' });
    }

    // 'profissional' — contestação INFUNDADA: liberta a B e marca o carril do
    // CONTRATANTE (o 2.º carril: o contratante também responde pela palavra).
    const { data: upd } = await admin
      .from('orcamentos')
      .update({ pagamento_estado: 'libertado', libertado_em: agora })
      .eq('id', orc.id)
      .eq('pagamento_estado', 'congelado')
      .select('id');
    if (!upd || upd.length === 0) {
      return json({ error: 'o pagamento mudou entretanto — recarrega' }, 409);
    }
    let transferido = false;
    {
      const { data: conta } = await admin
        .from('contas_connect')
        .select('stripe_account_id')
        .eq('perfil_id', orc.para_perfil)
        .maybeSingle();
      const destino = (conta as { stripe_account_id?: string | null } | null)?.stripe_account_id;
      if (destino) {
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
        // Falha transitória → pendente em silêncio; o resolver re-tenta.
      } else {
        // B sem conta Connect: o pagamento está dele, falta a porta de entrada.
        await admin.rpc('criar_aviso', {
          p_perfil: orc.para_perfil,
          p_tipo: 'pag_pendente',
          p_orcamento: orc.id,
          p_titulo: 'Pagamento libertado — falta a tua conta',
          p_corpo:
            'A revisão libertou o pagamento da entrega para ti. Ativa os pagamentos nas Definições para o receberes — a transferência segue sozinha assim que a conta estiver pronta.',
          p_prazo: null,
          p_urgente: true,
        });
      }
    }
    // A marca no carril do contratante — pela escada existente (048), com
    // origem auditável. 1.ª marca = pública sem suspensão; reincidência sobe.
    await admin.rpc('registar_infracao', {
      p_perfil: orc.de_perfil,
      p_tipo: 'incumprimento',
      p_origem: `entrega:contestacao_infundada:${orc.id}`,
    });
    await admin.rpc('criar_aviso', {
      p_perfil: orc.de_perfil,
      p_tipo: 'incumprido',
      p_orcamento: orc.id,
      p_titulo: 'Contestação sem fundamento',
      p_corpo:
        'A revisão do Honra confirmou a entrega: o pagamento foi libertado ao profissional e a contestação ficou marcada no teu registo de contratante.',
      p_prazo: null,
      p_urgente: false,
    });
    return json({ ok: true, pagamento: 'libertado', transferido });
  }

  if (acao !== 'resolver') return json({ error: 'ação inválida' }, 400);
  const decisao = String(body.decisao ?? '').trim();
  if (decisao !== 'prestador' && decisao !== 'recetor')
    return json({ error: 'decisão inválida' }, 400);

  const { data: cp } = await admin
    .from('checkpoints_orcamento')
    .select('id, orcamento_id, descricao, estado')
    .eq('id', String(body.checkpoint_id ?? ''))
    .maybeSingle();
  if (!cp) return json({ error: 'checkpoint não encontrado' }, 404);
  if (cp.estado !== 'contestado') return json({ error: 'este checkpoint não está em revisão' }, 409);

  const { data: orc } = await admin
    .from('orcamentos')
    .select('id, de_perfil, para_perfil')
    .eq('id', cp.orcamento_id)
    .maybeSingle();
  if (!orc) return json({ error: 'orçamento não encontrado' }, 404);

  if (decisao === 'prestador') {
    // A evidência corresponde → confirma o checkpoint, sem marca.
    const { error } = await admin
      .from('checkpoints_orcamento')
      .update({ estado: 'confirmado', confirmado_em: agora, resolvido_em: agora })
      .eq('id', cp.id).eq('estado', 'contestado');
    if (error) return json({ error: 'não foi possível resolver. Tenta de novo.' }, 500);
    await admin.rpc('criar_aviso', {
      p_perfil: orc.para_perfil, p_tipo: 'confirmou', p_orcamento: orc.id,
      p_titulo: 'Revisão a teu favor',
      p_corpo: `A revisão do Honra confirmou o checkpoint "${cp.descricao}". Sem marca.`,
      p_prazo: null, p_urgente: false,
    });
    const { data: desfecho } = await admin.rpc('avaliar_checkpoints_orcamento', { p_orc: orc.id });
    return json({ ok: true, checkpoint: 'confirmado', orcamento: desfecho ?? 'selado' });
  }

  // 'recetor' → o prestador não provou a entrega → marca no prestador.
  const { error } = await admin
    .from('checkpoints_orcamento')
    .update({ estado: 'incumprido', quem_falhou: 'prestador', resolvido_em: agora })
    .eq('id', cp.id).eq('estado', 'contestado');
  if (error) return json({ error: 'não foi possível resolver. Tenta de novo.' }, 500);
  await admin.rpc('criar_aviso', {
    p_perfil: orc.para_perfil, p_tipo: 'incumprido', p_orcamento: orc.id,
    p_titulo: 'Checkpoint não comprovado',
    p_corpo: `A revisão do Honra deu razão ao contratante no checkpoint "${cp.descricao}". Ficou marcado no teu registo.`,
    p_prazo: null, p_urgente: false,
  });
  const { data: desfecho } = await admin.rpc('avaliar_checkpoints_orcamento', { p_orc: orc.id });
  return json({ ok: true, checkpoint: 'incumprido', orcamento: desfecho ?? 'selado' });
});
