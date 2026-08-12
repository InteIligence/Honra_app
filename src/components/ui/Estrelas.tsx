import { StyleSheet, Text } from 'react-native';

import { Honra } from '@/theme/honra';

/**
 * Estrelas HONRA — 5 estrelas: cheias a dourado, vazias a pendente.
 * Usado pelo bloco de Confiança e pelos cartões de Avaliação.
 */
type Props = {
  /** Nota 0–5 (arredondada às cheias). */
  nota: number;
  tamanho?: number;
};

export function Estrelas({ nota, tamanho = 16 }: Props) {
  const cheias = Math.max(0, Math.min(5, Math.round(nota)));
  return (
    <Text style={[styles.cheias, { fontSize: tamanho }]}>
      {'★'.repeat(cheias)}
      <Text style={styles.vazias}>{'★'.repeat(5 - cheias)}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  cheias: { color: Honra.dourado, letterSpacing: 2 },
  vazias: { color: Honra.pendente },
});
