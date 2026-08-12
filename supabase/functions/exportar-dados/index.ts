// HONRA — RGPD: EXPORTAR os dados do utilizador (direito à portabilidade).
// A pessoa autenticada pede os SEUS dados; juntamos tudo o que é dela (com a
// service_role, para atravessar o RLS de leitura) e devolvemos um JSON. O cliente
// oferece o download. Só o próprio: escopado a auth.uid().

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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'não autenticado' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const uid = user.id;

  // Tolerante: cada gaveta é tentada à parte; se uma falhar (coluna/tabela), fica vazia.
  async function tenta<T>(fn: () => Promise<{ data: T | null }>): Promise<T | []> {
    try {
      const { data } = await fn();
      return (data as T) ?? ([] as unknown as T);
    } catch {
      return [] as unknown as T;
    }
  }

  const dados = {
    exportado_em: new Date().toISOString(),
    conta: { id: uid, email: user.email, criado_em: user.created_at },
    perfil: await tenta(() => admin.from('perfis').select('*').eq('id', uid).maybeSingle() as any),
    selo: await tenta(() => admin.from('verificacoes').select('aba, estado, verificado_em').eq('perfil_id', uid) as any),
    categorias: await tenta(() => admin.from('perfil_categorias').select('categorias(nome)').eq('perfil_id', uid) as any),
    negocios: await tenta(() =>
      admin.from('orcamentos').select('*').or(`de_perfil.eq.${uid},para_perfil.eq.${uid}`) as any),
    avaliacoes: await tenta(() =>
      admin.from('avaliacoes').select('*').or(`de_perfil.eq.${uid},para_perfil.eq.${uid}`) as any),
    mensagens: await tenta(() => admin.from('mensagens').select('*').eq('autor_perfil', uid) as any),
    portefolio: await tenta(() => admin.from('portfolio_itens').select('*').eq('perfil_id', uid) as any),
    // 064 · #9 — completar a portabilidade (art. 15/20): gavetas que faltavam.
    checkpoints: await tenta(() =>
      admin.from('checkpoints_orcamento').select('*, orcamentos!inner(de_perfil, para_perfil)')
        .or(`de_perfil.eq.${uid},para_perfil.eq.${uid}`, { referencedTable: 'orcamentos' }) as any),
    trabalhos: await tenta(() => admin.from('trabalhos').select('*').eq('autor_perfil', uid) as any),
    candidaturas: await tenta(() => admin.from('candidaturas').select('*').eq('candidato_perfil', uid) as any),
    infracoes: await tenta(() => admin.from('infracoes').select('*').eq('perfil_id', uid) as any),
    contactos: await tenta(() => admin.from('contactos_verificados').select('*').eq('perfil_id', uid) as any),
    denuncias_feitas: await tenta(() => admin.from('denuncias').select('*').eq('denunciante', uid) as any),
    denuncias_recebidas: await tenta(() => admin.from('denuncias').select('*').eq('denunciado', uid) as any),
    tarefas: await tenta(() => admin.from('tarefas').select('*').eq('perfil_id', uid) as any),
    contratos_convite: await tenta(() => admin.from('contratos_convite').select('*').eq('profissional_id', uid) as any),
    push_tokens: await tenta(() => admin.from('push_tokens').select('*').eq('perfil_id', uid) as any),
  };

  return json(dados);
});
