/**
 * HONRA — biblioteca de componentes (a língua visual em código).
 * Todos os ecrãs importam daqui: `import { … } from '@/components/ui'`.
 * Nunca re-estilizar do zero num ecrã (DESIGN-SYSTEM.md §5).
 */
export { Avaliacao } from './Avaliacao';
export { Avatar } from './Avatar';
export { Botao } from './Botao';
export { Calendario } from './Calendario';
export { Campo } from './Campo';
export { CampoData, formatarData, hojeISO } from './CampoData';
export { CampoHora } from './CampoHora';
export { Cartao } from './Cartao';
export { Chip } from './Chip';
export { Confianca, confiancaPct } from './Confianca';
export { CursorConfianca } from './CursorConfianca';
export { Credencial } from './Credencial';
export { Insignia } from './Insignia';
export { MoedaInsignia } from './MoedaInsignia';
export { PainelCategorias, type EscolhaCategoria } from './PainelCategorias';
export { SeletorCategorias, type CategoriaNo } from './SeletorCategorias';
export { Estrelas } from './Estrelas';
export { MIN_APERTOS_RACIO, OnHonra } from './OnHonra';
export { Pill } from './Pill';
export { ABAS_SELO, Selo } from './Selo';
export { Sino } from './Sino';
export { Virtudes } from './Virtudes';

// Estados de ecrã (carregar / vazio / erro) — alinhados na mesma porta.
export { Carregar, Erro, Vazio } from '../Estado';
