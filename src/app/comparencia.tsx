import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Botao, Carregar, Erro } from '@/components/ui';
import { useT } from '@/i18n';
import { razaoDoServidor } from '@/lib/funcoes';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * COMPARÊNCIA (Fatia E) — o ecrã do PROFISSIONAL no dia do evento.
 *
 * A camada 1 que blinda a fuga E: o P mostra ao cliente um CÓDIGO ROTATIVO (6
 * dígitos, derivado de segredo do servidor, muda ~a cada 45s). O cliente,
 * presente, lê-o do ecrã e submete-o com um OTP fresco (que só chega ao
 * telemóvel dele) → cunha a prova de encontro, que TRAVA o `nao_recebi`
 * indevido. Mostrar, não dizer: o código grande, a contagem, e um link para o
 * cliente. O 6-dígitos é o mecanismo real; o QR é conveniência (web).
 */

type Dados = {
  codigo: string;
  qr_payload: string;
  segundos_ate_rodar: number;
};

export default function Comparencia() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const [dados, setDados] = useState<Dados | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [jaProvado, setJaProvado] = useState(false);
  const [foraJanela, setForaJanela] = useState(false);
  const [segundos, setSegundos] = useState(45);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [aEnviarLink, setAEnviarLink] = useState(false);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.functions.invoke('convite-comparencia', {
      body: { contrato_id: id },
    });
    setACarregar(false);
    if (error || !data) {
      setErro((await razaoDoServidor(error)) ?? t('comp.erro_carregar'));
      return;
    }
    if (data.ja_provado) {
      setJaProvado(true);
      return;
    }
    if (data.error) {
      // A função devolve 409 fora da janela do evento.
      setForaJanela(true);
      return;
    }
    setErro(null);
    setDados({ codigo: data.codigo, qr_payload: data.qr_payload, segundos_ate_rodar: data.segundos_ate_rodar });
    setSegundos(Number(data.segundos_ate_rodar ?? 45));
  }, [id, t]);

  // Poll periódico (o código roda ~45s; renovamos com folga).
  useEffect(() => {
    carregar();
    const poll = setInterval(carregar, 10_000);
    return () => clearInterval(poll);
  }, [carregar]);

  // Contagem local; ao chegar a 0, renova já.
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;
  useEffect(() => {
    const tick = setInterval(() => {
      setSegundos((s) => {
        if (s <= 1) {
          carregarRef.current();
          return 45;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // QR (só web — o `qrcode` usa canvas). Cosmético; o 6-dígitos é o que conta.
  useEffect(() => {
    if (Platform.OS !== 'web' || !dados?.qr_payload) return;
    let vivo = true;
    import('qrcode')
      .then((QR) => QR.toDataURL(dados.qr_payload, { margin: 1, width: 220 }))
      .then((uri: string) => {
        if (vivo) setQrUri(uri);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [dados?.qr_payload]);

  async function enviarLink() {
    setAEnviarLink(true);
    setLinkMsg(null);
    const { data, error } = await supabase.functions.invoke('convite-comparencia', {
      body: { acao: 'link', contrato_id: id },
    });
    setAEnviarLink(false);
    if (error || !data?.enviado) {
      setLinkMsg(data?.error ?? (await razaoDoServidor(error)) ?? t('comp.erro_link'));
      return;
    }
    setLinkMsg(t('comp.link_enviado'));
  }

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <View style={styles.topo}>
        <Text style={styles.voltar} onPress={() => router.back()}>
          {t('comp.voltar')}
        </Text>
        <Text style={styles.titulo}>{t('comp.titulo')}</Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView contentContainerStyle={styles.corpo}>
        {aCarregar ? (
          <Carregar />
        ) : jaProvado ? (
          <View style={styles.card}>
            <Text style={styles.provado}>{t('comp.ja_provado')}</Text>
          </View>
        ) : foraJanela ? (
          <View style={styles.card}>
            <Text style={styles.sub}>{t('comp.fora_janela')}</Text>
          </View>
        ) : erro ? (
          <Erro texto={erro} />
        ) : dados ? (
          <>
            <Text style={styles.sub}>{t('comp.sub')}</Text>

            <View style={styles.codigoCard}>
              <Text style={styles.codigoRotulo}>{t('comp.codigo_rotulo')}</Text>
              <Text style={styles.codigo}>{dados.codigo}</Text>
              <Text style={styles.roda}>{t('comp.roda_em', { s: segundos })}</Text>
            </View>

            {qrUri ? (
              <View style={styles.qrWrap}>
                <Image source={{ uri: qrUri }} style={styles.qr} />
              </View>
            ) : null}

            <Text style={styles.instrucao}>{t('comp.instrucao')}</Text>

            {linkMsg ? <Text style={styles.linkMsg}>{linkMsg}</Text> : null}
            <Botao
              titulo={t('comp.enviar_link')}
              variante="secundario"
              onPress={enviarLink}
              aCarregar={aEnviarLink}
            />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Espaco.md,
    paddingTop: Espaco.md,
  },
  voltar: { color: Honra.verde, fontSize: 16, fontWeight: '700', width: 70 },
  titulo: { fontSize: 20, fontWeight: '800', color: Honra.tinta },
  corpo: { padding: Espaco.md, gap: Espaco.md, paddingBottom: Espaco.xxl, alignItems: 'center' },
  card: {
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.lg,
    padding: Espaco.lg,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    width: '100%',
  },
  sub: { fontSize: 14, color: Honra.tintaSuave, lineHeight: 20, textAlign: 'center' },
  provado: { fontSize: 15, color: Honra.verde, fontWeight: '700', textAlign: 'center' },
  codigoCard: {
    backgroundColor: Honra.verdeEscuro,
    borderRadius: Raio.lg,
    paddingVertical: Espaco.lg,
    paddingHorizontal: Espaco.xl,
    alignItems: 'center',
    width: '100%',
  },
  codigoRotulo: { fontSize: 11, letterSpacing: 1, fontWeight: '700', color: Honra.douradoClaro },
  codigo: { fontSize: 44, fontWeight: '800', color: '#fff', letterSpacing: 8, marginTop: 6 },
  roda: { fontSize: 12, color: 'rgba(238,234,222,0.7)', marginTop: 6 },
  qrWrap: { padding: Espaco.md, backgroundColor: '#fff', borderRadius: Raio.md },
  qr: { width: 200, height: 200 },
  instrucao: { fontSize: 13, color: Honra.tintaSuave, lineHeight: 19, textAlign: 'center' },
  linkMsg: { fontSize: 13, color: Honra.verde, fontWeight: '600', textAlign: 'center' },
});
