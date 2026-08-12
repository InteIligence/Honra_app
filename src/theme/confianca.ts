/**
 * A CONFIANÇA — a lei, num sítio só.
 *
 * Estava escrita em TRÊS sítios: no componente `Confianca`, e duas vezes dentro
 * do `prestigio.ts` (no cálculo do escalão e nos requisitos do próximo). Três
 * cópias da mesma regra é como as regras se perdem: muda-se uma, esquecem-se as
 * outras, e a app passa a dizer números diferentes da mesma pessoa em ecrãs
 * diferentes.
 *
 * Vive no `theme` porque é daqui que tanto os componentes como o prestígio
 * podem importar sem inverter a direção das dependências.
 *
 * A LEI:
 *   · toda a gente começa em 30% — ninguém nasce suspeito;
 *   · cada negócio HONRADO vale +5;
 *   · cada falha à palavra vale −10 (o dobro: custa mais falhar do que cumpre
 *     compensar, e é isso que faz a palavra pesar);
 *   · cada encontro COMBINADO cumprido vale +2, e falhado −2 (078). Aparecer
 *     não é o mesmo que cumprir um trabalho — por isso não vale o mesmo — mas
 *     faltar tem de custar alguma coisa;
 *   · trava entre 0 e 100.
 *
 * NÃO vem das estrelas das críticas. Isso é opinião; isto é conduta.
 */
export const CONFIANCA_BASE = 30;
export const POR_HONRADO = 5;
export const POR_FALHA = 10;
export const POR_COMBINADO = 2;

export type SinaisConfianca = {
  honrados?: number | null;
  falhados?: number | null;
  combinados?: number | null;
  combinadosFalhados?: number | null;
};

/**
 * QUANTOS HONRADOS UMA FALHA LEVA CONSIGO (Vítor, 01/08).
 *
 * Vive aqui e não no `prestigio.ts` porque as duas leis precisam dele e é este
 * o ficheiro de baixo — o prestígio importa daqui, nunca ao contrário.
 */
export const HONRADOS_POR_FALHA = 2;

/** As honras que contam: o bruto menos duas por cada falha. Nunca abaixo de 0. */
export function honrasEfetivas(honrados?: number | null, falhados?: number | null): number {
  return Math.max(0, (honrados ?? 0) - HONRADOS_POR_FALHA * (falhados ?? 0));
}

/**
 * A percentagem de Confiança, 0–100. Aceita tudo em falta — sem sinal, 30%.
 *
 * ── PORQUE CONTA AS HONRAS LÍQUIDAS (Vítor, 01/08) ──────────────────────
 * A fórmula trava em 100 e, com a escada nova (Mestre = 350 honrados), isso
 * deixava a barra a mentir onde ela mais é vista: quem tivesse 400 honrados e
 * 100 FALHAS aparecia com 100% de Confiança na montra. Nota máxima a quem
 * falhou cem vezes — e a barra é o que se olha antes de decidir contratar.
 *
 * A causa era o volume bruto a empurrar sempre para cima mais depressa do que
 * as falhas puxavam para baixo. Com o líquido, cada falha custa duas vezes na
 * mesma direção — perde os seus −10 E leva dois honrados (−10 indiretos) — e o
 * mesmo caso passa a mostrar 30%.
 *
 * O −10 direto FICA: é ele que faz uma falha isolada doer a quem tem pouco
 * histórico, onde o líquido quase não se nota. Os dois mecanismos apanham
 * pontas opostas da escala.
 *
 * Isto revê o "a barra fica COMO ESTÁ" travado a 20/07 — decidido nessa altura
 * quando o topo da escada eram dezenas de negócios, não centenas.
 */
export function calcularConfianca(s: SinaisConfianca): number {
  const f = Math.max(0, s.falhados ?? 0);
  const h = honrasEfetivas(s.honrados, f);
  const c = Math.max(0, s.combinados ?? 0);
  const cf = Math.max(0, s.combinadosFalhados ?? 0);
  const bruto =
    CONFIANCA_BASE + POR_HONRADO * h - POR_FALHA * f + POR_COMBINADO * c - POR_COMBINADO * cf;
  return Math.max(0, Math.min(100, bruto));
}
