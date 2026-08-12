import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Botao, Campo, Cartao, Erro } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { razaoDoServidor } from '@/lib/funcoes';

/** A razão da função, ou o genérico da casa. A conta vive no `lib/funcoes`. */
const razaoDoServidorOu = async (erro: unknown, generico: string) =>
  (await razaoDoServidor(erro)) ?? generico;
import { supabase } from '@/lib/supabase';
import { Espaco, Honra } from '@/theme/honra';

/**
 * Verificar PROFISSÃO — o 4.º selo, por DUAS vias (mostrar a proveniência):
 *  (A) pelo TRABALHO — acende sozinho ao cruzar o limiar de negócios honrados.
 *  (B) por CÉDULA — para profissões reguladas: submete a prova (foto/PDF) + nº +
 *      Ordem; fica pendente de revisão humana; só a aprovação acende (origem cédula).
 * A verdade é do registo da Ordem (a prova é só a alegação); aqui conduzimos a
 * pessoa e mostramos o estado com honestidade — nunca fingimos acender.
 */
const LIMIAR_TRABALHO = 2; // ≥2 negócios honrados acende a via (A). Espelha a migração 029.

type Pedido = {
  id: string;
  estado: 'pendente' | 'aprovado' | 'rejeitado';
  profissao_declarada: string;
  ordem: string;
  motivo_rejeicao: string | null;
};


export default function VerificarProfissao() {
  const { session } = useAuth();
  const { t } = useT();
  const uid = session?.user.id;

  const [honrados, setHonrados] = useState<number | null>(null);
  const [profissaoVerde, setProfissaoVerde] = useState(false);
  const [pedido, setPedido] = useState<Pedido | null>(null);

  // Formulário da via B.
  const [profissao, setProfissao] = useState('');
  const [numero, setNumero] = useState('');
  const [ordem, setOrdem] = useState('');
  const [frente, setFrente] = useState<string | null>(null); // caminho no bucket (FRENTE)
  const [verso, setVerso] = useState<string | null>(null); // caminho no bucket (VERSO)
  const [aEnviar, setAEnviar] = useState(false);
  const [aCarregarFace, setACarregarFace] = useState<'frente' | 'verso' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const carregar = useCallback(async () => {
    if (!uid) return;
    const [{ data: perfil }, { data: verifs }, { data: pedidos }] = await Promise.all([
      supabase.from('perfis').select('negocios_honrados').eq('id', uid).maybeSingle(),
      supabase.from('verificacoes').select('aba, estado, origem').eq('perfil_id', uid),
      supabase
        .from('pedidos_profissao')
        .select('id, estado, profissao_declarada, ordem, motivo_rejeicao')
        .eq('perfil_id', uid)
        .order('criado_em', { ascending: false })
        .limit(1),
    ]);
    setHonrados((perfil as { negocios_honrados?: number } | null)?.negocios_honrados ?? 0);
    setProfissaoVerde(
      ((verifs as { aba: string; estado: string }[]) ?? []).some(
        (v) => v.aba === 'profissao' && v.estado === 'verificado',
      ),
    );
    setPedido(((pedidos as Pedido[]) ?? [])[0] ?? null);
  }, [uid]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function escolherProva(face: 'frente' | 'verso') {
    if (!uid) return;
    setErro(null);
    const escolha = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (escolha.canceled || !escolha.assets?.[0]) return;
    setACarregarFace(face);
    try {
      const asset = escolha.assets[0];
      const blob = await (await fetch(asset.uri)).blob();
      const ext = (asset.fileName?.split('.').pop() || 'jpg').toLowerCase();
      const caminho = `${uid}/${face}-${Date.now()}.${ext}`;
      const { error: erroUp } = await supabase.storage
        .from('cedulas')
        .upload(caminho, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
      if (erroUp) throw erroUp;
      if (face === 'frente') setFrente(caminho);
      else setVerso(caminho);
    } catch {
      setErro(t('vprof.erro_prova'));
    } finally {
      setACarregarFace(null);
    }
  }

  async function submeter() {
    setErro(null);
    if (!profissao.trim() || !numero.trim() || !ordem.trim()) {
      setErro(t('vprof.erro_preencher'));
      return;
    }
    if (!frente || !verso) {
      setErro(t('vprof.erro_anexos'));
      return;
    }
    setAEnviar(true);
    const { data, error } = await supabase.functions.invoke('profissao-submeter', {
      body: {
        profissao_declarada: profissao.trim(),
        cedula_numero: numero.trim(),
        ordem: ordem.trim(),
        ficheiro_path: frente,
        ficheiro_verso: verso,
      },
    });
    setAEnviar(false);
    if (error || !data?.submetido) {
      setErro(await razaoDoServidorOu(error, t('vprof.erro_submeter')));
      return;
    }
    setOk(true);
    carregar();
  }

  const faltam = Math.max(0, LIMIAR_TRABALHO - (honrados ?? 0));
  const emRevisao = pedido?.estado === 'pendente';

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <View style={styles.topo}>
        <Text style={styles.voltar} onPress={() => router.back()}>
          {t('comum.voltar_seta')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.corpo}>
        <Text style={styles.rotulo}>{t('vprof.rotulo')}</Text>
        <Text style={styles.titulo}>{t('vprof.titulo')}</Text>
        <Text style={styles.texto}>{t('vprof.intro')}</Text>

        {profissaoVerde && (
          <Cartao style={styles.acesa}>
            <Text style={styles.acesaTxt}>{t('vprof.acesa')}</Text>
          </Cartao>
        )}

        {/* ===== VIA A — pelo trabalho ===== */}
        <View style={styles.via}>
          <Text style={styles.viaTitulo}>{t('vprof.via_a')}</Text>
          <Text style={styles.texto}>{t('vprof.via_a_txt', { n: LIMIAR_TRABALHO })}</Text>
          {!profissaoVerde && (
            <Text style={styles.progresso}>
              {honrados === null
                ? '…'
                : faltam === 0
                  ? t('vprof.limiar_ok')
                  : t('vprof.progresso', { n: honrados, total: LIMIAR_TRABALHO, faltam })}
            </Text>
          )}
        </View>

        {/* ===== VIA B — por cédula ===== */}
        <View style={styles.via}>
          <Text style={styles.viaTitulo}>{t('vprof.via_b')}</Text>
          <Text style={styles.texto}>{t('vprof.via_b_txt')}</Text>

          {emRevisao ? (
            <Cartao style={styles.revisao}>
              <Text style={styles.revisaoTxt}>
                {t('vprof.em_revisao', {
                  profissao: pedido?.profissao_declarada ?? '',
                  ordem: pedido?.ordem ?? '',
                })}
              </Text>
            </Cartao>
          ) : (
            <>
              {pedido?.estado === 'rejeitado' && (
                <Cartao style={styles.rejeitado}>
                  <Text style={styles.rejeitadoTxt}>
                    {pedido.motivo_rejeicao
                      ? t('vprof.rejeitado_com', { motivo: pedido.motivo_rejeicao })
                      : t('vprof.rejeitado_sem')}
                  </Text>
                </Cartao>
              )}

              <Text style={styles.label}>{t('vprof.profissao')}</Text>
              <Campo placeholder={t('vprof.profissao_ph')} value={profissao} onChangeText={setProfissao} />

              <Text style={styles.label}>{t('vprof.numero')}</Text>
              <Campo
                placeholder={t('vprof.numero_ph')}
                autoCapitalize="characters"
                value={numero}
                onChangeText={setNumero}
              />

              <Text style={styles.label}>{t('vprof.ordem')}</Text>
              <Campo placeholder={t('vprof.ordem_ph')} value={ordem} onChangeText={setOrdem} />

              <Text style={styles.label}>{t('vprof.frente')}</Text>
              <Botao
                titulo={frente ? t('vprof.frente_ok') : t('vprof.anexar_frente')}
                variante="secundario"
                onPress={() => escolherProva('frente')}
                aCarregar={aCarregarFace === 'frente'}
              />

              <Text style={styles.label}>{t('vprof.verso')}</Text>
              <Botao
                titulo={verso ? t('vprof.verso_ok') : t('vprof.anexar_verso')}
                variante="secundario"
                onPress={() => escolherProva('verso')}
                aCarregar={aCarregarFace === 'verso'}
              />

              {erro && <Erro texto={erro} />}
              {ok && <Text style={styles.sucesso}>{t('vprof.sucesso')}</Text>}

              <Botao
                titulo={t('vprof.submeter')}
                onPress={submeter}
                aCarregar={aEnviar}
                desativado={ok || !frente || !verso}
                style={styles.botao}
              />
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  topo: { paddingHorizontal: Espaco.md, paddingTop: Espaco.sm },
  voltar: { color: Honra.verde, fontSize: 16, fontWeight: '700' },
  corpo: { padding: Espaco.xl, gap: Espaco.sm, paddingBottom: Espaco.xxl },
  rotulo: { color: Honra.dourado, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  titulo: { fontSize: 26, fontWeight: '800', color: Honra.tinta },
  texto: { fontSize: 15, lineHeight: 22, color: Honra.tintaSuave },

  via: {
    gap: Espaco.sm,
    marginTop: Espaco.lg,
    paddingTop: Espaco.md,
    borderTopWidth: 1,
    borderTopColor: Honra.cremeEscuro,
  },
  viaTitulo: { fontSize: 18, fontWeight: '800', color: Honra.tinta },
  progresso: { fontSize: 14, fontWeight: '700', color: Honra.verde },

  acesa: { backgroundColor: Honra.verdeSuave, borderColor: Honra.verde, borderWidth: 1 },
  acesaTxt: { color: Honra.verde, fontSize: 15, fontWeight: '700' },
  revisao: { backgroundColor: Honra.brancoCreme },
  revisaoTxt: { color: Honra.tinta, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  rejeitado: { backgroundColor: Honra.brancoCreme, borderColor: Honra.erro, borderWidth: 1 },
  rejeitadoTxt: { color: Honra.erro, fontSize: 14, lineHeight: 20, fontWeight: '600' },

  label: {
    color: Honra.tintaSuave,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: Espaco.sm,
  },
  sucesso: { color: Honra.verde, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  botao: { marginTop: Espaco.md },
});
