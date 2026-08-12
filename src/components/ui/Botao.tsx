import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Espaco, Honra, Raio, TextoAcao } from '@/theme/honra';

/**
 * Botão HONRA — `primario` (verde cheio: a ação que avança) e
 * `secundario` (contorno verde: ação de apoio). Com estado de loading.
 * Verde = significado: só ações que fazem avançar.
 */
type Props = {
  titulo: string;
  onPress: () => void;
  variante?: 'primario' | 'secundario';
  /** Mostra o spinner e bloqueia toques. */
  aCarregar?: boolean;
  desativado?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Botao({
  titulo,
  onPress,
  variante = 'primario',
  aCarregar = false,
  desativado = false,
  style,
}: Props) {
  const primario = variante === 'primario';
  const inativo = aCarregar || desativado;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        primario ? styles.primario : styles.secundario,
        (pressed || inativo) && styles.apagado,
        style,
      ]}
      onPress={onPress}
      disabled={inativo}
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityState={{ disabled: inativo, busy: aCarregar }}
    >
      {aCarregar ? (
        <ActivityIndicator color={primario ? Honra.brancoCreme : Honra.verde} />
      ) : (
        <Text style={primario ? styles.txtPrimario : styles.txtSecundario}>{titulo}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Raio.md,
    paddingVertical: Espaco.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primario: { backgroundColor: Honra.verde },
  secundario: { borderWidth: 1, borderColor: Honra.verde },
  apagado: { opacity: 0.7 },
  // Rótulos de botão não se selecionam (ver TextoAcao no tema).
  txtPrimario: { ...TextoAcao, color: Honra.brancoCreme, fontSize: 16, fontWeight: '700' },
  txtSecundario: { ...TextoAcao, color: Honra.verde, fontSize: 15, fontWeight: '700' },
});
