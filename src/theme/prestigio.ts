import { calcularConfianca, honrasEfetivas } from './confianca';
/**
 * HONRA — PRESTÍGIO: o gold que cresce com o escalão.
 * (DESIGN-SYSTEM.md §3 — a lei central e específica do Honra.)
 *
 * O gold não é fixo: ganha presença à medida que o perfil sobe de escalão,
 * e o perfil enobrece-se — subtilmente. Não é um crachá que grita; é o
 * "escritório a ficar mais nobre".
 *
 * REGRA DE OURO: entre um nível e o seguinte a diferença SENTE-SE, não grita.
 * Se parecer "bling", está errado.
 *
 * LEI DE DESIGN (decisão travada do Vítor): o brilho só começa em RECONHECIDO.
 * Verificado e Provado partilham EXATAMENTE o mesmo visual base — Provado é
 * uma conquista de percurso (1º trabalho avaliado), não um degrau de dourado.
 *
 * Percurso (5 escalões = 5 níveis, 1:1):
 *   Verificado  → nível 0 ─┐ mesmo estilo base (anel fino e sóbrio,
 *   Provado     → nível 1 ─┘ sem brilho extra)
 *   Reconhecido → nível 2   1º degrau de dourado
 *   Referência  → nível 3   mais presença
 *   Mestre      → nível 4   o máximo (sempre contido)
 *
 * Os componentes (Credencial, Avatar, …) LEEM o prestígio e aplicam o
 * tratamento — a lei fica no código, não à mercê de interpretação.
 */
import { Honra } from './honra';

/** Nível de prestígio = índice do escalão em ESCALOES (1:1, sem saltos). */
export type NivelPrestigio = 0 | 1 | 2 | 3 | 4 | 5;

/** A sequência REAL do percurso — 5 escalões, alinhados com NivelPrestigio. */
export const ESCALOES = [
  'Verificado',
  'Provado',
  'Recomendado',
  'Reconhecido',
  'Referenciado',
  'Mestre',
] as const;

/**
 * A PARTIR DAQUI A INSÍGNIA RESPIRA.
 *
 * Até ao Recomendado a peça está parada; do Reconhecido para cima flutua
 * devagar, como se tivesse peso próprio. É a mesma lei do gold vivo aplicada
 * ao movimento: a distinção enobrece-se com o escalão, e não pelo mesmo
 * artifício em todos.
 *
 * A razão de não ser para todos é a que vale: se todas respiram, respirar
 * deixa de dizer alguma coisa. O movimento é uma afirmação — o Honra guarda-o
 * para o terço de cima da escada, onde já custou muito a chegar.
 *
 * (O reflexo que atravessa a peça continua exclusivo do Mestre, que é a única
 * moeda inteira. Respirar é do terço de cima; apanhar a luz é só do topo.)
 */
export const RESPIRA_A_PARTIR_DE: NivelPrestigio = 3;

/** Sinais disponíveis hoje para derivar o escalão. Todos opcionais/tolerantes. */
export type SinaisPerfil = {
  /** Índice de confiança 0–5 (coluna `perfis.indice_confianca`). */
  indice_confianca?: number | null;
  /** Nº de abas do selo verificadas a verde (0–4). */
  verificacoesVerdes?: number;
  /** Nº de avaliações recebidas (histórico total). */
  numAvaliacoes?: number;
  /** Nº de avaliações recebidas nos ÚLTIMOS ~6 MESES. Alimenta o DECAY do
   *  prestígio: o escalão mede honra RECENTE, não vaidade acumulada. Se
   *  omitido, assume-se = numAvaliacoes (sem decadência — retrocompatível). */
  avaliacoesRecentes?: number;
  /** Nº de projetos/orçamentos concluídos (quando o sinal existir). */
  projetosConcluidos?: number;
  /** NEGÓCIOS HONRADOS — o motor do escalão desde 01/08. É o facto: palavra
   *  dada e cumprida. Substituiu as avaliações, que são OPCIONAIS e dependem
   *  de terceiros (e, com o double-blind, de DUAS vontades): alguém podia
   *  honrar trinta negócios sem falhar um e ficar preso em Provado só porque
   *  ninguém se lembrou de escrever nada. O escalão passa a medir o que
   *  depende de quem o conquista. */
  negociosHonrados?: number;
  /** Falhas à palavra — entram pela Confiança, não sozinhas. */
  negociosFalhados?: number;
  /** Encontros combinados cumpridos / falhados (078): ±2 na Confiança. */
  combinadosCumpridos?: number;
  combinadosFalhados?: number;
};

/**
 * Limiares AFINÁVEIS (deliberadamente conservadores: subir de escalão
 * tem de ser conquista, não brinde). Ajustar aqui — e só aqui — quando
 * houver dados reais de utilização.
 */
const LIMIAR = {
  // ── A ESCALA DOS SEIS (Vítor, 01/08 — a tabela inteira é dele) ──────────
  //   Verificado    ·   0  · o selo completo, e mais nada
  //   Provado       ·   2  honrados
  //   Recomendado   ·  25
  //   Reconhecido   ·  90  ← daqui para cima a insígnia RESPIRA
  //   Referenciado  · 200
  //   Mestre        · 350
  //
  // A forma da escada conta uma história. Os degraus, em trabalho a mais:
  //     2 → 25   +23    (×12,5 — o maior salto EM PROPORÇÃO: a entrada)
  //    25 → 90   +65    (×3,6)
  //    90 → 200  +110   (×2,2)
  //   200 → 350  +150   (×1,75 — o MAIOR SALTO da escada em trabalho real)
  //
  // O rácio encolhe a cada degrau mas o esforço cresce sempre: subir custa
  // cada vez mais em trabalho, nunca em proporção. É essa a curva certa para
  // uma escada de mérito — não assusta quem entra e não se compra no topo.
  // O degrau para Mestre é o mais caro de todos, e é o que tem de ser.
  //
  // A insígnia ganha vida no Reconhecido (`RESPIRA_A_PARTIR_DE`), a meio da
  // escada: é onde o percurso deixa de ser começo e passa a ser ofício.
  //
  // `confianca` é o PISO DE CONDUTA — a Confiança real (30 + 5×honrado −
  // 10×falha), não a média das estrelas. Sem este piso, o volume puro convidava
  // ao farm de negócios pequenos, que é a fuga que o red-team já tinha achado.
  // Com ele, quem falha muito não sobe por mais que acumule.
  //
  // O piso sozinho não chegava: a Confiança satura em 100 aos 14 honrados sem
  // falhas, e a partir daí só desce com falhas em número absoluto — um Mestre
  // com 350 honrados precisaria de ~176 falhas para cair dos 90%. Nos escalões
  // altos, o travão da conduta estava praticamente desligado.
  //
  // Quem o religou foi o Vítor (01/08), e pelo lado certo: FALHAR TIRA DOIS
  // HONRADOS (ver `honrasEfetivas`). A falha passa a custar nas duas moedas —
  // −10 de Confiança e −2 de volume — e o volume não satura. Um Mestre com
  // 350 honrados cai do escalão às 26 falhas, não às 176.
  //
  // `verdes: 4` — a credencial COMPLETA é o chão de todo o percurso acima de
  // Verificado (lacuna fechada 27/07): nenhum escalão pode exigir menos selos
  // do que o degrau abaixo dele.
  //
  // `recentes` = honra recente mínima para MANTER o escalão (o DECAY: sem
  // trabalho, o brilho recua — decidido a 01/08, "é honrar o caminho").
  provado: { verdes: 0, honrados: 2, confianca: 30, recentes: 0 },
  recomendado: { verdes: 4, honrados: 25, confianca: 60, recentes: 1 },
  reconhecido: { verdes: 4, honrados: 90, confianca: 70, recentes: 2 },
  referenciado: { verdes: 4, honrados: 200, confianca: 75, recentes: 3 },
  mestre: { verdes: 4, honrados: 350, confianca: 90, recentes: 6 },
} as const;

/**
 * AS HONRAS QUE CONTAM — reexportadas, não recriadas.
 *
 * "Quem falha aperto de mão perde 2 honrados. Só tem a perder e a ganhar,
 * tanto com honrados como com confiança" (Vítor, 01/08).
 *
 * A conta vive no `confianca.ts` porque é lá que está a outra metade da mesma
 * lei — e a Confiança também a usa. Reexporta-se daqui para quem pensa em
 * percurso não ter de saber onde a regra mora; o que NÃO se faz é ter duas
 * cópias, que é como as regras se perdem (foi por isso que o `confianca.ts`
 * nasceu, quando a fórmula estava escrita em três sítios).
 *
 * A falha custa nas DUAS moedas do Honra: −10 na Confiança e −2 no volume. É
 * isso que faz a escada ser reversível de verdade — a Confiança trava em 100
 * e deixava de segurar seja quem for lá em cima; o volume não trava nunca.
 *
 * O histórico BRUTO fica intacto na base de dados. Isto é a régua do percurso,
 * não uma reescrita do que aconteceu.
 */
export { HONRADOS_POR_FALHA, honrasEfetivas } from './confianca';

/** Deriva o nível (0–4 = índice do escalão) a partir dos sinais do perfil. */
export function nivelDeCredencial(perfil: SinaisPerfil): NivelPrestigio {
  const verdes = perfil.verificacoesVerdes ?? 0;
  const brutos = perfil.negociosHonrados ?? 0;
  const falhados = perfil.negociosFalhados ?? 0;
  // O VOLUME que conta é o líquido: cada falha leva dois honrados com ela.
  const honrados = honrasEfetivas(brutos, falhados);
  // A Confiança REAL (conduta) — a lei vem de `@/theme/confianca`, nunca
  // recopiada: três cópias da mesma regra é como as regras se perdem.
  //
  // Recebe os BRUTOS de propósito: desde 01/08 é a própria `calcularConfianca`
  // que desconta as falhas do volume. Passar-lhe o líquido descontava-as duas
  // vezes.
  const confianca = calcularConfianca({
    honrados: brutos,
    falhados,
    combinados: perfil.combinadosCumpridos,
    combinadosFalhados: perfil.combinadosFalhados,
  });
  // Honra RECENTE — o motor do decay. Sem o sinal, cai para o total (sem
  // decadência), para não castigar quem ainda não tem histórico medido.
  const recentes = perfil.avaliacoesRecentes ?? honrados;

  // Cada degrau exige as DUAS coisas: volume (o que fizeste) e conduta (como
  // o fizeste). Só volume convidava ao farm; só conduta saturava aos 14.
  if (
    verdes >= LIMIAR.mestre.verdes &&
    honrados >= LIMIAR.mestre.honrados &&
    confianca >= LIMIAR.mestre.confianca &&
    recentes >= LIMIAR.mestre.recentes
  ) {
    return 5; // Mestre
  }
  if (
    verdes >= LIMIAR.referenciado.verdes &&
    honrados >= LIMIAR.referenciado.honrados &&
    confianca >= LIMIAR.referenciado.confianca &&
    recentes >= LIMIAR.referenciado.recentes
  ) {
    return 4; // Referenciado
  }
  if (
    verdes >= LIMIAR.reconhecido.verdes &&
    honrados >= LIMIAR.reconhecido.honrados &&
    confianca >= LIMIAR.reconhecido.confianca &&
    recentes >= LIMIAR.reconhecido.recentes
  ) {
    return 3; // Reconhecido
  }
  if (
    verdes >= LIMIAR.recomendado.verdes &&
    honrados >= LIMIAR.recomendado.honrados &&
    confianca >= LIMIAR.recomendado.confianca &&
    recentes >= LIMIAR.recomendado.recentes
  ) {
    return 2; // Recomendado
  }
  // Base do percurso: sair de Verificado EXIGE a credencial completa (os 4
  // selos) — lacuna fechada 27/07: podes juntar honrados à vontade, mas o
  // percurso só anda com a identidade (e o resto do selo) provada. Daí em
  // diante bastam 2 honrados para Provado — o VISUAL é o mesmo (a lei: o
  // brilho só começa no degrau seguinte).
  return verdes >= 4 && honrados >= LIMIAR.provado.honrados ? 1 : 0;
}

/** Nome do escalão (1:1 com o nível — a sequência real dos 5). */
export function escalaoDeCredencial(perfil: SinaisPerfil): string {
  return ESCALOES[nivelDeCredencial(perfil)];
}

/**
 * O próximo escalão do percurso: quem está em Verificado vai a caminho de
 * PROVADO — nunca saltamos degraus. Devolve null no topo (Mestre).
 */
export function proximoEscalao(perfil: SinaisPerfil): string | null {
  const i = nivelDeCredencial(perfil);
  if (i >= ESCALOES.length - 1) return null;
  return ESCALOES[i + 1];
}

/**
 * Os requisitos REAIS para o próximo escalão — o painel "O teu percurso" lê
 * daqui (a lei fica no código; o ecrã só a mostra). Devolve null no topo.
 * Cada degrau pede as duas naturezas: VOLUME (honrados) e CONDUTA
 * (Confiança). As avaliações saíram daqui a 01/08 — são opcionais e dependem
 * de terceiros, e o escalão não pode depender de quem não somos nós.
 */
export type Requisito = {
  chave: 'verdes' | 'honrados' | 'confianca' | 'recentes';
  atual: number;
  alvo: number;
  feito: boolean;
};
export function requisitosProximo(perfil: SinaisPerfil): Requisito[] | null {
  const nivel = nivelDeCredencial(perfil);
  if (nivel >= ESCALOES.length - 1) return null;
  const verdes = perfil.verificacoesVerdes ?? 0;
  const brutos = perfil.negociosHonrados ?? 0;
  const falhados = perfil.negociosFalhados ?? 0;
  // As MESMAS contas do `nivelDeCredencial`, e pela mesma razão: o painel do
  // percurso tem de mostrar exatamente os números que decidem o escalão. Se
  // mostrasse os brutos, alguém com falhas veria a meta cumprida e continuaria
  // parado no degrau — e não perceberia porquê.
  const honrados = honrasEfetivas(brutos, falhados);
  const confianca = calcularConfianca({
    honrados: brutos,
    falhados,
    combinados: perfil.combinadosCumpridos,
    combinadosFalhados: perfil.combinadosFalhados,
  });
  const recentes = perfil.avaliacoesRecentes ?? honrados;
  // Provado = conquista de percurso: credencial COMPLETA + os primeiros
  // negócios honrados. As honras sem selo não abrem a porta (lacuna 27/07),
  // e o selo sem honras também não — são as duas coisas.
  if (nivel === 0)
    return [
      { chave: 'verdes', atual: verdes, alvo: 4, feito: verdes >= 4 },
      {
        chave: 'honrados',
        atual: honrados,
        alvo: LIMIAR.provado.honrados,
        feito: honrados >= LIMIAR.provado.honrados,
      },
    ];
  const alvo =
    nivel === 1
      ? LIMIAR.recomendado
      : nivel === 2
        ? LIMIAR.reconhecido
        : nivel === 3
          ? LIMIAR.referenciado
          : LIMIAR.mestre;
  return [
    { chave: 'verdes', atual: verdes, alvo: alvo.verdes, feito: verdes >= alvo.verdes },
    { chave: 'honrados', atual: honrados, alvo: alvo.honrados, feito: honrados >= alvo.honrados },
    {
      chave: 'confianca',
      atual: confianca,
      alvo: alvo.confianca,
      feito: confianca >= alvo.confianca,
    },
    { chave: 'recentes', atual: recentes, alvo: alvo.recentes, feito: recentes >= alvo.recentes },
  ];
}

/** Config visual que os componentes consomem. Cumulativo e discreto. */
export type EstiloPrestigio = {
  nivel: NivelPrestigio;
  /** Nome do escalão a mostrar (pill, tooltips…). */
  escalao: string;
  /**
   * Degraus de DOURADO acima da base (0–3). É isto que os componentes usam
   * para modular brilho de forma contínua (ex.: medalha do Honra Card).
   * Lei de design: o brilho só começa em Reconhecido —
   * Verificado/Provado = 0 · Reconhecido = 1 · Referência = 2 · Mestre = 3.
   */
  brilho: 0 | 1 | 2 | 3;
  /** Anel do avatar: largura e cor. A base de tudo — nunca desaparece. */
  anel: { largura: number; cor: string };
  /** Referência+: segundo anel interior, fino e ténue (dourado-claro). */
  anelDuplo: boolean;
  /** Reconhecido+: hairline dourado ténue a separar a credencial do corpo. */
  hairline: boolean;
  /** Referência+: o ✓ junto ao nome ganha fundo dourado pleno. */
  acentoNome: boolean;
  /** Referência: detalhe de canto dourado discreto na base da credencial. */
  cantos: boolean;
  /** Mestre: moldura dourada ténue à volta da credencial. */
  moldura: boolean;
  /** Mestre: pequeno monograma "H" dourado (o emblema do Mestre). */
  emblema: boolean;
  /** Reconhecido+: a credencial pode mostrar a pill do escalão. */
  mostraEscalao: boolean;
};

/**
 * O estilo BASE — partilhado, à letra, por Verificado e Provado.
 * Lei de design: o brilho só começa em Reconhecido; até lá o perfil é
 * limpo — anel fino e sóbrio, sem molduras nem acentos.
 */
const BASE: Omit<EstiloPrestigio, 'nivel' | 'escalao'> = {
  brilho: 0,
  anel: { largura: 2, cor: Honra.dourado },
  anelDuplo: false,
  hairline: false,
  acentoNome: false,
  cantos: false,
  moldura: false,
  emblema: false,
  mostraEscalao: false,
};

/**
 * A tabela da lei (§3), em código. Cada degrau de brilho ACRESCENTA um
 * detalhe pequeno. Exceção deliberada: no Mestre a moldura absorve o
 * detalhe de canto — manter os dois seria ruído (lei 7: subtileza).
 */
const ESTILOS: Record<NivelPrestigio, EstiloPrestigio> = {
  // 0 — Verificado: o estilo base (sem brilho extra).
  0: { ...BASE, nivel: 0, escalao: 'Verificado' },
  // 1 — Provado: EXATAMENTE o mesmo visual base do Verificado.
  //     (lei de design: o brilho só começa no terceiro degrau)
  1: { ...BASE, nivel: 1, escalao: 'Provado' },
  // 2 — Recomendado: 1.º degrau de dourado — anel mais presente, hairline
  //     ténue e a pill do escalão. É AQUI que o ouro entra em cena.
  2: {
    nivel: 2,
    escalao: 'Recomendado',
    brilho: 1,
    anel: { largura: 2.5, cor: Honra.dourado },
    anelDuplo: false,
    hairline: true,
    acentoNome: false,
    cantos: false,
    moldura: false,
    emblema: false,
    mostraEscalao: true,
  },
  // 3 — Reconhecido: herdou a peça e o porte do antigo Referência (01/08) —
  //     anel duplo fino, ✓ do nome em dourado, canto discreto.
  3: {
    nivel: 3,
    escalao: 'Reconhecido',
    brilho: 2,
    anel: { largura: 2.5, cor: Honra.dourado },
    anelDuplo: true,
    hairline: true,
    acentoNome: true,
    cantos: true,
    moldura: false,
    emblema: false,
    mostraEscalao: true,
  },
  // 4 — Referenciado: herdou a peça e o porte do antigo Mestre — moldura
  //     ténue e monograma. O escritório nobre.
  4: {
    nivel: 4,
    escalao: 'Referenciado',
    brilho: 3,
    anel: { largura: 3, cor: Honra.dourado },
    anelDuplo: true,
    hairline: true,
    acentoNome: true,
    cantos: false, // a moldura absorve o detalhe de canto
    moldura: true,
    emblema: true,
    mostraEscalao: true,
  },
  // 5 — Mestre: à ESPERA da peça própria, que o Vítor vai desenhar. Até lá
  //     veste o porte do Referenciado — dívida assumida e visível, não um
  //     disfarce. O topo da escada ainda não tem cara própria.
  5: {
    nivel: 5,
    escalao: 'Mestre',
    brilho: 3,
    anel: { largura: 3, cor: Honra.dourado },
    anelDuplo: true,
    hairline: true,
    acentoNome: true,
    cantos: false,
    moldura: true,
    emblema: true,
    mostraEscalao: true,
  },
};

/**
 * NÍVEL DE DESENHO (0–4) para as peças de arte da Insígnia e da Moeda.
 *
 * As peças foram feitas quando a escada tinha CINCO degraus. Com o sexto
 * (Reconhecido, 01/08), o Vítor decidiu DESLOCAR as existentes em vez de
 * duplicar nenhuma: a peça do antigo Referência passa ao Reconhecido, a do
 * Mestre passa ao Referenciado, e ele desenha uma nova para o Mestre.
 *
 * Assim cada escalão tem cara própria — que é o que a lei do prestígio pede.
 * Até a peça nova existir, o Mestre usa a do Referenciado: é uma dívida
 * VISÍVEL e assumida, não um disfarce. Quando ela chegar, muda-se o último
 * número desta lista e mais nada.
 */
export function nivelDesenho(nivel: NivelPrestigio): 0 | 1 | 2 | 3 | 4 | 5 {
  return ([0, 1, 2, 3, 4, 5] as const)[nivel];
}

/** Devolve o config visual de um nível. */
export function estiloPrestigio(nivel: NivelPrestigio): EstiloPrestigio {
  return ESTILOS[nivel];
}
