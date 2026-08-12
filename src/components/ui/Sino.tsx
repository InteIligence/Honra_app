/**
 * HONRA — Sino de avisos. Símbolo desenhado (sem emoji), com contagem por ler e
 * um PULSAR dourado quando há algo a apertar o coração (urgente ou relógio a
 * fechar). Dourado, não vermelho: pressão digna, não alarme (DESIGN-SYSTEM §tom).
 * Toca → abre /avisos.
 */
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAvisos } from '@/lib/avisos';
import { Honra } from '@/theme/honra';

export function Sino({ cor = Honra.tinta }: { cor?: string }) {
  const { naoLidas, pulsar } = useAvisos();
  const anim = useRef(new Animated.Value(0)).current;

  // Liga/desliga o anel a pulsar conforme haja urgência.
  useEffect(() => {
    if (!pulsar) {
      anim.stopAnimation();
      anim.setValue(0);
      return;
    }
    const laco = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    laco.start();
    return () => laco.stop();
  }, [pulsar, anim]);

  const escala = anim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.9] });
  const opacidade = anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <Pressable
      onPress={() => router.push('/avisos')}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`Avisos${naoLidas ? `, ${naoLidas} por ler` : ''}`}
      style={styles.toque}
    >
      {/* Anel a pulsar (só visível quando há urgência). */}
      {pulsar && (
        <Animated.View
          pointerEvents="none"
          style={[styles.anel, { transform: [{ scale: escala }], opacity: opacidade }]}
        />
      )}

      {/* Sino desenhado — traço fino e elegante (contorno, não bloco). */}
      <View style={styles.sino}>
        {/* Pega no topo. */}
        <View style={[styles.nub, { backgroundColor: cor }]} />
        {/* Corpo em domo, só contorno (linha fina). */}
        <View style={[styles.corpo, { borderColor: cor }]} />
        {/* Lábio flareado — a linha larga da boca do sino. */}
        <View style={[styles.rim, { backgroundColor: cor }]} />
        {/* Badalo. */}
        <View style={[styles.badalo, { backgroundColor: cor }]} />
      </View>

      {/* Contagem por ler. */}
      {naoLidas > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeTxt}>{naoLidas > 9 ? '9+' : naoLidas}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toque: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  anel: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Honra.dourado,
  },
  sino: { alignItems: 'center', justifyContent: 'center' },
  // Pega discreta no cimo do domo.
  nub: { width: 4, height: 3, borderRadius: 2, marginBottom: 0.5 },
  // Corpo do sino: apenas contorno fino, ombros arredondados, laterais quase a pique.
  corpo: {
    width: 16,
    height: 14,
    borderWidth: 1.6,
    backgroundColor: 'transparent',
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    borderBottomWidth: 0, // a boca é fechada pelo lábio (rim), evita linha dupla
  },
  // Lábio da boca do sino: linha larga e fina, mais aberta que o corpo.
  rim: { width: 22, height: 1.6, borderRadius: 1, marginTop: -0.8 },
  // Badalo suspenso.
  badalo: { width: 3.6, height: 3.6, borderRadius: 1.8, marginTop: 2 },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: Honra.dourado,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTxt: { color: Honra.verdeMaisEscuro, fontSize: 10, fontWeight: '800' },
});
