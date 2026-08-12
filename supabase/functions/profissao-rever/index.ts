// HONRA — Selo "Profissão" (via B, cédula): REVER um pedido (só ADMIN).
// O admin (o Vítor, ao início) confirma no portal da Ordem (nome + nº + ativo) e
// que o nome bate com a identidade verificada; depois APROVA ou REJEITA aqui.
//   • aprovar  → acende a aba 'profissao' com origem='cedula' (verifica-se contra
//                a FONTE, não o PDF; o PDF ficou só como prova arquivada).
//   • rejeitar → marca o pedido rejeitado com motivo; NÃO mexe no selo (se já
//                estava aceso pela via trabalho, continua aceso).
// Só service_role escreve — o cliente nunca acende o seu próprio selo.

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

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 2) És admin? (a revisão é reservada.)
  const { data: quem } = await admin
    .from('perfis').select('is_admin').eq('id', user.id).maybeSingle();
  if (!quem?.is_admin) return json({ error: 'Sem permissão.' }, 403);

  // 3) Decisão.
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* sem corpo */ }
  const pedidoId = typeof body.pedido_id === 'string' ? body.pedido_id : null;
  const decisao = body.decisao === 'aprovar' || body.decisao === 'rejeitar' ? body.decisao : null;
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 300) : '';
  if (!pedidoId || !decisao) return json({ error: 'Falta o pedido ou a decisão.' }, 400);
  if (decisao === 'rejeitar' && motivo.length === 0) {
    return json({ error: 'Uma rejeição precisa de um motivo (o profissional tem direito a saber porquê).' }, 400);
  }

  // 4) Ir buscar o pedido (tem de estar pendente).
  const { data: pedido } = await admin
    .from('pedidos_profissao').select('*').eq('id', pedidoId).maybeSingle();
  if (!pedido) return json({ error: 'Pedido não encontrado.' }, 404);
  if (pedido.estado !== 'pendente') return json({ error: 'Este pedido já foi revisto.' }, 409);

  const agora = new Date().toISOString();

  if (decisao === 'aprovar') {
    // Acende a aba com origem='cedula' (a fonte é a Ordem; o PDF é só prova).
    const { error: erroSelo } = await admin
      .from('verificacoes')
      .update({ estado: 'verificado', origem: 'cedula', verificado_em: agora })
      .eq('perfil_id', pedido.perfil_id)
      .eq('aba', 'profissao');
    if (erroSelo) return json({ error: 'Não foi possível acender o selo. Tenta de novo.' }, 500);

    await admin.from('pedidos_profissao')
      .update({ estado: 'aprovado', revisto_em: agora, revisto_por: user.id })
      .eq('id', pedidoId);
    return json({ revisto: true, estado: 'aprovado' });
  }

  // rejeitar — não toca no selo.
  await admin.from('pedidos_profissao')
    .update({ estado: 'rejeitado', motivo_rejeicao: motivo, revisto_em: agora, revisto_por: user.id })
    .eq('id', pedidoId);
  return json({ revisto: true, estado: 'rejeitado' });
});
