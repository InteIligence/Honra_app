// HONRA — Contrato-convite (Fatia B): OTP do CONVIDADO + renascer do magic link.
// Pública (deploy com --no-verify-jwt): o convidado não tem conta. Protegida por
// token (magic link) + rate-limit — "o link identifica; só o OTP autentica".
//
// Dois modos, uma porta:
//   1) RENOVAR  { token_publico, renovar:true } — um link morto/gasto NUNCA é
//      beco (doc §6.10): gera-se um magic link 'assinar' novo (o antigo pode ter
//      expirado) e regista-se a mensagem-de-link. Rate-limit 45s por contrato.
//   2) PEDIR CÓDIGO { token, aviso_ok, politica_ok } — o convidado, DEPOIS de
//      aceitar explicitamente os dois avisos legais (não-resolução art. 4.º/1/p +
//      política de cancelamento, regra Visa), recebe o OTP por SMS. Carimbamos os
//      dois aceites ANTES de enviar o código (§4.3). Rate-limit 45s.
//
// A validação do OTP + a assinatura vivem em convite-assinar (o ato é atómico).

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { sha256 } from '../_shared/contrato.ts';
import { enviarOtpBird, enviarSmsTexto } from '../_shared/bird.ts';
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
// Em teste (SMS custam) devolvemos código/link no corpo. NUNCA em produção.
const MODO_TESTE = modoTeste();

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

  // ============ MODO 1 — RENASCER o magic link ============
  if (body.renovar === true) {
    const tokenPub = String(body.token_publico ?? '').trim();
    if (!tokenPub) return json({ error: 'falta o identificador do contrato' }, 400);

    const { data: c } = await admin
      .from('contratos_convite')
      .select('id, estado, contrato_hash, cliente_convidado_id')
      .eq('token_publico', tokenPub)
      .maybeSingle();
    if (!c) return json({ error: 'convite não encontrado' }, 404);
    if (c.estado !== 'aguarda_assinatura')
      return json({ error: 'este contrato não está à espera de assinatura' }, 409);

    // Rate-limit 45s: quantos links 'assinar' nasceram há pouco para este contrato.
    const ha45s = new Date(Date.now() - 45_000).toISOString();
    const { count } = await admin
      .from('magic_links_convite')
      .select('id', { count: 'exact', head: true })
      .eq('contrato_id', c.id)
      .eq('finalidade', 'assinar')
      .gte('criado_em', ha45s);
    if ((count ?? 0) > 0)
      return json({ error: 'Acabámos de enviar um link. Aguarda uns segundos.' }, 429);

    const linkToken = novoToken();
    const { error } = await admin.from('magic_links_convite').insert({
      token_hash: await sha256(linkToken),
      contrato_id: c.id,
      finalidade: 'assinar',
      expira_em: new Date(Date.now() + 72 * 3_600_000).toISOString(),
    });
    if (error) return json({ error: 'não foi possível gerar um link novo' }, 500);

    const link = `${SITE_URL}/c/${tokenPub}?ml=${linkToken}`;
    const hash8 = (c.contrato_hash ?? '').slice(0, 8);
    const mensagem = `O teu contrato (ref ${hash8}) espera por ti: ${link}`;

    // Enviar o link renovado por SMS de texto livre (sem isto, em produção o
    // convidado renovava mas NUNCA recebia o novo link — só volta no corpo em
    // teste). Graciosa: se falhar, não rebenta. Em teste não gasta SMS.
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
      payload: {
        finalidade: 'assinar',
        motivo: 'renovacao',
        mensagem,
        enviado: sms_enviado,
        ...(sms_motivo ? { falha: sms_motivo } : {}),
      },
    });
    return json({ renovado: true, sms_enviado, ...(MODO_TESTE ? { magic_link: link } : {}) });
  }

  // ============ MODO 2 — PEDIR o código (OTP) ============
  const token = String(body.token ?? '').trim();
  const aviso_ok = body.aviso_ok === true;
  const politica_ok = body.politica_ok === true;
  if (!token) return json({ error: 'falta o link' }, 400);
  if (!aviso_ok || !politica_ok)
    return json(
      { error: 'Tens de aceitar o aviso e a política de cancelamento antes de assinar.' },
      400,
    );

  // Resolver o magic link (por hash) — válido, não gasto, finalidade 'assinar'.
  const { data: link } = await admin
    .from('magic_links_convite')
    .select('id, contrato_id, finalidade, expira_em, usado_em')
    .eq('token_hash', await sha256(token))
    .maybeSingle();
  if (!link || link.finalidade !== 'assinar')
    return json({ error: 'Link inválido.', pode_renovar: true }, 401);
  if (link.usado_em)
    return json({ error: 'Este link já foi usado.', pode_renovar: true }, 410);
  if (new Date(link.expira_em).getTime() < Date.now())
    return json({ error: 'Este link expirou. Pede um novo.', pode_renovar: true }, 410);

  const { data: c } = await admin
    .from('contratos_convite')
    .select('id, estado, cliente_convidado_id, contrato_hash, aviso_resolucao_aceite_em, politica_cancel_aceite_em')
    .eq('id', link.contrato_id)
    .maybeSingle();
  if (!c) return json({ error: 'convite não encontrado' }, 404);
  if (c.estado !== 'aguarda_assinatura')
    return json({ error: 'este contrato não está à espera de assinatura' }, 409);

  const { data: cliente } = await admin
    .from('clientes_convidados')
    .select('telefone')
    .eq('id', c.cliente_convidado_id)
    .maybeSingle();
  if (!cliente) return json({ error: 'cliente do convite não encontrado' }, 404);

  const agora = new Date().toISOString();
  const ip =
    (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    null;

  // Carimbar os dois aceites legais ANTES do código (invariante §4.3). Só se
  // ainda não estavam carimbados (idempotente).
  const aceites: Record<string, string> = {};
  if (!c.aviso_resolucao_aceite_em) aceites.aviso_resolucao_aceite_em = agora;
  if (!c.politica_cancel_aceite_em) aceites.politica_cancel_aceite_em = agora;
  if (Object.keys(aceites).length > 0) {
    await admin.from('contratos_convite').update(aceites).eq('id', c.id);
    await admin.from('eventos_convite').insert({
      contrato_id: c.id,
      tipo: 'aceites_legais',
      ip,
      user_agent: req.headers.get('user-agent'),
      payload: {
        aviso_resolucao: 'art. 4.º/1/p DL 24/2014',
        politica_cancelamento: 'properly disclosed (Visa)',
        aceite_em: agora,
      },
    });
  }

  // Rate-limit 45s do OTP (padrão da verificar-contacto).
  const { data: atual } = await admin
    .from('otp_convidado')
    .select('enviado_em')
    .eq('contrato_id', c.id)
    .maybeSingle();
  if (atual && Date.now() - new Date(atual.enviado_em).getTime() < 45_000)
    return json({ error: 'Aguarda uns segundos antes de pedir um novo código.' }, 429);

  // TETO DIÁRIO (082). Aqui é MAIS importante do que no verificar-contacto: o
  // número de destino é de alguém que NÃO tem conta no Honra. Sem teto por
  // destino, a casa podia ser o instrumento de quem quer martelar o telemóvel
  // de um estranho — e essa pessoa nem teria onde se queixar, porque para ela
  // o remetente somos nós.
  // SÓ por contrato: o teto por NÚMERO vive no canal (`_shared/bird.ts`), por
  // onde este envio passa. Contá-lo aqui também gastaria o teto a dobrar.
  const { data: podeEnviar } = await admin.rpc('registar_sms', {
    p_chave: `c:${c.id}`,
    p_teto: 10,
  });
  if (podeEnviar === false)
    return json({ error: 'Já foram pedidos demasiados códigos para este contrato hoje.' }, 429);

  // Gerar o código, guardar (hash + validade + tentativas) e enviar via Bird.
  const codigo = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  const { error: erroGuarda } = await admin.from('otp_convidado').upsert({
    contrato_id: c.id,
    cliente_convidado_id: c.cliente_convidado_id,
    telefone: cliente.telefone,
    codigo_hash: await sha256(codigo),
    expira_em: new Date(Date.now() + 10 * 60_000).toISOString(),
    tentativas: 0,
    enviado_em: agora,
  });
  if (erroGuarda) return json({ error: 'Não foi possível iniciar a assinatura. Tenta de novo.' }, 500);

  const hash8 = (c.contrato_hash ?? '').slice(0, 8);
  // A mensagem IDEAL refere o hash + resumo (doc); o template Bird provado só
  // injeta o `code`, por isso a mensagem rica fica no audit trail e o SMS real
  // leva o código. TODO: registar template Bird com params hash8/resumo.
  const mensagem = `Honra: ${codigo} para assinar o contrato (ref ${hash8}). Válido 10 min.`;
  await admin.from('eventos_convite').insert({
    contrato_id: c.id,
    tipo: 'sms_enviado',
    ip,
    payload: { finalidade: 'otp', mensagem_modelo: mensagem, hash8 },
  });

  // Em modo de teste NÃO se gasta SMS (o código volta no corpo). Em produção,
  // sem SMS não há autenticação — fronteira honesta (doc §6.8).
  if (!MODO_TESTE) {
    const envio = await enviarOtpBird(cliente.telefone, codigo);
    if (!envio.ok) {
      await admin.from('otp_convidado').delete().eq('contrato_id', c.id);
      return json({ error: 'Não foi possível enviar o código. Confirma o número e tenta de novo.' }, 400);
    }
  }

  return json({
    enviado: true,
    ...(MODO_TESTE ? { codigo_teste: codigo, sms_saltado: true } : {}),
  });
});
