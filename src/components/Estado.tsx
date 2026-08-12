import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Espaco, Honra } from '@/theme/honra';

/**
 * Estados de ecrã reutilizáveis — para que carregar/vazio/erro
 * tenham sempre a mesma cara em toda a app Honra.
 */

// Roda verde centrada — enquanto os dados estão a chegar.
export function Carregar({ style }: { style?: object }) {
  return (
    <View style={[styles.centro, style]}>
      <ActivityIndicator color={Honra.verde} />
    </View>
  );
}

// Mensagem calma para "não há nada aqui (ainda)".
export function Vazio({ texto }: { texto: string }) {
  return <Text style={styles.vazio}>{texto}</Text>;
}

// Mensagem legível quando algo falha — nunca silenciar.
export function Erro({ texto }: { texto: string }) {
  return <Text style={styles.erro}>{texto}</Text>;
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Espaco.xl },
  vazio: { textAlign: 'center', color: Honra.tintaSuave, fontSize: 14, marginTop: Espaco.xxl },
  erro: { color: Honra.erro, fontSize: 14 },
});
