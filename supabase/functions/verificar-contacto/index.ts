// HONRA — Selo "Contacto": ENVIAR o código OTP por SMS (via Bird, plataforma nova EU).
// A API (eu1.platform.bird.com/v1/sms/messages) só ENVIA um template com o código que
// NÓS geramos. Por isso: geramos um código, guardamo-lo (hash+validade+tentativas) e
// pedimos ao Bird para o enviar. A validação é depois em `confirmar-contacto`.
// Segredo: BIRD_ACCESS_KEY (bk_eu1_…, usada como Bearer).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
function e164Valido(t: unknown): t is string {
  return typeof t === 'string' && /^\+[1-9]\d{7,14}$/.test(t);
}
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // 1) Quem és tu?
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'não autenticado' }, 401);

  // 2) Que número?
  let telefone: unknown;
  try { telefone = (await req.json())?.telefone; } catch { /* sem corpo */ }
  if (!e164Valido(telefone)) return json({ error: 'Indica um número válido (ex.: +351912345678).' }, 400);

  // 3) Fornecedor configurado?
  const key = Deno.env.get('BIRD_ACCESS_KEY');
  if (!key) return json({ error: 'A verificação de contacto ainda não está disponível.' }, 503);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 4) Rate-limit: no máximo 1 envio por 45s por utilizador (trava spam/pumping).
  const { data: atual } = await admin
    .from('otp_contacto').select('enviado_em').eq('perfil_id', user.id).maybeSingle();
  if (atual && Date.now() - new Date(atual.enviado_em).getTime() < 45_000) {
    return json({ error: 'Aguarda uns segundos antes de pedir um novo código.' }, 429);
  }

  // 4b) TETO DIÁRIO (082). Os 45s acima são um RITMO, não um teto: davam 1 920
  // SMS/dia por conta. Duas contagens, porque protegem gente diferente — a
  // primeira protege a fatura da casa, a segunda protege quem recebe.
  for (const [chave, teto, recado] of [
    [`p:${user.id}`, 10, 'Já pediste demasiados códigos hoje. Tenta amanhã.'],
    [`n:${telefone}`, 5, 'Este número já recebeu demasiados códigos hoje.'],
  ] as const) {
    const { data: podeEnviar } = await admin.rpc('registar_sms', {
      p_chave: chave,
      p_teto: teto,
    });
    if (podeEnviar === false) return json({ error: recado }, 429);
  }

  // 5) Gerar código de 6 dígitos e guardar (hash + validade + tentativas).
  const codigo = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  const { error: erroGuarda } = await admin.from('otp_contacto').upsert({
    perfil_id: user.id,
    telefone,
    codigo_hash: await sha256(codigo),
    expira_em: new Date(Date.now() + 10 * 60_000).toISOString(),
    tentativas: 0,
    enviado_em: new Date().toISOString(),
  });
  if (erroGuarda) return json({ error: 'Não foi possível iniciar a verificação. Tenta de novo.' }, 500);

  // 6) Pedir ao Bird para enviar o SMS (template OTP com o nosso código).
  const res = await fetch('https://eu1.platform.bird.com/v1/sms/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: telefone,
      template: { name: 'bird_otp_verification', parameters: { code: codigo } },
    }),
  });
  if (!res.ok) {
    const detalhe = await res.text().catch(() => '');
    console.error('bird send falhou', res.status, detalhe.slice(0, 300));
    return json({ error: 'Não foi possível enviar o código. Confirma o número e tenta de novo.' }, 400);
  }

  return json({ enviado: true });
});
