/**
 * HONRA — ecrã honesto de SUSPENSÃO (escada de suspensão, migração 048).
 *
 * Mostrar-não-dizer: uma consequência DIGNA, não humilhante. Diz a verdade —
 * até quando dura, porquê, o que ainda podes fazer e que a porta reabre sozinha.
 * Nunca é surpresa nem spermanente (não há prisão perpétua).
 */
import { StyleSheet, Text, View } from 'react-native';

import { formatarData } from '@/components/ui/CampoData';
import { useT, type ChaveI18n } from '@/i18n';
import { Espaco, Honra, Raio } from '@/theme/honra';

export function AvisoSuspenso({
  suspensoAte,
  nivel,
}: {
  suspensoAte: string | null;
  nivel: number;
}) {
  const { t } = useT();
  // 'AAAA-MM-DD' para o formatador PT (DD/MM/AAAA).
  const dataFim = suspensoAte ? formatarData(suspensoAte.slice(0, 10)) : '';
  const motivoChave: ChaveI18n =
    nivel === 1 ? 'susp.motivo1' : nivel === 2 ? 'susp.motivo2' : nivel === 3 ? 'susp.motivo3' : 'susp.motivo0';

  return (
    <View style={styles.cartao}>
      <Text style={styles.titulo}>{t('susp.titulo')}</Text>
      {!!dataFim && <Text style={styles.ate}>{t('susp.ate', { data: dataFim })}</Text>}
      <Text style={styles.motivo}>{t(motivoChave)}</Text>
      <Text style={styles.corpo}>{t('susp.termina')}</Text>
      <View style={styles.divisor} />
      <Text style={styles.pode}>{t('susp.pode')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cartao: {
    backgroundColor: Honra.cremeEscuro,
    borderRadius: Raio.md,
    borderLeftWidth: 4,
    borderLeftColor: Honra.erro,
    padding: Espaco.lg,
    gap: Espaco.sm,
  },
  titulo: { fontSize: 18, fontWeight: '700', color: Honra.tinta },
  ate: { fontSize: 16, fontWeight: '600', color: Honra.erro },
  motivo: { fontSize: 14, color: Honra.tinta },
  corpo: { fontSize: 14, color: Honra.tintaSuave, lineHeight: 20 },
  divisor: { height: 1, backgroundColor: Honra.pendente, marginVertical: Espaco.xs, opacity: 0.5 },
  pode: { fontSize: 13, color: Honra.tintaSuave, lineHeight: 19 },
});
