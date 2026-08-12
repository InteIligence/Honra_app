// HONRA — Resolver agendado do aperto de mão (o relógio do compromisso).
// Corre uma vez por dia (pg_cron → pg_net). Faz o que os humanos não fazem
// sozinhos:
//
//   0) Lembrete de véspera: toca em quem ainda não agiu. A marca nunca é
//      surpresa; empurra para a ação.
//   1) Selo não fechado a tempo: 'aceite' há mais de HORAS_SELO (48h) e A não
//      selou → 'expirado'. Sem marca.
//   2) [LEGADO] Checkpoint dos orçamentos SEM checkpoints (a_agiu_em/b_agiu_em).
//   3) [FATIA D] Checkpoints do orçamento (checkpoints_orcamento): ancorados ao
//      PRAZO combinado (decisão 4), com mínimo de segurança (nunca antes de
//      selado+24h). A marca julga SUBSTÂNCIA, não toques:
//        · checkpoint 'pendente' ao prazo → prestador não apresentou → MARCA no
//          PRESTADOR (para_perfil).
//        · checkpoint 'entregue' ao prazo (prestador apresentou COM evidência) e
//          recetor em SILÊNCIO → MARCA no RECETOR (de_perfil), MAS só depois de
//          avisado (in-app) + RELEMBRADO (véspera). Informada, nunca emboscada
//          (decisão 3).
//        · 'contestado' → NÃO se toca (aguarda a revisão admin — decisão 2).
//      A agregação (avaliar_checkpoints_orcamento) fecha o orçamento em
//      'honrado'/'incumprido' e os contadores 016/033 disparam como sempre.
//
// DECISÃO 15/07 (migração 032): a reputação é a caução — o fluxo interno NÃO tem
// dinheiro nos APERTOS. Este resolver NUNCA captura. Holds LEGADOS vivos são
// LIBERTADOS.
//
//   4) [065 · PAGAMENTO NA ENTREGA] O relógio da confirmação:
//        · 'pago_retido' com confirmar_ate à porta (véspera) → LEMBRETE a A,
//          uma vez (pagamento_relembrado_em) — a libertação nunca é emboscada.
//        · 'pago_retido' vencido → se A foi avisado E relembrado, liberta a B
//          (silêncio = libertação, o princípio da fatia D); senão relembra
//          primeiro e adia um ciclo.
//        · 'libertado' sem transfer (B sem conta Connect na altura) → re-tenta
//          a transferência (Idempotency-Key por orçamento — nunca duplica).
//        · 'congelado' NÃO SE TOCA: só sai por veredito da revisão
//          (checkpoint-disputa) — deliberado; o destino do dinheiro congelado é
//          decisão pendente com o advogado.
//      Tolerante à migração: colunas 065 em falta → secção salta com nota.
//
// Segurança: só corre com o RESOLVER_SECRET certo (header x-resolver-secret) ou
// service_role. Para testar aceita no corpo { dias_checkpoint, horas_selo,
// dias_lembrete, forcar_checkpoints, forcar_pagamentos } para encurtar prazos.
//
// Precisa de SUPABASE_SERVICE_ROLE_KEY + RESOLVER_SECRET (+ STRIPE_SECRET_KEY
// para holds legados e para as transferências do pagamento na entrega).

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { transferirEntrega } from '../_shared/pagamentos.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function libertarLegado(stripeKey: string | undefined, pi: string | null, erros: string[], rotulo: string) {
  if (!pi) return;
  if (!stripeKey) {
    erros.push(`hold legado ${rotulo} (${pi}) sem STRIPE_SECRET_KEY para libertar`);
    return;
  }
  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${pi}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    erros.push(`libertar legado ${rotulo}: ${body?.error?.message ?? 'erro'}`);
  }
}

// Fim do dia (UTC) de uma data 'AAAA-MM-DD'.
function fimDoDia(data: string): number {
  return Date.parse(`${data}T23:59:59Z`);
}

const MIN_SEGURANCA_H = 24; // a marca nunca cai antes de selado + 24h (decisão 4)

Deno.serve(async (req) => {
  const secret = Deno.env.get('RESOLVER_SECRET') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const dado = req.headers.get('x-resolver-secret') ?? '';
  const autorizado = (secret && dado === secret) || auth === `Bearer ${serviceKey}`;
  if (!autorizado) return json({ error: 'não autorizado' }, 401);

  let dias_checkpoint = 6;
  let horas_selo = 48;
  let dias_lembrete = 5;
  let dias_contestacao = 7; // dias que o admin tem para julgar uma contestação (063 · #3)
  let forcar_checkpoints = false; // teste: trata todos os checkpoints como já no prazo
  let forcar_pagamentos = false; // teste (065): trata os pago_retido como já vencidos
  try {
    const body = await req.json();
    if (typeof body?.dias_checkpoint === 'number') dias_checkpoint = body.dias_checkpoint;
    if (typeof body?.horas_selo === 'number') horas_selo = body.horas_selo;
    if (typeof body?.dias_lembrete === 'number') dias_lembrete = body.dias_lembrete;
    if (typeof body?.dias_contestacao === 'number') dias_contestacao = body.dias_contestacao;
    if (typeof body?.forcar_checkpoints === 'boolean') forcar_checkpoints = body.forcar_checkpoints;
    if (typeof body?.forcar_pagamentos === 'boolean') forcar_pagamentos = body.forcar_pagamentos;
  } catch {
    // sem corpo → prazos por omissão
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

  const agora = Date.now();
  const agoraIso = new Date(agora).toISOString();
  const limiteSelo = new Date(agora - horas_selo * 3600_000).toISOString();
  const limiteCheck = new Date(agora - dias_checkpoint * 86_400_000).toISOString();
  const limiteLembrete = new Date(agora - dias_lembrete * 86_400_000).toISOString();

  const resumo = {
    expirados: 0, honrados: 0, incumpridos: 0, lembretes: 0,
    checkpoints_marcados: 0, contestacoes_arquivadas: 0, orcamentos_agregados: 0,
    holds_legados_libertados: 0,
    // 065 — pagamento na entrega:
    pagamentos_lembretes: 0, pagamentos_libertados: 0,
    transferencias_feitas: 0, transferencias_pendentes: 0,
    erros: [] as string[],
  };

  // Orçamentos que JÁ correm a máquina nova (checkpoints) — os caminhos legados
  // (0 e 2) saltam-nos, para não os marcar pelo relógio cego nem por a_agiu/b_agiu.
  const { data: cpOrcs } = await admin.from('checkpoints_orcamento').select('orcamento_id');
  const comCheckpoints = new Set((cpOrcs ?? []).map((r) => r.orcamento_id as string));

  // === 0) LEMBRETE DE VÉSPERA (legado — só orçamentos SEM checkpoints) ===
  const { data: quaseFora } = await admin
    .from('orcamentos')
    .select('id, de_perfil, para_perfil, selado_em, a_agiu_em, b_agiu_em')
    .eq('estado', 'selado')
    .lte('selado_em', limiteLembrete)
    .gt('selado_em', limiteCheck);

  for (const o of quaseFora ?? []) {
    if (comCheckpoints.has(o.id)) continue;
    const prazo = new Date(new Date(o.selado_em).getTime() + dias_checkpoint * 86_400_000).toISOString();
    if (!o.b_agiu_em) {
      await admin.rpc('criar_aviso', {
        p_perfil: o.para_perfil, p_tipo: 'lembrete', p_orcamento: o.id,
        p_titulo: 'Última chamada — mostra evolução hoje',
        p_corpo: 'A tua palavra está dada. Apresenta a evolução antes do checkpoint fechar.',
        p_prazo: prazo, p_urgente: true,
      });
      resumo.lembretes++;
    }
    if (!o.a_agiu_em) {
      await admin.rpc('criar_aviso', {
        p_perfil: o.de_perfil, p_tipo: 'lembrete', p_orcamento: o.id,
        p_titulo: 'Última chamada — confirma a evolução hoje',
        p_corpo: 'A tua palavra está dada. Confirma a evolução antes do checkpoint fechar.',
        p_prazo: prazo, p_urgente: true,
      });
      resumo.lembretes++;
    }
  }

  // === 1) Selo não fechado a tempo → 'expirado' (sem marca). ===
  const { data: parados } = await admin
    .from('orcamentos')
    .select('id, hold_b')
    .eq('estado', 'aceite')
    .lt('aceite_em', limiteSelo);

  for (const o of parados ?? []) {
    if (o.hold_b) {
      await libertarLegado(stripeKey, o.hold_b, resumo.erros, `B ${o.id}`);
      resumo.holds_legados_libertados++;
    }
    const { error } = await admin
      .from('orcamentos').update({ estado: 'expirado' })
      .eq('id', o.id).eq('estado', 'aceite');
    if (!error) resumo.expirados++;
  }

  // === 2) [LEGADO] Checkpoint dos orçamentos SEM checkpoints ===
  const { data: selados } = await admin
    .from('orcamentos')
    .select('id, hold_a, hold_b, a_agiu_em, b_agiu_em')
    .eq('estado', 'selado')
    .lt('selado_em', limiteCheck);

  for (const o of selados ?? []) {
    if (comCheckpoints.has(o.id)) continue;
    if (o.hold_a) {
      await libertarLegado(stripeKey, o.hold_a, resumo.erros, `A ${o.id}`);
      resumo.holds_legados_libertados++;
    }
    if (o.hold_b) {
      await libertarLegado(stripeKey, o.hold_b, resumo.erros, `B ${o.id}`);
      resumo.holds_legados_libertados++;
    }
    const aAgiu = !!o.a_agiu_em;
    const bAgiu = !!o.b_agiu_em;
    if (aAgiu && bAgiu) {
      const { error } = await admin
        .from('orcamentos').update({ estado: 'honrado' })
        .eq('id', o.id).eq('estado', 'selado');
      if (!error) resumo.honrados++;
      continue;
    }
    const quem_falhou: 'a' | 'b' | 'ambos' =
      aAgiu && !bAgiu ? 'b' : !aAgiu && bAgiu ? 'a' : 'ambos';
    const { error } = await admin
      .from('orcamentos').update({ estado: 'incumprido', quem_falhou })
      .eq('id', o.id).eq('estado', 'selado');
    if (!error) resumo.incumpridos++;
  }

  // === 3) [FATIA D] Checkpoints do orçamento ===
  const { data: cps } = await admin
    .from('checkpoints_orcamento')
    .select(
      'id, orcamento_id, ordem, descricao, prazo, estado, aviso_entregue, relembrado_em, contestado_em, ' +
      'orc:orcamentos!inner(id, estado, de_perfil, para_perfil, selado_em, prazo)',
    )
    .in('estado', ['pendente', 'entregue', 'contestado'])
    .eq('orc.estado', 'selado');

  const paraAgregar = new Set<string>();

  for (const cp of (cps ?? []) as any[]) {
    const o = cp.orc as { id: string; de_perfil: string; para_perfil: string; selado_em: string | null; prazo: string | null };

    // --- CONTESTAÇÃO com relógio (063 · #3) ---------------------------------
    // Uma contestação vai a REVISÃO admin. Se o Honra não a julgar dentro de
    // `dias_contestacao`, arquiva-se NEUTRO (sem marca — nunca se pune sem
    // prova) e o negócio pode fechar. O admin é avisado a meio (metade do prazo).
    if (cp.estado === 'contestado') {
      const desde = cp.contestado_em ? Date.parse(cp.contestado_em) : agora;
      const prazoRevisao = desde + dias_contestacao * 86_400_000;
      const arquivarJa = forcar_checkpoints || agora > prazoRevisao;
      if (arquivarJa) {
        const { error } = await admin
          .from('checkpoints_orcamento')
          .update({ estado: 'arquivado', resolvido_em: agoraIso })
          .eq('id', cp.id).eq('estado', 'contestado');
        if (!error) {
          resumo.contestacoes_arquivadas++;
          paraAgregar.add(o.id);
          for (const alvo of [o.de_perfil, o.para_perfil]) {
            await admin.rpc('criar_aviso', {
              p_perfil: alvo, p_tipo: 'arquivado', p_orcamento: o.id,
              p_titulo: 'Contestação arquivada',
              p_corpo: `A contestação do checkpoint "${cp.descricao}" foi arquivada sem decisão a tempo. Fecha sem marca para ninguém.`,
              p_prazo: null, p_urgente: false,
            });
          }
        }
      } else if (!cp.relembrado_em && agora > desde + (dias_contestacao * 86_400_000) / 2) {
        // Meio do prazo: cutuca o admin (o painel de revisão) uma vez.
        await admin.rpc('criar_aviso', {
          p_perfil: o.de_perfil, p_tipo: 'lembrete', p_orcamento: o.id,
          p_titulo: 'Contestação à espera de revisão',
          p_corpo: `A contestação do checkpoint "${cp.descricao}" aguarda decisão. Sem julgamento, será arquivada sem marca.`,
          p_prazo: new Date(prazoRevisao).toISOString(), p_urgente: true,
        });
        await admin.from('checkpoints_orcamento').update({ relembrado_em: agoraIso }).eq('id', cp.id);
        resumo.lembretes++;
      }
      continue;
    }
    // Prazo efetivo = prazo do checkpoint (ou do projeto, ou +6 dias), NUNCA
    // antes de selado + 24h (mínimo de segurança).
    const selado = o.selado_em ? Date.parse(o.selado_em) : agora;
    const pisoSeguranca = selado + MIN_SEGURANCA_H * 3600_000;
    let prazoMs: number;
    if (cp.prazo) prazoMs = fimDoDia(cp.prazo);
    else if (o.prazo) prazoMs = fimDoDia(o.prazo);
    else prazoMs = selado + dias_checkpoint * 86_400_000;
    const deadline = Math.max(prazoMs, pisoSeguranca);
    const noPrazo = forcar_checkpoints || agora > deadline;

    if (!noPrazo) {
      // Véspera: relembra uma vez, antes do prazo, quem tem de agir.
      const vespera = deadline - 86_400_000;
      if (agora >= vespera && !cp.relembrado_em) {
        const alvo = cp.estado === 'pendente' ? o.para_perfil : o.de_perfil;
        const corpo = cp.estado === 'pendente'
          ? `Última chamada: apresenta a evidência do checkpoint "${cp.descricao}" antes do prazo.`
          : `Última chamada: confirma ou contesta o checkpoint "${cp.descricao}" antes do prazo.`;
        await admin.rpc('criar_aviso', {
          p_perfil: alvo, p_tipo: 'lembrete', p_orcamento: o.id,
          p_titulo: 'Última chamada — o checkpoint fecha em breve', p_corpo: corpo,
          p_prazo: new Date(deadline).toISOString(), p_urgente: true,
        });
        await admin.from('checkpoints_orcamento').update({ relembrado_em: agoraIso }).eq('id', cp.id);
        resumo.lembretes++;
      }
      continue;
    }

    // No prazo (ou forçado):
    if (cp.estado === 'pendente') {
      // O prestador não apresentou nada → a marca é dele (inação tem dono).
      const { error } = await admin
        .from('checkpoints_orcamento')
        .update({ estado: 'incumprido', quem_falhou: 'prestador', resolvido_em: agoraIso })
        .eq('id', cp.id).eq('estado', 'pendente');
      if (!error) {
        resumo.checkpoints_marcados++;
        paraAgregar.add(o.id);
        await admin.rpc('criar_aviso', {
          p_perfil: o.para_perfil, p_tipo: 'incumprido', p_orcamento: o.id,
          p_titulo: 'Checkpoint não cumprido',
          p_corpo: `Não apresentaste evidência no checkpoint "${cp.descricao}" a tempo. Ficou marcado no teu registo.`,
          p_prazo: null, p_urgente: false,
        });
      }
    } else if (cp.estado === 'entregue') {
      // O prestador apresentou COM evidência; o recetor ficou em silêncio.
      // Só marca se avisado (aviso_entregue) E relembrado (relembrado_em) —
      // informada, nunca emboscada (decisão 3).
      if (cp.aviso_entregue && cp.relembrado_em) {
        const { error } = await admin
          .from('checkpoints_orcamento')
          .update({ estado: 'incumprido', quem_falhou: 'recetor', resolvido_em: agoraIso })
          .eq('id', cp.id).eq('estado', 'entregue');
        if (!error) {
          resumo.checkpoints_marcados++;
          paraAgregar.add(o.id);
          await admin.rpc('criar_aviso', {
            p_perfil: o.de_perfil, p_tipo: 'incumprido', p_orcamento: o.id,
            p_titulo: 'Checkpoint não confirmado',
            p_corpo: `Não confirmaste nem contestaste o checkpoint "${cp.descricao}" a tempo, apesar dos avisos. Ficou marcado no teu registo.`,
            p_prazo: null, p_urgente: false,
          });
        }
      } else if (!cp.relembrado_em) {
        // Ainda não foi relembrado → relembra primeiro e adia a marca.
        await admin.rpc('criar_aviso', {
          p_perfil: o.de_perfil, p_tipo: 'lembrete', p_orcamento: o.id,
          p_titulo: 'Última chamada — confirma ou contesta',
          p_corpo: `Chegou evidência no checkpoint "${cp.descricao}". Confirma se corresponde, ou contesta se não recebeste — antes que fique marcado.`,
          p_prazo: null, p_urgente: true,
        });
        await admin.from('checkpoints_orcamento').update({ relembrado_em: agoraIso }).eq('id', cp.id);
        resumo.lembretes++;
      }
    }
  }

  // Agrega o desfecho de cada orçamento tocado (fecha 'honrado'/'incumprido').
  for (const id of paraAgregar) {
    await admin.rpc('avaliar_checkpoints_orcamento', { p_orc: id });
    resumo.orcamentos_agregados++;
  }

  // === 4) [065] PAGAMENTO NA ENTREGA — o relógio da confirmação ===
  // Tolerante à migração: se as colunas 065 ainda não existirem, a secção
  // salta com nota no resumo (nunca rebenta o resolver inteiro).
  {
    const { data: retidos, error: erroPag } = await admin
      .from('orcamentos')
      .select('id, de_perfil, para_perfil, valor_proposta, pagamento_intent, confirmar_ate, pagamento_relembrado_em')
      .eq('pagamento_estado', 'pago_retido');

    if (erroPag) {
      resumo.erros.push(`pagamento na entrega (065) saltado: ${erroPag.message}`);
    } else {
      for (const o of retidos ?? []) {
        const prazoMs = o.confirmar_ate ? Date.parse(o.confirmar_ate) : null;
        if (prazoMs == null) {
          // Sem prazo gravado (não devia acontecer: o webhook grava-o sempre).
          // Não se liberta às cegas — regista-se para olhar humano.
          resumo.erros.push(`pago_retido ${o.id} sem confirmar_ate — verificar à mão`);
          continue;
        }
        const vencido = forcar_pagamentos || agora > prazoMs;
        const naVespera = agora >= prazoMs - 86_400_000;

        if (!vencido) {
          // Véspera: relembra A UMA vez. A libertação nunca é emboscada.
          if (naVespera && !o.pagamento_relembrado_em) {
            await admin.rpc('criar_aviso', {
              p_perfil: o.de_perfil, p_tipo: 'lembrete', p_orcamento: o.id,
              p_titulo: 'Última chamada — confirma a entrega',
              p_corpo: 'O prazo de confirmação termina amanhã. Confirma a entrega — ou contesta com evidência. Sem resposta, o pagamento liberta-se ao profissional.',
              p_prazo: new Date(prazoMs).toISOString(), p_urgente: true,
            });
            await admin
              .from('orcamentos')
              .update({ pagamento_relembrado_em: agoraIso })
              .eq('id', o.id)
              .eq('pagamento_estado', 'pago_retido');
            resumo.pagamentos_lembretes++;
          }
          continue;
        }

        // Vencido SEM lembrete dado (ex.: o resolver esteve em baixo na véspera):
        // relembra primeiro e adia um ciclo — informada, nunca emboscada.
        if (!o.pagamento_relembrado_em && !forcar_pagamentos) {
          await admin.rpc('criar_aviso', {
            p_perfil: o.de_perfil, p_tipo: 'lembrete', p_orcamento: o.id,
            p_titulo: 'Última chamada — confirma a entrega',
            p_corpo: 'O prazo de confirmação chegou. Confirma a entrega — ou contesta com evidência. Sem resposta até amanhã, o pagamento liberta-se ao profissional.',
            p_prazo: null, p_urgente: true,
          });
          await admin
            .from('orcamentos')
            .update({ pagamento_relembrado_em: agoraIso })
            .eq('id', o.id)
            .eq('pagamento_estado', 'pago_retido');
          resumo.pagamentos_lembretes++;
          continue;
        }

        // Silêncio avisado + relembrado → LIBERTA a B. A mesma reclamação de
        // transição do entrega-decidir: se A decidir neste exato instante, só
        // um dos lados ganha o UPDATE.
        const { data: upd, error: eLib } = await admin
          .from('orcamentos')
          .update({ pagamento_estado: 'libertado', libertado_em: agoraIso })
          .eq('id', o.id)
          .eq('pagamento_estado', 'pago_retido')
          .select('id');
        if (eLib || !upd || upd.length === 0) continue;
        resumo.pagamentos_libertados++;

        // Transferência (best-effort; pendente fica para a re-tentativa abaixo).
        let transferido = false;
        let semConta = false;
        if (stripeKey && o.pagamento_intent) {
          const { data: conta } = await admin
            .from('contas_connect')
            .select('stripe_account_id')
            .eq('perfil_id', o.para_perfil)
            .maybeSingle();
          const destino = (conta as { stripe_account_id?: string | null } | null)?.stripe_account_id;
          if (!destino) {
            semConta = true;
          } else {
            const r = await transferirEntrega({
              stripeKey,
              contaDestino: destino,
              piId: o.pagamento_intent,
              valorCentimos: Math.round(Number(o.valor_proposta) * 100),
              orcamentoId: o.id,
            });
            if (r.ok && r.transferId) {
              await admin
                .from('orcamentos')
                .update({ pagamento_transfer: r.transferId })
                .eq('id', o.id)
                .eq('pagamento_estado', 'libertado');
              resumo.transferencias_feitas++;
              transferido = true;
            } else if (r.erro) {
              resumo.erros.push(`transfer ${o.id}: ${r.erro}`);
            }
          }
        }
        if (!transferido) {
          resumo.transferencias_pendentes++;
          // O aviso "falta a tua conta" só quando falta MESMO a conta — uma
          // falha transitória re-tenta amanhã sem culpar o profissional.
          if (semConta) {
            await admin.rpc('criar_aviso', {
              p_perfil: o.para_perfil, p_tipo: 'pag_pendente', p_orcamento: o.id,
              p_titulo: 'Pagamento libertado — falta a tua conta',
              p_corpo: 'O pagamento da entrega libertou-se para ti. Ativa os pagamentos nas Definições para o receberes — a transferência segue sozinha assim que a conta estiver pronta.',
              p_prazo: null, p_urgente: true,
            });
          }
        }
      }

      // 4b) Re-tentativa das transferências PENDENTES ('libertado' sem transfer).
      // Idempotency-Key por orçamento (em transferirEntrega): nunca duplica.
      const { data: pendentes } = await admin
        .from('orcamentos')
        .select('id, para_perfil, valor_proposta, pagamento_intent')
        .eq('pagamento_estado', 'libertado')
        .is('pagamento_transfer', null)
        .not('pagamento_intent', 'is', null);

      for (const o of pendentes ?? []) {
        if (!stripeKey || !o.pagamento_intent) continue;
        const { data: conta } = await admin
          .from('contas_connect')
          .select('stripe_account_id')
          .eq('perfil_id', o.para_perfil)
          .maybeSingle();
        const destino = (conta as { stripe_account_id?: string | null } | null)?.stripe_account_id;
        if (!destino) continue; // B ainda sem conta — fica para o próximo dia
        const r = await transferirEntrega({
          stripeKey,
          contaDestino: destino,
          piId: o.pagamento_intent,
          valorCentimos: Math.round(Number(o.valor_proposta) * 100),
          orcamentoId: o.id,
        });
        if (r.ok && r.transferId) {
          await admin
            .from('orcamentos')
            .update({ pagamento_transfer: r.transferId })
            .eq('id', o.id)
            .eq('pagamento_estado', 'libertado');
          resumo.transferencias_feitas++;
          await admin.rpc('criar_aviso', {
            p_perfil: o.para_perfil, p_tipo: 'pag_libertado', p_orcamento: o.id,
            p_titulo: 'Pagamento a caminho',
            p_corpo: 'A tua conta ficou pronta e a transferência da entrega seguiu para ti.',
            p_prazo: null, p_urgente: false,
          });
        }
        // Falhou de novo → silêncio (re-tenta amanhã); o aviso "falta a conta"
        // já foi dado na libertação.
      }

      // 4c) 'congelado' fica EXATAMENTE onde está — só o veredito da revisão
      // (checkpoint-disputa · resolver_entrega) lhe toca. Deliberado (advogado).
    }
  }

  return json({ ok: true, ...resumo });
});
