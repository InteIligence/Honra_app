/**
 * HONRA — pele "Credencial".
 * Verde-floresta = significado (verificado/avança). Bege/creme = fundo quente.
 * Dourado = brilho de marca E prestígio vivo (DESIGN-SYSTEM.md §3).
 * O verde NUNCA é decorativo.
 */
export const Honra = {
  // Verdes (significado)
  verde: '#1C5A40',
  verdeEscuro: '#123C2B',
  verdeMaisEscuro: '#0B2A1E',
  verdeSuave: '#E1F0E8',   // fundo de "verificado/ativo" (abas verdes, chips ativos, sucesso)
  verdeVivo: '#5DCAA5',    // ponto de "Disponível" sobre a faixa verde-escura
  // Bege / creme (fundo)
  creme: '#F2EDE2',
  cremeEscuro: '#E7DECB',
  // Secretária (handoff Shell Desktop 1a): bege mais quente + sálvia dos ícones
  // inativos no rail.
  begeSecretaria: '#E7E0D0',
  salvia: '#88A697',
  begeEscuro: '#BBA981', // aba de notificação: histórico/em curso (vs verde = marco)
  // Dourado (brilho de marca)
  dourado: '#C5A45F',
  douradoClaro: '#E6D2A2',
  // Neutros / texto
  tinta: '#12211B',        // texto sobre creme
  tintaSuave: '#5B6B62',
  brancoCreme: '#FBF8F1',
  // Estados
  verificado: '#1C5A40',
  pendente: '#B4B2A9',
  erro: '#9B3B2E',
  erroSuave: '#F6E4E0', // fundo ténue de estado de erro/recusa (par de verdeSuave)
} as const;

/**
 * TEXTO DE AÇÃO — o rótulo que vive dentro de um botão, chip ou pílula.
 *
 * Não se seleciona, e é de propósito: na web, arrastar sobre um botão pintava
 * a palavra de azul em vez de a carregar, e o duplo-toque selecionava-a. Um
 * botão que se pode "sublinhar" deixa de se sentir como botão.
 *
 * A regra é só esta e vale ao contrário também: o texto de CONTEÚDO — um nome,
 * um @handle, uma cidade, uma descrição — continua a selecionar-se e a
 * copiar-se, porque aí é útil e é próprio de uma app que respeita quem a usa.
 * Ação não se seleciona; conteúdo sim.
 */
export const TextoAcao = { userSelect: 'none' } as const;

export const Espaco = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const Raio = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

// Ponto de viragem web: a partir desta largura a app abre-se em "secretária"
// (rail, grelha, átrio) — ver src/app/_layout.tsx.
export const LARGURA_SECRETARIA = 1024;
