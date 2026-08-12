// HONRA — Contrato-convite (Fatia E, camada 3): ARBITRAGEM (revisão humana).
// Só o resíduo he-said/she-said chega aqui: 'em_disputa' (o cliente contestou a
// falta, ou o silêncio venceu sem recibo de entrega do aviso). Um ADMIN decide.
//
// Deploy COM JWT (o admin está autenticado). Só is_admin passa.
//
//   { acao:'listar' }                          → as disputas abertas (para o ecrã).
//   { acao:'resolver', contrato_id, decisao }  → 'cobrar' | 'arquivar':
//       'cobrar'   → dá razão ao PROFISSIONAL (tem prova de no-show): cobra a
//         cláusula penal (hold vivo → captura; senão MIT direta). Falha → dunning.
//       'arquivar' → dá razão ao CLIENTE (o DEFAULT: se P não tem prova de
//         no-show e o cliente afirma presença, NÃO se captura) → 'disputa_arquivada'.
//
// Regra do default (desenho, camada 3): na dúvida, protege o cliente.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  capturarHold,
  classificarDecline,
  cobrarMit,
  feePenalizacao,
  libertarHold,
  registarMetrica,
} from '../_shared/pagamentos.ts';

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
function eur(centimos: number): string {
  return `${(centimos / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} €`;
}

const COLUNAS =
  'id, estado, nivel_protecao, contrato_hash, servico, data_inicio, valor_total, pct_caucao, ' +
  'stripe_account_id, stripe_customer_id, payment_method_id, funding_cartao, hold_decisao, ' +
  'hold_id, hold_capture_before, prova_encontro_em, captura_proposta_em, consentimento_resultado, ' +
  'consentimento_aviso_entregue, contestacao_texto, profissional_id, cliente_convidado_id';

type Contrato = {
  id: string;
  estado: string;
  nivel_protecao: number | null;
  contrato_hash: string | null;
  servico: string | null;
  data_inicio: string;
  valor_total: number | null;
  pct_caucao: number;
  stripe_account_id: string | null;
  stripe_customer_id: string | null;
  payment_method_id: string | null;
  funding_cartao: string | null;
  hold_decisao: string | null;
  hold_id: string | null;
  hold_capture_before: string | null;
  prova_encontro_em: string | null;
  captura_proposta_em: string | null;
  consentimento_resultado: string | null;
  consentimento_aviso_entregue: boolean;
  contestacao_texto: string | null;
  profissional_id: string;
  cliente_convidado_id: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'método não suportado' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'não autenticado' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Só ADMIN passa (mesmo padrão do profissao-rever).
  const { data: eu } = await admin.from('perfis').select('is_admin').eq('id', user.id).maybeSingle();
  if (!(eu as { is_admin?: boolean } | null)?.is_admin)
    return json({ error: 'sem permissão' }, 403);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    return json({ error: 'corpo inválido' }, 400);
  }
  const acao = String(body.acao ?? '').trim();
  const agora = new Date().toISOString();

  // ---------- 'listar' → as disputas abertas (para o ecrã admin). ----------
  if (acao === 'listar') {
    const { data: disputas } = await admin
      .from('contratos_convite')
      .select(COLUNAS + ', cliente:clientes_convidados(nome), profissional:perfis(nome)')
      .eq('estado', 'em_disputa')
      .order('captura_proposta_em', { ascending: true });
    return json({ ok: true, disputas: disputas ?? [] });
  }

  if (acao !== 'resolver') return json({ error: 'ação inválida' }, 400);
  const decisao = String(body.decisao ?? '').trim();
  if (decisao !== 'cobrar' && decisao !== 'arquivar')
    return json({ error: 'decisão inválida' }, 400);
  const nota = typeof body.nota === 'string' ? body.nota.trim().slice(0, 1000) : null;

  const { data: cData } = await admin.from('contratos_convite').select(COLUNAS)
    .eq('id', String(body.contrato_id ?? '')).maybeSingle();
  if (!cData) return json({ error: 'contrato não encontrado' }, 404);
  const c = cData as unknown as Contrato;
  if (c.estado !== 'em_disputa')
    return json({ error: 'este contrato não está em disputa' }, 409);

  const hash8 = (c.contrato_hash ?? '').slice(0, 8);
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const valor = c.valor_total != null ? Math.round((c.valor_total * c.pct_caucao) / 100) : null;

  // ---------- 'arquivar' → protege o cliente (default). Sem cobrança. ----------
  if (decisao === 'arquivar') {
    // Se por acaso ainda houvesse um hold vivo, liberta-se (nunca fica preso).
    if (c.hold_id && c.hold_decisao === 'hold_armado' && stripeKey && c.stripe_account_id) {
      await libertarHold(stripeKey, c.stripe_account_id, c.hold_id);
    }
    const { error: eUp } = await admin.from('contratos_convite')
      .update({ estado: 'disputa_arquivada', resolvido_em: agora, quem_falhou: null })
      .eq('id', c.id).eq('estado', 'em_disputa');
    if (eUp) return json({ error: 'não foi possível arquivar. Tenta de novo.' }, 500);
    await admin.from('eventos_convite').insert({
      contrato_id: c.id, tipo: 'disputa_resolvida',
      payload: { por: 'admin', admin_id: user.id, decisao: 'arquivar', ...(nota ? { nota } : {}) },
    });
    await registarMetrica(admin, {
      evento: 'disputa_arquivada', contrato_id: c.id, profissional_id: c.profissional_id, valor,
      payload: { admin: user.id },
    });
    await admin.rpc('criar_aviso_convite', {
      p_perfil: c.profissional_id, p_tipo: 'convite_checkpoint', p_contrato: c.id,
      p_titulo: 'Disputa arquivada',
      p_corpo: `A revisão do Honra fechou a disputa do contrato (ref ${hash8}) sem cobrança — sem prova de falta, o cliente é protegido. Nada foi cobrado.`,
      p_prazo: null, p_urgente: false,
    });
    return json({ ok: true, estado: 'disputa_arquivada', cobrado: false });
  }

  // ---------- 'cobrar' → dá razão ao profissional (tem prova). ----------
  if (!stripeKey || !c.stripe_account_id)
    return json({ error: 'Pagamentos indisponíveis para esta cobrança.' }, 503);
  if (valor == null || valor <= 0)
    return json({ error: 'este contrato não tem valor computável para cobrar' }, 409);

  const fee = feePenalizacao(valor);
  let resultado: { ok: boolean; pi_id: string | null; decline_code: string | null; via: 'captura' | 'mit' } | null = null;

  const temHold = !!c.hold_id && c.hold_decisao === 'hold_armado';
  if (temHold) {
    const dentro = !c.hold_capture_before || Date.parse(c.hold_capture_before) > Date.now();
    if (dentro) {
      const cap = await capturarHold({ stripeKey, conta: c.stripe_account_id, piId: c.hold_id!, valor, fee });
      if (cap.ok) {
        resultado = { ok: true, pi_id: cap.pi_id, decline_code: null, via: 'captura' };
        await registarMetrica(admin, { evento: 'captura_ok', contrato_id: c.id, profissional_id: c.profissional_id, valor, fee_centimos: fee, funding: cap.funding ?? c.funding_cartao, rede: cap.rede, pi_id: cap.pi_id, payload: { motivo: 'arbitragem_pro' } });
      } else {
        await libertarHold(stripeKey, c.stripe_account_id, c.hold_id!);
      }
    } else {
      await libertarHold(stripeKey, c.stripe_account_id, c.hold_id!);
    }
  }
  if ((!resultado || !resultado.ok) && c.stripe_customer_id && c.payment_method_id) {
    const mit = await cobrarMit({ stripeKey, conta: c.stripe_account_id, customer: c.stripe_customer_id, paymentMethod: c.payment_method_id, valor, fee, descricao: `Honra — cláusula penal (arbitragem, ref ${hash8})`, contratoId: c.id, motivo: 'incumprimento_cliente' });
    resultado = { ok: mit.ok, pi_id: mit.pi_id, decline_code: mit.decline_code, via: 'mit' };
    await registarMetrica(admin, { evento: mit.ok ? 'mit_ok' : 'mit_falhou', contrato_id: c.id, profissional_id: c.profissional_id, valor, ...(mit.ok ? { fee_centimos: fee } : {}), decline_code: mit.decline_code, funding: mit.funding ?? c.funding_cartao, rede: mit.rede, pi_id: mit.pi_id, payload: { motivo: 'arbitragem_pro' } });
  }

  await admin.from('eventos_convite').insert({
    contrato_id: c.id, tipo: 'disputa_resolvida',
    payload: { por: 'admin', admin_id: user.id, decisao: 'cobrar', cobrado: resultado?.ok === true, via: resultado?.via ?? 'nenhuma', valor_centimos: valor, ...(nota ? { nota } : {}) },
  });

  if (resultado?.ok) {
    await registarMetrica(admin, { evento: 'fee_cobrada', contrato_id: c.id, profissional_id: c.profissional_id, valor, fee_centimos: fee, pi_id: resultado.pi_id });
    const { error: eUp } = await admin.from('contratos_convite')
      .update({ estado: 'incumprido_cliente', quem_falhou: 'cliente', cobranca_id: resultado.pi_id, cobranca_motivo: 'incumprimento_cliente', cobranca_valor: valor, resolvido_em: agora })
      .eq('id', c.id).eq('estado', 'em_disputa');
    if (eUp) return json({ ok: true, estado: 'em_disputa', cobrado: true, aviso: 'cobrado; estado por reconciliar' });
    await admin.rpc('criar_aviso_convite', {
      p_perfil: c.profissional_id, p_tipo: 'convite_cobranca', p_contrato: c.id,
      p_titulo: 'Disputa decidida a teu favor',
      p_corpo: `A revisão deu-te razão no contrato (ref ${hash8}). A cláusula penal de ${eur(valor)} foi cobrada para a tua conta (fee do Honra: ${eur(fee)}).`,
      p_prazo: null, p_urgente: false,
    });
    return json({ ok: true, estado: 'incumprido_cliente', cobrado: true, via: resultado.via, valor_centimos: valor, fee_centimos: fee });
  }

  // Cobrança falhou → cobranca_pendente + dunning (o resolver assume).
  const classe = classificarDecline(resultado?.decline_code);
  const { error: ePend } = await admin.from('contratos_convite')
    .update({ estado: 'cobranca_pendente', quem_falhou: 'cliente', cobranca_id: resultado?.pi_id ?? null, cobranca_motivo: 'incumprimento_cliente', cobranca_valor: valor, cobranca_iniciada_em: agora, cobranca_tentativas: 1, cobranca_ultimo_decline: resultado?.decline_code ?? null, cobranca_proxima_em: classe === 'soft' ? new Date(Date.now() + 86_400_000).toISOString() : null })
    .eq('id', c.id).eq('estado', 'em_disputa');
  if (ePend) return json({ error: 'não foi possível registar a cobrança. Tenta de novo.' }, 500);
  return json({ ok: true, estado: 'cobranca_pendente', cobrado: false, decline_code: resultado?.decline_code ?? null });
});
