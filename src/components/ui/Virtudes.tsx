import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useT } from '@/i18n';
import { MAX_VIRTUDES, type Virtude } from '@/lib/virtudes';
import { Espaco, Honra } from '@/theme/honra';

/**
 * VIRTUDES — as virtudes IMPRESSAS na credencial, como num documento gravado.
 *
 * Conceito: o Honra Card é uma credencial. Credenciais a sério (passaportes,
 * notas, diplomas) não usam caixas nem medalhas — usam GUILHOCHÉ: a gravação
 * de linhas finas entrelaçadas que diz "autêntico, valioso". Aqui as virtudes
 * ficam estampadas nessa textura de segurança, entre guardas de certificado,
 * com as siglas em relevo (serifadas, gravadas) e um brilho que passa uma vez
 * — a luz a correr sobre o metal impresso. Contido: a lei do prestígio.
 *
 * Sem virtudes (só o próprio vê): a mesma gravação, à espera, e um convite.
 */
const VB_W = 320;
const VB_H = 104;
const SERIF =
  Platform.OS === 'web' ? "Georgia, 'Times New Roman', serif" : Platform.OS === 'ios' ? 'Georgia' : 'serif';

// —— Guilhoché: duas famílias de ondas moduladas que se entrelaçam. ——
function tecer(): string[] {
  const linhas: string[] = [];
  const N = 7;
  for (let fam = 0; fam < 2; fam++) {
    const sinal = fam === 0 ? 1 : -1;
    for (let j = 0; j < N; j++) {
      const base = (j - (N - 1) / 2) * 6.4;
      let d = '';
      for (let x = 0; x <= VB_W; x += 3) {
        const u = (x / VB_W) * Math.PI * 2;
        const env = 27 * Math.cos((x / VB_W - 0.5) * Math.PI); // afina nas pontas
        const y =
          VB_H / 2 +
          base +
          sinal * (env * 0.5) * Math.sin(u * 3 + j * 0.5) +
          sinal * (env * 0.26) * Math.sin(u * 7 + j * 0.9);
        d += (x === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      }
      linhas.push(d);
    }
  }
  return linhas;
}
const GUILHOCHE = tecer();

// —— O fundo gravado: guilhoché + guardas de certificado (sem laterais). ——
function Gravacao() {
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
    >
      {GUILHOCHE.map((d, i) => (
        <Path key={i} d={d} stroke="#C5A45F" strokeWidth={0.5} strokeOpacity={0.15} fill="none" />
      ))}
      {/* Guardas — o par de fios dourados em cima e em baixo (moldura de diploma). */}
      {[10, 13.5, VB_H - 13.5, VB_H - 10].map((y, i) => (
        <Line
          key={`g${i}`}
          x1={14}
          y1={y}
          x2={VB_W - 14}
          y2={y}
          stroke="#E6D2A2"
          strokeWidth={i === 1 || i === 2 ? 0.6 : 1}
          strokeOpacity={i === 1 || i === 2 ? 0.35 : 0.55}
        />
      ))}
    </Svg>
  );
}

// —— Uma sigla estampada: entra como um carimbo (assenta com peso). ——
function ColunaVirtude({ v, index }: { v: Virtude; index: number }) {
  const { t } = useT();
  const a = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(a, {
      toValue: 1,
      duration: 480,
      delay: 160 + index * 120,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [a, index]);

  return (
    <Animated.View
      style={[
        styles.coluna,
        {
          opacity: a,
          transform: [
            { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
            { scale: a.interpolate({ inputRange: [0, 1], outputRange: [1.12, 1] }) }, // "carimba" para dentro
          ],
        },
      ]}
    >
      <Text style={styles.sigla} numberOfLines={1}>
        {v.codigo}
      </Text>
      <Text style={styles.nome} numberOfLines={1}>
        {t(v.chaveNome)}
      </Text>
    </Animated.View>
  );
}

export function Virtudes({
  virtudes,
  aoConvidar,
}: {
  virtudes: Virtude[];
  aoConvidar?: () => void;
}) {
  const { t } = useT();
  const preenchido = virtudes.length > 0;
  const brilho = useRef(new Animated.Value(0)).current;

  // A luz corre sobre a gravação, uma vez, depois das siglas assentarem.
  useEffect(() => {
    if (!preenchido) return;
    const relogio = setTimeout(() => {
      Animated.timing(brilho, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start();
    }, 640);
    return () => clearTimeout(relogio);
  }, [preenchido, brilho]);

  const rotulo = (
    <View style={styles.rotuloLinha}>
      <View style={styles.rotuloHair} />
      <Text style={styles.rotuloTxt}>{t('card.virtudes')}</Text>
      <View style={styles.rotuloHair} />
    </View>
  );

  // —— Convite (só o dono): a gravação à espera. ——
  if (!preenchido) {
    if (!aoConvidar) return null;
    return (
      <Pressable onPress={aoConvidar} style={styles.wrap}>
        {rotulo}
        <View style={styles.faixa}>
          <Gravacao />
          <View style={styles.fila}>
            {Array.from({ length: MAX_VIRTUDES }).map((_, i) => (
              <View key={i} style={styles.coluna}>
                <Text style={styles.siglaFantasma}>·</Text>
                <View style={styles.nomeFantasma} />
              </View>
            ))}
          </View>
        </View>
        <Text style={styles.conviteTxt}>{t('card.virtudes_convite')}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      {rotulo}
      <View style={styles.faixa}>
        <Gravacao />
        <View style={styles.fila}>
          {virtudes.map((v, i) => (
            <ColunaVirtude key={v.codigo} v={v} index={i} />
          ))}
        </View>

        {/* A luz que corre sobre a gravação (uma passagem). */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.brilho,
            {
              opacity: brilho.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: brilho.interpolate({ inputRange: [0, 1], outputRange: [-90, 320] }) },
                { skewX: '-16deg' },
              ],
            },
          ]}
        >
          <Svg width={70} height={VB_H * 2} viewBox={`0 0 70 ${VB_H * 2}`}>
            <Defs>
              <LinearGradient id="luzGrav" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#FFF6E0" stopOpacity={0} />
                <Stop offset="0.5" stopColor="#FFF6E0" stopOpacity={0.22} />
                <Stop offset="1" stopColor="#FFF6E0" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width={70} height={VB_H * 2} fill="url(#luzGrav)" />
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', marginTop: Espaco.md },

  // Cabeçalho: —— VIRTUDES ——
  rotuloLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: Espaco.sm,
    paddingHorizontal: 4,
  },
  rotuloHair: { flex: 1, height: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(197,164,95,0.26)' },
  rotuloTxt: {
    color: 'rgba(230,210,162,0.68)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    marginHorizontal: 10,
  },

  // A faixa gravada: painel impresso, cantos suaves, SEM borda de caixa.
  faixa: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: Honra.verdeMaisEscuro,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 22, paddingHorizontal: 18 },
  coluna: { alignItems: 'center', flex: 1 },

  sigla: {
    fontFamily: SERIF,
    fontSize: 27,
    color: Honra.douradoClaro,
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1.5,
  },
  nome: {
    fontSize: 8.5,
    fontWeight: '700',
    color: 'rgba(230,210,162,0.7)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 8,
  },

  siglaFantasma: { fontFamily: SERIF, fontSize: 27, color: 'rgba(230,210,162,0.4)' },
  nomeFantasma: { width: 28, height: 3, borderRadius: 999, backgroundColor: 'rgba(230,210,162,0.2)', marginTop: 12 },

  conviteTxt: { color: Honra.douradoClaro, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: Espaco.sm },

  brilho: { position: 'absolute', top: -VB_H / 2, left: 0, width: 70, height: VB_H * 2 },
});
