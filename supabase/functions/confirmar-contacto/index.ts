// HONRA — Selo "Contacto": VALIDAR o código OTP (que nós guardámos) e acender a aba.
// A pessoa devolve o código recebido por SMS. Comparamos com o hash guardado (validade
// + limite de tentativas); se bater certo, o servidor (service_role) grava o HASH do
// número (um número = uma conta) e põe a aba "contacto" a `verificado`. O cliente nunca
// escreve isto — auto-verificação impossível.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
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

  // 2) Código + número
  let codigo: unknown, telefone: unknown;
  try { const b = await req.json(); codigo = b?.codigo; telefone = b?.telefone; } catch { /* sem corpo */ }
  if (typeof codigo !== 'string' || typeof telefone !== 'string') {
    return json({ error: 'Faltam dados da verificação.' }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 3) Ir buscar o OTP pendente deste utilizador.
  const { data: row } = await admin
    .from('otp_contacto').select('*').eq('perfil_id', user.id).maybeSingle();
  if (!row) return json({ error: 'Pede um código primeiro.' }, 400);
  if (new Date(row.expira_em).getTime() < Date.now()) {
    await admin.from('otp_contacto').delete().eq('perfil_id', user.id);
    return json({ error: 'O código expirou. Pede um novo.' }, 400);
  }
  if (row.tentativas >= 5) {
    await admin.from('otp_contacto').delete().eq('perfil_id', user.id);
    return json({ error: 'Demasiadas tentativas. Pede um novo código.' }, 429);
  }

  // 4) Conta a tentativa e valida (código certo + mesmo número).
  await admin.from('otp_contacto').update({ tentativas: row.tentativas + 1 }).eq('perfil_id', user.id);
  const ok = row.telefone === telefone && (await sha256(codigo.trim())) === row.codigo_hash;
  if (!ok) return json({ error: 'Código inválido. Tenta de novo.' }, 400);

  // 5) Aprovado → gravar o hash (um número = uma conta) e acender a aba.
  const telefone_hash = await sha256(telefone);
  const { error: erroHash } = await admin
    .from('contactos_verificados')
    .upsert({ perfil_id: user.id, telefone_hash, verificado_em: new Date().toISOString() });
  if (erroHash) {
    return json({ error: 'Este número já está associado a outra conta.' }, 409);
  }
  await admin.from('verificacoes')
    .update({ estado: 'verificado', verificado_em: new Date().toISOString() })
    .eq('perfil_id', user.id).eq('aba', 'contacto');

  // Limpa o OTP usado.
  await admin.from('otp_contacto').delete().eq('perfil_id', user.id);

  return json({ verificado: true });
});
