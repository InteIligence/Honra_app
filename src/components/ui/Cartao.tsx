import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * Cartão HONRA — a base branco-creme com borda de listas e blocos.
 * Com `onPress` torna-se tocável (ex.: resultado de pesquisa).
 */
type Props = {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function Cartao({ children, onPress, style }: Props) {
  if (onPress) {
    return (
      <Pressable style={[styles.cartao, style]} onPress={onPress}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.cartao, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  cartao: {
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.md,
    padding: Espaco.md,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
  },
});
