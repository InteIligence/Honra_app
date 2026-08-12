import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Botao, Campo, Erro } from '@/components/ui';
import { useT } from '@/i18n';
import { razaoDoServidor } from '@/lib/funcoes';

/** A razão da função, ou o genérico da casa. A conta vive no `lib/funcoes`. */
const razaoDoServidorOu = async (erro: unknown, generico: string) =>
  (await razaoDoServidor(erro)) ?? generico;
import { supabase } from '@/lib/supabase';
import { Espaco, Honra } from '@/theme/honra';

/**
 * Verificar CONTACTO — acende a aba "Contacto" do selo provando o telemóvel por
 * OTP (Bird). Dois passos: número → código. A verdade é do servidor (a função
 * confirma com o Bird e grava com service_role); aqui só conduzimos a pessoa e
 * mostramos erros honestos (incl. "ainda não disponível" se faltar o fornecedor).
 */
type Passo = 'numero' | 'codigo';

// Normaliza para E.164 simples: 9 dígitos PT → +351…; senão respeita o + que puseres.
function normalizar(bruto: string): string {
  const limpo = bruto.replace(/[\s-]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(limpo)) return limpo;
  const soDigitos = limpo.replace(/\D/g, '');
  if (/^9\d{8}$/.test(soDigitos)) return `+351${soDigitos}`;
  return limpo;
}


export default function VerificarContacto() {
  const { t } = useT();
  const [passo, setPasso] = useState<Passo>('numero');
  const [telefone, setTelefone] = useState('+351');
  const [codigo, setCodigo] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviarCodigo() {
    setErro(null);
    const num = normalizar(telefone);
    if (!/^\+[1-9]\d{7,14}$/.test(num)) {
      setErro(t('vcontacto.erro_numero'));
      return;
    }
    setTelefone(num);
    setAEnviar(true);
    const { data, error } = await supabase.functions.invoke('verificar-contacto', {
      body: { telefone: num },
    });
    setAEnviar(false);
    if (error || !data?.enviado) {
      setErro(await razaoDoServidorOu(error, t('vcontacto.erro_enviar')));
      return;
    }
    setPasso('codigo');
  }

  async function confirmar() {
    setErro(null);
    if (!/^\d{4,8}$/.test(codigo.trim())) {
      setErro(t('vcontacto.erro_codigo_escreve'));
      return;
    }
    setAEnviar(true);
    const { data, error } = await supabase.functions.invoke('confirmar-contacto', {
      body: { codigo: codigo.trim(), telefone },
    });
    setAEnviar(false);
    if (error || !data?.verificado) {
      setErro(await razaoDoServidorOu(error, t('vcontacto.erro_codigo')));
      return;
    }
    // Aceso — volta ao perfil, que relê o selo ao ganhar foco.
    router.back();
  }

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <View style={styles.topo}>
        <Text style={styles.voltar} onPress={() => router.back()}>
          {t('comum.voltar_seta')}
        </Text>
      </View>

      <View style={styles.corpo}>
        <Text style={styles.rotulo}>{t('vcontacto.rotulo')}</Text>
        <Text style={styles.titulo}>
          {passo === 'numero' ? t('vcontacto.titulo_numero') : t('vcontacto.titulo_codigo')}
        </Text>
        <Text style={styles.texto}>
          {passo === 'numero'
            ? t('vcontacto.texto_numero')
            : t('vcontacto.texto_codigo', { telefone })}
        </Text>

        {passo === 'numero' ? (
          <>
            <Text style={styles.label}>{t('vcontacto.telemovel')}</Text>
            <Campo
              placeholder="+351 912 345 678"
              keyboardType="phone-pad"
              autoCapitalize="none"
              value={telefone}
              onChangeText={setTelefone}
            />
            {erro && <Erro texto={erro} />}
            <Botao titulo={t('vcontacto.enviar')} onPress={enviarCodigo} aCarregar={aEnviar} style={styles.botao} />
          </>
        ) : (
          <>
            <Text style={styles.label}>{t('vcontacto.codigo')}</Text>
            <Campo
              placeholder={t('vcontacto.codigo_ph')}
              keyboardType="number-pad"
              value={codigo}
              onChangeText={setCodigo}
            />
            {erro && <Erro texto={erro} />}
            <Botao titulo={t('vcontacto.confirmar')} onPress={confirmar} aCarregar={aEnviar} style={styles.botao} />
            <Text style={styles.reenviar} onPress={() => setPasso('numero')}>
              {t('vcontacto.reenviar')}
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  topo: { paddingHorizontal: Espaco.md, paddingTop: Espaco.sm },
  voltar: { color: Honra.verde, fontSize: 16, fontWeight: '700' },
  corpo: { padding: Espaco.xl, gap: Espaco.sm },
  rotulo: { color: Honra.dourado, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  titulo: { fontSize: 26, fontWeight: '800', color: Honra.tinta },
  texto: { fontSize: 15, lineHeight: 22, color: Honra.tintaSuave, marginBottom: Espaco.md },
  label: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: Espaco.sm },
  botao: { marginTop: Espaco.md },
  reenviar: { color: Honra.tintaSuave, fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: Espaco.md },
});
