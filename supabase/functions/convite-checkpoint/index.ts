// HONRA — Contrato-convite: o CHECKPOINT do dia do evento (Fatia E blindada).
//
// A fuga E (red-team §E) fechou-se aqui: o `nao_recebi` do profissional JÁ NÃO
// captura de forma síncrona. A cláusula penal só dispara para NO-SHOW, e só
// depois de prova OU de consentimento do cliente. A cobrança move-se SÓ no cron
// (resolver-convites), NUNCA no toque do profissional.
//
// Duas portas, uma função (deploy com --no-verify-jwt; o JWT valida-se à mão,
// como o convite-cancelar):
//
//   • PROFISSIONAL (JWT) — { contrato_id, acao }:
//       'recebi'     → HONRADO. O pagamento correu por fora; o hold (se existir)
//         LIBERTA-SE (0€). Fee do Honra: 0.
//       'nao_recebi' → declaração de NO-SHOW.
//         · COM prova_encontro → 409 "comparência comprovada, não podes declarar
//           falta" (camada 1: co-presença bloqueia a falta).
//         · SEM instrumento (nível i / valor "(a combinar)") → só registo
//           ('incumprido_cliente', 0€ — não há fuga E sem dinheiro).
//         · COM instrumento e SEM prova → 'captura_proposta': abre a JANELA DE
//           CONTESTAÇÃO (camada 2). Grava o prazo, arma o aviso pré-captura ao
//           cliente (magic link + OTP). NADA é capturado aqui.
//
//   • CLIENTE (magic link 'checkpoint_confirmar'/'checkpoint_contestar' + OTP):
//       'prever'    → o que está em jogo + o prazo (para a página mostrar).
//       'codigo'    → envia OTP fresco.
//       'confirmar' → "faltei": consentimento='confirmado' → captura no cron.
//       'contestar' → "compareci/paguei por fora": 'em_disputa', SEM captura,
//         ónus da prova no profissional (camada 3). Liberta o hold (protege o
//         cliente — default da arbitragem).
//
// Guarda dura (decisão 2): a captura-por-SILÊNCIO exige o recibo de entrega do
// aviso (consentimento_aviso_entregue). Bird PARQUEADO → fica false → o cron não
// captura por silêncio, cai em revisão. Aqui compõe-se e regista-se o aviso.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { sha256 } from '../_shared/contrato.ts';
import { enviarOtpBird, enviarSmsTexto } from '../_shared/bird.ts';
import { libertarHold, registarMetrica } from '../_shared/pagamentos.ts';
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
function eur(centimos: number): string {
  return `${(centimos / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} €`;
}
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://honraapp.com';
const MODO_TESTE = modoTeste();

// Parâmetros da janela de contestação (docs/DESENHO §Camada 2).
const JANELA_H = 48; // janela fixa (caminho MIT/débito)
const MARGEM_CAPTURE_H = 12; // decisão final a capture_before − 12h (crédito)
const PISO_EQUIDADE_H = 24; // se resta menos que isto, liberta o hold e vai a MIT

const ESTADOS_ELEGIVEIS = ['assinado', 'caucionado', 'sem_caucao', 'cartao_falhou'];
// Colunas partilhadas por todas as portas.
const COLUNAS =
  'id, estado, nivel_protecao, token_publico, contrato_hash, data_inicio, data_fim, valor_total, ' +
  'pct_caucao, pct_cancelamento, stripe_account_id, stripe_customer_id, payment_method_id, ' +
  'cartao_gravado_em, funding_cartao, hold_decisao, hold_id, hold_capture_before, ' +
  'prova_encontro_em, captura_proposta_em, captura_prazo_em, consentimento_resultado, ' +
  'consentimento_aviso_entregue, profissional_id, cliente_convidado_id';

type Contrato = {
  id: string;
  estado: string;
  nivel_protecao: number | null;
  token_publico: string;
  contrato_hash: string | null;
  data_inicio: string;
  data_fim: string | null;
  valor_total: number | null;
  pct_caucao: number;
  pct_cancelamento: number;
  stripe_account_id: string | null;
  stripe_customer_id: string | null;
  payment_method_id: string | null;
  cartao_gravado_em: string | null;
  funding_cartao: string | null;
  hold_decisao: string | null;
  hold_id: string | null;
  hold_capture_before: string | null;
  prova_encontro_em: string | null;
  captura_proposta_em: string | null;
  captura_prazo_em: string | null;
  consentimento_resultado: string | null;
  consentimento_aviso_entregue: boolean;
  profissional_id: string;
  cliente_convidado_id: string;
};

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

    const acao = String(body.acao ?? '').trim();
    if (acao !== 'recebi' && acao !== 'nao_recebi') return json({ error: 'ação inválida' }, 400);

    const { data: cData } = await admin.from('contratos_convite').select(COLUNAS)
      .eq('id', String(body.contrato_id)).maybeSingle();
    if (!cData) return json({ error: 'convite não encontrado' }, 404);
    const c = cData as unknown as Contrato;
    if (c.profissional_id !== user.id) return json({ error: 'este contrato não é teu' }, 403);
    if (!ESTADOS_ELEGIVEIS.includes(c.estado))
      return json({ error: 'este contrato não está num estado de checkpoint' }, 409);
    if (hoje < c.data_inicio)
      return json({ error: 'o checkpoint abre no dia do evento' }, 409);

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const hash8 = (c.contrato_hash ?? '').slice(0, 8);
    const temHold = c.estado === 'caucionado' && !!c.hold_id;
    const valorHold =
      c.valor_total != null ? Math.round((c.valor_total * c.pct_caucao) / 100) : null;

    // ---------- 'recebi' → HONRADO (hold liberta-se, 0€) ----------
    if (acao === 'recebi') {
      if (temHold) {
        if (!stripeKey || !c.stripe_account_id)
          return json({ error: 'Pagamentos indisponíveis: falta a chave da Stripe.' }, 503);
        const lib = await libertarHold(stripeKey, c.stripe_account_id, c.hold_id!);
        await registarMetrica(admin, {
          evento: 'hold_libertado',
          contrato_id: c.id,
          profissional_id: c.profissional_id,
          valor: valorHold,
          funding: c.funding_cartao,
          pi_id: c.hold_id,
          payload: { motivo: 'honrado', ...(lib.erro ? { erro: lib.erro } : {}) },
        });
      }
      const { error: eUp } = await admin.from('contratos_convite')
        .update({ estado: 'honrado', checkpoint_em: agora, resolvido_em: agora })
        .eq('id', c.id).in('estado', ESTADOS_ELEGIVEIS).is('checkpoint_em', null);
      if (eUp) return json({ error: 'não foi possível fechar o checkpoint. Tenta de novo.' }, 500);

      await admin.from('eventos_convite').insert({
        contrato_id: c.id, tipo: 'checkpoint',
        payload: { resultado: 'honrado', por: 'profissional', hold_libertado: temHold, fee_centimos: 0 },
      });
      await admin.from('eventos_convite').insert({
        contrato_id: c.id, tipo: 'sms_enviado',
        payload: {
          finalidade: 'honrado',
          mensagem: `Tudo certo com o teu contrato (ref ${hash8}). ${temHold ? 'A reserva foi devolvida — 0€ cobrados.' : 'Nada foi cobrado no teu cartão.'}`,
          enviado: false, motivo: MODO_TESTE ? 'modo_teste' : 'todo_bird_parqueado',
        },
      });
      return json({ ok: true, estado: 'honrado', hold_libertado: temHold });
    }

    // ---------- 'nao_recebi' → declaração de NO-SHOW ----------
    // Camada 1: a comparência comprovada BLOQUEIA a falta (a fuga E principal).
    if (c.prova_encontro_em)
      return json({ error: 'Comparência comprovada — não podes declarar falta neste contrato.' }, 409);

    const valor = valorHold; // a cláusula penal do escalão 3 É a % de caução
    const temCartao = (c.nivel_protecao ?? 1) >= 2 && !!c.payment_method_id && !!c.cartao_gravado_em;

    // Sem instrumento ou sem valor → só registo (não há dinheiro, não há fuga E).
    if (!temCartao || valor == null || valor <= 0) {
      const { error: eUp } = await admin.from('contratos_convite')
        .update({ estado: 'incumprido_cliente', quem_falhou: 'cliente', checkpoint_em: agora, resolvido_em: agora })
        .eq('id', c.id).in('estado', ESTADOS_ELEGIVEIS).is('checkpoint_em', null);
      if (eUp) return json({ error: 'não foi possível fechar o checkpoint. Tenta de novo.' }, 500);
      await admin.from('eventos_convite').insert({
        contrato_id: c.id, tipo: 'checkpoint',
        payload: { resultado: 'incumprido_cliente', por: 'profissional', cobranca: 'nenhuma', razao: !temCartao ? 'sem_cartao' : 'valor_nao_definido' },
      });
      return json({ ok: true, estado: 'incumprido_cliente', cobrado: false });
    }

    // Camada 2: COM instrumento e SEM prova → abrir a JANELA DE CONTESTAÇÃO.
    // Nada é capturado aqui — o cron é que move a cobrança, e só com consentimento
    // (confirmar) ou silêncio COM recibo de entrega do aviso.
    const T0 = Date.now();
    let prazoMs = T0 + JANELA_H * 3_600_000; // caminho MIT: janela fixa completa
    let holdLibertado = false;

    if (temHold && stripeKey && c.stripe_account_id) {
      // Tensão dura (crédito): o hold Visa expira ~4d18h. Decisão final a
      // capture_before − 12h; se o que resta for < piso de equidade (24h),
      // cede a certeza-de-fundos: liberta o hold já (0€) e cai para MIT com a
      // janela fixa completa (sem relógio de rede a apertar o contraditório).
      const captureBefore = c.hold_capture_before ? Date.parse(c.hold_capture_before) : null;
      if (captureBefore) {
        const deadlineCredito = captureBefore - MARGEM_CAPTURE_H * 3_600_000;
        const restante = deadlineCredito - T0;
        if (restante < PISO_EQUIDADE_H * 3_600_000) {
          const lib = await libertarHold(stripeKey, c.stripe_account_id, c.hold_id!);
          holdLibertado = lib.ok;
          await registarMetrica(admin, {
            evento: 'hold_libertado', contrato_id: c.id, profissional_id: c.profissional_id,
            valor, funding: c.funding_cartao, pi_id: c.hold_id,
            payload: { motivo: 'janela_curta_contestacao', ...(lib.erro ? { erro: lib.erro } : {}) },
          });
        } else {
          // Mantém o hold; o prazo do silêncio não pode passar do deadline do crédito.
          prazoMs = Math.min(deadlineCredito, T0 + JANELA_H * 3_600_000);
        }
      }
    }
    const captura_prazo_em = new Date(prazoMs).toISOString();

    // Emitir o aviso pré-captura ao cliente: magic link + SMS (Bird PARQUEADO).
    const linkToken = novoToken();
    const { error: eMl } = await admin.from('magic_links_convite').insert({
      token_hash: await sha256(linkToken),
      contrato_id: c.id,
      finalidade: 'checkpoint_confirmar',
      expira_em: captura_prazo_em,
    });
    if (eMl) return json({ error: 'não foi possível abrir a janela de contestação. Tenta de novo.' }, 500);
    const url = `${SITE_URL}/c/${c.token_publico}?ml=${linkToken}&fin=checkpoint`;
    const mensagem =
      `O profissional registou que faltaste ao contrato (ref ${hash8}). Se compareceste ou pagaste, contesta aqui: ${url} — senão, a cláusula penal de ${eur(valor)} será cobrada.`;

    // Recibo de entrega: em teste consideramos entregue (código no corpo); em
    // produção depende do envio real (Bird parqueado → false → sem captura por
    // silêncio, cai em revisão). Isto é a GUARDA DURA da decisão 2.
    let sms_enviado = false;
    if (MODO_TESTE) {
      sms_enviado = true; // simulado — o aviso "chega" em teste
    } else {
      const { data: cli } = await admin.from('clientes_convidados').select('telefone')
        .eq('id', c.cliente_convidado_id).maybeSingle();
      if (cli?.telefone) {
        const envio = await enviarSmsTexto(cli.telefone, mensagem);
        sms_enviado = envio.ok;
      }
    }

    const { error: eUp } = await admin.from('contratos_convite')
      .update({
        estado: 'captura_proposta',
        // A culpa NÃO se decide aqui — só quando a cobrança procede (cron) ou a
        // arbitragem decidir. captura_proposta é uma janela aberta, não um veredicto.
        checkpoint_em: agora,
        captura_proposta_em: agora,
        captura_prazo_em,
        consentimento_resultado: null,
        consentimento_aviso_entregue: sms_enviado,
        ...(holdLibertado ? { hold_decisao: 'hold_falhou' } : {}),
      })
      .eq('id', c.id).in('estado', ESTADOS_ELEGIVEIS).is('checkpoint_em', null);
    if (eUp) return json({ error: 'não foi possível abrir a janela de contestação. Tenta de novo.' }, 500);

    await admin.from('eventos_convite').insert({
      contrato_id: c.id, tipo: 'checkpoint_declarado', ip,
      payload: { por: 'profissional', valor_centimos: valor, hold_libertado: holdLibertado, captura_prazo_em },
    });
    await admin.from('eventos_convite').insert({
      contrato_id: c.id, tipo: 'consentimento_pedido',
      payload: { mensagem, enviado: sms_enviado, aviso_entregue: sms_enviado, motivo: MODO_TESTE ? 'modo_teste' : (sms_enviado ? 'bird' : 'todo_bird_parqueado') },
    });
    await registarMetrica(admin, {
      evento: 'consentimento_pedido', contrato_id: c.id, profissional_id: c.profissional_id,
      valor, funding: c.funding_cartao, payload: { aviso_entregue: sms_enviado },
    });
    await admin.rpc('criar_aviso_convite', {
      p_perfil: c.profissional_id, p_tipo: 'convite_checkpoint', p_contrato: c.id,
      p_titulo: 'Falta declarada — a aguardar o cliente',
      p_corpo: `Registaste a falta no contrato (ref ${hash8}). O cliente foi avisado: se não contestar até ao prazo, a cláusula penal de ${eur(valor)} é cobrada. Nada se cobra até lá.`,
      p_prazo: captura_prazo_em, p_urgente: false,
    });

    return json({
      ok: true, estado: 'captura_proposta', cobrado: false,
      captura_prazo_em, aviso_entregue: sms_enviado, hold_libertado: holdLibertado, valor_centimos: valor,
    });
  }

  // ================= PORTA DO CLIENTE (magic link + OTP) =================
  const token = String(body.token ?? '').trim();
  if (!token) return json({ error: 'falta o link' }, 400);
  const { data: link } = await admin.from('magic_links_convite')
    .select('id, contrato_id, finalidade, expira_em, usado_em')
    .eq('token_hash', await sha256(token)).maybeSingle();
  if (!link || !['checkpoint_confirmar', 'checkpoint_contestar'].includes(link.finalidade))
    return json({ error: 'Link inválido.' }, 401);
  if (link.usado_em) return json({ error: 'Este link já foi usado.' }, 410);

  const { data: cData } = await admin.from('contratos_convite').select(COLUNAS)
    .eq('id', link.contrato_id).maybeSingle();
  if (!cData) return json({ error: 'convite não encontrado' }, 404);
  const c = cData as unknown as Contrato;

  const acao = String(body.acao ?? '').trim();
  const valor = c.valor_total != null ? Math.round((c.valor_total * c.pct_caucao) / 100) : null;
  const hash8 = (c.contrato_hash ?? '').slice(0, 8);

  // --- 'prever': o que está em jogo + o prazo (a página mostra antes do botão). ---
  if (acao === 'prever') {
    return json({
      estado: c.estado,
      aberto: c.estado === 'captura_proposta' && c.consentimento_resultado == null,
      valor_centimos: valor,
      pct: c.pct_caucao,
      captura_prazo_em: c.captura_prazo_em,
    });
  }

  if (c.estado !== 'captura_proposta' || c.consentimento_resultado != null)
    return json({ error: 'Esta janela de contestação já não está aberta.', estado: c.estado }, 409);

  const { data: cliente } = await admin.from('clientes_convidados').select('telefone')
    .eq('id', c.cliente_convidado_id).maybeSingle();
  if (!cliente) return json({ error: 'cliente do convite não encontrado' }, 404);

  // --- 'codigo': gerar e enviar o OTP fresco ao cliente. ---
  if (acao === 'codigo') {
    const { data: atual } = await admin.from('otp_convidado').select('enviado_em')
      .eq('contrato_id', c.id).maybeSingle();
    if (atual && Date.now() - new Date(atual.enviado_em).getTime() < 45_000)
      return json({ error: 'Aguarda uns segundos antes de pedir um novo código.' }, 429);
    const codigo = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
    const { error: erroGuarda } = await admin.from('otp_convidado').upsert({
      contrato_id: c.id, cliente_convidado_id: c.cliente_convidado_id, telefone: cliente.telefone,
      codigo_hash: await sha256(codigo), expira_em: new Date(Date.now() + 10 * 60_000).toISOString(),
      tentativas: 0, enviado_em: agora,
    });
    if (erroGuarda) return json({ error: 'Não foi possível iniciar. Tenta de novo.' }, 500);
    if (!MODO_TESTE) {
      const envio = await enviarOtpBird(cliente.telefone, codigo);
      if (!envio.ok) {
        await admin.from('otp_convidado').delete().eq('contrato_id', c.id);
        return json({ error: 'Não foi possível enviar o código. Tenta de novo.' }, 400);
      }
    }
    await admin.from('eventos_convite').insert({
      contrato_id: c.id, tipo: 'sms_enviado', payload: { finalidade: 'checkpoint_otp', enviado: !MODO_TESTE },
    });
    return json({ enviado: true, ...(MODO_TESTE ? { codigo_teste: codigo } : {}) });
  }

  if (acao !== 'confirmar' && acao !== 'contestar') return json({ error: 'ação inválida' }, 400);

  // Validar OTP do cliente (o mesmo padrão da assinatura/comparência).
  const otp = String(body.otp ?? '').trim();
  if (!/^\d{6}$/.test(otp)) return json({ error: 'Indica o código de 6 dígitos que recebeste por SMS.' }, 400);
  const { data: otpRow } = await admin.from('otp_convidado')
    .select('codigo_hash, expira_em, tentativas').eq('contrato_id', c.id).maybeSingle();
  if (!otpRow) return json({ error: 'Pede primeiro o código por SMS.' }, 400);
  if (new Date(otpRow.expira_em).getTime() < Date.now())
    return json({ error: 'O código por SMS expirou. Pede um novo.' }, 410);
  if ((otpRow.tentativas ?? 0) >= 5) {
    await admin.from('otp_convidado').delete().eq('contrato_id', c.id);
    return json({ error: 'Demasiadas tentativas. Pede um novo código.' }, 429);
  }
  if (otpRow.codigo_hash !== (await sha256(otp))) {
    await admin.from('otp_convidado').update({ tentativas: (otpRow.tentativas ?? 0) + 1 }).eq('contrato_id', c.id);
    return json({ error: 'Código por SMS errado.' }, 401);
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');

  // --- 'confirmar' ("faltei"): consentimento explícito → captura NO CRON. ---
  if (acao === 'confirmar') {
    const { error: eUp } = await admin.from('contratos_convite')
      .update({ consentimento_resultado: 'confirmado', consentimento_aviso_entregue: true, captura_prazo_em: agora })
      .eq('id', c.id).eq('estado', 'captura_proposta').is('consentimento_resultado', null);
    if (eUp) return json({ error: 'não foi possível registar. Tenta de novo.' }, 500);
    await admin.from('otp_convidado').delete().eq('contrato_id', c.id);
    await admin.from('magic_links_convite').update({ usado_em: agora }).eq('id', link.id);
    await admin.from('eventos_convite').insert({
      contrato_id: c.id, tipo: 'checkpoint_confirmado', ip,
      payload: { por: 'cliente', valor_centimos: valor },
    });
    await registarMetrica(admin, {
      evento: 'consentimento_confirmado', contrato_id: c.id, profissional_id: c.profissional_id, valor,
    });
    return json({ ok: true, estado: 'captura_proposta', consentimento: 'confirmado', valor_centimos: valor });
  }

  // --- 'contestar' ("compareci/paguei por fora"): em_disputa, SEM captura. ---
  const texto = typeof body.texto === 'string' ? body.texto.trim().slice(0, 1000) : null;
  // Default da arbitragem: protege o cliente → liberta o hold vivo (0€).
  let holdLibertado = false;
  if (c.estado === 'captura_proposta' && c.hold_id && c.hold_decisao === 'hold_armado'
      && stripeKey && c.stripe_account_id) {
    const lib = await libertarHold(stripeKey, c.stripe_account_id, c.hold_id);
    holdLibertado = lib.ok;
    await registarMetrica(admin, {
      evento: 'hold_libertado', contrato_id: c.id, profissional_id: c.profissional_id,
      valor, funding: c.funding_cartao, pi_id: c.hold_id,
      payload: { motivo: 'contestacao', ...(lib.erro ? { erro: lib.erro } : {}) },
    });
  }
  const { error: eUp } = await admin.from('contratos_convite')
    .update({
      estado: 'em_disputa', consentimento_resultado: 'contestado', contestacao_texto: texto,
      ...(holdLibertado ? { hold_decisao: 'hold_falhou' } : {}),
    })
    .eq('id', c.id).eq('estado', 'captura_proposta').is('consentimento_resultado', null);
  if (eUp) return json({ error: 'não foi possível registar a contestação. Tenta de novo.' }, 500);
  await admin.from('otp_convidado').delete().eq('contrato_id', c.id);
  await admin.from('magic_links_convite').update({ usado_em: agora }).eq('id', link.id);
  await admin.from('eventos_convite').insert({
    contrato_id: c.id, tipo: 'checkpoint_contestado', ip, user_agent: req.headers.get('user-agent'),
    payload: { por: 'cliente', hold_libertado: holdLibertado, ...(texto ? { texto } : {}) },
  });
  await registarMetrica(admin, {
    evento: 'consentimento_contestado', contrato_id: c.id, profissional_id: c.profissional_id, valor,
  });
  await admin.rpc('criar_aviso_convite', {
    p_perfil: c.profissional_id, p_tipo: 'convite_checkpoint', p_contrato: c.id,
    p_titulo: 'O cliente contestou a falta',
    p_corpo: `O cliente contestou a falta no contrato (ref ${hash8}). Nada é cobrado por agora — vai a revisão do Honra, com o ónus da prova do teu lado.`,
    p_prazo: null, p_urgente: false,
  });
  return json({ ok: true, estado: 'em_disputa', consentimento: 'contestado', hold_libertado: holdLibertado });
});
