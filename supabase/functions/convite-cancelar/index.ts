// HONRA — Contrato-convite: CANCELAR — os 3 escalões completos (Fatia C-2 + D).
// O cancelamento nunca se impede; fixa-se-lhe o PREÇO, e o preço é do TEMPO
// (doc §5): as percentagens e a janela vêm CONGELADAS do aceite — nunca daqui.
//
// Duas portas, uma função (deploy com --no-verify-jwt; o JWT valida-se à mão):
//   • PROFISSIONAL (JWT):
//       { contrato_id, motivo? }            → 'cancelado_profissional'. Sem
//         QUALQUER cobrança ao cliente; um hold vivo LIBERTA-SE (0€). Se for a
//         ≤ 30 dias do evento, fica a MARCA (quem_falhou='profissional').
//       { contrato_id, acao:'perdoar' }     → PERDÃO de uma cobrança pendente:
//         cancela a PaymentIntent, fee 0 €, nada se cobra a ninguém; o contrato
//         fecha no estado terminal do motivo, com perdoado_em carimbado.
//         (PAGAMENTOS §7: o Honra não lucra com quebras; perdão custa 0.)
//   • CONVIDADO (magic link 'cancelar'):
//       { acao:'pedir', token_publico }  → emite o link por SMS (45s).
//       { acao:'prever', token }         → escalão + VALOR CONCRETO de hoje.
//       { acao:'confirmar', token, aceito } → executa:
//         escalão 1 → 'cancelado_escalao_1' (0€; hold vivo liberta-se);
//         escalão 2/3 com instrumento → hold vivo? CAPTURA (parcial se devido <
//           autorizado — under-capture nativa; NUNCA acima do autorizado) :
//           senão MIT direta ao cartão gravado. Fee do Honra na cobrança:
//           3% mín. 0,60 € (application_fee_amount). Falha → 'cobranca_pendente'
//           + máquina de dunning (resolver-convites: D+1/D+3/D+7 gated).
//         sem instrumento/valor → registo honesto ('cancelado_escalao_X', 0€).
//
// Cada movimento escreve a métrica certa em `metricas_pagamento`.
// TODO(Fatia E): âncora de liquidação 'fim' (multi-dia) — ancora-se na
// data_inicio, como o desenho manda por omissão (§6.6).

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { escalaoCancelamento, marcoEscalao1, marcoEscalao2, sha256, valorEscalao } from '../_shared/contrato.ts';
import { enviarSmsTexto } from '../_shared/bird.ts';
import {
  capturarHold,
  classificarDecline,
  cobrarMit,
  feePenalizacao,
  libertarHold,
  registarMetrica,
} from '../_shared/pagamentos.ts';
import { modoTeste } from '../_shared/modoTeste.ts';

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
function novoToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://honraapp.com';
const MODO_TESTE = modoTeste();

// Estados de contrato vivo de onde se pode cancelar (desenho §4.1).
const CANCELAVEIS = ['assinado', 'caucionado', 'sem_caucao', 'cartao_falhou'];

// Estado terminal de uma cobrança pelo motivo (partilhado com o resolver).
const TERMINAL_POR_MOTIVO: Record<string, string> = {
  escalao_2: 'cancelado_escalao_2',
  escalao_3: 'cancelado_escalao_3',
  incumprimento_cliente: 'incumprido_cliente',
};

// Colunas que todas as portas precisam de ler.
const COLUNAS =
  'id, estado, nivel_protecao, token_publico, contrato_hash, servico, data_inicio, ' +
  'valor_total, pct_cancelamento, pct_caucao, janela_x_meses, ' +
  'stripe_account_id, stripe_customer_id, payment_method_id, cartao_gravado_em, ' +
  'funding_cartao, hold_decisao, hold_id, hold_capture_before, ' +
  'cobranca_id, cobranca_motivo, cobranca_valor, ' +
  'profissional_id, cliente_convidado_id';

type Contrato = {
  id: string;
  estado: string;
  nivel_protecao: number;
  token_publico: string;
  contrato_hash: string | null;
  servico: string | null;
  data_inicio: string;
  valor_total: number | null;
  pct_cancelamento: number;
  pct_caucao: number;
  janela_x_meses: number;
  stripe_account_id: string | null;
  stripe_customer_id: string | null;
  payment_method_id: string | null;
  cartao_gravado_em: string | null;
  funding_cartao: string | null;
  hold_decisao: string | null;
  hold_id: string | null;
  hold_capture_before: string | null;
  cobranca_id: string | null;
  cobranca_motivo: string | null;
  cobranca_valor: number | null;
  profissional_id: string;
  cliente_convidado_id: string;
};

function eur(centimos: number): string {
  return `${(centimos / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} €`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'método não suportado' }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    return json({ error: 'corpo inválido' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const agora = new Date().toISOString();
  const hoje = agora.slice(0, 10);
  const ip =
    (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    null;
  const userAgent = req.headers.get('user-agent');
  const motivo =
    typeof body.motivo === 'string' && body.motivo.trim()
      ? body.motivo.trim().slice(0, 300)
      : null;
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');

  // ================= PORTA DO PROFISSIONAL (JWT) =================
  if (body.contrato_id != null) {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'não autenticado' }, 401);

    const { data: c } = await admin
      .from('contratos_convite')
      .select(COLUNAS)
      .eq('id', String(body.contrato_id))
      .maybeSingle();
    if (!c) return json({ error: 'convite não encontrado' }, 404);
    const ct = c as unknown as Contrato;
    if (ct.profissional_id !== user.id) return json({ error: 'este contrato não é teu' }, 403);

    // ---------- PERDÃO de uma cobrança pendente (Fatia D) ----------
    if (String(body.acao ?? '') === 'perdoar') {
      if (ct.estado !== 'cobranca_pendente')
        return json({ error: 'este contrato não tem nenhuma cobrança pendente para perdoar' }, 409);

      // Cancela a PaymentIntent pendente (best-effort: uma PI já morta não trava
      // o perdão — o que interessa é que NADA será cobrado).
      let pi_cancelada = false;
      if (ct.cobranca_id && stripeKey && ct.stripe_account_id) {
        const r = await libertarHold(stripeKey, ct.stripe_account_id, ct.cobranca_id);
        pi_cancelada = r.ok;
      }

      const motivoCobranca = ct.cobranca_motivo ?? 'escalao_2';
      const estadoFinal = TERMINAL_POR_MOTIVO[motivoCobranca] ?? 'cancelado_escalao_2';
      const { error: eUp } = await admin
        .from('contratos_convite')
        .update({
          estado: estadoFinal,
          perdoado_em: agora,
          cobranca_proxima_em: null,
          resolvido_em: agora,
        })
        .eq('id', ct.id)
        .eq('estado', 'cobranca_pendente');
      if (eUp) return json({ error: 'não foi possível perdoar. Tenta de novo.' }, 500);

      const hash8 = (ct.contrato_hash ?? '').slice(0, 8);
      await admin.from('eventos_convite').insert({
        contrato_id: ct.id,
        tipo: 'perdoado',
        ip,
        user_agent: userAgent,
        payload: {
          por: 'profissional',
          motivo_cobranca: motivoCobranca,
          valor_centimos: ct.cobranca_valor,
          fee_centimos: 0,
          pi_cancelada,
          ...(motivo ? { motivo } : {}),
        },
      });
      await registarMetrica(admin, {
        evento: 'perdoado',
        contrato_id: ct.id,
        profissional_id: ct.profissional_id,
        valor: ct.cobranca_valor,
        fee_centimos: 0,
        funding: ct.funding_cartao,
        pi_id: ct.cobranca_id,
        payload: { motivo_cobranca: motivoCobranca },
      });
      // SMS ao cliente — TODO parqueado do Bird.
      await admin.from('eventos_convite').insert({
        contrato_id: ct.id,
        tipo: 'sms_enviado',
        payload: {
          finalidade: 'perdoado',
          mensagem: `O profissional perdoou a cobrança do contrato (ref ${hash8}). Nada é cobrado no teu cartão.`,
          enviado: false,
          motivo: MODO_TESTE ? 'modo_teste' : 'todo_bird_parqueado',
        },
      });
      return json({ ok: true, estado: estadoFinal, perdoado: true, fee_centimos: 0 });
    }

    // ---------- Cancelamento unilateral de P ----------
    if (!CANCELAVEIS.includes(ct.estado))
      return json({ error: 'este contrato não está num estado cancelável' }, 409);

    // Hold vivo → liberta-se SEMPRE (o cartão de C fica intocado, doc §4.1).
    let hold_libertado = false;
    if (ct.estado === 'caucionado' && ct.hold_id && stripeKey && ct.stripe_account_id) {
      const lib = await libertarHold(stripeKey, ct.stripe_account_id, ct.hold_id);
      hold_libertado = lib.ok;
      await registarMetrica(admin, {
        evento: 'hold_libertado',
        contrato_id: ct.id,
        profissional_id: ct.profissional_id,
        valor:
          ct.valor_total != null ? Math.round((ct.valor_total * ct.pct_caucao) / 100) : null,
        funding: ct.funding_cartao,
        pi_id: ct.hold_id,
        payload: { motivo: 'cancelado_profissional', ...(lib.erro ? { erro: lib.erro } : {}) },
      });
    }

    // A marca: cancelar em cima do evento (≤ 30 dias) fica no registo de P.
    const dias = Math.floor(
      (Date.parse(ct.data_inicio + 'T00:00:00Z') - Date.parse(hoje + 'T00:00:00Z')) / 86_400_000,
    );
    const marca = dias <= 30;

    const { error: erroUp } = await admin
      .from('contratos_convite')
      .update({
        estado: 'cancelado_profissional',
        ...(marca ? { quem_falhou: 'profissional' } : {}),
        motivo_cancelamento: motivo,
        resolvido_em: agora,
      })
      .eq('id', ct.id)
      .in('estado', CANCELAVEIS);
    if (erroUp) return json({ error: 'não foi possível cancelar. Tenta de novo.' }, 500);

    await admin.from('eventos_convite').insert({
      contrato_id: ct.id,
      tipo: 'cancelamento',
      ip,
      user_agent: userAgent,
      payload: {
        por: 'profissional',
        dias_antecedencia: dias,
        marca, // TODO(Fatia D+): projetar a marca no Honra Card / índice de P
        ...(motivo ? { motivo } : {}),
        cobranca: 'nenhuma', // o cartão de C fica INTOCADO — sempre
        hold_libertado,
      },
    });

    // Dizer a C o que aconteceu — e o que NÃO acontece ao cartão dele.
    const hash8 = (ct.contrato_hash ?? '').slice(0, 8);
    const { data: cli } = await admin
      .from('clientes_convidados')
      .select('nome, telefone')
      .eq('id', ct.cliente_convidado_id)
      .maybeSingle();
    const { data: prof } = await admin
      .from('perfis')
      .select('nome')
      .eq('id', ct.profissional_id)
      .maybeSingle();
    const mensagem =
      `${prof?.nome ?? 'O profissional'} cancelou o contrato (ref ${hash8}). ` +
      'Nada é cobrado no teu cartão' +
      (hold_libertado ? ' — a reserva foi devolvida' : '') +
      '. Detalhes: ' +
      `${SITE_URL}/c/${ct.token_publico}`;
    let sms_enviado = false;
    let sms_motivo: string | undefined;
    if (MODO_TESTE) {
      sms_motivo = 'modo_teste';
    } else if (cli?.telefone) {
      const envio = await enviarSmsTexto(cli.telefone, mensagem);
      sms_enviado = envio.ok;
      if (!envio.ok) sms_motivo = envio.motivo;
    }
    await admin.from('eventos_convite').insert({
      contrato_id: ct.id,
      tipo: 'sms_enviado',
      payload: { finalidade: 'cancelado_profissional', mensagem, enviado: sms_enviado, ...(sms_motivo ? { falha: sms_motivo } : {}) },
    });

    return json({ ok: true, estado: 'cancelado_profissional', marca, dias_antecedencia: dias, hold_libertado });
  }

  // ================= PORTA DO CONVIDADO (magic link) =================
  const acao = String(body.acao ?? '').trim();

  // --- 'pedir': emitir o link de cancelamento por SMS. ---
  if (acao === 'pedir') {
    const tokenPub = String(body.token_publico ?? '').trim();
    if (!tokenPub) return json({ error: 'falta o identificador do contrato' }, 400);

    const { data: c } = await admin
      .from('contratos_convite')
      .select('id, estado, contrato_hash, cliente_convidado_id, token_publico')
      .eq('token_publico', tokenPub)
      .maybeSingle();
    if (!c) return json({ error: 'convite não encontrado' }, 404);
    if (!CANCELAVEIS.includes(c.estado))
      return json({ error: 'este contrato não está num estado cancelável' }, 409);

    const ha45s = new Date(Date.now() - 45_000).toISOString();
    const { count } = await admin
      .from('magic_links_convite')
      .select('id', { count: 'exact', head: true })
      .eq('contrato_id', c.id)
      .eq('finalidade', 'cancelar')
      .gte('criado_em', ha45s);
    if ((count ?? 0) > 0)
      return json({ error: 'Acabámos de enviar um link. Aguarda uns segundos.' }, 429);

    const linkToken = novoToken();
    const { error } = await admin.from('magic_links_convite').insert({
      token_hash: await sha256(linkToken),
      contrato_id: c.id,
      finalidade: 'cancelar',
      expira_em: new Date(Date.now() + 72 * 3_600_000).toISOString(),
    });
    if (error) return json({ error: 'não foi possível gerar o link' }, 500);

    const url = `${SITE_URL}/c/${tokenPub}?ml=${linkToken}&fin=cancelar`;
    const hash8 = (c.contrato_hash ?? '').slice(0, 8);
    const mensagem = `Para cancelares o contrato (ref ${hash8}) nos termos que assinaste, confirma aqui: ${url}`;

    let sms_enviado = false;
    let sms_motivo: string | undefined;
    if (MODO_TESTE) {
      sms_motivo = 'modo_teste';
    } else {
      const { data: cli } = await admin
        .from('clientes_convidados')
        .select('telefone')
        .eq('id', c.cliente_convidado_id)
        .maybeSingle();
      if (!cli) {
        sms_motivo = 'cliente_em_falta';
      } else {
        const envio = await enviarSmsTexto(cli.telefone, mensagem);
        sms_enviado = envio.ok;
        if (!envio.ok) sms_motivo = envio.motivo;
      }
    }
    await admin.from('eventos_convite').insert({
      contrato_id: c.id,
      tipo: 'sms_enviado',
      payload: { finalidade: 'cancelar', mensagem, enviado: sms_enviado, ...(sms_motivo ? { falha: sms_motivo } : {}) },
    });
    return json({ enviado: true, sms_enviado, ...(MODO_TESTE ? { magic_link: url } : {}) });
  }

  if (acao !== 'prever' && acao !== 'confirmar') return json({ error: 'ação inválida' }, 400);

  // --- Resolver o magic link 'cancelar' (vivo, não gasto). ---
  const token = String(body.token ?? '').trim();
  if (!token) return json({ error: 'falta o link' }, 400);
  const { data: link } = await admin
    .from('magic_links_convite')
    .select('id, contrato_id, finalidade, expira_em, usado_em')
    .eq('token_hash', await sha256(token))
    .maybeSingle();
  if (!link || link.finalidade !== 'cancelar')
    return json({ error: 'Link inválido.', pode_renovar: true }, 401);
  if (link.usado_em)
    return json({ error: 'Este link já foi usado.', pode_renovar: true }, 410);
  if (new Date(link.expira_em).getTime() < Date.now())
    return json({ error: 'Este link expirou. Pede um novo.', pode_renovar: true }, 410);

  const { data: cData } = await admin
    .from('contratos_convite')
    .select(COLUNAS)
    .eq('id', link.contrato_id)
    .maybeSingle();
  if (!cData) return json({ error: 'convite não encontrado' }, 404);
  const c = cData as unknown as Contrato;
  if (!CANCELAVEIS.includes(c.estado))
    return json({ error: 'este contrato não está num estado cancelável' }, 409);
  if (hoje > c.data_inicio)
    // Depois do evento já não é cancelamento — é o checkpoint (Fatia D).
    return json({ error: 'O evento já passou — este contrato resolve-se no dia, não por cancelamento.' }, 409);

  // O escalão de HOJE, pelas percentagens CONGELADAS no aceite.
  const escalao = escalaoCancelamento(c.data_inicio, c.janela_x_meses, hoje);
  const pct = escalao === 1 ? 0 : escalao === 2 ? c.pct_cancelamento : c.pct_caucao;
  const valor = valorEscalao(escalao, c.valor_total, c.pct_cancelamento, c.pct_caucao);
  const temCartao = (c.nivel_protecao ?? 1) >= 2 && !!c.payment_method_id && !!c.cartao_gravado_em;
  const temHold = c.estado === 'caucionado' && !!c.hold_id;
  const valorHold =
    c.valor_total != null ? Math.round((c.valor_total * c.pct_caucao) / 100) : null;
  // Cobra-se via Honra quando há escalão com preço, cartão gravado e valor computável.
  const cobravel = escalao >= 2 && temCartao && valor != null && valor > 0;

  // --- 'prever': o preço de hoje, para a página o mostrar junto ao botão. ---
  if (acao === 'prever') {
    return json({
      escalao,
      pct,
      valor_centimos: valor, // null = valor do contrato "(a combinar)" — nada via Honra
      cobra_no_cartao: cobravel,
      marco_escalao_1: marcoEscalao1(c.data_inicio, c.janela_x_meses),
      marco_escalao_2: marcoEscalao2(c.data_inicio),
      data_inicio: c.data_inicio,
      disponivel: true, // Fatia D: os 3 escalões executam-se por aqui
    });
  }

  // --- 'confirmar': executar o cancelamento ao preço de hoje. ---
  if (body.aceito !== true)
    return json({ error: 'Confirma que aceitas o valor do cancelamento.' }, 400);

  const hash8 = (c.contrato_hash ?? '').slice(0, 8);
  const { data: cli } = await admin
    .from('clientes_convidados')
    .select('nome')
    .eq('id', c.cliente_convidado_id)
    .maybeSingle();
  const nomeC = cli?.nome ?? 'O teu cliente';

  // Caminho SEM cobrança via Honra: escalão 1 (0€), ou escalão 2/3 sem
  // instrumento (nível i, sem cartão gravado, ou valor "(a combinar)").
  if (!cobravel) {
    // Hold vivo num cancelamento sem preço → liberta-se (0€, nunca fica preso).
    let hold_libertado = false;
    if (temHold && stripeKey && c.stripe_account_id) {
      const lib = await libertarHold(stripeKey, c.stripe_account_id, c.hold_id!);
      hold_libertado = lib.ok;
      await registarMetrica(admin, {
        evento: 'hold_libertado',
        contrato_id: c.id,
        profissional_id: c.profissional_id,
        valor: valorHold,
        funding: c.funding_cartao,
        pi_id: c.hold_id,
        payload: { motivo: `cancelado_escalao_${escalao}` , ...(lib.erro ? { erro: lib.erro } : {}) },
      });
    }
    const estadoFinal = `cancelado_escalao_${escalao}`;
    const { error: erroUp } = await admin
      .from('contratos_convite')
      .update({ estado: estadoFinal, motivo_cancelamento: motivo, resolvido_em: agora })
      .eq('id', c.id)
      .in('estado', CANCELAVEIS);
    if (erroUp) return json({ error: 'não foi possível cancelar. Tenta de novo.' }, 500);

    const razao =
      escalao === 1
        ? 'escalao_1'
        : !temCartao
          ? (c.nivel_protecao ?? 1) >= 2
            ? 'sem_cartao_gravado'
            : 'nivel_1'
          : 'valor_nao_definido';
    await admin.from('eventos_convite').insert({
      contrato_id: c.id,
      tipo: 'cancelamento',
      ip,
      user_agent: userAgent,
      payload: {
        por: 'cliente',
        escalao,
        pct,
        valor_centimos: valor,
        cobranca: 'nenhuma',
        razao,
        hold_libertado,
        ...(motivo ? { motivo } : {}),
      },
    });
    await admin.from('magic_links_convite').update({ usado_em: agora }).eq('id', link.id);

    // Aviso HONESTO a P — incluindo o que fica por cobrar fora do Honra.
    const corpoP =
      escalao === 1
        ? `${nomeC} cancelou longe da data (ref ${hash8}). Nada é cobrado via Honra — o adiantamento fora do Honra é assunto do contrato.`
        : `${nomeC} cancelou (ref ${hash8}). A cláusula penal de ${pct}%${valor != null ? ` (${eur(valor)})` : ''} fica por cobrar diretamente — este contrato não tem cartão guardado no Honra.`;
    await admin.rpc('criar_aviso_convite', {
      p_perfil: c.profissional_id,
      p_tipo: 'convite_cancelado',
      p_contrato: c.id,
      p_titulo: 'Contrato cancelado pelo cliente',
      p_corpo: corpoP,
      p_prazo: null,
      p_urgente: false,
    });

    return json({ ok: true, estado: estadoFinal, escalao, pct, valor_centimos: valor, cobrado: false });
  }

  // Caminho COM cobrança (escalão 2/3, cartão gravado, valor definido):
  // 'cobranca_pendente' primeiro (trava dupla execução), depois o instrumento
  // vivo: CAPTURA do hold (parcial se devido < autorizado) ou MIT direta na
  // conta de P — o mandato aceite no cartão é a autorização (EBA Q&A 2019_4792/4794).
  if (!stripeKey) return json({ error: 'Pagamentos indisponíveis: falta a chave da Stripe.' }, 503);
  if (!c.stripe_account_id)
    return json({ error: 'este contrato não tem conta de pagamentos associada' }, 409);

  const motivoCobranca = escalao === 2 ? 'escalao_2' : 'escalao_3';
  const fee = feePenalizacao(valor!);

  const { error: erroPend } = await admin
    .from('contratos_convite')
    .update({
      estado: 'cobranca_pendente',
      motivo_cancelamento: motivo,
      cobranca_motivo: motivoCobranca,
      cobranca_valor: valor,
    })
    .eq('id', c.id)
    .in('estado', CANCELAVEIS);
  if (erroPend) return json({ error: 'não foi possível cancelar. Tenta de novo.' }, 500);

  // O ATO de cancelar entra no audit trail ANTES do dinheiro (IP/UA do C — a
  // evidência do pedido é independente do sucesso da cobrança).
  await admin.from('eventos_convite').insert({
    contrato_id: c.id,
    tipo: 'cancelamento',
    ip,
    user_agent: userAgent,
    payload: {
      por: 'cliente',
      escalao,
      pct,
      valor_centimos: valor,
      cobranca: temHold ? 'captura_hold' : 'mit_off_session',
      ...(motivo ? { motivo } : {}),
    },
  });

  // ---- O instrumento vivo. 1.º: hold (captura ≤ autorizado). 2.º: MIT. ----
  let resultado: {
    ok: boolean;
    pi_id: string | null;
    decline_code: string | null;
    rede: string | null;
    funding: string | null;
    erro: string | null;
    via: 'captura' | 'mit';
  } | null = null;

  if (temHold) {
    const dentroDaJanela =
      !c.hold_capture_before || Date.parse(c.hold_capture_before) > Date.now();
    if (dentroDaJanela && valorHold != null) {
      // NUNCA acima do autorizado (overcapture excluída no EEE) — parcial é nativo.
      const aCapturar = Math.min(valor!, valorHold);
      const cap = await capturarHold({
        stripeKey,
        conta: c.stripe_account_id,
        piId: c.hold_id!,
        valor: aCapturar,
        fee: feePenalizacao(aCapturar),
      });
      if (cap.ok) {
        resultado = { ...cap, via: 'captura' };
        await registarMetrica(admin, {
          evento: 'captura_ok',
          contrato_id: c.id,
          profissional_id: c.profissional_id,
          valor: aCapturar,
          fee_centimos: feePenalizacao(aCapturar),
          funding: cap.funding ?? c.funding_cartao,
          rede: cap.rede,
          pi_id: cap.pi_id,
          payload: {
            motivo: motivoCobranca,
            autorizado_centimos: valorHold,
            parcial: aCapturar < valorHold,
          },
        });
      } else {
        await registarMetrica(admin, {
          evento: 'captura_falhou',
          contrato_id: c.id,
          profissional_id: c.profissional_id,
          valor: aCapturar,
          decline_code: cap.decline_code,
          funding: c.funding_cartao,
          pi_id: c.hold_id,
          payload: { erro: cap.erro, motivo: motivoCobranca },
        });
        await libertarHold(stripeKey, c.stripe_account_id, c.hold_id!);
      }
    } else {
      // Fora da janela real: libertar e cair para MIT (nunca capturar tarde).
      await libertarHold(stripeKey, c.stripe_account_id, c.hold_id!);
      await registarMetrica(admin, {
        evento: 'hold_expirado',
        contrato_id: c.id,
        profissional_id: c.profissional_id,
        valor: valorHold,
        funding: c.funding_cartao,
        pi_id: c.hold_id,
        payload: { capture_before: c.hold_capture_before },
      });
    }
  }

  if ((!resultado || !resultado.ok) && c.stripe_customer_id && c.payment_method_id) {
    const mit = await cobrarMit({
      stripeKey,
      conta: c.stripe_account_id,
      customer: c.stripe_customer_id,
      paymentMethod: c.payment_method_id,
      valor: valor!,
      fee,
      descricao: `Honra — cláusula penal de cancelamento (escalão ${escalao}, ${pct}%, ref ${hash8})`,
      contratoId: c.id,
      motivo: motivoCobranca,
    });
    resultado = { ...mit, via: 'mit' };
    await registarMetrica(admin, {
      evento: mit.ok ? 'mit_ok' : 'mit_falhou',
      contrato_id: c.id,
      profissional_id: c.profissional_id,
      valor: valor!,
      ...(mit.ok ? { fee_centimos: fee } : {}),
      decline_code: mit.decline_code,
      funding: mit.funding ?? c.funding_cartao,
      rede: mit.rede,
      pi_id: mit.pi_id,
      payload: { motivo: motivoCobranca, tentativa: 0, escalao },
    });
  }

  const cobrado = resultado?.ok === true;
  const feeReal =
    resultado?.via === 'captura' ? feePenalizacao(Math.min(valor!, valorHold ?? valor!)) : fee;
  await admin.from('eventos_convite').insert({
    contrato_id: c.id,
    tipo: cobrado ? 'cobranca' : 'cobranca_falhou',
    ip,
    user_agent: userAgent,
    payload: {
      escalao,
      pct,
      valor_centimos: valor,
      via: resultado?.via ?? 'nenhuma',
      payment_intent: resultado?.pi_id ?? null,
      ...(cobrado ? { fee_centimos: feeReal } : {}),
      stripe_account: c.stripe_account_id,
      ...(resultado?.decline_code ? { decline_code: resultado.decline_code } : {}),
      ...(resultado?.erro ? { erro: resultado.erro } : {}),
      ...(motivo ? { motivo } : {}),
    },
  });

  if (cobrado) {
    await registarMetrica(admin, {
      evento: 'fee_cobrada',
      contrato_id: c.id,
      profissional_id: c.profissional_id,
      valor: valor!,
      fee_centimos: feeReal,
      pi_id: resultado!.pi_id,
    });
    const estadoFinal = `cancelado_escalao_${escalao}`;
    const { error: erroFinal } = await admin
      .from('contratos_convite')
      .update({ estado: estadoFinal, cobranca_id: resultado!.pi_id, resolvido_em: agora })
      .eq('id', c.id)
      .eq('estado', 'cobranca_pendente');
    if (erroFinal)
      // A cobrança correu; o estado fica pendente até o dunning/reconciliação —
      // nunca esconder o dinheiro que já se moveu.
      return json({ ok: true, estado: 'cobranca_pendente', escalao, pct, valor_centimos: valor, cobrado: true });

    await admin.from('magic_links_convite').update({ usado_em: agora }).eq('id', link.id);
    await admin.rpc('criar_aviso_convite', {
      p_perfil: c.profissional_id,
      p_tipo: 'convite_cancelado',
      p_contrato: c.id,
      p_titulo: 'Contrato cancelado — cláusula penal cobrada',
      p_corpo: `${nomeC} cancelou (ref ${hash8}). A cláusula penal de ${pct}% (${eur(valor!)}) foi ${resultado!.via === 'captura' ? 'capturada da reserva' : 'cobrada'} para a tua conta (fee do Honra: ${eur(feeReal)}). Se a data for reocupada, podes perdoar — nesse caso devolve-se tudo.`,
      p_prazo: null,
      p_urgente: false,
    });
    return json({ ok: true, estado: estadoFinal, escalao, pct, valor_centimos: valor, cobrado: true, via: resultado!.via, fee_centimos: feeReal });
  }

  // Recusa/SCA/erro: fica 'cobranca_pendente' — o cancelamento está pedido, a
  // cobrança por concluir. A máquina de dunning (resolver-convites) assume:
  // soft → D+1/D+3/D+7; authentication_required → magic link SCA (72h), NUNCA
  // retry por máquina; hard → incobrável.
  const classe = classificarDecline(resultado?.decline_code);
  await admin
    .from('contratos_convite')
    .update({
      ...(resultado?.pi_id ? { cobranca_id: resultado.pi_id } : {}),
      cobranca_iniciada_em: agora,
      cobranca_tentativas: 1,
      cobranca_ultimo_decline: resultado?.decline_code ?? null,
      cobranca_proxima_em:
        classe === 'soft' ? new Date(Date.now() + 86_400_000).toISOString() : null,
    })
    .eq('id', c.id)
    .eq('estado', 'cobranca_pendente');
  await admin.from('magic_links_convite').update({ usado_em: agora }).eq('id', link.id);
  await admin.rpc('criar_aviso_convite', {
    p_perfil: c.profissional_id,
    p_tipo: 'convite_cancelado',
    p_contrato: c.id,
    p_titulo: 'Cancelamento — cobrança por concluir',
    p_corpo: `${nomeC} cancelou (ref ${hash8}), mas o cartão recusou a cláusula penal de ${pct}% (${eur(valor!)}). Vamos continuar a tentar — podes perdoar a cobrança a qualquer momento.`,
    p_prazo: null,
    p_urgente: false,
  });
  return json({
    ok: true,
    estado: 'cobranca_pendente',
    escalao,
    pct,
    valor_centimos: valor,
    cobrado: false,
    aviso: 'O teu cartão recusou a cobrança da cláusula penal. O cancelamento ficou registado; a cobrança vai ser retentada.',
  });
});
