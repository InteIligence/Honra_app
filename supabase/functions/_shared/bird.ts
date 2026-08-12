// HONRA — envio de SMS via Bird (plataforma EU). Segredo: BIRD_ACCESS_KEY.
// Reutiliza o padrão PROVADO em verificar-contacto: a API ENVIA um template
// onde NÓS pomos o parâmetro; o código é gerado e validado por nós.
//
// Duas rotas, o MESMO endpoint/auth/originator:
//   • enviarOtpBird  → `template` (PROVADO ao vivo: 'bird_otp_verification', param `code`).
//   • enviarSmsTexto → `body` de TEXTO LIVRE (para o LINK de assinatura e lembretes,
//     que o template do OTP não consegue exprimir — não leva URL nem texto-livre).
//
// Porquê texto livre: a investigação concluiu que NÃO dá para criar templates de
// LINK via API (a chave é de envio, não de gestão; os templates de sistema têm
// variáveis tipadas, sem texto-livre/URL). A saída é enviar o corpo como texto.
//
// ⚠️ SCHEMA (verificado na doc da Bird — Channels API / api-reference/messaging):
// o modelo de mensagem da Bird tem SEMPRE um destinatário `receiver` e DEPOIS ou
// um `template` OU um `body`. O corpo de TEXTO é `{ type:'text', text:{ text } }`.
// O destinatário canónico é `receiver: { contacts: [{ identifierValue:'+351…' }] }`.
// NÃO existe campo `to` na doc: o `to` de topo é só um atalho que a rota
// eu1.platform.bird.com/v1/sms/messages aceita no caminho `template` (por isso o OTP
// passa). No caminho `body` a rota valida contra o modelo completo e exige o
// `receiver` canónico — foi o que gerou os "3 validation errors" do envio anterior
// com `{ to, body }`. Por isso enviarSmsTexto usa `receiver.contacts[].identifierValue`.
// Auth/originator idênticos ao OTP (Bearer + sender por defeito da conta).

const BIRD_ENDPOINT = 'https://eu1.platform.bird.com/v1/sms/messages';
const BIRD_OTP_TEMPLATE = 'bird_otp_verification';

export function e164Valido(t: unknown): t is string {
  return typeof t === 'string' && /^\+[1-9]\d{7,14}$/.test(t);
}

// ── O PORTEIRO DO CANAL (082) ──────────────────────────────────────────────
// SEIS funções mandam SMS por aqui (verificar-contacto, convite-otp,
// convite-checkpoint, convite-decidir, convite-cancelar, resolver-convites).
// Pôr o teto em cada uma seria pôr seis fechaduras na mesma porta e esquecer
// uma — e a que se esquecesse era a que ficava aberta. Vive AQUI, no sítio por
// onde todas passam.
//
// O teto é por NÚMERO DE DESTINO, e a razão é a que mais importa: a maioria
// destes SMS vai para pessoas que NÃO têm conta no Honra. Sem este travão, a
// casa podia ser o instrumento de quem quer martelar o telemóvel de um
// estranho, e essa pessoa nem teria onde se queixar — para ela, o remetente
// somos nós.
//
// O teto por REMETENTE (a fatura da casa) fica em quem sabe quem está a pedir;
// aqui só se sabe quem recebe.
const TETO_DIA_POR_NUMERO = 5;

async function podeEnviarPara(numero: string): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL');
  const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  // Sem credenciais de serviço não há como contar. Falha ABERTO de propósito:
  // um contrato por assinar bloqueado por um problema nosso de configuração
  // seria pior do que um SMS a mais. O teto por remetente continua de pé.
  if (!url || !chave) return true;

  try {
    const r = await fetch(`${url}/rest/v1/rpc/registar_sms`, {
      method: 'POST',
      headers: {
        apikey: chave,
        Authorization: `Bearer ${chave}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_chave: `n:${numero}`, p_teto: TETO_DIA_POR_NUMERO }),
    });
    if (!r.ok) return true;
    return (await r.json()) !== false;
  } catch {
    return true;
  }
}

/** Envia o OTP (código de 6 dígitos) pelo template provado. Devolve ok/detalhe. */
export async function enviarOtpBird(
  to: string,
  codigo: string,
): Promise<{ ok: boolean; status: number; detalhe?: string }> {
  if (!(await podeEnviarPara(to)))
    return { ok: false, status: 429, motivo: 'teto diario de SMS para este numero' };

  const key = Deno.env.get('BIRD_ACCESS_KEY');
  if (!key) return { ok: false, status: 503, detalhe: 'BIRD_ACCESS_KEY em falta' };

  const res = await fetch(BIRD_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to,
      template: { name: BIRD_OTP_TEMPLATE, parameters: { code: codigo } },
    }),
  });
  if (!res.ok) {
    const detalhe = await res.text().catch(() => '');
    console.error('bird otp send falhou', res.status, detalhe.slice(0, 300));
    return { ok: false, status: res.status, detalhe: detalhe.slice(0, 300) };
  }
  return { ok: true, status: res.status };
}

/**
 * Envia um SMS de TEXTO LIVRE (não-template) pela MESMA rota/auth/originator do OTP.
 * Para a mensagem do LINK de assinatura e lembretes — texto que o template do OTP
 * não exprime.
 *
 * Falha SEMPRE graciosamente: devolve { ok:false, motivo } em vez de rebentar, para
 * que quem chama NUNCA faça a operação principal (aceite/assinatura) falhar por um
 * SMS. Nunca imprime a BIRD_ACCESS_KEY (só a classe do erro / o corpo da Bird).
 *
 * Schema (ver comentário no topo): `receiver.contacts[].identifierValue` + `body`
 * de texto. A única parte por confirmar ao vivo é se esta rota específica aceita o
 * `receiver` canónico (a doc confirma o schema; só um envio real prova a rota).
 */
export async function enviarSmsTexto(
  to: string,
  texto: string,
): Promise<{ ok: boolean; status: number; motivo?: string }> {
  if (!e164Valido(to)) return { ok: false, status: 400, motivo: 'telefone inválido (E.164)' };
  if (!texto || !texto.trim()) return { ok: false, status: 400, motivo: 'texto vazio' };

  if (!(await podeEnviarPara(to)))
    return { ok: false, status: 429, motivo: 'teto diario de SMS para este numero' };

  const key = Deno.env.get('BIRD_ACCESS_KEY');
  if (!key) return { ok: false, status: 503, motivo: 'BIRD_ACCESS_KEY em falta' };

  let res: Response;
  try {
    res = await fetch(BIRD_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Destinatário canónico da Bird (não o atalho `to`, que a rota só aceita no
        // caminho `template`). O caminho `body` valida o modelo completo → exige isto.
        receiver: { contacts: [{ identifierValue: to }] },
        // Corpo de TEXTO LIVRE em vez de `template`. Schema de mensagem da Bird:
        // body.type = 'text' e body.text.text = a frase JÁ preenchida por nós.
        body: { type: 'text', text: { text: texto } },
      }),
    });
  } catch (e) {
    // Erro de rede — nunca expõe a chave, só a classe do erro.
    return { ok: false, status: 0, motivo: `rede: ${e instanceof Error ? e.name : 'desconhecido'}` };
  }

  if (!res.ok) {
    const detalhe = await res.text().catch(() => '');
    console.error('bird texto send falhou', res.status, detalhe.slice(0, 300));
    return { ok: false, status: res.status, motivo: detalhe.slice(0, 200) || `HTTP ${res.status}` };
  }
  return { ok: true, status: res.status };
}
