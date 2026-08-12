import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { useT } from '@/i18n';
import { Espaco, Honra } from '@/theme/honra';

import { Cartao } from './Cartao';
import { Estrelas } from './Estrelas';

/**
 * Avaliação HONRA — estrelas + comentário + autor, num cartão.
 * Mostra só o primeiro nome do autor (privacidade calma).
 */
type Props = {
  /** Nota 1–5. */
  nota: number;
  comentario?: string | null;
  /** Nome completo do autor — o componente reduz ao primeiro nome. */
  autor?: string | null;
  style?: StyleProp<ViewStyle>;
};

export function Avaliacao({ nota, comentario, autor, style }: Props) {
  const { t } = useT();
  return (
    <Cartao style={[styles.cartao, style]}>
      <Estrelas nota={nota} />
      {comentario ? <Text style={styles.comentario}>{comentario}</Text> : null}
      <Text style={styles.autor}>{primeiroNome(autor ?? t('aval.alguem'))}</Text>
    </Cartao>
  );
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0];
}

const styles = StyleSheet.create({
  cartao: { gap: Espaco.xs },
  comentario: { fontSize: 15, color: Honra.tinta, lineHeight: 20 },
  autor: { fontSize: 13, color: Honra.tintaSuave, fontWeight: '600' },
});
