// HONRA — Selo "Profissão" (via B, cédula): SUBMETER um pedido para revisão.
// O profissional já carregou a prova (foto/PDF da cédula) para o bucket privado
// 'cedulas' (na sua pasta {perfil_id}/…) e envia-nos os dados declarados + o
// caminho do ficheiro. Registamos um pedido PENDENTE. NÃO acendemos nada aqui —
// a verdade é do registo da Ordem, confirmada por um admin em `profissao-rever`.
//
// Princípio (não negociável): o nome da cédula tem de bater com a IDENTIDADE já
// verificada. Por isso exigimos a identidade verificada ANTES de aceitar o pedido
// (o admin fará depois o cruzamento nome+nº+ativo no portal da Ordem).

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
function limpo(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.length === 0 || s.length > max) return null;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // 1) Quem és tu? (o Porteiro confirma pela tua sessão)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'não autenticado' }, 401);

  // 2) Dados do pedido.
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* sem corpo */ }
  const profissao = limpo(body.profissao_declarada, 120);
  const numero = limpo(body.cedula_numero, 60);
  const ordem = limpo(body.ordem, 120);
  // Duas faces da cédula: FRENTE (ficheiro_path, nome mantido da 029) + VERSO.
  const frente = limpo(body.ficheiro_path, 300);
  const verso = limpo(body.ficheiro_verso, 300);
  if (!profissao || !numero || !ordem || !frente || !verso) {
    return json(
      { error: 'Faltam dados: profissão, nº de cédula, Ordem e as DUAS faces da cédula (frente e verso).' },
      400,
    );
  }
  // Ambas as provas têm de ser do próprio (pasta {perfil_id}/… no bucket privado).
  if (!frente.startsWith(`${user.id}/`) || !verso.startsWith(`${user.id}/`)) {
    return json({ error: 'A prova enviada não pertence a esta conta.' }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 3) Exigir IDENTIDADE verificada — o nome da cédula cruza com o nome legal.
  const { data: ident } = await admin
    .from('verificacoes')
    .select('estado')
    .eq('perfil_id', user.id)
    .eq('aba', 'identidade')
    .maybeSingle();
  if (ident?.estado !== 'verificado') {
    return json({ error: 'Verifica primeiro a tua identidade — a cédula tem de bater com o teu nome legal.' }, 409);
  }

  // 4) Um pedido pendente de cada vez (não empilhar revisões do mesmo perfil).
  const { data: jaPendente } = await admin
    .from('pedidos_profissao')
    .select('id')
    .eq('perfil_id', user.id)
    .eq('estado', 'pendente')
    .maybeSingle();
  if (jaPendente) {
    return json({ error: 'Já tens um pedido de cédula em revisão. Espera pela decisão.' }, 409);
  }

  // 5) Registar o pedido PENDENTE (a prova fica no Storage; aqui fica a alegação).
  const { data: pedido, error } = await admin
    .from('pedidos_profissao')
    .insert({
      perfil_id: user.id,
      profissao_declarada: profissao,
      cedula_numero: numero,
      ordem,
      ficheiro_path: frente,   // FRENTE (nome mantido da 029)
      ficheiro_verso: verso,   // VERSO
      estado: 'pendente',
    })
    .select('id')
    .single();
  if (error) return json({ error: 'Não foi possível registar o pedido. Tenta de novo.' }, 500);

  return json({ submetido: true, pedido_id: pedido.id });
});
