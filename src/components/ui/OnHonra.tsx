/**
 * HONRA — "On Honra": confiança em SINAIS SEPARADOS e verificáveis, ao lado do
 * ★ (Confianca). Com o dinheiro fora do aperto interno, a reputação É a caução —
 * e a espinha dela é o RÁCIO: apertos de mão dados (negócios selados) ao lado
 * dos honrados. 190 apertos e 10 trabalhos é de desconfiar; 190 e 169 é outra
 * dinâmica. O cancelamento mútuo também faz a sua história: mostra-se, não
 * penaliza (nunca vermelho, nunca alarme).
 *
 * Arranque a frio: a percentagem só aparece com ≥5 apertos — antes disso os
 * números absolutos bastam e ninguém nasce "suspeito". Sem prova nenhuma,
 * não se mostra nada (não se inventa).
 */
import { StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { Espaco, Honra, Raio } from '@/theme/honra';

// A percentagem só ganha direito a existir com ≥5 apertos (regra do arranque a frio).
export const MIN_APERTOS_RACIO = 5;

export function OnHonra({
  apertos,
  honrados,
  cancelados,
}: {
  apertos?: number | null;
  honrados?: number | null;
  cancelados?: number | null;
}) {
  const { t } = useT();
  const a = apertos ?? 0;
  const h = honrados ?? 0;
  const c = cancelados ?? 0;
  if (a <= 0 && h <= 0) return null; // sem apertos nem honrados → sem prova a mostrar

  const comRacio = a >= MIN_APERTOS_RACIO;
  const taxa = comRacio ? Math.round((h / a) * 100) : 0;

  return (
    <View style={styles.bloco}>
      <View style={styles.linha}>
        {a > 0 ? (
          <>
            <Text style={styles.honra}>
              {t(a === 1 ? 'onhonra.aperto' : 'onhonra.apertos', { n: a })}
            </Text>
            <Text style={styles.honrados}>
              {t(h === 1 ? 'onhonra.honrado' : 'onhonra.honrados', { n: h })}
            </Text>
            {comRacio && (
              <Text style={taxa >= 80 ? styles.taxaVerde : styles.taxaNeutra}>
                {t('onhonra.cumpre', { pct: taxa })}
              </Text>
            )}
          </>
        ) : (
          // Perfis com honra antiga mas sem apertos contados: a prova de sempre.
          <Text style={styles.honra}>
            {h === 1 ? t('onhonra.sempre_1') : t('onhonra.sempre', { n: h })}
          </Text>
        )}
      </View>
      {c > 0 && (
        <Text style={styles.cancelados}>
          {t(c === 1 ? 'onhonra.cancelado' : 'onhonra.cancelados', { n: c })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bloco: { gap: Espaco.xs, alignSelf: 'flex-start' },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Espaco.xs,
    backgroundColor: Honra.verdeSuave,
    borderRadius: Raio.pill,
    paddingHorizontal: Espaco.md,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  honra: { color: Honra.verde, fontSize: 13, fontWeight: '800' },
  honrados: { color: Honra.tinta, fontSize: 13, fontWeight: '700' },
  // A percentagem: verde quando a palavra se cumpre (≥80), tinta neutra abaixo.
  // NUNCA vermelho — a história conta-se, não se grita.
  taxaVerde: { color: Honra.verde, fontSize: 12, fontWeight: '700' },
  taxaNeutra: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '600' },
  // Cancelamento mútuo: neutro e discreto — faz história, não faz marca.
  cancelados: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '600', paddingLeft: Espaco.md },
});
