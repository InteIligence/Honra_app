// HONRA — Contrato-convite: o profissional DECIDE (aceitar ou recusar).
// P (autenticado) responde a um formulário recebido. Aceitar CONGELA o nível de
// proteção e as percentagens, GERA o texto+hash do contrato, cria um magic link
// 'assinar' (72h) e ENVIA ao convidado, por SMS de TEXTO LIVRE, o link para
// assinar (Fatia B). Recusar fecha em 'recusado'.
//
// Fatia C-2: o aceite passa a levar `nivel` (1 = contrato; 2 = contrato+cartão).
// O nível 2 só passa se o gate `pode_nivel_protecao_avancado(P)` estiver aberto
// (conta Connect ATIVA — migração 035): é NA conta de P que o SetupIntent e as
// cobranças vão viver (direct charges, doc §11.1). No aceite a nível 2
// congela-se também o `stripe_account_id` (a conta de P pode mudar; o contrato
// não) e gera-se o TEXTO DO MANDATO (P nomeado beneficiário, valores e datas
// concretos) — que o convidado aceitará no passo do cartão. Nível 3 (hold) é da
// Fatia D — recusado com honestidade.
//
// Exige JWT (deploy SEM --no-verify-jwt). A escrita é toda do servidor
// (service_role) — o guarda_ciclo_convite reserva o ciclo ao servidor.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { gerarContrato, gerarMandato, hash8, sha256 } from '../_shared/contrato.ts';
import { enviarSmsTexto } from '../_shared/bird.ts';
import { modoTeste } from '../_shared/modoTeste.ts';

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
// Token opaco (24 bytes → 48 hex). O do magic link é longo e só existe no
// SMS/URL; a BD guarda apenas o seu hash.
function novoToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://honraapp.com';
// Em teste (SMS custam) NÃO se envia — compõe-se, regista-se e devolve-se para
// prova. Mesmo interruptor da convite-otp.
const MODO_TESTE = modoTeste();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Quem és tu?
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'não autenticado' }, 401);

  let contrato_id: string | undefined;
  let decisao: string | undefined;
  let nivelPedido: unknown;
  try {
    const body = await req.json();
    contrato_id = body?.contrato_id;
    decisao = body?.decisao; // 'aceitar' | 'recusar'
    nivelPedido = body?.nivel; // 1 | 2 (C-2); default 1
  } catch {
    // sem corpo
  }
  if (!contrato_id) return json({ error: 'falta o contrato_id' }, 400);
  if (decisao !== 'aceitar' && decisao !== 'recusar')
    return json({ error: 'decisão inválida' }, 400);

  // Nível pedido: omitido → 1. Só 1 e 2 existem nesta fatia (3 = hold, Fatia D).
  const nivel = nivelPedido == null ? 1 : Number(nivelPedido);
  if (nivel !== 1 && nivel !== 2) {
    return json(
      { error: nivel === 3 ? 'O nível contrato+cartão+caução ainda não está disponível.' : 'nível de proteção inválido' },
      400,
    );
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: c, error: erro } = await admin
    .from('contratos_convite')
    .select(
      'id, profissional_id, cliente_convidado_id, token_publico, estado, servico, data_inicio, ' +
        'data_fim, valor_total, sinal_valor, pct_caucao, pct_cancelamento, janela_x_meses',
    )
    .eq('id', contrato_id)
    .maybeSingle();
  if (erro || !c) return json({ error: 'convite não encontrado' }, 404);
  if (c.profissional_id !== user.id) return json({ error: 'este convite não é teu' }, 403);
  if (c.estado !== 'formulario_recebido')
    return json({ error: 'este convite já foi decidido ou expirou' }, 409);

  // Conta suspensa: aceitar convites é um gesto de marketplace — travado enquanto
  // durar a suspensão (escada de suspensão, migração 048). Recusar é permitido
  // (só fecha o convite, sem criar compromisso novo).
  if (decisao === 'aceitar') {
    const { data: susp } = await admin.rpc('esta_suspenso', { p_perfil: user.id });
    if (susp === true) {
      return json(
        { suspenso: true, error: 'A tua conta está suspensa: não podes aceitar convites enquanto durar a suspensão.' },
        403,
      );
    }
  }

  const agora = new Date().toISOString();

  if (decisao === 'recusar') {
    const { error } = await admin
      .from('contratos_convite')
      .update({ estado: 'recusado', resolvido_em: agora })
      .eq('id', c.id)
      .eq('estado', 'formulario_recebido');
    if (error) return json({ error: 'não consegui registar a recusa' }, 500);
    await admin.from('eventos_convite').insert({
      contrato_id: c.id,
      tipo: 'recusa',
      payload: { por: user.id },
    });
    return json({ ok: true, estado: 'recusado' });
  }

  // Aceitar — congela a proteção e GERA o contrato (texto + hash + versão +
  // carimbo nosso). Depois cria um magic link 'assinar' (72h) e regista a
  // mensagem-de-link para o convidado voltar. Nível 1 não tem mandato/cartão —
  // o contrato é o compromisso em si. Nível 2 (C-2) exige o gate Connect e
  // congela a conta de P + o texto do mandato.
  const NIVEL = nivel;
  const PCT_CAUCAO = 25;
  const PCT_CANCELAMENTO = 12;
  const JANELA_X = 2;

  // GATE do nível 2 (migração 035): sem conta Connect ATIVA não há para onde a
  // cobrança cair a favor de P (direct charges) — recusa honesta.
  let stripeAccountId: string | null = null;
  if (NIVEL === 2) {
    const { data: podeAvancado } = await admin.rpc('pode_nivel_protecao_avancado', {
      p_perfil: user.id,
    });
    if (podeAvancado !== true) {
      return json(
        { error: 'Para usares contrato+cartão, ativa primeiro os pagamentos nas Definições.' },
        403,
      );
    }
    const { data: conta } = await admin
      .from('contas_connect')
      .select('stripe_account_id')
      .eq('perfil_id', user.id)
      .maybeSingle();
    if (!conta?.stripe_account_id) {
      // Gate aberto sem conta seria um estado impossível — mas nunca fingimos.
      return json({ error: 'A tua conta de pagamentos ainda não está pronta.' }, 503);
    }
    stripeAccountId = conta.stripe_account_id as string;
  }

  // Nomes das partes para o texto do contrato.
  const [{ data: cliente }, { data: prof }] = await Promise.all([
    admin.from('clientes_convidados').select('nome, telefone').eq('id', c.cliente_convidado_id).maybeSingle(),
    admin.from('perfis').select('nome').eq('id', c.profissional_id).maybeSingle(),
  ]);
  if (!cliente) return json({ error: 'cliente do convite não encontrado' }, 404);

  // Anexos já registados (nível i: normalmente nenhum — gancho da Fatia B+).
  const { data: anexos } = await admin
    .from('anexos_convite')
    .select('nome_ficheiro, sha256, criado_em')
    .eq('contrato_id', c.id)
    .order('criado_em', { ascending: true });

  const dados = {
    profissional_nome: prof?.nome ?? 'Profissional',
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    servico: c.servico ?? null,
    data_inicio: c.data_inicio,
    data_fim: c.data_fim ?? null,
    valor_total: c.valor_total ?? null,
    sinal_valor: c.sinal_valor ?? null,
    pct_cancelamento: PCT_CANCELAMENTO,
    pct_caucao: PCT_CAUCAO,
    janela_x_meses: JANELA_X,
    nivel_protecao: NIVEL,
    anexos: anexos ?? [],
  };
  const contrato = await gerarContrato(dados);
  // Nível 2: o MANDATO nasce aqui (congela com o aceite, como as percentagens) —
  // P nomeado beneficiário, valores/datas concretos, ligado ao contrato pela ref.
  const mandato = NIVEL === 2 ? await gerarMandato(dados, hash8(contrato.hash)) : null;

  const { error } = await admin
    .from('contratos_convite')
    .update({
      estado: 'aguarda_assinatura',
      aceite_em: agora,
      nivel_protecao: NIVEL,
      pct_caucao: PCT_CAUCAO,
      pct_cancelamento: PCT_CANCELAMENTO,
      janela_x_meses: JANELA_X,
      contrato_texto: contrato.texto,
      contrato_hash: contrato.hash,
      contrato_versao: contrato.versao,
      contrato_gerado_em: agora,
      ...(mandato ? { mandato_texto: mandato.texto, mandato_hash: mandato.hash } : {}),
      ...(stripeAccountId ? { stripe_account_id: stripeAccountId } : {}),
      // TODO(prova+): selo temporal qualificado (RFC 3161) sobre o hash — presunção
      // legal de data/integridade (art. 41.º/2 eIDAS). Exige QTSP da Trusted List
      // do GNS; por agora fica só o nosso hash + carimbo (contrato_gerado_em).
    })
    .eq('id', c.id)
    .eq('estado', 'formulario_recebido');
  if (error) return json({ error: 'não consegui aceitar o convite' }, 500);

  // Magic link para o convidado voltar a assinar (72h). Guarda-se só o hash.
  const linkToken = novoToken();
  await admin.from('magic_links_convite').insert({
    token_hash: await sha256(linkToken),
    contrato_id: c.id,
    finalidade: 'assinar',
    expira_em: new Date(Date.now() + 72 * 3_600_000).toISOString(),
  });
  // O convidado abre o contrato pela sua página (identificada pelo token_publico
  // que já é a sua porta de leitura) e AGE com o token do magic link (?ml=).
  const link = `${SITE_URL}/c/${c.token_publico}?ml=${linkToken}`;

  await admin.from('eventos_convite').insert({
    contrato_id: c.id,
    tipo: 'aceite',
    payload: {
      por: user.id,
      nivel_protecao: NIVEL,
      pct_caucao: PCT_CAUCAO,
      pct_cancelamento: PCT_CANCELAMENTO,
      contrato_hash: contrato.hash,
      contrato_versao: contrato.versao,
      ...(mandato ? { mandato_hash: mandato.hash, mandato_versao: mandato.versao } : {}),
      ...(stripeAccountId ? { stripe_account_id: stripeAccountId } : {}),
    },
  });
  // Mensagem do LINK (texto livre — o template do OTP não leva URL). Enviada por
  // SMS ao convidado para que volte a assinar. Ver _shared/bird.ts.
  const mensagemLink =
    `${prof?.nome ?? 'O teu profissional'} preparou o teu contrato no Honra. Lê com calma e assina aqui: ${link} (válido 72h)`;

  // Envio GRACIOSO: se o SMS falhar, a aceitação NÃO falha — a app diz ao
  // profissional "partilha tu o link". Em modo de teste não se gasta SMS.
  let sms_enviado = false;
  let sms_motivo: string | undefined;
  if (MODO_TESTE) {
    sms_motivo = 'modo_teste';
  } else {
    const envio = await enviarSmsTexto(cliente.telefone, mensagemLink);
    sms_enviado = envio.ok;
    if (!envio.ok) sms_motivo = envio.motivo;
  }

  await admin.from('eventos_convite').insert({
    contrato_id: c.id,
    tipo: 'sms_enviado',
    payload: {
      finalidade: 'assinar',
      mensagem: mensagemLink,
      telefone: cliente.telefone,
      enviado: sms_enviado,
      ...(sms_motivo ? { motivo: sms_motivo } : {}),
    },
  });

  return json({
    ok: true,
    estado: 'aguarda_assinatura',
    nivel_protecao: NIVEL,
    contrato_hash: contrato.hash,
    // A app usa sms_enviado para decidir se pede ao profissional que partilhe o
    // link ele próprio (false = não conseguimos enviar).
    sms_enviado,
    ...(sms_motivo ? { sms_motivo } : {}),
    // Devolve-se o link/mensagem (não expõe nada que o convidado não vá receber
    // por SMS). Útil para o profissional partilhar e para teste.
    magic_link: link,
    mensagem_link: mensagemLink,
  });
});
