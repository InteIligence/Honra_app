// HONRA — Resolver agendado do CONTRATO-CONVITE (o relógio dos convites).
// Função IRMÃ da `resolver-caucoes` (não incha a existente — relógios e tabela
// diferentes). Corre no mesmo cron diário.
//
//   1) Formulário sem resposta de P há mais de DIAS_FORMULARIO (7) →
//      'formulario_expirado'.
//   2) Assinatura sem acontecer em 72h → 'assinatura_expirada'.
//   3) Lembretes de assinatura 24h/48h (atrás de CONVITE_LEMBRETES_ON).
//
// FATIA D — o hold vivo (parâmetros FECHADOS em docs/PAGAMENTOS-HOLD-METRICAS.md;
// onde o desenho dizia "arme −3", a investigação corrigiu para −2):
//   4) AVISO pré-arme (D−3): a reserva nunca é surpresa. Aviso in-app a P +
//      evento com o texto composto; o SMS ao cliente é TODO parqueado (Bird).
//   5) ARME do hold (D−2): SÓ cartões de CRÉDITO (funding). PaymentIntent
//      manual-capture MIT na conta Connect de P; `capture_before` REAL lido e
//      guardado. Débito/pré-pago/unknown → SEM hold ('sem_caucao', modelo
//      Fresha — MIT direto só na quebra). Falha soft → 'cartao_falhou' e
//      re-arma no dia seguinte; a D−1 sem hold → 'sem_caucao'.
//   6) CHECKPOINT: lembrete a P no D0; D+1 sem ação de P → GHOST: hold
//      liberta-se (0€) + 'incumprido_profissional' + marca (inação = default).
//   7) DUNNING das 'cobranca_pendente': retries D+1/D+3/D+7 (máx. 4 tentativas)
//      GATED por decline code — authentication_required NUNCA re-tenta por
//      máquina (magic link SCA, prazo 72h → 'cobranca_incobravel'); hard
//      declines e do_not_honor persistente param cedo.
//
// Cada passo com dinheiro escreve a métrica certa em `metricas_pagamento`.
//
// Porta fechada: só o cron/serviço entra (x-resolver-secret OU service_role).
// Para testar aceita no corpo: { dias_formulario, horas_assinatura, hoje,
// dias_aviso, dias_arme, dunning_dias, sca_horas } — prazos curtos/relógio
// injetado, padrão do resolver-caucoes.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { sha256, valorEscalao } from '../_shared/contrato.ts';
import { enviarSmsTexto } from '../_shared/bird.ts';
import {
  armarHold,
  capturarHold,
  classificarDecline,
  cobrarMit,
  feePenalizacao,
  libertarHold,
  obterFundingCartao,
  registarMetrica,
  retentarCobranca,
} from '../_shared/pagamentos.ts';
import { modoTeste } from '../_shared/modoTeste.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://honraapp.com';
// Em teste (SMS custam) NÃO se envia — compõe-se e regista-se. Mesmo interruptor
// da convite-otp / convite-decidir.
const MODO_TESTE = modoTeste();
function novoToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}
// Soma dias a uma data YYYY-MM-DD (UTC).
function dataMais(iso: string, dias: number): string {
  const dt = new Date(iso + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}
function eur(centimos: number): string {
  return `${(centimos / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} €`;
}

// Estado terminal de uma cobrança recuperada, pelo motivo congelado no contrato.
const TERMINAL_POR_MOTIVO: Record<string, string> = {
  escalao_2: 'cancelado_escalao_2',
  escalao_3: 'cancelado_escalao_3',
  incumprimento_cliente: 'incumprido_cliente',
};

// Estados "vivos" que chegam ao dia do evento e se resolvem no checkpoint.
const ESTADOS_CHECKPOINT = ['assinado', 'caucionado', 'sem_caucao', 'cartao_falhou'];

const COLUNAS_HOLD =
  'id, estado, nivel_protecao, token_publico, contrato_hash, servico, data_inicio, ' +
  'valor_total, pct_caucao, pct_cancelamento, janela_x_meses, ' +
  'stripe_account_id, stripe_customer_id, payment_method_id, cartao_gravado_em, ' +
  'funding_cartao, hold_decisao, hold_id, hold_capture_before, checkpoint_em, ' +
  'profissional_id, cliente_convidado_id';

type ContratoHold = {
  id: string;
  estado: string;
  nivel_protecao: number;
  token_publico: string;
  contrato_hash: string | null;
  servico: string | null;
  data_inicio: string;
  valor_total: number | null;
  pct_caucao: number;
  pct_cancelamento: number;
  janela_x_meses: number;
  stripe_account_id: string | null;
  stripe_customer_id: string | null;
  payment_method_id: string | null;
  cartao_gravado_em: string | null;
  funding_cartao: string | null;
  hold_decisao: string | null;
  hold_id: string | null;
  hold_capture_before: string | null;
  checkpoint_em: string | null;
  profissional_id: string;
  cliente_convidado_id: string;
};

Deno.serve(async (req) => {
  // --- Porta fechada (mesmo padrão da resolver-caucoes). ---
  const secret = Deno.env.get('RESOLVER_SECRET') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const dado = req.headers.get('x-resolver-secret') ?? '';
  const autorizado = (secret && dado === secret) || auth === `Bearer ${serviceKey}`;
  if (!autorizado) return json({ error: 'não autorizado' }, 401);

  let dias_formulario = 7;
  let horas_assinatura = 72; // Fatia B: janela de assinatura (doc §4.3)
  // Fatia D — o relógio do hold (a investigação manda: aviso −3, ARME −2).
  let dias_aviso = 3;
  let dias_arme = 2;
  let dunning_dias = [1, 3, 7]; // retries após a tentativa 0 (máx. 4 tentativas)
  let sca_horas = 72; // prazo do fallback SCA on-session
  let hoje = new Date().toISOString().slice(0, 10); // injetável p/ teste (relógio)
  try {
    const body = await req.json();
    if (typeof body?.dias_formulario === 'number') dias_formulario = body.dias_formulario;
    if (typeof body?.horas_assinatura === 'number') horas_assinatura = body.horas_assinatura;
    if (typeof body?.dias_aviso === 'number') dias_aviso = body.dias_aviso;
    if (typeof body?.dias_arme === 'number') dias_arme = body.dias_arme;
    if (Array.isArray(body?.dunning_dias) && body.dunning_dias.length === 3) {
      dunning_dias = body.dunning_dias.map((n: unknown) => Number(n));
    }
    if (typeof body?.sca_horas === 'number') sca_horas = body.sca_horas;
    if (typeof body?.hoje === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.hoje)) hoje = body.hoje;
  } catch {
    // sem corpo → prazos por omissão
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const agoraISO = new Date().toISOString();
  const limiteFormulario = new Date(Date.now() - dias_formulario * 86_400_000).toISOString();
  const limiteAssinatura = new Date(Date.now() - horas_assinatura * 3_600_000).toISOString();
  const resumo = {
    formularios_expirados: 0,
    assinaturas_expiradas: 0,
    lembretes_enviados: 0,
    avisos_pre_hold: 0,
    holds_armados: 0,
    holds_dispensados: 0,
    arme_falhas: 0,
    sem_caucao: 0,
    checkpoints_lembrados: 0,
    ghosts_profissional: 0,
    dunning_retries: 0,
    cobrancas_recuperadas: 0,
    sca_pedidos: 0,
    incobraveis: 0,
    // Fatia E — janela de contestação (blindagem da fuga E).
    consentimentos_lembrados: 0,
    capturas_por_consentimento: 0,
    capturas_por_silencio: 0,
    silencios_em_revisao: 0,
    capturas_proposta_falhadas: 0,
    erros: [] as string[],
  };

  // Regista um SMS COMPOSTO mas não enviado (TODO parqueado do Bird) ou envia
  // se um dia o parque abrir. Nesta fatia: nunca envia (parqueado + modo teste).
  async function registarSmsParqueado(contratoId: string, finalidade: string, mensagem: string) {
    await admin.from('eventos_convite').insert({
      contrato_id: contratoId,
      tipo: 'sms_enviado',
      payload: {
        finalidade,
        mensagem,
        enviado: false,
        motivo: MODO_TESTE ? 'modo_teste' : 'todo_bird_parqueado',
      },
    });
  }

  // === 1) Formulário sem resposta de P → 'formulario_expirado'. ===
  const { data: parados, error } = await admin
    .from('contratos_convite')
    .select('id')
    .eq('estado', 'formulario_recebido')
    .lt('formulario_em', limiteFormulario);
  if (error) resumo.erros.push(`ler formularios: ${error.message}`);

  for (const c of parados ?? []) {
    const { error: eUp } = await admin
      .from('contratos_convite')
      .update({ estado: 'formulario_expirado', resolvido_em: new Date().toISOString() })
      .eq('id', c.id)
      .eq('estado', 'formulario_recebido');
    if (eUp) {
      resumo.erros.push(`expirar ${c.id}: ${eUp.message}`);
      continue;
    }
    await admin.from('eventos_convite').insert({
      contrato_id: c.id,
      tipo: 'expiracao',
      payload: { motivo: 'formulario_sem_resposta', dias: dias_formulario },
    });
    resumo.formularios_expirados++;
  }

  // === 2) Assinatura sem acontecer há mais de horas_assinatura (72h) →
  //        'assinatura_expirada'. (Fatia B.) ===
  const { data: porAssinar, error: erroAssin } = await admin
    .from('contratos_convite')
    .select('id')
    .eq('estado', 'aguarda_assinatura')
    .lt('aceite_em', limiteAssinatura);
  if (erroAssin) resumo.erros.push(`ler assinaturas: ${erroAssin.message}`);

  for (const c of porAssinar ?? []) {
    const { error: eUp } = await admin
      .from('contratos_convite')
      .update({ estado: 'assinatura_expirada', resolvido_em: new Date().toISOString() })
      .eq('id', c.id)
      .eq('estado', 'aguarda_assinatura');
    if (eUp) {
      resumo.erros.push(`expirar assinatura ${c.id}: ${eUp.message}`);
      continue;
    }
    await admin.from('eventos_convite').insert({
      contrato_id: c.id,
      tipo: 'expiracao',
      payload: { motivo: 'assinatura_sem_acontecer', horas: horas_assinatura },
    });
    resumo.assinaturas_expiradas++;
  }

  // === 3) LEMBRETES de assinatura (24h/48h antes do prazo de 72h). ===
  // Texto livre (o template do OTP não leva URL) — ver _shared/bird.ts.
  //
  // SEGURO POR OMISSÃO: só corre se o segredo CONVITE_LEMBRETES_ON existir. Assim
  // os convites de teste JÁ em 'aguarda_assinatura' (ex.: o "Afonso") NÃO recebem
  // SMS inesperados enquanto não confirmamos ao vivo que o texto-livre passa na
  // rota Bird. Mesmo ligado, respeita CONVITE_MODO_TESTE (compõe+regista, não
  // gasta SMS). Para ligar: definir o segredo CONVITE_LEMBRETES_ON (qualquer valor).
  const LEMBRETES_ON = (Deno.env.get('CONVITE_LEMBRETES_ON') ?? '') !== '';
  if (LEMBRETES_ON) {
    // Marcos (descendente: escolhe-se o mais urgente já atingido). Às +48h desde
    // o aceite faltam 24h; às +24h faltam 48h.
    const marcos = [
      { marco: '24h', desde_h: 48 },
      { marco: '48h', desde_h: 24 },
    ];
    // Só contratos ainda dentro da janela de 72h (os que já passaram foram
    // expirados no bloco 2 acima).
    const { data: pendentes, error: eLemb } = await admin
      .from('contratos_convite')
      .select('id, token_publico, aceite_em, cliente_convidado_id, profissional_id')
      .eq('estado', 'aguarda_assinatura')
      .gte('aceite_em', limiteAssinatura);
    if (eLemb) resumo.erros.push(`ler lembretes: ${eLemb.message}`);

    for (const c of pendentes ?? []) {
      const horas = (Date.now() - new Date(c.aceite_em).getTime()) / 3_600_000;
      const alvo = marcos.find((m) => horas >= m.desde_h);
      if (!alvo) continue;

      // Dedup: já enviámos um lembrete deste marco para este contrato?
      const { count: jaFeito } = await admin
        .from('eventos_convite')
        .select('id', { count: 'exact', head: true })
        .eq('contrato_id', c.id)
        .eq('tipo', 'sms_enviado')
        .contains('payload', { finalidade: 'lembrete', marco: alvo.marco });
      if ((jaFeito ?? 0) > 0) continue;

      const [{ data: prof }, { data: cliente }] = await Promise.all([
        admin.from('perfis').select('nome').eq('id', c.profissional_id).maybeSingle(),
        admin.from('clientes_convidados').select('telefone').eq('id', c.cliente_convidado_id).maybeSingle(),
      ]);
      if (!cliente) {
        resumo.erros.push(`lembrete ${c.id}: cliente em falta`);
        continue;
      }

      // Magic link novo (só o hash fica na BD); expira no prazo real (aceite+72h).
      const linkToken = novoToken();
      const { error: eMl } = await admin.from('magic_links_convite').insert({
        token_hash: await sha256(linkToken),
        contrato_id: c.id,
        finalidade: 'assinar',
        expira_em: new Date(new Date(c.aceite_em).getTime() + 72 * 3_600_000).toISOString(),
      });
      if (eMl) {
        resumo.erros.push(`lembrete ml ${c.id}: ${eMl.message}`);
        continue;
      }

      const link = `${SITE_URL}/c/${c.token_publico}?ml=${linkToken}`;
      const nome = prof?.nome ?? 'o teu profissional';
      const mensagem =
        `Ainda tens o contrato com ${nome} por assinar. Fica aqui: ${link} — o link expira em breve.`;

      let enviado = false;
      let motivo: string | undefined;
      if (MODO_TESTE) {
        motivo = 'modo_teste';
      } else {
        const envio = await enviarSmsTexto(cliente.telefone, mensagem);
        enviado = envio.ok;
        if (!envio.ok) motivo = envio.motivo;
      }
      await admin.from('eventos_convite').insert({
        contrato_id: c.id,
        tipo: 'sms_enviado',
        payload: {
          finalidade: 'lembrete',
          marco: alvo.marco,
          mensagem,
          enviado,
          ...(motivo ? { motivo } : {}),
        },
      });
      resumo.lembretes_enviados++;
    }
  }

  // ================================================================
  // FATIA D — 4) AVISO PRÉ-ARME (D−3): a reserva nunca é surpresa.
  // Contratos com cartão gravado cuja data entra na janela [arme+1 … aviso]
  // dias. Lê-se o funding JÁ AQUI (o aviso é diferente para crédito/débito) e
  // grava-se — a decisão do arme reutiliza-o.
  // ================================================================
  const { data: paraAvisar, error: eAviso } = await admin
    .from('contratos_convite')
    .select(COLUNAS_HOLD)
    .eq('estado', 'assinado')
    .gte('nivel_protecao', 2)
    .not('cartao_gravado_em', 'is', null)
    .gt('data_inicio', dataMais(hoje, dias_arme))
    .lte('data_inicio', dataMais(hoje, dias_aviso));
  if (eAviso) resumo.erros.push(`ler avisos pré-hold: ${eAviso.message}`);

  for (const cData of paraAvisar ?? []) {
    const c = cData as unknown as ContratoHold;
    // Dedup: um aviso pré-hold por contrato.
    const { count: jaAvisado } = await admin
      .from('eventos_convite')
      .select('id', { count: 'exact', head: true })
      .eq('contrato_id', c.id)
      .eq('tipo', 'aviso_pre_hold');
    if ((jaAvisado ?? 0) > 0) continue;

    // Funding do cartão (grava-se; decide o texto do aviso e depois o arme).
    let funding = c.funding_cartao;
    if (!funding && stripeKey && c.stripe_account_id && c.payment_method_id) {
      const f = await obterFundingCartao(stripeKey, c.stripe_account_id, c.payment_method_id);
      funding = f.funding;
      await admin.from('contratos_convite').update({ funding_cartao: funding }).eq('id', c.id);
    }

    const valorHold =
      c.valor_total != null ? Math.round((c.valor_total * c.pct_caucao) / 100) : null;
    const hash8 = (c.contrato_hash ?? '').slice(0, 8);
    const credito = funding === 'credit';
    // O SMS ao cliente (TODO parqueado do Bird) — composto e registado como prova.
    const msgCliente = credito
      ? `Como assinaste (ref ${hash8}), vamos reservar ${c.pct_caucao}%${valorHold != null ? ` (${eur(valorHold)})` : ''} no teu cartão a 2 dias do evento. Não é uma cobrança — é devolvida no dia se tudo correr bem. ${SITE_URL}/c/${c.token_publico}`
      : `O teu cartão garante o contrato (ref ${hash8}). Não há qualquer retenção — só é cobrado se cancelares nos termos que assinaste ou faltares. ${SITE_URL}/c/${c.token_publico}`;
    await registarSmsParqueado(c.id, 'aviso_pre_hold', msgCliente);
    await admin.from('eventos_convite').insert({
      contrato_id: c.id,
      tipo: 'aviso_pre_hold',
      payload: {
        funding: funding ?? 'desconhecido',
        valor_centimos: valorHold,
        pct_caucao: c.pct_caucao,
        dias_arme,
      },
    });
    await admin.rpc('criar_aviso_convite', {
      p_perfil: c.profissional_id,
      p_tipo: 'convite_hold',
      p_contrato: c.id,
      p_titulo: credito ? 'Caução arma-se em breve' : 'Contrato garantido pelo cartão',
      p_corpo: credito
        ? `A reserva de ${c.pct_caucao}%${valorHold != null ? ` (${eur(valorHold)})` : ''} arma-se a 2 dias do evento (ref ${hash8}). O cliente foi avisado — nunca é surpresa.`
        : `O cartão do cliente é de débito/pré-pago: sem retenção (ref ${hash8}). Se houver quebra, cobra-se direto ao cartão gravado.`,
      p_prazo: null,
      p_urgente: false,
    });
    resumo.avisos_pre_hold++;
  }

  // ================================================================
  // FATIA D — 5) ARME DO HOLD (D−2). Crédito → hold; resto → sem_caucao
  // (modelo Fresha, registado com honestidade). hold_decisao é o marcador
  // de "já decidido"; 'cartao_falhou' re-tenta diariamente até D−1.
  // ================================================================
  const { data: paraArmar, error: eArme } = await admin
    .from('contratos_convite')
    .select(COLUNAS_HOLD)
    .in('estado', ['assinado', 'cartao_falhou'])
    .gte('nivel_protecao', 2)
    .not('cartao_gravado_em', 'is', null)
    .is('hold_decisao', null)
    .gte('data_inicio', hoje)
    .lte('data_inicio', dataMais(hoje, dias_arme));
  if (eArme) resumo.erros.push(`ler arme: ${eArme.message}`);

  for (const cData of paraArmar ?? []) {
    const c = cData as unknown as ContratoHold;
    const hash8 = (c.contrato_hash ?? '').slice(0, 8);

    if (!c.stripe_account_id || !c.stripe_customer_id || !c.payment_method_id) {
      resumo.erros.push(`arme ${c.id}: contrato nível ${c.nivel_protecao} sem dados Stripe`);
      continue;
    }
    if (!stripeKey) {
      resumo.erros.push('arme: STRIPE_SECRET_KEY em falta');
      break;
    }

    // Valor "(a combinar)" → nada a segurar; fica registado com verdade.
    const valorHold =
      c.valor_total != null && c.valor_total > 0
        ? Math.round((c.valor_total * c.pct_caucao) / 100)
        : null;
    if (valorHold == null) {
      await admin
        .from('contratos_convite')
        .update({ hold_decisao: 'sem_hold_sem_valor' })
        .eq('id', c.id);
      await admin.from('eventos_convite').insert({
        contrato_id: c.id,
        tipo: 'sem_hold',
        payload: { motivo: 'valor_nao_definido' },
      });
      continue;
    }

    // Funding: a decisão central da investigação — hold SÓ em crédito.
    let funding = c.funding_cartao;
    let rede: string | null = null;
    if (!funding) {
      const f = await obterFundingCartao(stripeKey, c.stripe_account_id, c.payment_method_id);
      funding = f.funding;
      rede = f.rede;
    }

    if (funding !== 'credit') {
      const decisao =
        funding === 'debit'
          ? 'sem_hold_debito'
          : funding === 'prepaid'
            ? 'sem_hold_prepaid'
            : 'sem_hold_unknown';
      const { error: eUp } = await admin
        .from('contratos_convite')
        .update({ estado: 'sem_caucao', funding_cartao: funding, hold_decisao: decisao })
        .in('estado', ['assinado', 'cartao_falhou'])
        .eq('id', c.id);
      if (eUp) {
        resumo.erros.push(`sem_hold ${c.id}: ${eUp.message}`);
        continue;
      }
      await admin.from('eventos_convite').insert({
        contrato_id: c.id,
        tipo: 'sem_hold',
        payload: { motivo: decisao, funding, valor_centimos: valorHold },
      });
      await registarMetrica(admin, {
        evento: 'arme_dispensado',
        contrato_id: c.id,
        profissional_id: c.profissional_id,
        valor: valorHold,
        funding,
        rede,
        payload: { decisao },
      });
      await admin.rpc('criar_aviso_convite', {
        p_perfil: c.profissional_id,
        p_tipo: 'convite_hold',
        p_contrato: c.id,
        p_titulo: 'Cartão em garantia — sem retenção',
        p_corpo: `O cartão do cliente é de ${funding === 'debit' ? 'débito' : funding === 'prepaid' ? 'pré-pago' : 'tipo desconhecido'} (ref ${hash8}): não se retém dinheiro. Em caso de quebra, a cláusula penal cobra-se direto ao cartão gravado.`,
        p_prazo: null,
        p_urgente: false,
      });
      resumo.holds_dispensados++;
      continue;
    }

    // CRÉDITO → armar o hold (MIT manual-capture na conta de P).
    const r = await armarHold({
      stripeKey,
      conta: c.stripe_account_id,
      customer: c.stripe_customer_id,
      paymentMethod: c.payment_method_id,
      valor: valorHold,
      descricao: `Honra — reserva de caução (${c.pct_caucao}%, ref ${hash8}). Devolvida no dia se tudo correr como assinado.`,
      contratoId: c.id,
    });

    if (r.ok && r.pi_id) {
      const { error: eUp } = await admin
        .from('contratos_convite')
        .update({
          estado: 'caucionado',
          hold_id: r.pi_id,
          hold_armado_em: agoraISO,
          hold_capture_before: r.capture_before,
          funding_cartao: 'credit',
          hold_decisao: 'hold_armado',
        })
        .in('estado', ['assinado', 'cartao_falhou'])
        .eq('id', c.id);
      if (eUp) {
        resumo.erros.push(`caucionado ${c.id}: ${eUp.message}`);
        // O hold ficou armado na Stripe sem estado na BD — libertar já (0€),
        // nunca deixar dinheiro seguro sem máquina de estados a vigiá-lo.
        await libertarHold(stripeKey, c.stripe_account_id, r.pi_id);
        continue;
      }
      await admin.from('eventos_convite').insert({
        contrato_id: c.id,
        tipo: 'hold_armado',
        payload: {
          payment_intent: r.pi_id,
          valor_centimos: valorHold,
          pct_caucao: c.pct_caucao,
          capture_before: r.capture_before,
          rede: r.rede,
          stripe_account: c.stripe_account_id,
        },
      });
      await registarMetrica(admin, {
        evento: 'arme_ok',
        contrato_id: c.id,
        profissional_id: c.profissional_id,
        valor: valorHold,
        funding: 'credit',
        rede: r.rede,
        pi_id: r.pi_id,
        payload: { capture_before: r.capture_before },
      });
      await admin.rpc('criar_aviso_convite', {
        p_perfil: c.profissional_id,
        p_tipo: 'convite_hold',
        p_contrato: c.id,
        p_titulo: 'Caução segura ✓',
        p_corpo: `${eur(valorHold)} (${c.pct_caucao}%) ficaram reservados no cartão do cliente (ref ${hash8}). Resolve-se no checkpoint do evento: confirma "recebi" e liberta-se a 0€.`,
        p_prazo: null,
        p_urgente: false,
      });
      resumo.holds_armados++;
      continue;
    }

    // ARME FALHOU. Gating: SCA/hard nunca se re-tentam por máquina; soft
    // re-arma amanhã — mas a D−1 acaba a conversa: 'sem_caucao' (o contrato
    // vale; a quebra cobra-se por MIT — doc §6.3).
    const classe = classificarDecline(r.decline_code);
    const ultimaJanela = c.data_inicio <= dataMais(hoje, 1);
    const final = classe !== 'soft' || ultimaJanela;

    await registarMetrica(admin, {
      evento: 'arme_falhou',
      contrato_id: c.id,
      profissional_id: c.profissional_id,
      valor: valorHold,
      funding: 'credit',
      decline_code: r.decline_code,
      pi_id: r.pi_id,
      payload: { classe, final },
    });
    await admin.from('eventos_convite').insert({
      contrato_id: c.id,
      tipo: 'hold_falhou',
      payload: {
        decline_code: r.decline_code,
        status: r.status,
        classe,
        final,
        ...(r.erro ? { erro: r.erro } : {}),
      },
    });

    if (final) {
      const { error: eUp } = await admin
        .from('contratos_convite')
        .update({ estado: 'sem_caucao', funding_cartao: 'credit', hold_decisao: 'hold_falhou' })
        .in('estado', ['assinado', 'cartao_falhou'])
        .eq('id', c.id);
      if (eUp) resumo.erros.push(`sem_caucao ${c.id}: ${eUp.message}`);
      else {
        resumo.sem_caucao++;
        await admin.rpc('criar_aviso_convite', {
          p_perfil: c.profissional_id,
          p_tipo: 'convite_hold',
          p_contrato: c.id,
          p_titulo: 'A reserva não foi possível',
          p_corpo: `O cartão do cliente não deixou reservar a caução (ref ${hash8}). O contrato continua válido: em caso de quebra, a cláusula penal cobra-se direto ao cartão gravado.`,
          p_prazo: null,
          p_urgente: false,
        });
      }
    } else {
      const { error: eUp } = await admin
        .from('contratos_convite')
        .update({ estado: 'cartao_falhou', funding_cartao: 'credit' })
        .eq('id', c.id)
        .eq('estado', 'assinado');
      if (eUp && c.estado === 'assinado') resumo.erros.push(`cartao_falhou ${c.id}: ${eUp.message}`);
      resumo.arme_falhas++;
      if (c.estado === 'assinado') {
        await admin.rpc('criar_aviso_convite', {
          p_perfil: c.profissional_id,
          p_tipo: 'convite_hold',
          p_contrato: c.id,
          p_titulo: 'O cartão recusou a reserva',
          p_corpo: `O cartão do cliente recusou a reserva da caução (ref ${hash8}). Vamos tentar de novo amanhã; avisámos o cliente para repor o cartão.`,
          p_prazo: null,
          p_urgente: false,
        });
        // SMS "repõe o cartão" ao cliente — TODO parqueado (Bird).
        await registarSmsParqueado(
          c.id,
          'repor_cartao',
          `O teu cartão não deixou fazer a reserva do contrato (ref ${hash8}). Vê o estado aqui: ${SITE_URL}/c/${c.token_publico}`,
        );
      }
    }
  }

  // ================================================================
  // FATIA D — 6) CHECKPOINT do evento.
  // 6a) D0: lembrete urgente a P ("recebeste o pagamento?").
  // 6b) D+1 sem ação de P → GHOST: liberta o hold (0€) + marca em P.
  //     Inação = default; nunca se julga acusação, julga-se ação (doc §4.1).
  // ================================================================
  const { data: noDia, error: eD0 } = await admin
    .from('contratos_convite')
    .select('id, profissional_id, contrato_hash, data_inicio, checkpoint_em, estado')
    .in('estado', ESTADOS_CHECKPOINT)
    .eq('data_inicio', hoje)
    .is('checkpoint_em', null);
  if (eD0) resumo.erros.push(`ler checkpoint D0: ${eD0.message}`);

  for (const c of noDia ?? []) {
    const { count: jaLembrado } = await admin
      .from('eventos_convite')
      .select('id', { count: 'exact', head: true })
      .eq('contrato_id', c.id)
      .eq('tipo', 'aviso_checkpoint');
    if ((jaLembrado ?? 0) > 0) continue;
    const hash8 = (c.contrato_hash ?? '').slice(0, 8);
    await admin.from('eventos_convite').insert({
      contrato_id: c.id,
      tipo: 'aviso_checkpoint',
      payload: { data_inicio: c.data_inicio },
    });
    await admin.rpc('criar_aviso_convite', {
      p_perfil: c.profissional_id,
      p_tipo: 'convite_checkpoint',
      p_contrato: c.id,
      p_titulo: 'Hoje é o dia — confirma o pagamento',
      p_corpo: `Recebeste o pagamento do contrato (ref ${hash8})? Confirma na app até amanhã de manhã. O silêncio liberta o cliente e fica marcado no teu registo.`,
      p_prazo: new Date(Date.parse(c.data_inicio + 'T09:00:00Z') + 86_400_000).toISOString(),
      p_urgente: true,
    });
    resumo.checkpoints_lembrados++;
  }

  const { data: fantasmas, error: eD1 } = await admin
    .from('contratos_convite')
    .select(COLUNAS_HOLD)
    .in('estado', ESTADOS_CHECKPOINT)
    .lt('data_inicio', hoje)
    .is('checkpoint_em', null);
  if (eD1) resumo.erros.push(`ler checkpoint D+1: ${eD1.message}`);

  for (const cData of fantasmas ?? []) {
    const c = cData as unknown as ContratoHold;
    const hash8 = (c.contrato_hash ?? '').slice(0, 8);

    // Hold vivo → liberta-se SEMPRE no ghost de P (0€ ao cliente).
    if (c.estado === 'caucionado' && c.hold_id && stripeKey && c.stripe_account_id) {
      const lib = await libertarHold(stripeKey, c.stripe_account_id, c.hold_id);
      await registarMetrica(admin, {
        evento: 'hold_libertado',
        contrato_id: c.id,
        profissional_id: c.profissional_id,
        valor:
          c.valor_total != null ? Math.round((c.valor_total * c.pct_caucao) / 100) : null,
        funding: c.funding_cartao,
        pi_id: c.hold_id,
        payload: { motivo: 'ghost_profissional', ...(lib.erro ? { erro: lib.erro } : {}) },
      });
    }

    const { error: eUp } = await admin
      .from('contratos_convite')
      .update({
        estado: 'incumprido_profissional',
        quem_falhou: 'profissional',
        resolvido_em: agoraISO,
      })
      .in('estado', ESTADOS_CHECKPOINT)
      .eq('id', c.id)
      .is('checkpoint_em', null);
    if (eUp) {
      resumo.erros.push(`ghost ${c.id}: ${eUp.message}`);
      continue;
    }
    await admin.from('eventos_convite').insert({
      contrato_id: c.id,
      tipo: 'checkpoint',
      payload: {
        resultado: 'incumprido_profissional',
        motivo: 'silencio_ate_d1',
        hold_libertado: c.estado === 'caucionado' && !!c.hold_id,
      },
    });
    // ESCADA DE SUSPENSÃO (migração 048): a marca de incumprimento do profissional
    // conta na janela de reincidência de 6 meses e pode aplicar a suspensão. O
    // cliente-convidado não tem conta → não entra na escada (fuga M). A função é
    // idempotente por ciclo: o ghost só resolve o contrato uma vez.
    await admin.rpc('registar_infracao', {
      p_perfil: c.profissional_id,
      p_tipo: 'incumprimento',
      p_origem: 'convite:' + c.id,
    });
    await admin.rpc('criar_aviso_convite', {
      p_perfil: c.profissional_id,
      p_tipo: 'convite_checkpoint',
      p_contrato: c.id,
      p_titulo: 'Checkpoint fechado sem a tua confirmação',
      p_corpo: `Não confirmaste o contrato (ref ${hash8}) até D+1. A reserva do cliente foi devolvida (0€) e o incumprimento ficou no teu registo.`,
      p_prazo: null,
      p_urgente: false,
    });
    await registarSmsParqueado(
      c.id,
      'checkpoint_ghost',
      `O profissional não confirmou o contrato (ref ${hash8}). Nada te é cobrado — a reserva, se existia, foi devolvida. ${SITE_URL}/c/${c.token_publico}`,
    );
    resumo.ghosts_profissional++;
  }

  // ================================================================
  // FATIA D — 7) DUNNING das cobranças pendentes.
  // Tentativa 0 já aconteceu (convite-cancelar / convite-checkpoint). Aqui:
  //   • SCA (authentication_required): NUNCA re-tentar por máquina — magic
  //     link 'repor_cartao' + prazo 72h → 'cobranca_incobravel'.
  //   • hard declines e do_not_honor persistente: parar cedo.
  //   • soft: retries a D+1/D+3/D+7 da tentativa 0 (máx. 4 tentativas).
  // ================================================================
  const { data: pendentes, error: ePend } = await admin
    .from('contratos_convite')
    .select(
      COLUNAS_HOLD +
        ', cobranca_id, cobranca_motivo, cobranca_valor, cobranca_iniciada_em, ' +
        'cobranca_tentativas, cobranca_proxima_em, cobranca_ultimo_decline, cobranca_sca_prazo_em',
    )
    .eq('estado', 'cobranca_pendente');
  if (ePend) resumo.erros.push(`ler dunning: ${ePend.message}`);

  for (const cData of pendentes ?? []) {
    const c = cData as unknown as ContratoHold & {
      cobranca_id: string | null;
      cobranca_motivo: string | null;
      cobranca_valor: number | null;
      cobranca_iniciada_em: string | null;
      cobranca_tentativas: number;
      cobranca_proxima_em: string | null;
      cobranca_ultimo_decline: string | null;
      cobranca_sca_prazo_em: string | null;
    };
    const hash8 = (c.contrato_hash ?? '').slice(0, 8);
    const motivo = c.cobranca_motivo ?? 'escalao_2'; // legado C-2 = escalão 2
    const valor =
      c.cobranca_valor ??
      valorEscalao(2, c.valor_total, c.pct_cancelamento, c.pct_caucao);
    if (valor == null || valor <= 0) {
      resumo.erros.push(`dunning ${c.id}: sem valor computável`);
      continue;
    }

    // Linha legada (pré-Fatia D) sem máquina: inicializa e segue no próximo ciclo.
    if (!c.cobranca_iniciada_em) {
      await admin
        .from('contratos_convite')
        .update({
          cobranca_motivo: motivo,
          cobranca_valor: valor,
          cobranca_iniciada_em: agoraISO,
          cobranca_tentativas: 1,
          cobranca_proxima_em: new Date(Date.now() + dunning_dias[0] * 86_400_000).toISOString(),
        })
        .eq('id', c.id)
        .eq('estado', 'cobranca_pendente');
      continue;
    }

    const classe = classificarDecline(c.cobranca_ultimo_decline);

    // Fecha como incobrável (função local para os três caminhos de paragem).
    const fecharIncobravel = async (motivoFim: string) => {
      const { error: eUp } = await admin
        .from('contratos_convite')
        .update({ estado: 'cobranca_incobravel', resolvido_em: agoraISO })
        .eq('id', c.id)
        .eq('estado', 'cobranca_pendente');
      if (eUp) {
        resumo.erros.push(`incobravel ${c.id}: ${eUp.message}`);
        return;
      }
      await admin.from('eventos_convite').insert({
        contrato_id: c.id,
        tipo: 'incobravel',
        payload: { motivo: motivoFim, tentativas: c.cobranca_tentativas, valor_centimos: valor },
      });
      await registarMetrica(admin, {
        evento: 'incobravel',
        contrato_id: c.id,
        profissional_id: c.profissional_id,
        valor,
        decline_code: c.cobranca_ultimo_decline,
        funding: c.funding_cartao,
        payload: { motivo: motivoFim, tentativas: c.cobranca_tentativas },
      });
      await admin.rpc('criar_aviso_convite', {
        p_perfil: c.profissional_id,
        p_tipo: 'convite_cobranca',
        p_contrato: c.id,
        p_titulo: 'Cobrança incobrável',
        p_corpo: `Não foi possível cobrar ${eur(valor)} da cláusula penal (ref ${hash8}) — ${motivoFim === 'sca_expirado' ? 'o cliente não confirmou o pagamento no prazo' : 'o cartão recusou de forma definitiva'}. Fica registado no contrato.`,
        p_prazo: null,
        p_urgente: false,
      });
      resumo.incobraveis++;
    };

    // --- Fallback SCA: nunca por máquina. ---
    if (classe === 'sca') {
      if (!c.cobranca_sca_prazo_em) {
        const linkToken = novoToken();
        const { error: eMl } = await admin.from('magic_links_convite').insert({
          token_hash: await sha256(linkToken),
          contrato_id: c.id,
          finalidade: 'repor_cartao',
          expira_em: new Date(Date.now() + sca_horas * 3_600_000).toISOString(),
        });
        if (eMl) {
          resumo.erros.push(`sca ml ${c.id}: ${eMl.message}`);
          continue;
        }
        const url = `${SITE_URL}/c/${c.token_publico}?ml=${linkToken}&fin=repor_cartao`;
        await admin
          .from('contratos_convite')
          .update({
            cobranca_sca_prazo_em: new Date(Date.now() + sca_horas * 3_600_000).toISOString(),
            cobranca_proxima_em: null, // máquina parada — a ação é do cliente
          })
          .eq('id', c.id)
          .eq('estado', 'cobranca_pendente');
        await admin.from('eventos_convite').insert({
          contrato_id: c.id,
          tipo: 'sca_pedido',
          payload: { valor_centimos: valor, prazo_horas: sca_horas },
        });
        await registarSmsParqueado(
          c.id,
          'sca_pedido',
          `O teu banco exige confirmação para a cobrança de ${eur(valor)} que assinaste (ref ${hash8}). Confirma em ${Math.round(sca_horas)}h: ${url}`,
        );
        await registarMetrica(admin, {
          evento: 'sca_pedido',
          contrato_id: c.id,
          profissional_id: c.profissional_id,
          valor,
          decline_code: 'authentication_required',
          funding: c.funding_cartao,
          pi_id: c.cobranca_id,
          payload: { prazo_horas: sca_horas },
        });
        resumo.sca_pedidos++;
      } else if (new Date(c.cobranca_sca_prazo_em).getTime() < Date.now()) {
        await fecharIncobravel('sca_expirado');
      }
      continue;
    }

    // --- Hard declines: parar já (re-tentar é multa de rede). ---
    if (classe === 'hard') {
      await fecharIncobravel('hard_decline');
      continue;
    }

    // --- do_not_honor persistente: parar cedo (MAC/emissor a dizer não). ---
    if (c.cobranca_ultimo_decline === 'do_not_honor' && c.cobranca_tentativas >= 2) {
      await fecharIncobravel('do_not_honor_persistente');
      continue;
    }

    // --- Soft: retry se chegou a hora e ainda há tentativas. ---
    if (c.cobranca_tentativas >= 4) {
      await fecharIncobravel('tentativas_esgotadas');
      continue;
    }
    if (!c.cobranca_proxima_em || new Date(c.cobranca_proxima_em).getTime() > Date.now()) continue;
    if (!stripeKey || !c.stripe_account_id || !c.stripe_customer_id || !c.payment_method_id) {
      resumo.erros.push(`dunning ${c.id}: sem dados Stripe`);
      continue;
    }

    const tentativa = c.cobranca_tentativas; // n.º deste retry (1-based após a 0)
    await registarMetrica(admin, {
      evento: 'retry',
      contrato_id: c.id,
      profissional_id: c.profissional_id,
      valor,
      funding: c.funding_cartao,
      payload: { tentativa },
    });
    const fee = feePenalizacao(valor);
    const r = await retentarCobranca({
      stripeKey,
      conta: c.stripe_account_id,
      piIdAnterior: c.cobranca_id,
      customer: c.stripe_customer_id,
      paymentMethod: c.payment_method_id,
      valor,
      fee,
      descricao: `Honra — cláusula penal (${motivo.replace('_', ' ')}, ref ${hash8}) — retentativa ${tentativa}`,
      contratoId: c.id,
      motivo,
    });
    resumo.dunning_retries++;

    if (r.ok) {
      const estadoFinal = TERMINAL_POR_MOTIVO[motivo] ?? 'cancelado_escalao_2';
      const { error: eUp } = await admin
        .from('contratos_convite')
        .update({
          estado: estadoFinal,
          cobranca_id: r.pi_id,
          cobranca_tentativas: tentativa + 1,
          cobranca_ultimo_decline: null,
          resolvido_em: agoraISO,
          ...(motivo === 'incumprimento_cliente' ? { quem_falhou: 'cliente' } : {}),
        })
        .eq('id', c.id)
        .eq('estado', 'cobranca_pendente');
      if (eUp) {
        // Dinheiro moveu-se; o estado fica pendente até reconciliação manual —
        // nunca esconder (o evento e a métrica ficam escritos).
        resumo.erros.push(`recuperada sem estado ${c.id}: ${eUp.message}`);
      }
      await admin.from('eventos_convite').insert({
        contrato_id: c.id,
        tipo: 'cobranca',
        payload: {
          payment_intent: r.pi_id,
          valor_centimos: valor,
          fee_centimos: fee,
          tentativa,
          motivo,
          recuperada_por: 'dunning',
        },
      });
      await registarMetrica(admin, {
        evento: 'mit_ok',
        contrato_id: c.id,
        profissional_id: c.profissional_id,
        valor,
        fee_centimos: fee,
        funding: r.funding ?? c.funding_cartao,
        rede: r.rede,
        pi_id: r.pi_id,
        payload: { tentativa, motivo },
      });
      await registarMetrica(admin, {
        evento: 'fee_cobrada',
        contrato_id: c.id,
        profissional_id: c.profissional_id,
        valor,
        fee_centimos: fee,
        pi_id: r.pi_id,
      });
      await admin.rpc('criar_aviso_convite', {
        p_perfil: c.profissional_id,
        p_tipo: 'convite_cobranca',
        p_contrato: c.id,
        p_titulo: 'Cobrança recuperada ✓',
        p_corpo: `A cláusula penal de ${eur(valor)} (ref ${hash8}) foi cobrada à ${tentativa + 1}.ª tentativa e cai na tua conta (fee do Honra: ${eur(fee)}).`,
        p_prazo: null,
        p_urgente: false,
      });
      resumo.cobrancas_recuperadas++;
      continue;
    }

    // Retry falhou: regista, reclassifica e agenda (ou esgota).
    const novasTentativas = tentativa + 1;
    const novaClasse = classificarDecline(r.decline_code);
    await registarMetrica(admin, {
      evento: 'mit_falhou',
      contrato_id: c.id,
      profissional_id: c.profissional_id,
      valor,
      decline_code: r.decline_code,
      funding: r.funding ?? c.funding_cartao,
      rede: r.rede,
      pi_id: r.pi_id,
      payload: { tentativa, motivo },
    });
    await admin.from('eventos_convite').insert({
      contrato_id: c.id,
      tipo: 'cobranca_falhou',
      payload: {
        payment_intent: r.pi_id,
        decline_code: r.decline_code,
        tentativa,
        ...(r.erro ? { erro: r.erro } : {}),
      },
    });
    const atualizacao: Record<string, unknown> = {
      cobranca_tentativas: novasTentativas,
      cobranca_ultimo_decline: r.decline_code,
      ...(r.pi_id ? { cobranca_id: r.pi_id } : {}),
    };
    if (novaClasse === 'sca') {
      atualizacao.cobranca_proxima_em = null; // o ramo SCA assume no próximo ciclo
    } else if (novaClasse === 'hard' || novasTentativas >= 4) {
      // fecha já no próximo ciclo (ou agora): marcar sem próxima e fechar
      atualizacao.cobranca_proxima_em = null;
    } else {
      atualizacao.cobranca_proxima_em = new Date(
        new Date(c.cobranca_iniciada_em).getTime() +
          dunning_dias[Math.min(novasTentativas - 1, dunning_dias.length - 1)] * 86_400_000,
      ).toISOString();
    }
    await admin
      .from('contratos_convite')
      .update(atualizacao)
      .eq('id', c.id)
      .eq('estado', 'cobranca_pendente');
    if (novaClasse === 'hard') {
      c.cobranca_tentativas = novasTentativas;
      c.cobranca_ultimo_decline = r.decline_code;
      await fecharIncobravel('hard_decline');
    } else if (novaClasse === 'soft' && novasTentativas >= 4) {
      c.cobranca_tentativas = novasTentativas;
      await fecharIncobravel('tentativas_esgotadas');
    }
  }

  // ================================================================
  // FATIA E — 8) JANELA DE CONTESTAÇÃO (captura_proposta). A cobrança move-se
  // SÓ aqui, NUNCA no toque do profissional (blindagem da fuga E). Regras:
  //   • consentimento 'confirmado' ("faltei") → captura já (o cliente consentiu);
  //   • silêncio vencido COM recibo de entrega → captura (silêncio=consentimento);
  //   • silêncio vencido SEM recibo (Bird parqueado) → GUARDA DURA: 'em_disputa',
  //     hold libertado, SEM captura (cai em revisão — decisão 2 do fundador);
  //   • 'contestado' já foi a 'em_disputa' no convite-checkpoint (não chega aqui).
  // ================================================================
  const { data: propostas, error: eProp } = await admin
    .from('contratos_convite')
    .select(
      COLUNAS_HOLD +
        ', captura_proposta_em, captura_prazo_em, consentimento_resultado, ' +
        'consentimento_aviso_entregue, prova_encontro_em',
    )
    .eq('estado', 'captura_proposta');
  if (eProp) resumo.erros.push(`ler captura_proposta: ${eProp.message}`);

  for (const cData of propostas ?? []) {
    const c = cData as unknown as ContratoHold & {
      captura_proposta_em: string | null;
      captura_prazo_em: string | null;
      consentimento_resultado: string | null;
      consentimento_aviso_entregue: boolean;
      prova_encontro_em: string | null;
    };
    const hash8 = (c.contrato_hash ?? '').slice(0, 8);
    const valor =
      c.valor_total != null && c.valor_total > 0
        ? Math.round((c.valor_total * c.pct_caucao) / 100)
        : null;

    // Sem valor computável → só registo (não há dinheiro a mover).
    if (valor == null || valor <= 0) {
      await admin.from('contratos_convite')
        .update({ estado: 'incumprido_cliente', resolvido_em: agoraISO })
        .eq('id', c.id).eq('estado', 'captura_proposta');
      continue;
    }

    const confirmado = c.consentimento_resultado === 'confirmado';
    const prazoMs = c.captura_prazo_em ? Date.parse(c.captura_prazo_em) : Number.POSITIVE_INFINITY;
    const vencido = Date.now() >= prazoMs;

    // Ainda aberto e por vencer → talvez um lembrete (< 24h), e espera.
    if (!confirmado && !vencido) {
      if (prazoMs - Date.now() < 24 * 3_600_000) {
        const { count: jaLembrado } = await admin.from('eventos_convite')
          .select('id', { count: 'exact', head: true })
          .eq('contrato_id', c.id).eq('tipo', 'consentimento_lembrete');
        if ((jaLembrado ?? 0) === 0) {
          await registarSmsParqueado(c.id, 'consentimento_lembrete',
            `Falta pouco: se compareceste ou pagaste o contrato (ref ${hash8}), contesta antes do prazo — senão a cláusula penal de ${eur(valor)} será cobrada. ${SITE_URL}/c/${c.token_publico}`);
          await admin.from('eventos_convite').insert({
            contrato_id: c.id, tipo: 'consentimento_lembrete', payload: { valor_centimos: valor },
          });
          resumo.consentimentos_lembrados++;
        }
      }
      continue;
    }

    // GUARDA DURA: silêncio vencido SEM recibo de entrega → NUNCA captura; revisão.
    if (!confirmado && vencido && !c.consentimento_aviso_entregue) {
      if (c.hold_id && c.hold_decisao === 'hold_armado' && stripeKey && c.stripe_account_id) {
        await libertarHold(stripeKey, c.stripe_account_id, c.hold_id);
        await registarMetrica(admin, {
          evento: 'hold_libertado', contrato_id: c.id, profissional_id: c.profissional_id,
          valor, funding: c.funding_cartao, pi_id: c.hold_id, payload: { motivo: 'silencio_sem_recibo' },
        });
      }
      const { error: eUp } = await admin.from('contratos_convite')
        .update({ estado: 'em_disputa', consentimento_resultado: 'silencio', resolvido_em: null,
          ...(c.hold_id ? { hold_decisao: 'hold_falhou' } : {}) })
        .eq('id', c.id).eq('estado', 'captura_proposta');
      if (eUp) { resumo.erros.push(`silencio_revisao ${c.id}: ${eUp.message}`); continue; }
      await admin.from('eventos_convite').insert({
        contrato_id: c.id, tipo: 'checkpoint_silencio',
        payload: { motivo: 'sem_recibo_de_entrega', para: 'em_disputa' },
      });
      await registarMetrica(admin, {
        evento: 'consentimento_silencio', contrato_id: c.id, profissional_id: c.profissional_id,
        valor, payload: { recibo: false, resultado: 'em_disputa' },
      });
      await admin.rpc('criar_aviso_convite', {
        p_perfil: c.profissional_id, p_tipo: 'convite_checkpoint', p_contrato: c.id,
        p_titulo: 'Falta em revisão',
        p_corpo: `O aviso ao cliente não teve confirmação de entrega, por isso a falta do contrato (ref ${hash8}) não é cobrada automaticamente — vai a revisão do Honra.`,
        p_prazo: null, p_urgente: false,
      });
      resumo.silencios_em_revisao++;
      continue;
    }

    // Capturar: consentimento 'confirmado' OU silêncio vencido COM recibo.
    if (!stripeKey || !c.stripe_account_id) { resumo.erros.push(`captura_proposta ${c.id}: sem Stripe`); continue; }
    const fee = feePenalizacao(valor);
    let resultado: { ok: boolean; pi_id: string | null; decline_code: string | null; via: 'captura' | 'mit' } | null = null;

    const temHold = !!c.hold_id && c.hold_decisao === 'hold_armado';
    if (temHold) {
      const dentro = !c.hold_capture_before || Date.parse(c.hold_capture_before) > Date.now();
      if (dentro) {
        const cap = await capturarHold({ stripeKey, conta: c.stripe_account_id, piId: c.hold_id!, valor, fee });
        if (cap.ok) {
          resultado = { ok: true, pi_id: cap.pi_id, decline_code: null, via: 'captura' };
          await registarMetrica(admin, { evento: 'captura_ok', contrato_id: c.id, profissional_id: c.profissional_id, valor, fee_centimos: fee, funding: cap.funding ?? c.funding_cartao, rede: cap.rede, pi_id: cap.pi_id, payload: { motivo: 'incumprimento_cliente', consentimento: confirmado ? 'confirmado' : 'silencio' } });
        } else {
          await registarMetrica(admin, { evento: 'captura_falhou', contrato_id: c.id, profissional_id: c.profissional_id, valor, decline_code: cap.decline_code, funding: c.funding_cartao, pi_id: c.hold_id, payload: { erro: cap.erro } });
          await libertarHold(stripeKey, c.stripe_account_id, c.hold_id!);
        }
      } else {
        await libertarHold(stripeKey, c.stripe_account_id, c.hold_id!);
        await registarMetrica(admin, { evento: 'hold_expirado', contrato_id: c.id, profissional_id: c.profissional_id, valor, funding: c.funding_cartao, pi_id: c.hold_id, payload: { capture_before: c.hold_capture_before } });
      }
    }
    if ((!resultado || !resultado.ok) && c.stripe_customer_id && c.payment_method_id) {
      const mit = await cobrarMit({ stripeKey, conta: c.stripe_account_id, customer: c.stripe_customer_id, paymentMethod: c.payment_method_id, valor, fee, descricao: `Honra — cláusula penal por incumprimento (${c.pct_caucao}%, ref ${hash8})`, contratoId: c.id, motivo: 'incumprimento_cliente' });
      resultado = { ok: mit.ok, pi_id: mit.pi_id, decline_code: mit.decline_code, via: 'mit' };
      await registarMetrica(admin, { evento: mit.ok ? 'mit_ok' : 'mit_falhou', contrato_id: c.id, profissional_id: c.profissional_id, valor, ...(mit.ok ? { fee_centimos: fee } : {}), decline_code: mit.decline_code, funding: mit.funding ?? c.funding_cartao, rede: mit.rede, pi_id: mit.pi_id, payload: { motivo: 'incumprimento_cliente', consentimento: confirmado ? 'confirmado' : 'silencio', tentativa: 0 } });
    }

    if (resultado?.ok) {
      await registarMetrica(admin, { evento: 'fee_cobrada', contrato_id: c.id, profissional_id: c.profissional_id, valor, fee_centimos: fee, pi_id: resultado.pi_id });
      await registarMetrica(admin, { evento: confirmado ? 'consentimento_confirmado' : 'consentimento_silencio', contrato_id: c.id, profissional_id: c.profissional_id, valor, payload: { recibo: true, capturado: true } });
      await admin.from('contratos_convite')
        .update({ estado: 'incumprido_cliente', quem_falhou: 'cliente', cobranca_id: resultado.pi_id, cobranca_motivo: 'incumprimento_cliente', cobranca_valor: valor, resolvido_em: agoraISO, ...(confirmado ? {} : { consentimento_resultado: 'silencio' }) })
        .eq('id', c.id).eq('estado', 'captura_proposta');
      await admin.from('eventos_convite').insert({ contrato_id: c.id, tipo: confirmado ? 'checkpoint_confirmado' : 'checkpoint_silencio', payload: { resultado: 'incumprido_cliente', via: resultado.via, payment_intent: resultado.pi_id, valor_centimos: valor, fee_centimos: fee, consentimento: confirmado ? 'confirmado' : 'silencio' } });
      await admin.rpc('criar_aviso_convite', { p_perfil: c.profissional_id, p_tipo: 'convite_cobranca', p_contrato: c.id, p_titulo: 'Cláusula penal cobrada', p_corpo: `A cláusula penal de ${eur(valor)} (ref ${hash8}) foi ${resultado.via === 'captura' ? 'capturada da reserva' : 'cobrada'} para a tua conta (fee do Honra: ${eur(fee)}). ${confirmado ? 'O cliente confirmou a falta.' : 'O cliente não contestou no prazo.'}`, p_prazo: null, p_urgente: false });
      if (confirmado) resumo.capturas_por_consentimento++;
      else resumo.capturas_por_silencio++;
      continue;
    }

    // Cobrança falhou → 'cobranca_pendente' + máquina de dunning (próximo ciclo).
    const classe = classificarDecline(resultado?.decline_code);
    const { error: ePend } = await admin.from('contratos_convite')
      .update({ estado: 'cobranca_pendente', cobranca_id: resultado?.pi_id ?? null, cobranca_motivo: 'incumprimento_cliente', cobranca_valor: valor, cobranca_iniciada_em: agoraISO, cobranca_tentativas: 1, cobranca_ultimo_decline: resultado?.decline_code ?? null, cobranca_proxima_em: classe === 'soft' ? new Date(Date.now() + dunning_dias[0] * 86_400_000).toISOString() : null, ...(confirmado ? {} : { consentimento_resultado: 'silencio' }) })
      .eq('id', c.id).eq('estado', 'captura_proposta');
    if (ePend) { resumo.erros.push(`captura_proposta pendente ${c.id}: ${ePend.message}`); continue; }
    await admin.from('eventos_convite').insert({ contrato_id: c.id, tipo: 'cobranca_falhou', payload: { motivo: 'incumprimento_cliente', consentimento: confirmado ? 'confirmado' : 'silencio', decline_code: resultado?.decline_code, valor_centimos: valor } });
    resumo.capturas_proposta_falhadas++;
  }

  return json({ ok: true, hoje, ...resumo });
});
