import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Botao } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra } from '@/theme/honra';

/**
 * Retorno da verificação de identidade (Stripe Identity). O resultado real chega
 * pelo webhook e acende a aba do selo — mas PODE falhar (ex.: documento não
 * reconhecido → 'requires_input'). Em vez de prometer que "acende sozinha", este
 * ecrã CONFIRMA o estado real (sonda a BD uns segundos) e diz a verdade:
 *   • verificado → celebra e volta ao perfil;
 *   • ainda pendente ao fim de ~12s → honesto ("pode demorar, ou não passou").
 */
type Estado = 'a_confirmar' | 'verificado' | 'pendente';

export default function Verificado() {
  const { session } = useAuth();
  const { t } = useT();
  const [estado, setEstado] = useState<Estado>('a_confirmar');

  useEffect(() => {
    if (!session) return;
    let vivo = true;
    let tentativas = 0;
    const iv = setInterval(async () => {
      tentativas += 1;
      const { data } = await supabase
        .from('verificacoes')
        .select('estado')
        .eq('perfil_id', session.user.id)
        .eq('aba', 'identidade')
        .maybeSingle();
      if (!vivo) return;
      if (data?.estado === 'verificado') {
        setEstado('verificado');
        clearInterval(iv);
        setTimeout(() => router.replace('/perfil'), 1600);
      } else if (tentativas >= 6) {
        // ~12s (6 × 2s): não confirmou. Honesto, sem fingir.
        setEstado('pendente');
        clearInterval(iv);
      }
    }, 2000);
    return () => {
      vivo = false;
      clearInterval(iv);
    };
  }, [session]);

  return (
    <SafeAreaView style={styles.fundo}>
      <View style={styles.centro}>
        <Text style={styles.marca}>Honra</Text>

        {estado === 'a_confirmar' && (
          <>
            <ActivityIndicator color={Honra.douradoClaro} style={styles.spinner} />
            <Text style={styles.titulo}>{t('verificado.a_confirmar')}</Text>
            <Text style={styles.texto}>{t('verificado.a_confirmar_txt')}</Text>
          </>
        )}

        {estado === 'verificado' && (
          <>
            <Text style={styles.selo}>✓</Text>
            <Text style={styles.titulo}>{t('verificado.ok')}</Text>
            <Text style={styles.texto}>{t('verificado.ok_txt')}</Text>
          </>
        )}

        {estado === 'pendente' && (
          <>
            <Text style={styles.titulo}>{t('verificado.pendente')}</Text>
            <Text style={styles.texto}>{t('verificado.pendente_txt')}</Text>
            <Botao titulo={t('verificado.ir_perfil')} onPress={() => router.replace('/perfil')} style={styles.botao} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.verdeEscuro },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Espaco.xl, gap: Espaco.md },
  marca: { color: Honra.douradoClaro, fontSize: 15, fontWeight: '800', letterSpacing: 2 },
  spinner: { marginTop: Espaco.sm },
  selo: { color: Honra.douradoClaro, fontSize: 44, fontWeight: '900' },
  titulo: { color: Honra.creme, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  texto: { color: 'rgba(251,248,241,0.75)', fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 340 },
  botao: { marginTop: Espaco.sm, minWidth: 220 },
});
