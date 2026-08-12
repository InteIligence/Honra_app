import { useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import { nomeEscalao, useT, type ChaveI18n } from '@/i18n';
import { Honra } from '@/theme/honra';
import { ESCALOES, nivelDesenho, type NivelPrestigio } from '@/theme/prestigio';

import { Insignia } from './Insignia';

/**
 * MOEDA HONRA — a insígnia como uma moeda de dois lados. A FRENTE é o selo
 * (o medalhão H que se constrói). O VERSO tem a MÁXIMA do escalão gravada —
 * a alma daquele nível, em metal. Toca (ou arrasta) e a moeda VIRA.
 *
 * Isto substitui o "tilt 3D" (que era só inclinar, sem revelar nada): virar
 * uma moeda só vale a pena se do outro lado houver algo digno de se ver.
 */

/** A máxima gravada no verso de cada escalão (chave i18n). */
const FRASE: Record<NivelPrestigio, ChaveI18n> = {
  0: 'moeda.frase0',
  1: 'moeda.frase1',
  2: 'moeda.frase2',
  3: 'moeda.frase3',
  4: 'moeda.frase4',
  5: 'moeda.frase5',
};

export function MoedaInsignia({
  nivel,
  tamanho = 184,
  animarFrente = false,
}: {
  nivel: NivelPrestigio;
  tamanho?: number;
  /** true = a frente (o selo) constrói-se em cena ao montar. */
  animarFrente?: boolean;
}) {
  const { t } = useT();
  const [virada, setVirada] = useState(false);
  // 0 = frente à mostra · 1 = verso à mostra.
  const flip = useRef(new Animated.Value(0)).current;

  function virar() {
    const destino = virada ? 0 : 1;
    setVirada(!virada);
    Animated.timing(flip, {
      toValue: destino,
      duration: 620,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  const frenteRot = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const versoRot = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  const frase = t(FRASE[nivel]);
  const nome = nomeEscalao(t, ESCALOES[nivel]);
  const u = tamanho / 200;

  const lado = (rot: Animated.AnimatedInterpolation<string>) =>
    ({
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backfaceVisibility: 'hidden' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      transform: [{ perspective: 1000 }, { rotateY: rot }],
    });

  return (
    <Pressable
      onPress={virar}
      style={{ width: tamanho, height: tamanho }}
      accessibilityRole="button"
      accessibilityLabel={virada ? nome : t('moeda.virar')}
    >
      {/* FRENTE — o selo. */}
      <Animated.View style={lado(frenteRot)} pointerEvents="none">
        {/* Já não se proíbe aqui o flutuar. A regra é do ESCALÃO — do
            Reconhecido para cima a peça respira, e não faria sentido a moeda
            do percurso mostrar uma peça mais parada do que a do perfil. O
            virar é um gesto de quem toca; o respirar é da própria peça. */}
        <Insignia nivel={nivelDesenho(nivel)} tamanho={tamanho} animar={animarFrente} />
      </Animated.View>

      {/* VERSO — a máxima gravada. */}
      <Animated.View style={lado(versoRot)} pointerEvents="none">
        <Svg width={tamanho} height={tamanho} viewBox="0 0 200 200">
          <Defs>
            <LinearGradient id="moedaOuro" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#f7e6ac" />
              <Stop offset="0.3" stopColor="#d9b45f" />
              <Stop offset="0.6" stopColor="#a67e34" />
              <Stop offset="0.82" stopColor="#e7ce86" />
              <Stop offset="1" stopColor="#6d5120" />
            </LinearGradient>
          </Defs>
          {/* disco + moldura, a mesma "moeda" da frente */}
          <Circle cx="100" cy="100" r="84" fill="#0e2c1e" />
          <Circle cx="100" cy="100" r="80" fill="none" stroke="url(#moedaOuro)" strokeWidth="4.5" />
          <Circle
            cx="100"
            cy="100"
            r="71"
            fill="none"
            stroke="url(#moedaOuro)"
            strokeWidth="1"
            strokeOpacity="0.45"
          />
          {/* ornamento: dois losangos dourados, topo e base */}
          {[30, 170].map((cy) => (
            <G key={cy} transform={`translate(100 ${cy})`}>
              <Path d="M0 -5 L4 0 L0 5 L-4 0 Z" fill="url(#moedaOuro)" />
            </G>
          ))}
        </Svg>
        {/* A frase, por cima do disco — o coração do verso. */}
        <View style={[StyleSheet.absoluteFill, styles.centro, { paddingHorizontal: tamanho * 0.2 }]}>
          <Text style={[styles.escalao, { fontSize: 10 * u + 1 }]}>{nome.toUpperCase()}</Text>
          <View style={[styles.traco, { width: tamanho * 0.16 }]} />
          <Text style={[styles.frase, { fontSize: 13 * u + 1, lineHeight: 18 * u + 2 }]}>
            {frase}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centro: { alignItems: 'center', justifyContent: 'center' },
  escalao: {
    color: Honra.douradoClaro,
    fontWeight: '700',
    letterSpacing: 2,
    opacity: 0.85,
  },
  traco: { height: 1, backgroundColor: Honra.dourado, opacity: 0.5, marginVertical: 7 },
  frase: {
    color: '#f2e4bd',
    fontStyle: 'italic',
    fontWeight: '600',
    textAlign: 'center',
  },
});
