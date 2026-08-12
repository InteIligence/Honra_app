import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Botao, Campo, Cartao, Carregar, Erro } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { razaoDoServidor } from '@/lib/funcoes';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * REVISÃO DE PROFISSÃO (só ADMIN) — a lista de pedidos de cédula pendentes.
 * O admin confirma no portal da Ordem (nome + nº + ativo) e que o nome bate com
 * a IDENTIDADE já verificada (por isso mostramos o nome do perfil ao lado), abre
 * a prova, e Aprova/Rejeita. Só service_role muda o estado (Edge `profissao-rever`).
 * Fechado a não-admins: quem não é admin vê só "sem permissão".
 */
type Pendente = {
  id: string;
  perfil_id: string;
  profissao_declarada: string;
  cedula_numero: string;
  ordem: string;
  ficheiro_path: string; // FRENTE
  ficheiro_verso: string | null; // VERSO (nulo em pedidos anteriores à 030)
  criado_em: string;
  perfil: { nome: string | null; handle: string | null } | null;
};

type Provas = { frente?: string; verso?: string };

export default function RevisaoProfissao() {
  const { session } = useAuth();
  const { t } = useT();
  const uid = session?.user.id;

  const [admin, setAdmin] = useState<boolean | null>(null);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [provas, setProvas] = useState<Record<string, Provas>>({});
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [aProcessar, setAProcessar] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  const carregar = useCallback(async () => {
    if (!uid) return;
    setACarregar(true);
    setErro(null);

    // 064: a app pergunta pela RPC, sem puxar is_admin (fail-closed).
    const { data: ehAdmin } = await supabase.rpc('sou_admin');
    const souAdmin = ehAdmin === true;
    setAdmin(souAdmin);
    if (!souAdmin) {
      setACarregar(false);
      return;
    }

    // O admin lê todos os pedidos (RLS pedprof_admin_ve).
    const { data } = await supabase
      .from('pedidos_profissao')
      .select(
        'id, perfil_id, profissao_declarada, cedula_numero, ordem, ficheiro_path, ficheiro_verso, criado_em, perfil:perfis!perfil_id(nome, handle)',
      )
      .eq('estado', 'pendente')
      .order('criado_em', { ascending: true });
    const linhas = (data as unknown as Pendente[]) ?? [];
    setPendentes(linhas);

    // URLs assinados das provas (bucket privado 'cedulas'; admin lê via RLS).
    const mapa: Record<string, Provas> = {};
    await Promise.all(
      linhas.map(async (p) => {
        const par: Provas = {};
        const { data: sigF } = await supabase.storage
          .from('cedulas')
          .createSignedUrl(p.ficheiro_path, 300);
        if (sigF?.signedUrl) par.frente = sigF.signedUrl;
        if (p.ficheiro_verso) {
          const { data: sigV } = await supabase.storage
            .from('cedulas')
            .createSignedUrl(p.ficheiro_verso, 300);
          if (sigV?.signedUrl) par.verso = sigV.signedUrl;
        }
        mapa[p.id] = par;
      }),
    );
    setProvas(mapa);
    setACarregar(false);
  }, [uid]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function decidir(p: Pendente, decisao: 'aprovar' | 'rejeitar') {
    setErro(null);
    const motivo = (motivos[p.id] ?? '').trim();
    if (decisao === 'rejeitar' && !motivo) {
      setErro(t('revisao.erro_motivo'));
      return;
    }
    setAProcessar(p.id);
    const { data, error } = await supabase.functions.invoke('profissao-rever', {
      body: { pedido_id: p.id, decisao, motivo },
    });
    setAProcessar(null);
    if (error || !data?.revisto) {
      // A razão da função, quando ela deu uma — um genérico fixo aqui escondia
      // o motivo real da recusa a quem está a rever pedidos.
      setErro((await razaoDoServidor(error)) ?? t('revisao.erro_decidir'));
      return;
    }
    // Tira o pedido decidido da lista.
    setPendentes((xs) => xs.filter((x) => x.id !== p.id));
  }

  if (aCarregar) {
    return (
      <SafeAreaView style={styles.fundo} edges={['top']}>
        <View style={styles.topo}>
          <Text style={styles.voltar} onPress={() => router.back()}>
            {t('comum.voltar_seta')}
          </Text>
        </View>
        <Carregar />
      </SafeAreaView>
    );
  }

  if (admin === false) {
    return (
      <SafeAreaView style={styles.fundo} edges={['top']}>
        <View style={styles.topo}>
          <Text style={styles.voltar} onPress={() => router.back()}>
            {t('comum.voltar_seta')}
          </Text>
        </View>
        <View style={styles.corpo}>
          <Text style={styles.titulo}>{t('revisao.sem_permissao')}</Text>
          <Text style={styles.texto}>{t('revisao.sem_permissao_txt')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <View style={styles.topo}>
        <Text style={styles.voltar} onPress={() => router.back()}>
          {t('comum.voltar_seta')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.corpo}>
        <Text style={styles.rotulo}>{t('revisao.rotulo')}</Text>
        <Text style={styles.titulo}>{t('revisao.titulo')}</Text>
        <Text style={styles.texto}>{t('revisao.intro')}</Text>

        {erro && <Erro texto={erro} />}

        {pendentes.length === 0 ? (
          <Text style={styles.vazio}>{t('revisao.vazio')}</Text>
        ) : (
          pendentes.map((p) => (
            <Cartao key={p.id} style={styles.cartao}>
              {/* Nome do PERFIL (para cruzar com a cédula) */}
              <Text style={styles.nome}>{p.perfil?.nome ?? t('revisao.sem_nome')}</Text>
              {p.perfil?.handle ? <Text style={styles.handle}>@{p.perfil.handle}</Text> : null}

              <View style={styles.linha}>
                <Text style={styles.chaveTxt}>{t('revisao.profissao')}</Text>
                <Text style={styles.valorTxt}>{p.profissao_declarada}</Text>
              </View>
              <View style={styles.linha}>
                <Text style={styles.chaveTxt}>{t('revisao.cedula')}</Text>
                <Text style={styles.valorTxt}>{p.cedula_numero}</Text>
              </View>
              <View style={styles.linha}>
                <Text style={styles.chaveTxt}>{t('revisao.ordem')}</Text>
                <Text style={styles.valorTxt}>{p.ordem}</Text>
              </View>

              {/* Provas (URLs assinados do bucket privado) — as DUAS faces da cédula */}
              <Text style={styles.provaRotulo}>{t('revisao.frente')}</Text>
              {provas[p.id]?.frente ? (
                <Pressable onPress={() => Linking.openURL(provas[p.id].frente!)}>
                  <Image
                    source={{ uri: provas[p.id].frente }}
                    style={styles.prova}
                    resizeMode="cover"
                  />
                  <Text style={styles.abrirProva}>{t('revisao.abrir_frente')}</Text>
                </Pressable>
              ) : (
                <Text style={styles.semProva}>{t('revisao.frente_indisp')}</Text>
              )}

              <Text style={styles.provaRotulo}>{t('revisao.verso')}</Text>
              {provas[p.id]?.verso ? (
                <Pressable onPress={() => Linking.openURL(provas[p.id].verso!)}>
                  <Image
                    source={{ uri: provas[p.id].verso }}
                    style={styles.prova}
                    resizeMode="cover"
                  />
                  <Text style={styles.abrirProva}>{t('revisao.abrir_verso')}</Text>
                </Pressable>
              ) : (
                <Text style={styles.semProva}>
                  {p.ficheiro_verso ? t('revisao.verso_indisp') : t('revisao.sem_verso')}
                </Text>
              )}

              <Campo
                placeholder={t('revisao.motivo_ph')}
                value={motivos[p.id] ?? ''}
                onChangeText={(texto) => setMotivos((m) => ({ ...m, [p.id]: texto }))}
                multiline
              />

              <View style={styles.acoes}>
                <Botao
                  titulo={t('revisao.aprovar')}
                  onPress={() => decidir(p, 'aprovar')}
                  aCarregar={aProcessar === p.id}
                  style={styles.aprovar}
                />
                <Botao
                  titulo={t('revisao.rejeitar')}
                  variante="secundario"
                  onPress={() => decidir(p, 'rejeitar')}
                  aCarregar={aProcessar === p.id}
                  style={styles.rejeitar}
                />
              </View>
            </Cartao>
          ))
        )}
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
  vazio: { color: Honra.tintaSuave, fontSize: 15, marginTop: Espaco.lg },

  cartao: { gap: Espaco.xs, marginTop: Espaco.md },
  nome: { fontSize: 18, fontWeight: '800', color: Honra.tinta },
  handle: { fontSize: 13, color: Honra.tintaSuave, marginBottom: Espaco.xs },
  linha: { flexDirection: 'row', justifyContent: 'space-between', gap: Espaco.md },
  chaveTxt: { color: Honra.tintaSuave, fontSize: 14, fontWeight: '700' },
  valorTxt: { color: Honra.tinta, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  prova: {
    width: '100%',
    height: 200,
    borderRadius: Raio.md,
    backgroundColor: Honra.cremeEscuro,
    marginTop: Espaco.sm,
  },
  provaRotulo: {
    color: Honra.tintaSuave,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: Espaco.sm,
  },
  abrirProva: { color: Honra.verde, fontSize: 13, fontWeight: '700', marginTop: Espaco.xs },
  semProva: { color: Honra.erro, fontSize: 13, marginTop: Espaco.sm },

  acoes: { flexDirection: 'row', gap: Espaco.sm, marginTop: Espaco.sm },
  aprovar: { flex: 1 },
  rejeitar: { flex: 1 },
});
