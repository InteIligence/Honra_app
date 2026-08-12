import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Botao, Campo, Cartao, Erro } from '@/components/ui';
import { useT, type ChaveI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { razaoDoServidor } from '@/lib/funcoes';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * ATIVAR PAGAMENTOS — o onboarding Stripe Connect do profissional (Fatia C-1).
 *
 * Voz Honra, mostrar não dizer: o dinheiro das cauções/cobranças dos contratos
 * entra na conta DO PROFISSIONAL — o Honra nunca lhe toca. Isto não é burocracia
 * decorativa: é a estrutura que a lei obriga (direct charges na conta Connect de
 * P; ver DESENHO §11.1). O gate explica-se pelo GANHO ("para a proteção cair na
 * TUA conta"), não pelo medo.
 *
 * Nada é fingido: lê o estado real de `contas_connect` e abre o Account Link
 * real da Stripe. Se algo faltar (chave, Connect por ativar), degrada com
 * honestidade — nunca acende verde que não seja verdade.
 */

type Estado = 'a_configurar' | 'pendente' | 'ativa' | 'restrita';
type ContaConnect = {
  estado: Estado;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  nif: string | null;
};

// A "história" de cada estado — clara, sem eufemismo (textos nos dicionários i18n).
const HISTORIA: Record<Estado, { titulo: ChaveI18n; corpo: ChaveI18n; cor: string }> = {
  a_configurar: {
    titulo: 'pag.estado.a_configurar.titulo',
    corpo: 'pag.estado.a_configurar.corpo',
    cor: Honra.tintaSuave,
  },
  pendente: {
    titulo: 'pag.estado.pendente.titulo',
    corpo: 'pag.estado.pendente.corpo',
    cor: Honra.dourado,
  },
  ativa: {
    titulo: 'pag.estado.ativa.titulo',
    corpo: 'pag.estado.ativa.corpo',
    cor: Honra.verde,
  },
  restrita: {
    titulo: 'pag.estado.restrita.titulo',
    corpo: 'pag.estado.restrita.corpo',
    cor: Honra.erro,
  },
};

export default function AtivarPagamentosScreen() {
  const { session } = useAuth();
  const { t } = useT();
  const uid = session?.user.id;

  const [conta, setConta] = useState<ContaConnect | null>(null);
  const [nif, setNif] = useState('');
  const [aCarregar, setACarregar] = useState(true);
  const [aAbrir, setAAbrir] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    if (!uid) return;
    supabase
      .from('contas_connect')
      .select('estado, charges_enabled, payouts_enabled, nif')
      .eq('perfil_id', uid)
      .maybeSingle()
      .then(({ data }) => {
        const c = data as ContaConnect | null;
        setConta(c);
        if (c?.nif) setNif(c.nif);
        setACarregar(false);
      });
  }, [uid]);

  useFocusEffect(carregar);

  async function ativar() {
    setErro(null);
    setAAbrir(true);
    // Para onde a Stripe deve voltar depois do onboarding: a app (na web, a
    // origem exata; no nativo, um deep link). Mesmo padrão da verificação.
    const return_url =
      Platform.OS === 'web'
        ? `${window.location.origin}/ativar-pagamentos`
        : Linking.createURL('ativar-pagamentos');

    const so = nif.replace(/\D/g, '');
    const { data, error } = await supabase.functions.invoke('connect-onboarding', {
      body: { return_url, ...(so.length === 9 ? { nif: so } : {}) },
    });
    setAAbrir(false);

    if (error || !data?.url) {
      // Mensagem honesta vinda da função (ex.: Connect por ativar) quando houver.
      // Lê os DOIS sítios: o corpo de uma recusa 200 e o `context` de um erro de
      // estado — antes só via o primeiro, e o segundo é o mais comum.
      const msg =
        (data as { error?: string } | null)?.error ??
        (await razaoDoServidor(error)) ??
        t('pag.erro_abrir');
      setErro(msg);
      return;
    }

    if (Platform.OS === 'web') {
      window.location.assign(data.url as string);
      return;
    }
    await WebBrowser.openBrowserAsync(data.url as string);
    carregar(); // volta e relê o estado
  }

  const estado: Estado = conta?.estado ?? 'a_configurar';
  const h = HISTORIA[estado];
  const ativa = estado === 'ativa';
  const nifSo = nif.replace(/\D/g, '');
  const nifValido = nifSo.length === 9;

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <Pressable style={styles.voltar} onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.voltarTxt}>{t('comum.voltar_seta')}</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.corpo}>
        <Text style={styles.titulo}>{t('pag.titulo')}</Text>

        <Text style={styles.intro}>
          {t('pag.intro_1')}
          <Text style={styles.forte}>{t('pag.intro_tua')}</Text>
          {t('pag.intro_2')}
        </Text>

        {/* Estado atual — a "prova", não uma promessa. */}
        <Cartao style={styles.estadoCartao}>
          <View style={styles.estadoLinha}>
            <View style={[styles.ponto, { backgroundColor: h.cor }]} />
            <Text style={[styles.estadoTitulo, { color: h.cor }]}>{t(h.titulo)}</Text>
          </View>
          <Text style={styles.estadoCorpo}>{t(h.corpo)}</Text>
          {ativa && conta && !conta.payouts_enabled ? (
            <Text style={styles.nota}>{t('pag.nota_payouts')}</Text>
          ) : null}
        </Cartao>

        {/* NIF — DAC7 (Lei 36/2023): o Honra tem de o reportar à AT. Pede-se aqui,
            uma vez, com a razão à vista. */}
        {!ativa ? (
          <View style={styles.bloco}>
            <Text style={styles.rotulo}>{t('pag.nif')}</Text>
            <Campo
              placeholder={t('pag.nif_ph')}
              keyboardType="number-pad"
              value={nif}
              onChangeText={setNif}
              maxLength={11}
            />
            <Text style={styles.nota}>{t('pag.nif_nota')}</Text>
          </View>
        ) : null}

        {erro ? <Erro texto={erro} /> : null}

        {ativa ? (
          <Cartao style={styles.feito}>
            <Feather name="check-circle" size={20} color={Honra.verde} />
            <Text style={styles.feitoTxt}>{t('pag.feito')}</Text>
          </Cartao>
        ) : (
          <Botao
            titulo={estado === 'a_configurar' ? t('pag.ligar') : t('pag.continuar')}
            onPress={ativar}
            aCarregar={aAbrir || aCarregar}
            desativado={estado === 'a_configurar' && !nifValido}
          />
        )}

        {estado === 'a_configurar' && !nifValido ? (
          <Text style={styles.notaCentro}>{t('pag.nif_falta')}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  voltar: { paddingHorizontal: Espaco.md, paddingTop: Espaco.sm },
  voltarTxt: { color: Honra.verde, fontSize: 16, fontWeight: '700' },
  corpo: { padding: Espaco.xl, gap: Espaco.md, paddingBottom: Espaco.xxl },
  titulo: { fontSize: 28, fontWeight: '800', color: Honra.tinta },
  intro: { fontSize: 15, lineHeight: 22, color: Honra.tintaSuave },
  forte: { color: Honra.tinta, fontWeight: '800' },

  estadoCartao: { gap: Espaco.xs },
  estadoLinha: { flexDirection: 'row', alignItems: 'center', gap: Espaco.sm },
  ponto: { width: 10, height: 10, borderRadius: Raio.pill },
  estadoTitulo: { fontSize: 17, fontWeight: '800' },
  estadoCorpo: { fontSize: 14, lineHeight: 20, color: Honra.tinta },

  bloco: { gap: Espaco.sm },
  rotulo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  nota: { color: Honra.tintaSuave, fontSize: 13, lineHeight: 19 },
  notaCentro: { color: Honra.tintaSuave, fontSize: 13, textAlign: 'center' },

  feito: { flexDirection: 'row', alignItems: 'center', gap: Espaco.sm },
  feitoTxt: { flex: 1, color: Honra.tinta, fontSize: 15, fontWeight: '600', lineHeight: 21 },
});
