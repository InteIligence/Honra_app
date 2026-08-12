import {
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useT } from '@/i18n';
import { calcularConfianca } from '@/theme/confianca';
import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * Confiança HONRA — CONDUTA, não opinião. A LEI vive em `@/theme/confianca`
 * (um sítio só, desde 01/08 — estava em três e três cópias perdem-se). Aqui
 * fica só o desenho: a barra que se enche.
 */
export function confiancaPct(
  honrados?: number | null,
  falhados?: number | null,
  combinados?: number | null,
  combinadosFalhados?: number | null
): number {
  return calcularConfianca({ honrados, falhados, combinados, combinadosFalhados });
}

type Props = {
  /** Negócios honrados (perfis.negocios_honrados). */
  honrados?: number | null;
  /** Falhas à palavra (perfis.negocios_falhados). */
  falhados?: number | null;
  /** Sussurro em vez de cartão: uma linha fina, sem número grande. A confiança
   *  fala baixo — o destaque ganha-se no Percurso, não se grita no feed. */
  subtil?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Confianca({ honrados, falhados, subtil = false, style }: Props) {
  const { t } = useT();
  const h = Math.max(0, honrados ?? 0);
  const f = Math.max(0, falhados ?? 0);
  const pct = confiancaPct(h, f);
  const semHistorico = h === 0 && f === 0;
  if (subtil) {
    return (
      <View style={[styles.subtilLinha, style]}>
        <Text style={styles.subtilRotulo}>{t('confianca.rotulo')}</Text>
        <View style={styles.subtilBarra}>
          <View style={[styles.subtilFill, { width: `${pct}%` as DimensionValue }]} />
        </View>
        <Text style={styles.subtilPct}>{pct}%</Text>
      </View>
    );
  }
  return (
    <View style={[styles.bloco, style]}>
      <Text style={styles.numero}>{pct}%</Text>
      <View style={styles.meio}>
        <Text style={styles.rotulo}>{t('confianca.rotulo')}</Text>
        {/* Barra de conduta — enche com o índice. Estrelas só nas críticas. */}
        <View style={styles.barra}>
          <View style={[styles.barraFill, { width: `${pct}%` as DimensionValue }]} />
          {/* Marcas das ZONAS (60 sólida · 90 exemplar) — leitura, não motor. */}
          <View style={[styles.zonaTick, { left: '60%' as DimensionValue }]} />
          <View style={[styles.zonaTick, { left: '90%' as DimensionValue }]} />
        </View>
        <Text style={styles.sub}>
          {semHistorico ? t('confianca.base') : t('confianca.registo', { h, f })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bloco: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.lg,
    backgroundColor: Honra.verdeSuave,
    borderRadius: Raio.lg,
    borderWidth: 1,
    borderColor: Honra.verde,
    paddingVertical: Espaco.md,
    paddingHorizontal: Espaco.lg,
  },
  numero: { fontSize: 40, fontWeight: '800', color: Honra.verde, lineHeight: 42 },
  meio: { flex: 1, gap: 1 },
  rotulo: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: Honra.verde },
  sub: { fontSize: 13, color: Honra.tintaSuave },
  barra: {
    height: 8,
    borderRadius: Raio.pill,
    backgroundColor: 'rgba(20,54,31,0.15)',
    overflow: 'hidden',
    marginVertical: 5,
  },
  zonaTick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: 'rgba(20,54,31,0.25)',
  },
  barraFill: { height: '100%', borderRadius: Raio.pill, backgroundColor: Honra.verde },

  // Variante SUBTIL — uma linha só, tom sobre tom. A barra é um fio; o número
  // acompanha em voz baixa. Nada de cartão, nada de verde a gritar.
  subtilLinha: { flexDirection: 'row', alignItems: 'center', gap: Espaco.sm },
  subtilRotulo: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: Honra.tintaSuave },
  subtilBarra: {
    flex: 1,
    height: 4,
    borderRadius: Raio.pill,
    backgroundColor: Honra.cremeEscuro,
    overflow: 'hidden',
  },
  subtilFill: { height: '100%', borderRadius: Raio.pill, backgroundColor: Honra.verde },
  subtilPct: { fontSize: 12, fontWeight: '700', color: Honra.tintaSuave },
});
