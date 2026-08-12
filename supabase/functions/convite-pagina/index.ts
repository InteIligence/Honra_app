// HONRA — Contrato-convite: o ESTADO público para a página do convidado.
// Duas leituras, uma porta (o convidado nunca lê a BD diretamente):
//   • modo CARTÃO  ({ perfil }) — devolve o Honra Card público do profissional
//     (a prova que abre a escada de confiança). Só campos públicos.
//   • modo CONTRATO ({ token }) — devolve o estado do contrato-convite do C
//     (o que ele próprio submeteu) + a linha do tempo. Nunca dá dados a mais.
//
// Pública (deploy com --no-verify-jwt). Leitura com service_role; devolve
// exclusivamente o que a finalidade permite.

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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cartão público do profissional — SÓ o que já é visível/partilhável (a mesma
// prova do honra-card): nome, papel, cidade, avatar, índice, negócios, e as
// abas do selo verificadas. Nada privado (email/nif/telefone fora).
async function cartaoPublico(admin: ReturnType<typeof createClient>, id: string) {
  const { data: p } = await admin
    .from('perfis')
    .select('id, nome, papel, cidade, avatar, handle, indice_confianca, negocios_honrados')
    .eq('id', id)
    .maybeSingle();
  if (!p) return null;
  const { data: verifs } = await admin
    .from('verificacoes')
    .select('aba, estado')
    .eq('perfil_id', id);
  return {
    id: p.id,
    nome: p.nome,
    papel: p.papel,
    cidade: p.cidade,
    avatar: p.avatar,
    handle: p.handle,
    indice_confianca: p.indice_confianca,
    negocios_honrados: p.negocios_honrados,
    verificacoes: (verifs ?? []).filter((v) => v.estado === 'verificado').map((v) => v.aba),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    return json({ error: 'corpo inválido' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ===== Modo CONTRATO — { token } =====
  const tokenPub = body.token != null ? String(body.token).trim() : '';
  if (tokenPub) {
    const { data: c } = await admin
      .from('contratos_convite')
      .select(
        'id, profissional_id, estado, servico, data_inicio, data_fim, valor_total, moeda, ' +
          'sinal_valor, nivel_protecao, pct_cancelamento, pct_caucao, janela_x_meses, ' +
          'contrato_texto, contrato_hash, contrato_versao, ' +
          'mandato_texto, mandato_hash, mandato_aceite_em, cartao_gravado_em, ' +
          'aviso_resolucao_aceite_em, politica_cancel_aceite_em, ' +
          'prova_encontro_em, captura_proposta_em, captura_prazo_em, consentimento_resultado, ' +
          'formulario_em, aceite_em, assinado_em, resolvido_em',
      )
      .eq('token_publico', tokenPub)
      .maybeSingle();
    if (!c) return json({ error: 'convite não encontrado' }, 404);

    // O contrato (texto + hash) só se mostra depois de gerado (a partir do
    // aceite) e enquanto a relação existir — o convidado guarda este link como
    // "o seu contrato" (§8.1), incluindo depois de cancelado/honrado. Antes do
    // aceite, e nos fins sem contrato (recusado/expirado), é null.
    const mostrarContrato =
      !!c.contrato_texto &&
      !['formulario_recebido', 'recusado', 'formulario_expirado'].includes(c.estado);

    const cartao = await cartaoPublico(admin, c.profissional_id);
    return json({
      modo: 'contrato',
      profissional: cartao,
      contrato: {
        estado: c.estado,
        servico: c.servico,
        data_inicio: c.data_inicio,
        data_fim: c.data_fim,
        valor_total: c.valor_total,
        moeda: c.moeda,
        sinal_valor: c.sinal_valor,
        nivel_protecao: c.nivel_protecao,
        pct_cancelamento: c.pct_cancelamento,
        pct_caucao: c.pct_caucao,
        janela_x_meses: c.janela_x_meses,
        contrato_texto: mostrarContrato ? c.contrato_texto : null,
        contrato_hash: mostrarContrato ? c.contrato_hash : null,
        contrato_versao: mostrarContrato ? c.contrato_versao : null,
        // Fatia C-2 — o passo do cartão (nível ii): o mandato mostra-se com o
        // contrato (é lido e aceite ANTES do cartão); o carimbo do cartão diz à
        // página se o passo já foi dado.
        mandato_texto: mostrarContrato ? c.mandato_texto : null,
        mandato_aceite_em: c.mandato_aceite_em,
        cartao_gravado_em: c.cartao_gravado_em,
        aviso_resolucao_aceite_em: c.aviso_resolucao_aceite_em,
        politica_cancel_aceite_em: c.politica_cancel_aceite_em,
        // Fatia E — prova-de-encontro + janela de contestação.
        prova_encontro_em: c.prova_encontro_em,
        captura_proposta_em: c.captura_proposta_em,
        captura_prazo_em: c.captura_prazo_em,
        consentimento_resultado: c.consentimento_resultado,
        formulario_em: c.formulario_em,
        aceite_em: c.aceite_em,
        assinado_em: c.assinado_em,
        resolvido_em: c.resolvido_em,
      },
    });
  }

  // ===== Modo CARTÃO — { perfil } (id ou handle) =====
  const perfilRef = body.perfil != null ? String(body.perfil).trim() : '';
  if (!perfilRef) return json({ error: 'falta o profissional ou o token' }, 400);

  let id = perfilRef;
  if (!UUID.test(perfilRef)) {
    const { data: p } = await admin
      .from('perfis')
      .select('id')
      .eq('handle', perfilRef)
      .maybeSingle();
    if (!p) return json({ error: 'profissional não encontrado' }, 404);
    id = p.id as string;
  }

  const cartao = await cartaoPublico(admin, id);
  if (!cartao) return json({ error: 'profissional não encontrado' }, 404);

  // A prova antes do pedido: só se a identidade estiver verificada é que este
  // profissional pode receber convites (doc §2). Dizemo-lo com honestidade.
  const podeReceber = cartao.verificacoes.includes('identidade');
  return json({ modo: 'cartao', profissional: cartao, pode_receber: podeReceber });
});
