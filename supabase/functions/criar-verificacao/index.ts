// HONRA — Fatia 2: cria uma sessão de verificação no Stripe Identity.
// O utilizador toca "Verificar identidade" na app → esta função pede ao Stripe
// uma sessão (documento + liveness) e devolve o URL onde ele se verifica.
// Corre no Supabase Edge Functions (Deno). Precisa do segredo STRIPE_SECRET_KEY.

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

// O cliente diz para onde o Stripe deve voltar (a app, não uma página morta).
// Só http(s) (o Stripe exige-o); na web é a origem da app (inclui a build na LAN).
function returnValido(u: unknown): string | null {
  return typeof u === 'string' && /^https?:\/\//.test(u) ? u : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // 1) Quem és tu? (o Porteiro confirma pela tua sessão)
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'não autenticado' }, 401);

  // 1b) Para onde voltar depois de verificar (a app).
  let return_url: string | undefined;
  try {
    return_url = (await req.json())?.return_url;
  } catch {
    // sem corpo — usa o valor por omissão
  }

  // 2) Pedir ao Stripe uma sessão de verificação (documento + captura ao vivo)
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
  const params = new URLSearchParams();
  params.set('type', 'document');
  params.set('metadata[perfil_id]', user.id);            // ← liga o resultado ao perfil
  params.set('options[document][require_live_capture]', 'true');    // liveness
  params.set('options[document][require_matching_selfie]', 'true'); // face match
  const returnUrl =
    returnValido(return_url) ?? Deno.env.get('VERIF_RETURN_URL') ?? 'https://honraapp.com/verificado';
  params.set('return_url', returnUrl);

  const res = await fetch('https://api.stripe.com/v1/identity/verification_sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  const vs = await res.json();
  if (!res.ok) return json({ error: vs.error?.message ?? 'erro no Stripe' }, 400);

  // 3) Devolver o URL onde o utilizador se verifica
  return json({ url: vs.url, id: vs.id });
});
