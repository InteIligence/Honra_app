// HONRA — Contrato-convite (Fatia E): PROVA-DE-ENCONTRO (co-presença).
// A camada 1 que blinda a fuga E: o cliente prova que se encontrou com o
// profissional, e com isso TRAVA o `nao_recebi` unilateral (checkpoint).
//
// Duas portas, uma função (deploy com --no-verify-jwt; o JWT valida-se à mão,
// como o convite-cancelar):
//   • PROFISSIONAL (JWT) — na janela do evento (D0±1):
//       { contrato_id }              → código ROTATIVO (6 dígitos + payload QR),
//         derivado de segredo do servidor, ligado ao contrato. O P mostra-o ao
//         cliente; a app faz poll para o manter fresco (~45s).
//       { acao:'link', contrato_id } → emite ao cliente um magic link
//         'comparencia' por SMS (Bird PARQUEADO — composto e registado; em teste
//         devolvido no corpo). O cliente abre-o para submeter a prova.
//   • CLIENTE (magic link 'comparencia'):
//       { acao:'codigo', token }               → envia-lhe um OTP fresco (SMS).
//       { acao:'provar', token, otp, codigo }  → valida OTP (telemóvel do cliente)
//         + código vivo (co-presença) → cunha `prova_encontro` (append-only) e
//         grava `prova_encontro_em` IMUTÁVEL. Ninguém cunha sozinho.
//
// Anti-forja: o P não tem o OTP do cliente; o cliente não precomputa o código
// (rotativo + segredo); a rotação mata o replay. Válido só em D0±1.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { sha256 } from '../_shared/contrato.ts';
import { enviarOtpBird, enviarSmsTexto } from '../_shared/bird.ts';
import { registarMetrica } from '../_shared/pagamentos.ts';
import {
  codigoComparencia,
  janelaComparencia,
  segundosAteRodar,
  validarCodigoComparencia,
} from '../_shared/comparencia.ts';
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
function novoToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://honraapp.com';
const MODO_TESTE = modoTeste();
// Segredo do código rotativo. Dedicado de preferência; se faltar, cai no service
// role key (sempre presente) — funciona em teste, mas documenta-se um segredo
// próprio (COMPARENCIA_SECRET) para produção.
function segredoComparencia(): string {
  return (
    Deno.env.get('COMPARENCIA_SECRET') ||
    Deno.env.get('RESOLVER_SECRET') ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

// Soma dias a uma data YYYY-MM-DD (UTC).
function dataMais(iso: string, dias: number): string {
  const dt = new Date(iso + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}
// A janela do evento (D0±1): hoje entre data_inicio−1 e (data_fim||data_inicio)+1.
function naJanelaDoEvento(dataInicio: string, dataFim: string | null, hoje: string): boolean {
  const fim = dataFim && dataFim > dataInicio ? dataFim : dataInicio;
  return hoje >= dataMais(dataInicio, -1) && hoje <= dataMais(fim, 1);
}

// Estados vivos em que a prova-de-encontro faz sentido (chegam ao evento).
const ESTADOS_COMPARENCIA = ['assinado', 'caucionado', 'sem_caucao', 'cartao_falhou'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'método não suportado' }, 405);

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
  const agora = new Date().toISOString();
  const hoje = agora.slice(0, 10);

  // ================= PORTA DO PROFISSIONAL (JWT) =================
  if (body.contrato_id != null) {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'não autenticado' }, 401);

    const { data: c } = await admin
      .from('contratos_convite')
      .select(
        'id, profissional_id, cliente_convidado_id, estado, token_publico, contrato_hash, ' +
          'data_inicio, data_fim, prova_encontro_em',
      )
      .eq('id', String(body.contrato_id))
      .maybeSingle();
    if (!c) return json({ error: 'convite não encontrado' }, 404);
    if (c.profissional_id !== user.id) return json({ error: 'este contrato não é teu' }, 403);
    if (!ESTADOS_COMPARENCIA.includes(c.estado))
      return json({ error: 'este contrato não está num estado de comparência' }, 409);
    if (!naJanelaDoEvento(c.data_inicio, c.data_fim, hoje))
      return json({ error: 'a comparência só se prova na janela do evento' }, 409);
    if (c.prova_encontro_em)
      return json({ ok: true, ja_provado: true, prova_encontro_em: c.prova_encontro_em });

    // --- 'link': emitir ao cliente o magic link de comparência por SMS. ---
    if (String(body.acao ?? '') === 'link') {
      const ha45s = new Date(Date.now() - 45_000).toISOString();
      const { count } = await admin
        .from('magic_links_convite')
        .select('id', { count: 'exact', head: true })
        .eq('contrato_id', c.id)
        .eq('finalidade', 'comparencia')
        .gte('criado_em', ha45s);
      if ((count ?? 0) > 0)
        return json({ error: 'Acabámos de enviar um link. Aguarda uns segundos.' }, 429);

      const linkToken = novoToken();
      const { error } = await admin.from('magic_links_convite').insert({
        token_hash: await sha256(linkToken),
        contrato_id: c.id,
        finalidade: 'comparencia',
        expira_em: new Date(Date.now() + 24 * 3_600_000).toISOString(), // válido o dia do evento
      });
      if (error) return json({ error: 'não foi possível gerar o link' }, 500);

      const url = `${SITE_URL}/c/${c.token_publico}?ml=${linkToken}&fin=comparencia`;
      const hash8 = (c.contrato_hash ?? '').slice(0, 8);
      const mensagem =
        `Estás com o profissional? Confirma o encontro (ref ${hash8}) e digita o código que ele te mostra: ${url}`;
      let sms_enviado = false;
      let sms_motivo: string | undefined;
      if (MODO_TESTE) {
        sms_motivo = 'modo_teste';
      } else {
        const { data: cli } = await admin
          .from('clientes_convidados')
          .select('telefone')
          .eq('id', c.cliente_convidado_id)
          .maybeSingle();
        if (!cli) sms_motivo = 'cliente_em_falta';
        else {
          const envio = await enviarSmsTexto(cli.telefone, mensagem);
          sms_enviado = envio.ok;
          if (!envio.ok) sms_motivo = envio.motivo;
        }
      }
      await admin.from('eventos_convite').insert({
        contrato_id: c.id,
        tipo: 'sms_enviado',
        payload: { finalidade: 'comparencia', mensagem, enviado: sms_enviado, ...(sms_motivo ? { falha: sms_motivo } : {}) },
      });
      return json({ enviado: true, sms_enviado, ...(MODO_TESTE ? { magic_link: url } : {}) });
    }

    // --- (por omissão) devolver o código ROTATIVO ao P (para mostrar/QR). ---
    const janela = janelaComparencia();
    const codigo = await codigoComparencia(segredoComparencia(), c.id, janela);
    // Payload do QR: um deep link que pré-preenche o código na página do cliente.
    const qr_payload = `${SITE_URL}/c/${c.token_publico}?fin=comparencia&cod=${codigo}`;
    return json({
      ok: true,
      codigo,
      qr_payload,
      segundos_ate_rodar: segundosAteRodar(),
      janela_valida: true,
    });
  }

  // ================= PORTA DO CLIENTE (magic link 'comparencia') =================
  const token = String(body.token ?? '').trim();
  if (!token) return json({ error: 'falta o link' }, 400);
  const { data: link } = await admin
    .from('magic_links_convite')
    .select('id, contrato_id, finalidade, expira_em, usado_em')
    .eq('token_hash', await sha256(token))
    .maybeSingle();
  if (!link || link.finalidade !== 'comparencia')
    return json({ error: 'Link inválido.', pode_renovar: true }, 401);
  if (new Date(link.expira_em).getTime() < Date.now())
    return json({ error: 'Este link expirou. Pede um novo ao profissional.', pode_renovar: true }, 410);

  const { data: c } = await admin
    .from('contratos_convite')
    .select('id, estado, cliente_convidado_id, contrato_hash, data_inicio, data_fim, prova_encontro_em')
    .eq('id', link.contrato_id)
    .maybeSingle();
  if (!c) return json({ error: 'convite não encontrado' }, 404);
  if (c.prova_encontro_em)
    return json({ ok: true, ja_provado: true });
  if (!ESTADOS_COMPARENCIA.includes(c.estado))
    return json({ error: 'este contrato não está num estado de comparência' }, 409);
  if (!naJanelaDoEvento(c.data_inicio, c.data_fim, hoje))
    return json({ error: 'a comparência só se prova na janela do evento' }, 409);

  const { data: cliente } = await admin
    .from('clientes_convidados')
    .select('telefone')
    .eq('id', c.cliente_convidado_id)
    .maybeSingle();
  if (!cliente) return json({ error: 'cliente do convite não encontrado' }, 404);

  const acao = String(body.acao ?? '').trim();

  // --- 'codigo': gerar e enviar o OTP fresco ao cliente. ---
  if (acao === 'codigo') {
    const { data: atual } = await admin
      .from('otp_convidado')
      .select('enviado_em')
      .eq('contrato_id', c.id)
      .maybeSingle();
    if (atual && Date.now() - new Date(atual.enviado_em).getTime() < 45_000)
      return json({ error: 'Aguarda uns segundos antes de pedir um novo código.' }, 429);

    const codigo = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
    const { error: erroGuarda } = await admin.from('otp_convidado').upsert({
      contrato_id: c.id,
      cliente_convidado_id: c.cliente_convidado_id,
      telefone: cliente.telefone,
      codigo_hash: await sha256(codigo),
      expira_em: new Date(Date.now() + 10 * 60_000).toISOString(),
      tentativas: 0,
      enviado_em: agora,
    });
    if (erroGuarda) return json({ error: 'Não foi possível iniciar a confirmação. Tenta de novo.' }, 500);

    if (!MODO_TESTE) {
      const envio = await enviarOtpBird(cliente.telefone, codigo);
      if (!envio.ok) {
        await admin.from('otp_convidado').delete().eq('contrato_id', c.id);
        return json({ error: 'Não foi possível enviar o código. Confirma o número e tenta de novo.' }, 400);
      }
    }
    await admin.from('eventos_convite').insert({
      contrato_id: c.id,
      tipo: 'sms_enviado',
      payload: { finalidade: 'comparencia_otp', enviado: !MODO_TESTE },
    });
    return json({ enviado: true, ...(MODO_TESTE ? { codigo_teste: codigo } : {}) });
  }

  // --- 'provar': validar OTP (cliente) + código vivo (co-presença) → cunhar. ---
  if (acao !== 'provar') return json({ error: 'ação inválida' }, 400);

  const otp = String(body.otp ?? '').trim();
  const codigoComp = String(body.codigo ?? '').trim();
  if (!/^\d{6}$/.test(otp)) return json({ error: 'Indica o código de 6 dígitos que recebeste por SMS.' }, 400);
  if (!/^\d{6}$/.test(codigoComp.replace(/\s/g, '')))
    return json({ error: 'Digita o código de 6 dígitos que o profissional te mostra.' }, 400);

  // OTP do cliente (telemóvel dele) — trava força-bruta.
  const { data: otpRow } = await admin
    .from('otp_convidado')
    .select('codigo_hash, expira_em, tentativas')
    .eq('contrato_id', c.id)
    .maybeSingle();
  if (!otpRow) return json({ error: 'Pede primeiro o código por SMS.' }, 400);
  if (new Date(otpRow.expira_em).getTime() < Date.now())
    return json({ error: 'O código por SMS expirou. Pede um novo.' }, 410);
  if ((otpRow.tentativas ?? 0) >= 5) {
    await admin.from('otp_convidado').delete().eq('contrato_id', c.id);
    return json({ error: 'Demasiadas tentativas. Pede um novo código.' }, 429);
  }
  if (otpRow.codigo_hash !== (await sha256(otp))) {
    await admin.from('otp_convidado').update({ tentativas: (otpRow.tentativas ?? 0) + 1 }).eq('contrato_id', c.id);
    return json({ error: 'Código por SMS errado.' }, 401);
  }

  // Código vivo de co-presença (janela atual ou anterior).
  const coPresente = await validarCodigoComparencia(segredoComparencia(), c.id, codigoComp);
  if (!coPresente)
    return json({ error: 'O código do profissional não confere. Confirma que é o que aparece no ecrã dele agora.' }, 401);

  const ip =
    (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    null;

  // Cunhar a prova — grava prova_encontro_em (IMUTÁVEL) só se ainda nula.
  const { error: eUp } = await admin
    .from('contratos_convite')
    .update({ prova_encontro_em: agora })
    .eq('id', c.id)
    .is('prova_encontro_em', null);
  if (eUp) return json({ error: 'não foi possível registar a comparência. Tenta de novo.' }, 500);

  await admin.from('otp_convidado').delete().eq('contrato_id', c.id);
  await admin.from('magic_links_convite').update({ usado_em: agora }).eq('id', link.id);
  await admin.from('eventos_convite').insert({
    contrato_id: c.id,
    tipo: 'prova_encontro',
    ip,
    user_agent: req.headers.get('user-agent'),
    payload: { por: 'cliente', metodo: 'otp+codigo_rotativo', prova_encontro_em: agora },
  });
  await registarMetrica(admin, {
    evento: 'prova_encontro',
    contrato_id: c.id,
    payload: { por: 'cliente' },
  });

  return json({ ok: true, provado: true, prova_encontro_em: agora });
});
