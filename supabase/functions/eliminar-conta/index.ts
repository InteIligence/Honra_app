// HONRA — RGPD: ELIMINAR a conta (direito a ser esquecido).
// A pessoa autenticada pede a eliminação da SUA conta. Com a service_role,
// apagamos o utilizador de auth.users → o resto cai em cascata (perfil, selo,
// negócios, avaliações, mensagens, portefólio, etc. têm on delete cascade).
// Só o próprio: apaga-se auth.uid(), nunca outra conta. Sem volta atrás.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Quem és tu? (só apagas a TUA conta)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'não autenticado' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Retenção durante a suspensão (escada de suspensão, migração 048; fuga A do
  // red-team): uma conta suspensa NÃO se pode apagar enquanto durar a sanção —
  // senão apagava-se e recriava-se limpa, e a marca valia zero. A sanção é
  // temporária (expira sozinha em suspenso_ate), por isso o bloqueio é honesto e
  // proporcional. Mensagem clara com a data em que a porta reabre.
  const { data: perfil } = await admin
    .from('perfis')
    .select('suspenso_ate')
    .eq('id', user.id)
    .maybeSingle();
  if (perfil?.suspenso_ate && new Date(perfil.suspenso_ate).getTime() > Date.now()) {
    return json(
      {
        suspenso: true,
        suspenso_ate: perfil.suspenso_ate,
        error:
          'A tua conta está suspensa e não pode ser eliminada enquanto durar a suspensão. ' +
          'A suspensão termina sozinha — depois disso podes eliminar a conta.',
      },
      409,
    );
  }

  // Apaga o utilizador (cascata trata do resto).
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return json({ error: 'Não foi possível eliminar a conta. Tenta de novo.' }, 500);
  }

  return json({ eliminado: true });
});
