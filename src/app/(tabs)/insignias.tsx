import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MoedaInsignia } from '@/components/ui';
import { nomeEscalao, useT } from '@/i18n';
import { Espaco, Honra, LARGURA_SECRETARIA, Raio } from '@/theme/honra';
import { ESCALOES, type NivelPrestigio } from '@/theme/prestigio';

/**
 * ATELIER DAS INSÍGNIAS — ecrã de revisão do desenho (rota escondida, sem
 * botão próprio: chega-se por /insignias). Mostra as 5 insígnias e deixa
 * repetir cada ritual — o mesmo que o Vítor tinha no Claude Design, agora
 * a correr na app a sério.
 */
export default function Insignias() {
  const { t } = useT();
  // Uma "chave" por insígnia: mudá-la remonta o componente e repete o ritual.
  const [chaves, setChaves] = useState<number[]>(() => ESCALOES.map(() => 0));
  // SECRETÁRIA: as 5 insígnias em FILA (lado a lado), não empilhadas.
  const { width } = useWindowDimensions();
  const largo = width >= LARGURA_SECRETARIA;

  const repetir = (i: number) =>
    setChaves((c) => c.map((v, j) => (j === i ? v + 1 : v)));
  const repetirTodas = () =>
    // Derivado da escada, nunca escrito à mão: quando entrou o sexto degrau
    // (Reconhecido, 01/08) este ecrã mostrava cinco e escondia um em silêncio.
    ESCALOES.forEach((_, i) => setTimeout(() => repetir(i), i * 550));

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <View style={styles.topo}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.voltar}>{t('comum.voltar_seta')}</Text>
        </Pressable>
        <Pressable style={styles.todas} onPress={repetirTodas}>
          <Text style={styles.todasTxt}>{t('insig.todas')}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.corpo}>
        <Text style={styles.titulo}>{t('insig.titulo')}</Text>
        <Text style={styles.sub}>{t('insig.sub')}</Text>
        <Text style={styles.dica}>{t('moeda.virar')}</Text>

        <View style={largo ? styles.fila : undefined}>
          {ESCALOES.map((_, i) => (
            <View key={i} style={[styles.bloco, largo && styles.blocoLargo]}>
              <MoedaInsignia
                key={`i${i}-${chaves[i]}`}
                nivel={i as NivelPrestigio}
                animarFrente
                tamanho={largo ? 156 : 184}
              />
              <Text style={styles.nome}>{nomeEscalao(t, ESCALOES[i])}</Text>
              <Pressable style={styles.botao} onPress={() => repetir(i)} hitSlop={6}>
                <Text style={styles.botaoTxt}>{t('insig.repetir')}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Fundo de forja: quase preto, para o ouro cantar (como no desenho).
  fundo: { flex: 1, backgroundColor: '#0a0b09' },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Espaco.lg,
    paddingTop: Espaco.sm,
  },
  voltar: { color: Honra.douradoClaro, fontSize: 16, fontWeight: '700' },
  todas: {
    borderWidth: 1,
    borderColor: 'rgba(200,163,78,.45)',
    borderRadius: Raio.pill,
    paddingVertical: 7,
    paddingHorizontal: Espaco.md,
  },
  todasTxt: { color: Honra.douradoClaro, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  corpo: { padding: Espaco.xl, alignItems: 'center', gap: Espaco.xl, paddingBottom: Espaco.xxl },
  titulo: { color: '#f1ead6', fontSize: 28, fontWeight: '800', textAlign: 'center' },
  sub: {
    color: '#9aa08f',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: -Espaco.md,
  },
  dica: { color: '#c8a34e', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: -Espaco.sm },
  // Secretária: as 5 insígnias numa fila que quebra, centrada e larga.
  fila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: Espaco.xl,
    maxWidth: 1100,
    alignSelf: 'center',
  },
  bloco: { alignItems: 'center', gap: Espaco.sm },
  blocoLargo: { width: 190 },
  nome: { color: '#e7e0cc', fontSize: 19, fontWeight: '700' },
  botao: {
    borderWidth: 1,
    borderColor: 'rgba(200,163,78,.35)',
    borderRadius: Raio.pill,
    paddingVertical: 6,
    paddingHorizontal: Espaco.md,
  },
  botaoTxt: { color: Honra.dourado, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
});
