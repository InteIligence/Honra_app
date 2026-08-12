// HONRA — Contrato-convite (Fatia E): o código ROTATIVO de comparência.
//
// A prova-de-encontro (co-presença) precisa de um sinal que NENHUM lado consiga
// forjar sozinho: o profissional mostra um código de 6 dígitos que ROTAcapture ~a
// cada 45s, derivado de um segredo do SERVIDOR (o P nunca o vê — só o servidor o
// gera e o valida) e ligado ao `contrato_id`. O cliente, presente, lê o código
// do ecrã do P e submete-o com um OTP fresco (que só chega ao telemóvel dele).
//   • o P sozinho não tem o OTP do cliente;
//   • o cliente sozinho não consegue precomputar o código (rotativo + segredo);
//   • a rotação mata o replay (um código velho não vale no ciclo seguinte).
//
// Determinístico: o MESMO segredo + contrato + janela → o MESMO código. O
// servidor valida a janela atual E a anterior (tolera latência de submissão e
// desvio de relógio ~1 rotação). Sem segredos em logs — a chave entra por
// parâmetro.
//
// Offline-tolerante (desenho): o P pode pré-carregar um token assinado e gerar o
// código sem rede; o cliente submete quando voltar a ter rede (dentro da janela
// do evento, ainda com o mesmo código se a rotação não passou). Nesta fatia o P
// obtém o código por poll à Edge Function; o pré-carregamento fica documentado.

const ROTACAO_S = 45; // ~30–60s (desenho); 45s é o meio-termo

/** A janela de rotação atual (índice inteiro do bloco de 45s em tempo UTC). */
export function janelaComparencia(agoraMs: number = Date.now()): number {
  return Math.floor(agoraMs / 1000 / ROTACAO_S);
}

/** Segundos que faltam até o código rodar (para a UI mostrar a contagem). */
export function segundosAteRodar(agoraMs: number = Date.now()): number {
  return ROTACAO_S - Math.floor(agoraMs / 1000) % ROTACAO_S;
}

/**
 * O código de 6 dígitos para (contrato, janela), derivado por HMAC-SHA256 do
 * segredo do servidor. Determinístico e não invertível sem o segredo.
 */
export async function codigoComparencia(
  segredo: string,
  contratoId: string,
  janela: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${contratoId}:${janela}`));
  const b = new Uint8Array(sig);
  // 31 bits dos 4 primeiros bytes → 6 dígitos (padrão HOTP truncado, simplificado).
  const num = (((b[0] & 0x7f) << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  return String(num % 1_000_000).padStart(6, '0');
}

/**
 * Valida um código submetido pelo cliente contra a janela ATUAL e a ANTERIOR.
 * Comparação em tempo constante (evita timing oracle sobre o código).
 */
export async function validarCodigoComparencia(
  segredo: string,
  contratoId: string,
  submetido: string,
  agoraMs: number = Date.now(),
): Promise<boolean> {
  const limpo = (submetido ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(limpo)) return false;
  const j = janelaComparencia(agoraMs);
  const validos = await Promise.all([
    codigoComparencia(segredo, contratoId, j),
    codigoComparencia(segredo, contratoId, j - 1),
  ]);
  return validos.some((v) => tempoConstanteIgual(v, limpo));
}

function tempoConstanteIgual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
