import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Botao } from '@/components/ui';
import { useT } from '@/i18n';
import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * 404 na língua do Honra (063 · #7 UX). Um URL inválido na web caía no ecrã cru
 * do Expo (fundo escuro, tipografia default) — rutura total de marca. Aqui o
 * selo "H" e o caminho de volta ao Início.
 */
export default function NaoEncontrado() {
  const { t } = useT();
  return (
    <SafeAreaView style={styles.fundo}>
      <View style={styles.conteudo}>
        <View style={styles.selo}>
          <Text style={styles.seloTxt}>H</Text>
        </View>
        <Text style={styles.titulo}>{t('nf.titulo')}</Text>
        <Text style={styles.sub}>{t('nf.sub')}</Text>
        <Botao
          titulo={t('nf.voltar')}
          onPress={() => router.replace('/(tabs)/inicio')}
          style={styles.botao}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  conteudo: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Espaco.xl, gap: Espaco.md },
  selo: {
    width: 72,
    height: 72,
    borderRadius: Raio.pill,
    backgroundColor: Honra.verdeEscuro,
    borderWidth: 2,
    borderColor: Honra.dourado,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seloTxt: { fontSize: 32, fontWeight: '800', color: Honra.creme },
  titulo: { fontSize: 24, fontWeight: '800', color: Honra.tinta, textAlign: 'center' },
  sub: { fontSize: 14, color: Honra.tintaSuave, textAlign: 'center' },
  botao: { alignSelf: 'stretch', marginTop: Espaco.sm },
});
