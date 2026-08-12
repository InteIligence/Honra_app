/**
 * HONRA — Calendário da Agenda. Símbolo desenhado (sem emoji), irmão do Sino:
 * traço fino, contorno, Views puras, zero dependências novas (DESIGN-SYSTEM §tom).
 * Toca → abre /agenda (compromissos reais + as minhas tarefas).
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { Honra } from '@/theme/honra';

export function Calendario({ cor = Honra.tinta }: { cor?: string }) {
  const { t } = useT();
  return (
    <Pressable
      onPress={() => router.push('/agenda')}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t('agenda.titulo')}
      style={styles.toque}
    >
      <View style={styles.icone}>
        {/* As duas argolas no topo da folha. */}
        <View style={styles.argolas}>
          <View style={[styles.argola, { backgroundColor: cor }]} />
          <View style={[styles.argola, { backgroundColor: cor }]} />
        </View>
        {/* A folha — só contorno, linha fina como o corpo do Sino. */}
        <View style={[styles.folha, { borderColor: cor }]}>
          {/* O cabeçalho da folha. */}
          <View style={[styles.linha, { backgroundColor: cor }]} />
          {/* O dia marcado — um apontamento, não um alarme. */}
          <View style={[styles.dia, { backgroundColor: cor }]} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toque: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  icone: { alignItems: 'center' },
  // Argolas por cima do contorno (o -1.6 encaixa-as na linha da folha).
  argolas: { flexDirection: 'row', gap: 7, marginBottom: -1.6, zIndex: 1 },
  argola: { width: 1.8, height: 5, borderRadius: 1 },
  folha: {
    width: 18,
    height: 15,
    borderWidth: 1.6,
    borderRadius: 3.5,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  linha: { alignSelf: 'stretch', height: 1.6, marginTop: 2.6 },
  dia: { width: 3.2, height: 3.2, borderRadius: 1, marginTop: 2.2, alignSelf: 'flex-end', marginRight: 2.6 },
});
