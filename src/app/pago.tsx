import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Botao } from '@/components/ui';
import { useT } from '@/i18n';
import { Espaco, Honra } from '@/theme/honra';

/**
 * Retorno do pagamento da caução. O Stripe devolve aqui (mesma aba, na web) com
 * `?orcamento=<id>`. A verdade do hold vem do webhook — este ecrã só traz a
 * pessoa de volta ao negócio, sem a deixar presa numa página morta.
 * Sucesso e cancelamento voltam ambos aqui: não afirmamos que pagou, só que
 * voltou; o estado real aparece no próprio negócio.
 */
export default function Pago() {
  const { t } = useT();
  const { orcamento } = useLocalSearchParams<{ orcamento?: string }>();

  function continuar() {
    if (orcamento) router.replace(`/projeto/${orcamento}`);
    else router.replace('/inicio');
  }

  // Volta sozinho ao negócio passado um instante (dá tempo de ler a mensagem).
  useEffect(() => {
    const t = setTimeout(continuar, 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orcamento]);

  return (
    <SafeAreaView style={styles.fundo}>
      <View style={styles.centro}>
        {/* Wordmark da casa: `Honra.` com o ponto dourado, igual ao átrio
            (H maiúsculo — decisão do Vítor 28/07). */}
        <Text style={styles.marca}>
          Honra<Text style={styles.marcaPonto}>.</Text>
        </Text>
        <Text style={styles.titulo}>{t('pago.titulo')}</Text>
        <Text style={styles.texto}>{t('pago.texto')}</Text>
        <Botao titulo={t('pago.voltar')} onPress={continuar} style={styles.botao} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.verdeEscuro },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Espaco.xl, gap: Espaco.md },
  marca: { color: Honra.douradoClaro, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  marcaPonto: { color: Honra.dourado },
  titulo: { color: Honra.creme, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  texto: { color: 'rgba(251,248,241,0.75)', fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 320 },
  botao: { marginTop: Espaco.sm, minWidth: 220 },
});
