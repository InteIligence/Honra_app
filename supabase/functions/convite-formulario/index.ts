// HONRA — Contrato-convite: SUBMISSÃO do formulário (pública, sem conta).
// O convidado (C) — que NÃO tem conta Honra — preenche datas, serviço e valor a
// partir da página do Honra Card do profissional (P). Esta função valida,
// trava spam (rate-limit por telefone/IP; gancho de CAPTCHA deixado para v-próxima),
// grava/atualiza o cliente_convidado e cria um contrato em 'formulario_recebido'.
// O aviso a P nasce do trigger `notificar_convite`. Respostas honestas.
//
// Pública (deploy com --no-verify-jwt). Usa service_role para a BD — o convidado
// NUNCA toca na base diretamente (ver doc 4.3 / 8.1).
//
// Invariante legal: data do evento (data_inicio) OBRIGATÓRIA (art. 17.º/1/k
// DL 24/2014). Sem ela não há contrato.

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
function e164Valido(t: unknown): t is string {
  return typeof t === 'string' && /^\+[1-9]\d{7,14}$/.test(t);
}
function dataValida(d: unknown): d is string {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = Date.parse(d + 'T00:00:00Z');
  return !Number.isNaN(t);
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function token(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
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

  // --- Campos do formulário ---
  const perfilRef = String(body.perfil ?? '').trim(); // id do perfil OU handle do Honra Card
  const nome = String(body.nome ?? '').trim();
  const telefone = body.telefone;
  const servico = body.servico != null ? String(body.servico).trim() : null;
  const data_inicio = body.data_inicio;
  const data_fim = body.data_fim != null && body.data_fim !== '' ? String(body.data_fim) : null;
  const email = body.email != null && String(body.email).trim() !== '' ? String(body.email).trim() : null;
  const valor_total =
    body.valor_total != null && body.valor_total !== ''
      ? Math.round(Number(body.valor_total))
      : null; // cêntimos

  // --- Validações honestas (invariantes legais primeiro) ---
  if (!perfilRef) return json({ error: 'Falta indicar o profissional.' }, 400);
  if (nome.length < 2) return json({ error: 'Diz-nos o teu nome.' }, 400);
  if (!e164Valido(telefone))
    return json({ error: 'Indica um telemóvel válido (ex.: +351912345678).' }, 400);
  if (!dataValida(data_inicio))
    return json({ error: 'A data do evento é obrigatória.' }, 400); // invariante legal
  if (data_fim && (!dataValida(data_fim) || (data_fim as string) < (data_inicio as string)))
    return json({ error: 'A data de fim não pode ser antes do início.' }, 400);
  if (valor_total != null && (!Number.isFinite(valor_total) || valor_total < 0))
    return json({ error: 'Valor inválido.' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // --- Resolver o profissional (por id ou por handle) e exigir identidade
  //     verificada: a prova vem antes do pedido (doc §2). ---
  const q = admin.from('perfis').select('id, nome').limit(1);
  const { data: perfil } = UUID.test(perfilRef)
    ? await q.eq('id', perfilRef).maybeSingle()
    : await q.eq('handle', perfilRef).maybeSingle();
  if (!perfil) return json({ error: 'Profissional não encontrado.' }, 404);

  const { data: verif } = await admin
    .from('verificacoes')
    .select('estado')
    .eq('perfil_id', perfil.id)
    .eq('aba', 'identidade')
    .eq('estado', 'verificado')
    .maybeSingle();
  if (!verif)
    return json({ error: 'Este profissional ainda não pode receber convites.' }, 403);

  // --- Cliente convidado (063 · #8 segurança): NUNCA sobrescrever uma linha
  // existente. Esta função é PÚBLICA — deixar o upsert reescrever `nome`/`email`
  // por telefone permitia a qualquer um corromper o registo que OUTRO
  // profissional já vê no seu contrato (cross-tenant). Regra nova: se já existe
  // linha para este telefone, REUTILIZA-SE tal como está; só se cria quando é
  // mesmo nova. (O nome/email de uma linha viva só se muda por dentro, com dono.)
  let clienteId: string | null = null;
  {
    const { data: existente } = await admin
      .from('clientes_convidados')
      .select('id')
      .eq('telefone', telefone)
      .maybeSingle();
    if (existente) {
      clienteId = existente.id as string;
    } else {
      const { data: novo, error: erroNovo } = await admin
        .from('clientes_convidados')
        .insert({ nome, telefone, email })
        .select('id')
        .single();
      // Corrida: se dois pedidos criarem ao mesmo tempo, o 2º colide no único
      // por telefone → relê a linha em vez de falhar.
      if (erroNovo) {
        const { data: relido } = await admin
          .from('clientes_convidados')
          .select('id')
          .eq('telefone', telefone)
          .maybeSingle();
        clienteId = relido?.id ?? null;
      } else {
        clienteId = novo?.id ?? null;
      }
    }
  }
  if (!clienteId)
    return json({ error: 'Não foi possível registar o pedido. Tenta de novo.' }, 500);
  const cliente = { id: clienteId };

  // --- Rate-limit / anti-spam (primeira superfície pública do Honra). ---
  // TODO(Fatia F+): CAPTCHA real. Por agora: janela por telefone + por IP.
  const ip =
    (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    null;

  const ha45s = new Date(Date.now() - 45_000).toISOString();
  const { count: recentesTelefone } = await admin
    .from('contratos_convite')
    .select('id', { count: 'exact', head: true })
    .eq('cliente_convidado_id', cliente.id)
    .gte('criado_em', ha45s);
  if ((recentesTelefone ?? 0) > 0)
    return json({ error: 'Aguarda uns segundos antes de enviar outro pedido.' }, 429);

  if (ip) {
    const ha10min = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count: recentesIp } = await admin
      .from('contratos_convite')
      .select('id', { count: 'exact', head: true })
      .eq('ip_submissao', ip)
      .gte('criado_em', ha10min);
    if ((recentesIp ?? 0) >= 5)
      return json({ error: 'Demasiados pedidos deste dispositivo. Tenta mais tarde.' }, 429);
  }

  // --- Criar o contrato em 'formulario_recebido'. ---
  const token_publico = token();
  const { data: contrato, error: erroContrato } = await admin
    .from('contratos_convite')
    .insert({
      profissional_id: perfil.id,
      cliente_convidado_id: cliente.id,
      token_publico,
      servico,
      data_inicio,
      data_fim,
      valor_total,
      ip_submissao: ip,
      estado: 'formulario_recebido',
    })
    .select('id')
    .single();
  if (erroContrato || !contrato)
    return json({ error: 'Não foi possível criar o pedido. Tenta de novo.' }, 500);

  // --- Evidência (append-only) — o primeiro toque do audit trail. ---
  await admin.from('eventos_convite').insert({
    contrato_id: contrato.id,
    tipo: 'formulario',
    ip,
    user_agent: req.headers.get('user-agent'),
    payload: { servico, data_inicio, data_fim, valor_total, nome, telefone, email },
  });

  return json({ ok: true, token: token_publico });
});
