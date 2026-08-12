// HONRA — Checkpoint do aperto de mão INTERNO (fatia D — sem dinheiro).
//
// A fuga D (docs/RED-TEAM-FUGAS.md §3 D) fechou-se aqui: a marca deixou de cair
// por INAÇÃO ("quem não tocou leva a marca"). Agora julga-se SUBSTÂNCIA:
//
//   • PRESTADOR (para_perfil) apresenta evolução → EXIGE evidência (ficheiro ou
//     texto). Toque vazio = NÃO agiu (decisão 1). Checkpoint 'pendente'→'entregue'.
//   • RECETOR (de_perfil) tem 3 opções sobre a evidência (decisão 2):
//       'confirmar' → 'confirmado' (sem marca; se todos os checkpoints ficarem
//                     confirmados, o orçamento fecha 'honrado').
//       'contestar' → 'contestado' (NÃO marca ninguém; vai a REVISÃO admin, com
//                     o ónus da prova no prestador — espelha convite-disputa,
//                     SEM cobrança).
//       silêncio    → não é ação aqui; o resolver marca o recetor SÓ depois de
//                     avisado + relembrado, ao prazo (decisão 3).
//
// SEM DINHEIRO (decisão 15/07, migração 032): a reputação é a caução; não há
// holds nem captura. Só se libertam holds LEGADOS se aparecerem (segurança).
//
// Múltiplos checkpoints (decisão 5): o corpo traz `checkpoint_id`; cada
// checkpoint corre esta mesma máquina. Sem `checkpoint_id` cai no caminho
// LEGADO (orçamentos antigos sem checkpoints — a_agiu_em/b_agiu_em).
//
// Precisa de STRIPE_SECRET_KEY (só holds legados) + SUPABASE_SERVICE_ROLE_KEY.
// JWT obrigatório (deploy SEM --no-verify-jwt).

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

// Liberta (cancela) um hold LEGADO no Stripe — nada é cobrado, nunca.
async function libertarHold(stripeKey: string, paymentIntentId: string) {
  const res = await fetch(
    `https://api.stripe.com/v1/payment_intents/${paymentIntentId}/cancel`,
    { method: 'POST', headers: { Authorization: `Bearer ${stripeKey}` } },
  );
  return res.ok ? null : (await res.json())?.error?.message ?? 'erro ao libertar';
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
  let checkpoint_id: string | undefined;
  let acao: string | undefined;
  let ficheiro: string | undefined; // caminho no bucket 'evolucoes'
  let texto: string | undefined; // substância textual / texto de contestação
  try {
    const body = await req.json();
    orcamento_id = body?.orcamento_id;
    checkpoint_id = body?.checkpoint_id;
    acao = typeof body?.acao === 'string' ? body.acao.trim() : undefined;
    ficheiro = body?.ficheiro;
    texto = typeof body?.texto === 'string' ? body.texto.trim() : undefined;
  } catch {
    // sem corpo
  }
  if (!orcamento_id) return json({ error: 'falta o orcamento_id' }, 400);

  const { data: orc, error: erroOrc } = await supabase
    .from('orcamentos')
    .select('id, de_perfil, para_perfil, estado, hold_a, hold_b, a_agiu_em, b_agiu_em')
    .eq('id', orcamento_id)
    .single();
  if (erroOrc || !orc) return json({ error: 'orçamento não encontrado' }, 404);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const agora = new Date().toISOString();
  const hash8 = orc.id.slice(0, 8);

  // ============================================================
  // CAMINHO NOVO — checkpoint identificado (fatia D)
  // ============================================================
  if (checkpoint_id) {
    if (orc.estado !== 'selado') {
      return json({ error: 'o checkpoint só corre com o aperto de mão selado' }, 400);
    }
    const euPrestador = user.id === orc.para_perfil; // B apresenta
    const euRecetor = user.id === orc.de_perfil; // A recebe
    if (!euPrestador && !euRecetor) {
      return json({ error: 'não fazes parte deste orçamento' }, 403);
    }

    const { data: cp, error: erroCp } = await admin
      .from('checkpoints_orcamento')
      .select('id, orcamento_id, ordem, descricao, estado')
      .eq('id', checkpoint_id)
      .eq('orcamento_id', orc.id)
      .single();
    if (erroCp || !cp) return json({ error: 'checkpoint não encontrado' }, 404);

    // ---- PRESTADOR apresenta evidência (decisão 1: substância obrigatória) ----
    if (euPrestador) {
      if (cp.estado !== 'pendente') {
        return json({ error: 'este checkpoint já não está à espera de evolução' }, 409);
      }
      // Conta suspensa: apresentar evolução é um gesto de marketplace — travado
      // enquanto durar a suspensão (escada de suspensão, migração 048).
      {
        const { data: susp } = await supabase.rpc('esta_suspenso', { p_perfil: user.id });
        if (susp === true) {
          return json(
            { suspenso: true, error: 'A tua conta está suspensa: não podes apresentar evolução enquanto durar a suspensão.' },
            403,
          );
        }
      }
      // A evidência tem de ter SUBSTÂNCIA: ficheiro na pasta deste orçamento, ou texto.
      const ficheiroOk =
        ficheiro && ficheiro.startsWith(`${orc.id}/`) ? ficheiro : undefined;
      const textoOk = texto && texto.length > 0 ? texto.slice(0, 2000) : undefined;
      if (!ficheiroOk && !textoOk) {
        return json(
          { error: 'Precisas de anexar evidência (foto/ficheiro ou uma descrição) para apresentar a evolução.' },
          400,
        );
      }
      const { data: upd, error: eUp } = await admin
        .from('checkpoints_orcamento')
        .update({
          estado: 'entregue',
          evidencia_ficheiro: ficheiroOk ?? null,
          evidencia_texto: textoOk ?? null,
          apresentado_em: agora,
          aviso_entregue: true, // o recetor é avisado in-app (o sino "entrega" sempre)
        })
        .eq('id', cp.id)
        .eq('estado', 'pendente')
        .select('id');
      if (eUp) return json({ error: 'não consegui registar a evolução' }, 500);
      if (!upd || upd.length === 0) {
        return json({ error: 'o checkpoint mudou entretanto — recarrega e tenta de novo' }, 409);
      }
      // Avisa o recetor: há evidência para confirmar ou contestar.
      await admin.rpc('criar_aviso', {
        p_perfil: orc.de_perfil,
        p_tipo: 'apresentou',
        p_orcamento: orc.id,
        p_titulo: 'Evolução apresentada',
        p_corpo: `Chegou evidência no checkpoint "${cp.descricao}". Confirma se corresponde — ou contesta se não recebeste.`,
        p_prazo: null,
        p_urgente: true,
      });
      return json({ ok: true, checkpoint: 'entregue' });
    }

    // ---- RECETOR confirma / contesta a evidência (decisão 2) ----
    if (acao !== 'confirmar' && acao !== 'contestar') {
      return json({ error: 'ação inválida (confirmar ou contestar)' }, 400);
    }
    if (cp.estado !== 'entregue') {
      return json({ error: 'este checkpoint ainda não tem evolução para decidir' }, 409);
    }

    if (acao === 'confirmar') {
      const { data: upd, error: eUp } = await admin
        .from('checkpoints_orcamento')
        .update({ estado: 'confirmado', confirmado_em: agora, resolvido_em: agora })
        .eq('id', cp.id)
        .eq('estado', 'entregue')
        .select('id');
      if (eUp) return json({ error: 'não consegui registar a confirmação' }, 500);
      if (!upd || upd.length === 0) {
        return json({ error: 'o checkpoint mudou entretanto — recarrega e tenta de novo' }, 409);
      }
      // Agrega: se todos os checkpoints ficaram confirmados, o orçamento fecha 'honrado'.
      const { data: desfecho } = await admin.rpc('avaliar_checkpoints_orcamento', {
        p_orc: orc.id,
      });
      // Se fechou honrado, liberta holds LEGADOS (segurança; o fluxo novo não os tem).
      if (desfecho === 'honrado') {
        const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
        if (stripeKey && orc.hold_a) await libertarHold(stripeKey, orc.hold_a);
        if (stripeKey && orc.hold_b) await libertarHold(stripeKey, orc.hold_b);
      } else {
        await admin.rpc('criar_aviso', {
          p_perfil: orc.para_perfil,
          p_tipo: 'confirmou',
          p_orcamento: orc.id,
          p_titulo: 'Evolução confirmada',
          p_corpo: `O contratante confirmou o checkpoint "${cp.descricao}".`,
          p_prazo: null,
          p_urgente: false,
        });
      }
      return json({ ok: true, checkpoint: 'confirmado', orcamento: desfecho ?? 'selado' });
    }

    // 'contestar' — NÃO marca ninguém; vai a revisão admin (ónus no prestador).
    const contest = texto && texto.length > 0 ? texto.slice(0, 1000) : null;
    const { data: upd, error: eUp } = await admin
      .from('checkpoints_orcamento')
      // relembrado_em a null: o relógio da revisão (063) parte do zero, para o
      // aviso ao admin a meio do prazo não ser comido por um lembrete da fase
      // `entregue`.
      .update({ estado: 'contestado', contestado_em: agora, contestacao_texto: contest, relembrado_em: null })
      .eq('id', cp.id)
      .eq('estado', 'entregue')
      .select('id');
    if (eUp) return json({ error: 'não consegui registar a contestação' }, 500);
    if (!upd || upd.length === 0) {
      return json({ error: 'o checkpoint mudou entretanto — recarrega e tenta de novo' }, 409);
    }
    await admin.rpc('criar_aviso', {
      p_perfil: orc.para_perfil,
      p_tipo: 'contestou',
      p_orcamento: orc.id,
      p_titulo: 'O contratante contestou a evolução',
      p_corpo: `O checkpoint "${cp.descricao}" (ref ${hash8}) foi contestado. Nada fica marcado — vai a revisão do Honra, com o ónus da prova do teu lado.`,
      p_prazo: null,
      p_urgente: false,
    });
    return json({ ok: true, checkpoint: 'contestado' });
  }

  // ============================================================
  // CAMINHO LEGADO — orçamentos sem checkpoints (a_agiu_em / b_agiu_em)
  // (mantido intacto para negócios anteriores à fatia D; o fluxo novo usa
  //  sempre checkpoints, por isso este ramo não serve negócios novos.)
  // ============================================================
  if (orc.estado !== 'selado') {
    return json({ error: 'o checkpoint só está aberto com o aperto de mão selado' }, 400);
  }

  let a_agiu = orc.a_agiu_em as string | null;
  let b_agiu = orc.b_agiu_em as string | null;
  if (user.id === orc.de_perfil) {
    a_agiu = a_agiu ?? agora;
  } else if (user.id === orc.para_perfil) {
    b_agiu = b_agiu ?? agora;
  } else {
    return json({ error: 'não fazes parte deste orçamento' }, 403);
  }

  const ficheiroOk = ficheiro && ficheiro.startsWith(`${orcamento_id}/`) ? ficheiro : undefined;
  const anexo = user.id === orc.para_perfil && ficheiroOk ? { evolucao_ficheiro: ficheiroOk } : {};

  if (!a_agiu || !b_agiu) {
    const { error } = await admin
      .from('orcamentos')
      .update({ a_agiu_em: a_agiu, b_agiu_em: b_agiu, ...anexo })
      .eq('id', orc.id)
      .eq('estado', 'selado');
    if (error) return json({ error: 'não consegui registar a ação' }, 500);
    return json({ ok: true, estado: 'selado', aguarda_o_outro: true });
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
  if (orc.hold_b) await libertarHold(stripeKey, orc.hold_b);
  if (orc.hold_a) await libertarHold(stripeKey, orc.hold_a);

  const { error } = await admin
    .from('orcamentos')
    .update({ estado: 'honrado', a_agiu_em: a_agiu, b_agiu_em: b_agiu, ...anexo })
    .eq('id', orc.id)
    .eq('estado', 'selado');
  if (error) {
    return json({ error: 'holds libertados mas não consegui fechar o estado' }, 500);
  }
  return json({ ok: true, estado: 'honrado' });
});
