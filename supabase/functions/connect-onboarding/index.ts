// HONRA — Contrato-convite (Fatia C-1): onboarding Stripe Connect do PROFISSIONAL.
//
// PORQUÊ: a lei obriga a que as penalizações/holds do contrato-convite caiam na
// conta Stripe do PROFISSIONAL (direct charges na sua conta Connect +
// application fee do Honra), NUNCA na do Honra — senão o Honra entraria na posse
// de fundos de terceiros = atividade licenciável pelo Banco de Portugal
// (art. 5.º/b DL 91/2018; considerando 11 PSD2). Ver DESENHO §11.1 / JURIDICO §6.
//
// ACCOUNTS V2 (16/07/2026): a Stripe descontinuou o v1 para integrações novas
// ("Create connected accounts with POST /v2/core/accounts instead") — a nossa
// conta-plataforma é nova e só aceitava v1 por um interruptor de compatibilidade.
// Contas NOVAS nascem agora via /v2/core/accounts com o equivalente exato do
// Express de antes (provado ao vivo em teste a 16/07/2026):
//   • dashboard: 'express'
//   • defaults.responsibilities: fees_collector + losses_collector = 'application'
//     (requirements_collector fica 'stripe' por omissão — como no Express v1)
//   • configuration.merchant.capabilities.card_payments (direct charges;
//     a capability stripe_balance.payouts acende com ela automaticamente)
// O link de onboarding hosted é o Account Links V2 (/v2/core/account_links,
// JSON + use_case) — o v1 (/v1/account_links) fica só para as contas v1 já
// existentes (acct_1Ttw2c…, provada), distinguidas pela coluna `api_versao`
// (migração 038). NADA muda a jusante: direct charges/SetupIntents continuam a
// usar o header Stripe-Account com o mesmo acct_… (os endpoints v1 aceitam
// contas v2 — docs.stripe.com/connect/accounts-v2).
//
// O QUE FAZ (só o alicerce — sem cartão/hold, que são C-2/C-3):
//   1) Se P ainda não tem conta Connect → cria uma via Accounts v2 (país PT)
//      e grava-a em `contas_connect` com api_versao='v2'.
//   2) Recolhe/associa o NIF de P se fornecido (DAC7 — Lei 36/2023).
//   3) Devolve um Account Link (URL de onboarding, v2 ou v1 conforme a conta)
//      para P completar os dados na Stripe. Idempotente: reusa a conta
//      existente e emite só um link novo.
//
// HONESTIDADE: se STRIPE_SECRET_KEY faltar → 503. Se o Connect NÃO estiver
// ativado na conta-plataforma da Stripe, a Stripe recusa a criação da conta e
// devolvemos esse erro claro (503) — NÃO fingimos onboarding.
//
// Exige JWT (deploy SEM --no-verify-jwt). A escrita em contas_connect é toda do
// servidor (service_role) — o guarda_contas_connect reserva-a ao servidor.

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

// O cliente diz para onde a Stripe deve voltar (a app, não uma página morta).
// Só http(s) — a Stripe exige-o para return_url/refresh_url — e evita open-redirect.
// (Mesmo padrão de autorizar-caucao / criar-verificacao.)
function returnValido(u: unknown): string | null {
  return typeof u === 'string' && /^https?:\/\//.test(u) ? u : null;
}

// NIF português: 9 dígitos. Guardamos só o que faz sentido; validação forte fica
// para C-2/faturação. Aqui aceita-se 9 dígitos (limpa espaços).
function nifLimpo(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  const so = u.replace(/\D/g, '');
  return /^\d{9}$/.test(so) ? so : null;
}

// Accounts v2 — versão da API provada ao vivo (16/07/2026). É a release que
// tornou o Accounts v2 disponível para plataformas Connect
// (docs.stripe.com/changelog/clover/2025-12-15/accounts-v2).
const STRIPE_V2_VERSION = '2025-12-15.clover';
const STRIPE_V2_ACCOUNTS = 'https://api.stripe.com/v2/core/accounts';
const STRIPE_V2_ACCOUNT_LINKS = 'https://api.stripe.com/v2/core/account_links';
const STRIPE_V1_ACCOUNT_LINKS = 'https://api.stripe.com/v1/account_links';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    // Dependência de configuração — honesto, não finge.
    return json({ error: 'Pagamentos indisponíveis: falta a chave da Stripe.' }, 503);
  }

  // 1) Quem és tu? (o Porteiro confirma pela tua sessão)
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'não autenticado' }, 401);

  // 2) Corpo: para onde voltar + NIF opcional + tipo de negócio opcional.
  let return_url: unknown;
  let nif: unknown;
  let business_type: unknown;
  try {
    const body = await req.json();
    return_url = body?.return_url;
    nif = body?.nif;
    business_type = body?.business_type; // 'individual' | 'company'
  } catch {
    // sem corpo — usam-se os valores por omissão
  }
  const nifOk = nifLimpo(nif);
  const btOk =
    business_type === 'individual' || business_type === 'company' ? business_type : null;

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 3) Já existe conta Connect para este perfil?
  const { data: existente } = await admin
    .from('contas_connect')
    .select(
      'perfil_id, stripe_account_id, nif, estado, charges_enabled, payouts_enabled, api_versao',
    )
    .eq('perfil_id', user.id)
    .maybeSingle();

  let accountId = existente?.stripe_account_id ?? null;
  // A via da conta decide o recurso do link: contas antigas ficam v1 (provadas),
  // contas novas nascem v2. Linha sem conta ainda → vai nascer v2.
  let apiVersao: 'v1' | 'v2' = accountId ? (existente?.api_versao === 'v2' ? 'v2' : 'v1') : 'v2';

  // 4) Sem conta Stripe ainda → cria uma via Accounts v2 (equivalente Express).
  //    (Idempotente: se já há stripe_account_id, salta e emite só um link novo.)
  if (!accountId) {
    const payload: Record<string, unknown> = {
      dashboard: 'express',
      identity: {
        country: 'pt',
        ...(btOk ? { entity_type: btOk } : {}),
      },
      configuration: {
        merchant: { capabilities: { card_payments: { requested: true } } },
      },
      defaults: {
        currency: 'eur',
        locales: ['pt-PT'],
        // Espelho do Express v1: a plataforma paga as fees da Stripe e cobre
        // perdas; a Stripe recolhe os requirements (onboarding hosted).
        responsibilities: { fees_collector: 'application', losses_collector: 'application' },
      },
      metadata: { perfil_id: user.id },
    };
    if (user.email) payload.contact_email = user.email;
    // O NIF vai para a nossa BD SEMPRE (DAC7); o onboarding hosted da Stripe
    // recolhe-o também do lado dela — não o pré-preenchemos aqui.

    const res = await fetch(STRIPE_V2_ACCOUNTS, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Stripe-Version': STRIPE_V2_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const acct = await res.json();
    if (!res.ok) {
      // Erro mais provável em teste: Connect não ativado na conta-plataforma.
      // Devolvemos a mensagem da Stripe crua para o Vítor saber o que ativar —
      // sem NUNCA imprimir a chave.
      const msg = acct?.error?.message ?? 'erro ao criar a conta na Stripe';
      const connectDesligado = /connect|sign(ed)?\s*up|platform/i.test(String(msg));
      return json(
        {
          error: connectDesligado
            ? 'A Stripe Connect ainda não está ativada nesta conta-plataforma. ' +
              'Ativa Connect no dashboard da Stripe (modo teste) e tenta de novo.'
            : msg,
          stripe_error: msg,
          connect_por_ativar: connectDesligado,
        },
        503,
      );
    }
    accountId = acct.id as string;
    apiVersao = 'v2';
  }

  // 5) Grava/atualiza a linha em contas_connect (só o servidor pode).
  //    estado = 'pendente' logo que a conta existe; passa a 'ativa' quando o
  //    webhook confirmar charges_enabled.
  const linha: Record<string, unknown> = {
    perfil_id: user.id,
    stripe_account_id: accountId,
    estado: existente?.charges_enabled ? existente.estado : 'pendente',
    api_versao: apiVersao,
  };
  if (nifOk) linha.nif = nifOk;
  const { error: erroUpsert } = await admin
    .from('contas_connect')
    .upsert(linha, { onConflict: 'perfil_id' });
  if (erroUpsert) {
    return json({ error: 'não consegui guardar a conta de pagamentos' }, 500);
  }

  // 6) Account Link (onboarding). O return_url validado do cliente; o
  //    refresh_url é o mesmo destino com marcador (a Stripe volta aqui se o link
  //    expirar antes de P concluir).
  const returnBase =
    returnValido(return_url) ?? Deno.env.get('CONNECT_RETURN_URL') ?? 'https://honraapp.com/pagamentos';
  const sep = returnBase.includes('?') ? '&' : '?';
  const returnUrl = `${returnBase}${sep}connect=ok`;
  const refreshUrl = `${returnBase}${sep}connect=refresh`;

  let linkRes: Response;
  if (apiVersao === 'v2') {
    // Account Links V2 — o recurso de onboarding hosted das contas v2
    // (docs.stripe.com/connect/marketplace/tasks/onboard). Onboarda a
    // configuração `merchant` (a dos direct charges).
    linkRes = await fetch(STRIPE_V2_ACCOUNT_LINKS, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Stripe-Version': STRIPE_V2_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        account: accountId,
        use_case: {
          type: 'account_onboarding',
          account_onboarding: {
            configurations: ['merchant'],
            return_url: returnUrl,
            refresh_url: refreshUrl,
          },
        },
      }),
    });
  } else {
    // Contas v1 existentes (acct_1Ttw2c…): o Account Link v1 de sempre.
    const linkParams = new URLSearchParams();
    linkParams.set('account', accountId!);
    linkParams.set('type', 'account_onboarding');
    linkParams.set('return_url', returnUrl);
    linkParams.set('refresh_url', refreshUrl);
    linkRes = await fetch(STRIPE_V1_ACCOUNT_LINKS, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: linkParams,
    });
  }
  const link = await linkRes.json();
  if (!linkRes.ok) {
    return json({ error: link?.error?.message ?? 'erro ao gerar o link de onboarding' }, 502);
  }

  return json({
    url: link.url,
    account_id: accountId,
    estado: existente?.charges_enabled ? existente.estado : 'pendente',
    charges_enabled: existente?.charges_enabled ?? false,
    api_versao: apiVersao,
  });
});
