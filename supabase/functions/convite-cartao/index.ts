// HONRA — Contrato-convite (Fatia C-2): o CARTÃO GRAVADO do nível ii.
// Pública (deploy com --no-verify-jwt): o convidado não tem conta. Protegida por
// magic link (finalidade 'cartao') — o link nasce na assinatura (convite-assinar)
// ou renasce aqui por SMS. O cartão vem SEMPRE depois de assinar (doc §3) e
// SEMPRE depois do mandato aceite (invariante legal — task §3):
//
//   • acao 'link'      { token_publico }             → reemite o magic link por
//     SMS (um link morto nunca é beco — §6.10). Rate-limit 45s.
//   • acao 'iniciar'   { token, mandato_ok, return_url } → carimba o ACEITE DO
//     MANDATO (click-to-accept + mandato_aceite_em + evento) e cria uma Checkout
//     Session `mode=setup` DIRETAMENTE na conta Connect do profissional (header
//     Stripe-Account — direct charges, doc §11.1; funciona igual em contas v1 e
//     v2). Apple Pay/Google Pay à cabeça — o Checkout mostra-os sozinho.
//   • acao 'confirmar' { token, session_id }         → no retorno: retrieve da
//     sessão + do SetupIntent NA conta de P → 'succeeded' → grava
//     setup_intent_id/payment_method_id/cartao_gravado_em e gasta o link.
//
// ESTADO HONESTO: o contrato FICA em 'assinado' — a máquina da 025/026 (doc
// §4.1/4.2) mantém os níveis i e ii em 'assinado' até ao evento; 'caucionado'
// é exclusivo do hold armado (nível iii, Fatia D). O cartão regista-se em
// cartao_gravado_em + setup_intent_id/payment_method_id.
//
// SEM webhook novo: a confirmação é por retrieve server-side (verificada na
// Stripe, nunca confiada ao browser). TODO(Fatia D): integrar os eventos
// `setup_intent.succeeded` das contas ligadas no endpoint Connect próprio,
// para apanhar retornos que nunca chegam (browser fechado no return_url).

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { sha256 } from '../_shared/contrato.ts';
import { enviarSmsTexto } from '../_shared/bird.ts';
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
// Só http(s) — a Stripe exige-o para success_url/cancel_url — e evita
// open-redirect (mesmo padrão de autorizar-caucao / connect-onboarding).
function returnValido(u: unknown): string | null {
  return typeof u === 'string' && /^https?:\/\//.test(u) ? u : null;
}
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://honraapp.com';
const MODO_TESTE = modoTeste();
const STRIPE = 'https://api.stripe.com/v1';

// Chamada v1 à Stripe NA conta Connect de P (direct objects). Nunca imprime a chave.
async function stripeNaConta(
  key: string,
  conta: string,
  metodo: 'POST' | 'GET',
  caminho: string,
  params?: URLSearchParams,
): Promise<{ ok: boolean; corpo: Record<string, unknown> }> {
  const url = metodo === 'GET' && params ? `${STRIPE}${caminho}?${params}` : `${STRIPE}${caminho}`;
  const res = await fetch(url, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${key}`,
      'Stripe-Account': conta, // ← o objeto vive na conta de P, não na do Honra
      ...(metodo === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: metodo === 'POST' ? params : undefined,
  });
  const corpo = await res.json().catch(() => ({}));
  return { ok: res.ok, corpo };
}

// Resolve e valida o magic link 'cartao' (vivo, não gasto). Devolve o link ou
// uma resposta de erro pronta (401 inválido / 410 gasto ou expirado).
async function resolverLink(admin: ReturnType<typeof createClient>, token: string) {
  const { data: link } = await admin
    .from('magic_links_convite')
    .select('id, contrato_id, finalidade, expira_em, usado_em')
    .eq('token_hash', await sha256(token))
    .maybeSingle();
  if (!link || link.finalidade !== 'cartao')
    return { erro: json({ error: 'Link inválido.', pode_renovar: true }, 401) };
  if (link.usado_em)
    return { erro: json({ error: 'Este link já foi usado.', pode_renovar: true }, 410) };
  if (new Date(link.expira_em).getTime() < Date.now())
    return { erro: json({ error: 'Este link expirou. Pede um novo.', pode_renovar: true }, 410) };
  return { link };
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
  const acao = String(body.acao ?? '').trim();

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ============ 'link' — reemitir o magic link do cartão por SMS ============
  if (acao === 'link') {
    const tokenPub = String(body.token_publico ?? '').trim();
    if (!tokenPub) return json({ error: 'falta o identificador do contrato' }, 400);

    const { data: c } = await admin
      .from('contratos_convite')
      .select('id, estado, nivel_protecao, cartao_gravado_em, contrato_hash, cliente_convidado_id')
      .eq('token_publico', tokenPub)
      .maybeSingle();
    if (!c) return json({ error: 'convite não encontrado' }, 404);
    if (c.estado !== 'assinado' || (c.nivel_protecao ?? 1) < 2)
      return json({ error: 'este contrato não está à espera de cartão' }, 409);
    if (c.cartao_gravado_em)
      return json({ error: 'o cartão deste contrato já está guardado' }, 409);

    // Rate-limit 45s (padrão do renovar da convite-otp).
    const ha45s = new Date(Date.now() - 45_000).toISOString();
    const { count } = await admin
      .from('magic_links_convite')
      .select('id', { count: 'exact', head: true })
      .eq('contrato_id', c.id)
      .eq('finalidade', 'cartao')
      .gte('criado_em', ha45s);
    if ((count ?? 0) > 0)
      return json({ error: 'Acabámos de enviar um link. Aguarda uns segundos.' }, 429);

    const linkToken = novoToken();
    const { error } = await admin.from('magic_links_convite').insert({
      token_hash: await sha256(linkToken),
      contrato_id: c.id,
      finalidade: 'cartao',
      expira_em: new Date(Date.now() + 72 * 3_600_000).toISOString(),
    });
    if (error) return json({ error: 'não foi possível gerar um link novo' }, 500);

    const url = `${SITE_URL}/c/${tokenPub}?ml=${linkToken}&fin=cartao`;
    const hash8 = (c.contrato_hash ?? '').slice(0, 8);
    const mensagem = `Falta a proteção do teu contrato (ref ${hash8}). Guarda o cartão em 1 minuto: ${url}`;

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
        finalidade: 'cartao',
        mensagem,
        enviado: sms_enviado,
        ...(sms_motivo ? { falha: sms_motivo } : {}),
      },
    });
    return json({ renovado: true, sms_enviado, ...(MODO_TESTE ? { magic_link: url } : {}) });
  }

  // As restantes ações exigem a chave da Stripe — honesto, não finge.
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return json({ error: 'Pagamentos indisponíveis: falta a chave da Stripe.' }, 503);

  const token = String(body.token ?? '').trim();
  if (!token) return json({ error: 'falta o link' }, 400);
  const r = await resolverLink(admin, token);
  if (r.erro) return r.erro;
  const link = r.link!;

  const { data: c } = await admin
    .from('contratos_convite')
    .select(
      'id, estado, nivel_protecao, token_publico, contrato_hash, servico, data_inicio, ' +
        'mandato_texto, mandato_hash, mandato_aceite_em, stripe_account_id, ' +
        'stripe_customer_id, setup_intent_id, cartao_gravado_em, ' +
        'profissional_id, cliente_convidado_id',
    )
    .eq('id', link.contrato_id)
    .maybeSingle();
  if (!c) return json({ error: 'convite não encontrado' }, 404);
  if (c.estado !== 'assinado' || (c.nivel_protecao ?? 1) < 2)
    return json({ error: 'este contrato não está à espera de cartão' }, 409);
  if (!c.stripe_account_id || !c.mandato_texto || !c.mandato_hash)
    // Sem conta de P congelada ou sem mandato gerado não há cartão — estado
    // impossível num aceite nível 2 (convite-decidir grava ambos); não se finge.
    return json({ error: 'este contrato não tem proteção por cartão configurada' }, 409);

  const agora = new Date().toISOString();
  const ip =
    (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    null;
  const userAgent = req.headers.get('user-agent');
  const hash8 = (c.contrato_hash ?? '').slice(0, 8);

  // ============ 'iniciar' — mandato aceite → Checkout de setup na conta de P ============
  if (acao === 'iniciar') {
    if (c.cartao_gravado_em)
      return json({ error: 'o cartão deste contrato já está guardado' }, 409);

    // INVARIANTE (task §3): o mandato é lido e aceite ANTES do cartão.
    if (body.mandato_ok !== true)
      return json({ error: 'Lê e aceita a autorização de cobrança antes de guardares o cartão.' }, 400);

    // Carimbo do aceite (uma vez; o guarda torna-o imutável) + evidência.
    if (!c.mandato_aceite_em) {
      const { error: erroAceite } = await admin
        .from('contratos_convite')
        .update({ mandato_aceite_em: agora })
        .eq('id', c.id)
        .is('mandato_aceite_em', null);
      if (erroAceite)
        return json({ error: 'não foi possível registar o aceite. Tenta de novo.' }, 500);
      await admin.from('eventos_convite').insert({
        contrato_id: c.id,
        tipo: 'mandato',
        ip,
        user_agent: userAgent,
        payload: {
          mandato_hash: c.mandato_hash,
          aceite_em: agora,
          beneficiario: 'profissional', // EBA Q&A 2019_4794 — P nomeado no texto
          metodo: 'click_to_accept',
        },
      });
    }

    // Customer NA conta de P (o payment_method fica anexado a ele — é isso que
    // permite a cobrança MIT depois). Um por contrato; reutiliza se já existe.
    let customerId = c.stripe_customer_id as string | null;
    if (!customerId) {
      const { data: cli } = await admin
        .from('clientes_convidados')
        .select('nome, telefone')
        .eq('id', c.cliente_convidado_id)
        .maybeSingle();
      const pc = new URLSearchParams();
      if (cli?.nome) pc.set('name', cli.nome);
      if (cli?.telefone) pc.set('phone', cli.telefone);
      pc.set('metadata[contrato_id]', c.id);
      const rc = await stripeNaConta(stripeKey, c.stripe_account_id, 'POST', '/customers', pc);
      if (!rc.ok) {
        const msg = (rc.corpo as { error?: { message?: string } })?.error?.message;
        return json({ error: msg ?? 'erro ao preparar o cartão na Stripe' }, 502);
      }
      customerId = String(rc.corpo.id);
      await admin
        .from('contratos_convite')
        .update({ stripe_customer_id: customerId })
        .eq('id', c.id);
    }

    // Checkout Session mode=setup na conta de P. O return_url validado http(s);
    // levamos o magic link e o marcador de volta para a página confirmar.
    const returnBase = returnValido(body.return_url) ?? `${SITE_URL}/c/${c.token_publico}`;
    const sep = returnBase.includes('?') ? '&' : '?';
    const successUrl = `${returnBase}${sep}ml=${token}&fin=cartao&cartao=confirmar&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${returnBase}${sep}ml=${token}&fin=cartao&cartao=cancelado`;

    const ps = new URLSearchParams();
    ps.set('mode', 'setup');
    ps.set('customer', customerId);
    ps.set('payment_method_types[0]', 'card'); // Apple/Google Pay entram sozinhos no Checkout
    ps.set('success_url', successUrl);
    ps.set('cancel_url', cancelUrl);
    ps.set('metadata[contrato_id]', c.id);
    ps.set('setup_intent_data[metadata][contrato_id]', c.id);
    ps.set('setup_intent_data[metadata][mandato_hash]', String(c.mandato_hash));
    ps.set(
      'setup_intent_data[description]',
      `Honra — proteção do contrato (ref ${hash8}). Nada é cobrado fora dos termos assinados.`,
    );
    const rs = await stripeNaConta(
      stripeKey,
      c.stripe_account_id,
      'POST',
      '/checkout/sessions',
      ps,
    );
    if (!rs.ok) {
      const msg = (rs.corpo as { error?: { message?: string } })?.error?.message;
      return json({ error: msg ?? 'erro ao abrir o passo do cartão' }, 502);
    }
    await admin.from('eventos_convite').insert({
      contrato_id: c.id,
      tipo: 'cartao_iniciado',
      ip,
      user_agent: userAgent,
      payload: { checkout_session: rs.corpo.id, stripe_account: c.stripe_account_id },
    });
    // O link NÃO se gasta aqui — gasta-se no 'confirmar' (o ato). Assim o
    // convidado pode repetir se abandonar o Checkout.
    return json({ url: rs.corpo.url, session_id: rs.corpo.id });
  }

  // ============ 'confirmar' — retrieve na conta de P → gravar o cartão ============
  if (acao === 'confirmar') {
    // Idempotente: se já está gravado, não se refaz (nem se rebenta).
    if (c.cartao_gravado_em)
      return json({ ok: true, ja_estava: true, estado: c.estado, cartao_gravado_em: c.cartao_gravado_em });

    const sessionId = String(body.session_id ?? '').trim();
    if (!/^cs_/.test(sessionId)) return json({ error: 'falta a sessão do cartão' }, 400);

    // 1) A sessão É deste contrato? (defesa contra troca de session_id)
    const rs = await stripeNaConta(
      stripeKey,
      c.stripe_account_id,
      'GET',
      `/checkout/sessions/${sessionId}`,
    );
    if (!rs.ok) return json({ error: 'não encontrámos a sessão do cartão' }, 404);
    const sess = rs.corpo as {
      metadata?: Record<string, string>;
      status?: string;
      setup_intent?: string | null;
      customer?: string | null;
    };
    if (sess.metadata?.contrato_id !== c.id)
      return json({ error: 'esta sessão não pertence a este contrato' }, 403);
    if (sess.status !== 'complete' || !sess.setup_intent)
      return json({ error: 'O cartão ainda não ficou guardado. Tenta de novo.', incompleto: true }, 409);

    // 2) O SetupIntent está mesmo 'succeeded'? (verdade da Stripe, não do browser)
    const pe = new URLSearchParams();
    pe.set('expand[]', 'payment_method');
    const rsi = await stripeNaConta(
      stripeKey,
      c.stripe_account_id,
      'GET',
      `/setup_intents/${sess.setup_intent}`,
      pe,
    );
    if (!rsi.ok) return json({ error: 'não foi possível confirmar o cartão' }, 502);
    const si = rsi.corpo as {
      id: string;
      status?: string;
      payment_method?: { id?: string; card?: { brand?: string; last4?: string } } | string | null;
    };
    if (si.status !== 'succeeded')
      return json({ error: 'O cartão ainda não ficou guardado. Tenta de novo.', incompleto: true }, 409);
    const pm = typeof si.payment_method === 'string' ? { id: si.payment_method } : si.payment_method;
    if (!pm?.id) return json({ error: 'não foi possível confirmar o cartão' }, 502);

    // 3) Gravar — o estado FICA 'assinado' (a máquina do desenho: 'caucionado'
    //    é só do hold, Fatia D). O cartão vive nas colunas próprias da 025.
    const { error: erroUp } = await admin
      .from('contratos_convite')
      .update({
        setup_intent_id: si.id,
        payment_method_id: pm.id,
        ...(sess.customer ? { stripe_customer_id: sess.customer } : {}),
        cartao_gravado_em: agora,
      })
      .eq('id', c.id)
      .eq('estado', 'assinado')
      .is('cartao_gravado_em', null);
    if (erroUp) return json({ error: 'não foi possível gravar o cartão. Tenta de novo.' }, 500);

    // 4) Evidência + gastar o link (o ato consumou-se) + avisar P.
    await admin.from('eventos_convite').insert({
      contrato_id: c.id,
      tipo: 'cartao_gravado',
      ip,
      user_agent: userAgent,
      payload: {
        setup_intent_id: si.id,
        payment_method_id: pm.id,
        stripe_account: c.stripe_account_id,
        ...(pm.card ? { brand: pm.card.brand, last4: pm.card.last4 } : {}),
        mandato_hash: c.mandato_hash,
        mandato_aceite_em: c.mandato_aceite_em ?? agora,
      },
    });
    await admin.from('magic_links_convite').update({ usado_em: agora }).eq('id', link.id);

    const { data: cli } = await admin
      .from('clientes_convidados')
      .select('nome')
      .eq('id', c.cliente_convidado_id)
      .maybeSingle();
    await admin.rpc('criar_aviso_convite', {
      p_perfil: c.profissional_id,
      p_tipo: 'convite_cartao',
      p_contrato: c.id,
      p_titulo: 'Proteção ativa ✓',
      p_corpo: `${cli?.nome ?? 'O teu cliente'} guardou o cartão. Este contrato tem agora proteção contrato+cartão.`,
      p_prazo: null,
      p_urgente: false,
    });

    return json({
      ok: true,
      estado: 'assinado',
      cartao_gravado_em: agora,
      ...(pm.card ? { brand: pm.card.brand, last4: pm.card.last4 } : {}),
    });
  }

  return json({ error: 'ação inválida' }, 400);
});
