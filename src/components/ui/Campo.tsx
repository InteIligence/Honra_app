import { forwardRef } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * Campo HONRA — input de texto com a pele da casa.
 * Aceita todas as props de `TextInput`; multiline ganha altura e
 * alinhamento ao topo automaticamente. Reencaminha `ref` para o TextInput —
 * assim os formulários saltam de campo em campo e submetem com o Enter.
 */
export const Campo = forwardRef<TextInput, TextInputProps>(function Campo(
  { style, multiline, ...resto },
  ref,
) {
  return (
    <TextInput
      ref={ref}
      style={[styles.campo, multiline && styles.multilinha, style]}
      placeholderTextColor={Honra.tintaSuave}
      multiline={multiline}
      {...resto}
    />
  );
});

const styles = StyleSheet.create({
  campo: {
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.md,
    padding: Espaco.md,
    fontSize: 15,
    color: Honra.tinta,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    // Fora o anel azul do browser. Na web o `outline` do sistema desenha-se
    // POR CIMA da nossa borda, com o azul do Chrome e os cantos dele — e um
    // ecrã que tem a sua própria linguagem não pede emprestada a do sistema.
    // Sai aqui, no componente base, para não haver um campo esquecido.
    outlineWidth: 0,
  },
  multilinha: { minHeight: 80, textAlignVertical: 'top' },
});
