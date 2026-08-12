import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Botao } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * Convidar cliente — a porta (a) do contrato-convite: o profissional partilha o
 * MESMO link do Card (`/c/<id>`) OU mostra o QR ao cliente, que o scaneia e
 * preenche o formulário. Quem preenche é o cliente; isto só entrega o convite
 * pela mão (link para enviar, QR para mostrar em pessoa — ideal em eventos).
 */
function linkConvite(uid: string): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/c/${uid}`;
  }
  return `https://honraapp.com/c/${uid}`;
}

export default function ConvidarCliente() {
  const { t } = useT();
  const { session } = useAuth();
  const uid = session?.user.id;
  const link = uid ? linkConvite(uid) : 'https://honraapp.com';
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  // QR só na web (o `qrcode` usa canvas). O link fica sempre à vista como recurso.
  useEffect(() => {
    if (Platform.OS !== 'web' || !uid) return;
    let vivo = true;
    import('qrcode')
      .then((QR) => QR.toDataURL(link, { margin: 1, width: 240 }))
      .then((uri) => {
        if (vivo) setQrUri(uri);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [link, uid]);

  async function partilhar() {
    setCopiado(false);
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({ text: t('convidar.texto'), url: link });
          return;
        }
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(link);
          setCopiado(true);
          return;
        }
      } else {
        await Share.share({ message: `${t('convidar.texto')} ${link}` });
      }
    } catch {
      // Silêncio: o link continua à vista para copiar à mão.
    }
  }

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <View style={styles.topo}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.voltar}>{t('comum.voltar_seta')}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.corpo}>
        <Text style={styles.titulo}>{t('convidar.titulo')}</Text>
        <Text style={styles.sub}>{t('convidar.sub')}</Text>

        {qrUri ? (
          <View style={styles.qrCartao}>
            <Image source={{ uri: qrUri }} style={styles.qr} />
            <Text style={styles.qrNota}>{t('convidar.qr_nota')}</Text>
          </View>
        ) : null}

        <View style={styles.linkCartao}>
          <Text style={styles.linkTxt} selectable>
            {link}
          </Text>
        </View>

        <Botao
          titulo={copiado ? t('convidar.copiado') : t('convidar.partilhar')}
          onPress={partilhar}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  topo: { paddingHorizontal: Espaco.xl, paddingTop: Espaco.sm },
  voltar: { color: Honra.verde, fontSize: 16, fontWeight: '700' },
  corpo: { padding: Espaco.xl, gap: Espaco.md, alignItems: 'stretch' },
  titulo: { fontSize: 26, fontWeight: '800', color: Honra.tinta },
  sub: { fontSize: 14, color: Honra.tintaSuave, marginBottom: Espaco.sm },
  qrCartao: {
    alignItems: 'center',
    gap: Espaco.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: Raio.lg,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    padding: Espaco.lg,
  },
  qr: { width: 240, height: 240 },
  qrNota: { fontSize: 13, color: Honra.tintaSuave, textAlign: 'center' },
  linkCartao: {
    backgroundColor: Honra.cremeEscuro,
    borderRadius: Raio.md,
    paddingVertical: Espaco.md,
    paddingHorizontal: Espaco.lg,
  },
  linkTxt: { fontSize: 14, color: Honra.tinta, fontWeight: '600' },
});
