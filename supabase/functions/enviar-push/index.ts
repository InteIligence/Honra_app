// HONRA — Enviar push (fase 2 dos avisos).
// A cada aviso novo em `notificacoes`, um trigger na BD chama esta função com
// { notificacao_id }. Ela lê o aviso e os tokens do destinatário e entrega a
// notificação à Expo Push API — a camada que chega a quem NÃO tem a app aberta.
//
// O push é o MESMO aviso, entregue mais longe: título e corpo vêm do aviso.
// Best-effort: se um token estiver morto ou a Expo falhar, não rebenta — o
// aviso in-app já existe (é a fonte da verdade). Devolve um resumo do envio.
//
// Segurança: porta fechada por `x-push-secret` == PUSH_SECRET (401 senão). É
// chamada só pelo trigger (server-side), nunca pelo cliente.
//
// Precisa de SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + PUSH_SECRET.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-push-secret',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

type Mensagem = { to: string; title: string; body: string; sound: 'default' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // --- Porta fechada: só o trigger (com o segredo) entra. ---
  const secret = Deno.env.get('PUSH_SECRET') ?? '';
  const dado = req.headers.get('x-push-secret') ?? '';
  if (!secret || dado !== secret) return json({ error: 'não autorizado' }, 401);

  // --- Que aviso? ---
  let notificacao_id: string | undefined;
  try {
    const body = await req.json();
    notificacao_id = body?.notificacao_id;
  } catch {
    // sem corpo
  }
  if (!notificacao_id) return json({ error: 'falta o notificacao_id' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 1) Ler o aviso (título/corpo/destinatário).
  const { data: aviso, error: erroAviso } = await admin
    .from('notificacoes')
    .select('id, perfil_id, titulo, corpo')
    .eq('id', notificacao_id)
    .single();
  if (erroAviso || !aviso) return json({ error: 'aviso não encontrado' }, 404);

  // 2) Ler os tokens do destinatário.
  const { data: tokens } = await admin
    .from('push_tokens')
    .select('token')
    .eq('perfil_id', aviso.perfil_id);

  const lista = (tokens ?? []).map((t) => t.token as string).filter(Boolean);
  if (lista.length === 0) return json({ ok: true, enviados: 0, motivo: 'sem tokens' });

  // 3) Montar as mensagens (uma por token) e enviar em lote à Expo.
  const mensagens: Mensagem[] = lista.map((to) => ({
    to,
    title: aviso.titulo,
    body: aviso.corpo ?? '',
    sound: 'default',
  }));

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(mensagens),
    });
    const corpo = await res.json().catch(() => null);
    if (!res.ok) {
      // A Expo recusou o lote — não rebenta, devolve o motivo.
      return json({ ok: false, enviados: 0, erro: corpo ?? 'erro da Expo Push' });
    }
    return json({ ok: true, enviados: mensagens.length, expo: corpo });
  } catch (e) {
    return json({ ok: false, enviados: 0, erro: String(e) });
  }
});
