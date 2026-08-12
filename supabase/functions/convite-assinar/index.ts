// HONRA — Contrato-convite (Fatia B): ASSINAR (validar OTP + selar a assinatura).
// Pública (deploy com --no-verify-jwt): o convidado não tem conta. Protegida por
// magic link (finalidade 'assinar') + OTP fresco — o ato é atómico: validar o
// código E assinar de uma vez.
//
// Guardas legais (invariantes §4.3) — a assinatura é RECUSADA enquanto:
//   • aviso_resolucao_aceite_em for nulo (art. 4.º/1/p DL 24/2014), OU
//   • politica_cancel_aceite_em for nulo (regra Visa "properly disclosed").
// Estes carimbos são postos por convite-otp quando o convidado aceita os avisos;
// aqui só se CONFIRMA (defesa em profundidade — nunca assinar sem os dois).
//
// Nível i: o contrato é o compromisso — termina aqui. Nível ii (Fatia C-2): a
// assinatura sela na mesma ('assinado'), e a resposta traz um magic link novo
// (finalidade 'cartao') para o degrau seguinte da escada — o cartão vem SEMPRE
// depois da assinatura, nunca antes (doc §3). O SetupIntent em si vive na
// função convite-cartao (mandato aceite primeiro; Checkout na conta de P).
// Grava evidência append-only (IP + user-agent + timestamp + hash) para o audit
// trail (a defesa de chargeback e a linha do tempo). Gasta o magic link.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { sha256 } from '../_shared/contrato.ts';

function novoToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

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

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    return json({ error: 'corpo inválido' }, 400);
  }

  const token = String(body.token ?? '').trim(); // magic link
  const codigo = typeof body.codigo === 'string' ? body.codigo.trim() : '';
  if (!token) return json({ error: 'falta o link' }, 400);
  if (!/^\d{6}$/.test(codigo)) return json({ error: 'Indica o código de 6 dígitos.' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 1) Magic link válido, não gasto, finalidade 'assinar'.
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

  // 2) Contrato à espera de assinatura + carimbos legais presentes.
  const { data: c } = await admin
    .from('contratos_convite')
    .select(
      'id, estado, contrato_hash, aviso_resolucao_aceite_em, politica_cancel_aceite_em, ' +
        'nivel_protecao, profissional_id, cliente_convidado_id',
    )
    .eq('id', link.contrato_id)
    .maybeSingle();
  if (!c) return json({ error: 'convite não encontrado' }, 404);
  if (c.estado !== 'aguarda_assinatura')
    return json({ error: 'este contrato não está à espera de assinatura' }, 409);

  // INVARIANTE — recusa se os avisos legais não foram aceites (§4.3).
  if (!c.aviso_resolucao_aceite_em || !c.politica_cancel_aceite_em)
    return json(
      { error: 'Aceita o aviso e a política de cancelamento antes de assinar.', falta_aceites: true },
      400,
    );

  // 3) OTP: existe, não expirou, tentativas dentro do limite, código certo.
  const { data: otp } = await admin
    .from('otp_convidado')
    .select('codigo_hash, expira_em, tentativas')
    .eq('contrato_id', c.id)
    .maybeSingle();
  if (!otp) return json({ error: 'Pede um código primeiro.' }, 400);
  if (new Date(otp.expira_em).getTime() < Date.now()) {
    await admin.from('otp_convidado').delete().eq('contrato_id', c.id);
    return json({ error: 'O código expirou. Pede um novo.' }, 400);
  }
  if (otp.tentativas >= 5) {
    await admin.from('otp_convidado').delete().eq('contrato_id', c.id);
    return json({ error: 'Demasiadas tentativas. Pede um novo código.' }, 429);
  }
  await admin.from('otp_convidado').update({ tentativas: otp.tentativas + 1 }).eq('contrato_id', c.id);
  const acerta = (await sha256(codigo)) === otp.codigo_hash;
  if (!acerta) return json({ error: 'Código inválido. Tenta de novo.' }, 400);

  // 4) SELAR a assinatura. O guarda_ciclo_convite torna assinado_em imutável a
  //    partir daqui (append-only da prova).
  const agora = new Date().toISOString();
  const ip =
    (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    null;
  const userAgent = req.headers.get('user-agent');

  const { error: erroUp } = await admin
    .from('contratos_convite')
    .update({ estado: 'assinado', assinado_em: agora })
    .eq('id', c.id)
    .eq('estado', 'aguarda_assinatura');
  if (erroUp) return json({ error: 'não foi possível assinar. Tenta de novo.' }, 500);

  // 5) Evidência append-only — o momento probatório central (doc §4.4, §6.5).
  await admin.from('eventos_convite').insert({
    contrato_id: c.id,
    tipo: 'assinatura',
    ip,
    user_agent: userAgent,
    payload: {
      assinado_em: agora,
      contrato_hash: c.contrato_hash,
      metodo: 'otp_sms',
      aviso_resolucao_aceite_em: c.aviso_resolucao_aceite_em,
      politica_cancel_aceite_em: c.politica_cancel_aceite_em,
    },
  });

  // 6) Gastar o magic link (uso único ao AGIR) e limpar o OTP usado.
  await admin.from('magic_links_convite').update({ usado_em: agora }).eq('id', link.id);
  await admin.from('otp_convidado').delete().eq('contrato_id', c.id);

  // 7) Avisar P — o outro lado do contrato acabou de o assinar (o convidado não
  //    tem sino; P tem). Gracioso: se falhar, a assinatura não falha.
  const nivel2 = (c.nivel_protecao ?? 1) >= 2;
  const { data: cli } = await admin
    .from('clientes_convidados')
    .select('nome')
    .eq('id', c.cliente_convidado_id)
    .maybeSingle();
  await admin.rpc('criar_aviso_convite', {
    p_perfil: c.profissional_id,
    p_tipo: 'convite_assinado',
    p_contrato: c.id,
    p_titulo: 'Contrato assinado ✓',
    p_corpo:
      `O contrato com ${cli?.nome ?? 'o teu cliente'} foi assinado.` +
      (nivel2 ? ' Falta o cartão de proteção — avisamos-te quando estiver guardado.' : ''),
    p_prazo: null,
    p_urgente: false,
  });

  // 8) Nível ii (C-2): o degrau seguinte é o cartão — emite-se JÁ um magic link
  //    'cartao' (72h) e devolve-se o token à página (o convidado está presente e
  //    acabou de se autenticar por OTP; se sair, a convite-cartao reenvia por
  //    SMS). O SetupIntent nasce na convite-cartao, DEPOIS do aceite do mandato.
  let mlCartao: string | null = null;
  if (nivel2) {
    mlCartao = novoToken();
    const { error: erroLink } = await admin.from('magic_links_convite').insert({
      token_hash: await sha256(mlCartao),
      contrato_id: c.id,
      finalidade: 'cartao',
      expira_em: new Date(Date.now() + 72 * 3_600_000).toISOString(),
    });
    if (erroLink) mlCartao = null; // sem drama: a página oferece "enviar por SMS"
  }

  return json({
    ok: true,
    estado: 'assinado',
    assinado_em: agora,
    contrato_hash: c.contrato_hash,
    nivel_protecao: c.nivel_protecao ?? 1,
    // Nível ii: a página continua direto para o passo do cartão com este token.
    ...(mlCartao ? { ml_cartao: mlCartao } : {}),
  });
});
