import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useT, type ChaveI18n } from '@/i18n';
import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * ONBOARDING — a apresentação do dia-1. Conta, em três telas honestas, o que o
 * Honra É e a promessa central (posicionamento travado 12/07): reputação
 * verificada de QUALQUER profissional que leve o trabalho a sério, ganha-se a
 * zero por mérito. Sem passos falsos — a verificação real acontece depois, nos
 * "primeiros passos" do Início. Fundo verde nobre, ouro contido, "mostrar não
 * dizer". Vê-se uma vez (guarda flag local).
 *
 * Se a conta nasceu como EMPRESA (registo → ?tipo=empresa), o 3.º slide fala
 * diretamente a quem contrata: encontrar quem faz bem — e honrar quem contrata.
 */
type Slide = { rotulo: ChaveI18n; titulo: ChaveI18n; corpo: ChaveI18n };

const SLIDES: Slide[] = [
  { rotulo: 'onboarding.s1.rotulo', titulo: 'onboarding.s1.titulo', corpo: 'onboarding.s1.corpo' },
  { rotulo: 'onboarding.s2.rotulo', titulo: 'onboarding.s2.titulo', corpo: 'onboarding.s2.corpo' },
  { rotulo: 'onboarding.s3.rotulo', titulo: 'onboarding.s3.titulo', corpo: 'onboarding.s3.corpo' },
];

// O 3.º slide na voz da EMPRESA — a promessa do lado de quem contrata.
const SLIDE_EMPRESA: Slide = {
  rotulo: 'onboarding.empresa.rotulo',
  titulo: 'onboarding.empresa.titulo',
  corpo: 'onboarding.empresa.corpo',
};

export default function Onboarding() {
  const { t } = useT();
  const { tipo } = useLocalSearchParams<{ tipo?: string }>();
  const slides =
    tipo === 'empresa' ? [SLIDES[0], SLIDES[1], SLIDE_EMPRESA] : SLIDES;
  const [i, setI] = useState(0);
  const ultimo = i === slides.length - 1;
  const s = slides[i];

  async function concluir() {
    try {
      await AsyncStorage.setItem('honra.onboarding.visto', '1');
    } catch {
      // sem persistência — segue na mesma
    }
    router.replace('/(tabs)/inicio');
  }

  return (
    <SafeAreaView style={styles.fundo}>
      {/* Saltar — discreto, sem peso. */}
      <View style={styles.topo}>
        <Pressable onPress={concluir} hitSlop={10}>
          <Text style={styles.saltar}>{t('onboarding.saltar')}</Text>
        </Pressable>
      </View>

      <View style={styles.corpo}>
        {/* Selo "H" — a marca, calma e nobre. */}
        <View style={styles.selo}>
          <Text style={styles.seloTxt}>H</Text>
        </View>

        <Text style={styles.rotulo}>{t(s.rotulo)}</Text>
        <Text style={styles.titulo}>{t(s.titulo)}</Text>
        <Text style={styles.texto}>{t(s.corpo)}</Text>
      </View>

      {/* Pontos de progresso. */}
      <View style={styles.pontos}>
        {slides.map((_, k) => (
          <View key={k} style={[styles.ponto, k === i && styles.pontoAtivo]} />
        ))}
      </View>

      <View style={styles.barra}>
        <Pressable
          style={styles.botao}
          onPress={() => (ultimo ? concluir() : setI((x) => x + 1))}
        >
          <Text style={styles.botaoTxt}>
            {ultimo ? t('onboarding.comecar') : t('onboarding.continuar')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.verdeEscuro },
  topo: { alignItems: 'flex-end', paddingHorizontal: Espaco.xl, paddingTop: Espaco.sm },
  saltar: { color: 'rgba(251,248,241,0.6)', fontSize: 14, fontWeight: '600' },

  corpo: { flex: 1, justifyContent: 'center', paddingHorizontal: Espaco.xl },
  selo: {
    width: 76,
    height: 76,
    borderRadius: Raio.pill,
    borderWidth: 1.5,
    borderColor: Honra.dourado,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Espaco.xl,
  },
  seloTxt: { color: Honra.creme, fontSize: 36, fontWeight: '800' },
  rotulo: {
    color: Honra.douradoClaro,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: Espaco.sm,
  },
  titulo: { color: Honra.creme, fontSize: 34, fontWeight: '800', lineHeight: 40, letterSpacing: -0.5 },
  texto: {
    color: 'rgba(251,248,241,0.75)',
    fontSize: 16,
    lineHeight: 24,
    marginTop: Espaco.md,
    maxWidth: 340,
  },

  pontos: { flexDirection: 'row', gap: Espaco.sm, paddingHorizontal: Espaco.xl, marginBottom: Espaco.md },
  ponto: { width: 8, height: 8, borderRadius: Raio.pill, backgroundColor: 'rgba(251,248,241,0.22)' },
  pontoAtivo: { backgroundColor: Honra.dourado, width: 22 },

  barra: { paddingHorizontal: Espaco.xl, paddingBottom: Espaco.lg },
  botao: {
    backgroundColor: Honra.creme,
    borderRadius: Raio.md,
    paddingVertical: Espaco.md,
    alignItems: 'center',
  },
  botaoTxt: { color: Honra.verdeEscuro, fontSize: 16, fontWeight: '800' },
});
