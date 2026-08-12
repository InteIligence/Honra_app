import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * Pill HONRA — etiquetas pequenas sobre a faixa verde da credencial.
 * - `empresa`: dourado cheio (marca o tipo de conta).
 * - `disponivel`: contorno verde + ponto vivo (estado, verde = significado).
 * - `escalao`: contorno dourado ténue (prestígio — discreto, nunca "bling").
 */
type Props = {
  texto: string;
  variante?: 'empresa' | 'disponivel' | 'escalao';
  style?: StyleProp<ViewStyle>;
};

export function Pill({ texto, variante = 'empresa', style }: Props) {
  if (variante === 'disponivel') {
    return (
      <View style={[styles.base, styles.disponivel, style]}>
        <View style={styles.dot} />
        <Text style={styles.disponivelTxt}>{texto}</Text>
      </View>
    );
  }
  if (variante === 'escalao') {
    return (
      <View style={[styles.base, styles.escalao, style]}>
        <Text style={styles.escalaoTxt}>{texto}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.base, styles.empresa, style]}>
      <Text style={styles.empresaTxt}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Raio.pill,
    paddingHorizontal: Espaco.md,
  },
  empresa: { backgroundColor: Honra.dourado, paddingVertical: 2 },
  empresaTxt: {
    color: Honra.verdeMaisEscuro,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  disponivel: {
    gap: 6,
    borderWidth: 1,
    borderColor: Honra.verde,
    paddingVertical: 3,
  },
  disponivelTxt: { color: Honra.creme, fontSize: 12, fontWeight: '700' },
  dot: { width: 7, height: 7, borderRadius: Raio.pill, backgroundColor: Honra.verdeVivo },
  escalao: {
    borderWidth: 1,
    borderColor: Honra.dourado,
    paddingVertical: 3,
  },
  escalaoTxt: { color: Honra.douradoClaro, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
});
