/**
 * HONRA — Apresentar trabalho: o executante escolhe quais dos seus negócios
 * HONRADOS ficam na montra do perfil (trabalho comprovado, migração 055).
 *
 * Não é automático de propósito: a montra é dele, o mérito também — destacar
 * é um gesto. E o nome de quem contratou nunca aparece por arrasto: o
 * sub-toggle só PEDE o consentimento; quem decide é a outra parte, nos
 * avisos dela. A BD (guarda da 055) garante que nenhum atalho salta isto.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Campo, Carregar, Cartao, Chip, Erro, formatarData, Vazio } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, Raio } from '@/theme/honra';

// O "chegou a honrado" canónico da casa (o mesmo leque da 016/055).
const HONRADOS = ['honrado', 'entregue', 'concluido', 'confirmado_ambos', 'devolvido'];

type OrcHonrado = {
  id: string;
  descricao: string | null;
  criado_em: string;
  selado_em: string | null;
  evolucao_ficheiro: string | null;
  de_perfil: string;
  para_perfil: string;
  de?: { nome: string | null } | null;
  para?: { nome: string | null } | null;
};

type Destaque = {
  id: string;
  orcamento_id: string;
  titulo: string | null;
  mostrar_contratante: boolean;
  consentimento_estado: 'pendente' | 'aceite' | 'recusado';
};

// Título curto com estado próprio: grava ao sair do campo. Guardar o texto
// aqui (e não no evento de blur) poupa-nos às diferenças nativo/web do RN.
function CampoTitulo({
  inicial,
  placeholder,
  aoGuardar,
}: {
  inicial: string;
  placeholder: string;
  aoGuardar: (texto: string) => void;
}) {
  const [texto, setTexto] = useState(inicial);
  return (
    <Campo
      placeholder={placeholder}
      value={texto}
      onChangeText={setTexto}
      onBlur={() => aoGuardar(texto)}
      onEndEditing={() => aoGuardar(texto)}
    />
  );
}

// Miniatura da entrega (bucket privado 'evolucoes' → URL assinado; como
// parte do negócio tenho sempre leitura, mesmo sem destacar).
function MiniFoto({ caminho }: { caminho: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    supabase.storage
      .from('evolucoes')
      .createSignedUrl(caminho, 3600)
      .then(({ data }) => vivo && setUrl(data?.signedUrl ?? null));
    return () => {
      vivo = false;
    };
  }, [caminho]);
  if (!url) return <View style={styles.miniatura} />;
  return <Image source={{ uri: url }} style={styles.miniatura} resizeMode="cover" />;
}

export default function ApresentarTrabalho() {
  const { session } = useAuth();
  const { t } = useT();
  const uid = session?.user.id;
  const [negocios, setNegocios] = useState<OrcHonrado[]>([]);
  // Foto por negócio: evolucao_ficheiro (007) ou a evidência do último
  // checkpoint com foto (047) — a MESMA regra da view pública, para o que o
  // executante vê aqui bater certo com o que o mundo verá no perfil.
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [destaques, setDestaques] = useState<Destaque[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null); // orcamento em gravação

  const carregar = useCallback(() => {
    if (!uid) return;
    setErro(null);
    // Os meus negócios honrados — a RLS (orc_partes_veem) já me limita aos meus.
    supabase
      .from('orcamentos')
      .select(
        'id, descricao, criado_em, selado_em, evolucao_ficheiro, de_perfil, para_perfil, de:perfis!de_perfil(nome), para:perfis!para_perfil(nome)',
      )
      .in('estado', HONRADOS)
      .order('criado_em', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setErro(t('apres.erro_carregar'));
          setACarregar(false);
          return;
        }
        const xs = ((data as any[]) ?? []) as OrcHonrado[];
        setNegocios(xs);
        setACarregar(false);
        // Fallback de foto: a evidência de checkpoint mais recente (047).
        const semFoto = xs.filter((o) => !o.evolucao_ficheiro).map((o) => o.id);
        if (semFoto.length > 0) {
          supabase
            .from('checkpoints_orcamento')
            .select('orcamento_id, ordem, evidencia_ficheiro')
            .in('orcamento_id', semFoto)
            .not('evidencia_ficheiro', 'is', null)
            .order('ordem', { ascending: true })
            .then(({ data: cps }) => {
              const mapa: Record<string, string> = {};
              // ordem ascendente → a última escrita por orçamento fica (a maior).
              for (const cp of (cps as any[]) ?? []) mapa[cp.orcamento_id] = cp.evidencia_ficheiro;
              setFotos(mapa);
            });
        }
      });
    // O que já está na montra.
    supabase
      .from('trabalhos_comprovados')
      .select('id, orcamento_id, titulo, mostrar_contratante, consentimento_estado')
      .eq('perfil_id', uid)
      .then(({ data }) => setDestaques(((data as any[]) ?? []) as Destaque[]));
  }, [uid, t]);

  useFocusEffect(carregar);

  // Liga/desliga o destaque: a linha nasce ou morre (o toggle É a linha).
  async function alternarDestaque(orc: OrcHonrado, destaque: Destaque | undefined) {
    if (!uid || ocupado) return;
    setErro(null);
    setOcupado(orc.id);
    const { error } = destaque
      ? await supabase.from('trabalhos_comprovados').delete().eq('id', destaque.id)
      : await supabase.from('trabalhos_comprovados').insert({ orcamento_id: orc.id, perfil_id: uid });
    setOcupado(null);
    if (error) setErro(t('apres.erro_guardar'));
    else carregar();
  }

  // Liga/desliga o "mostrar quem contratou". Ligar dispara o pedido de
  // consentimento (aviso à contraparte) — tudo do lado da BD (055 §4).
  async function alternarNome(destaque: Destaque) {
    if (ocupado) return;
    setErro(null);
    setOcupado(destaque.orcamento_id);
    const { error } = await supabase
      .from('trabalhos_comprovados')
      .update({ mostrar_contratante: !destaque.mostrar_contratante })
      .eq('id', destaque.id);
    setOcupado(null);
    if (error) setErro(t('apres.erro_guardar'));
    else carregar();
  }

  // Título curto — grava ao sair do campo (sem botão a atravancar).
  async function guardarTitulo(destaque: Destaque, titulo: string) {
    const limpo = titulo.trim() || null;
    if (limpo === destaque.titulo) return;
    const { error } = await supabase
      .from('trabalhos_comprovados')
      .update({ titulo: limpo })
      .eq('id', destaque.id);
    if (error) setErro(t('apres.erro_guardar'));
    else setDestaques((xs) => xs.map((d) => (d.id === destaque.id ? { ...d, titulo: limpo } : d)));
  }

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <Pressable style={styles.voltar} onPress={() => router.back()} hitSlop={10}>
        <Text style={styles.voltarTxt}>{t('comum.voltar_seta')}</Text>
      </Pressable>
      <Text style={styles.titulo}>{t('apres.titulo')}</Text>
      <Text style={styles.sub}>{t('apres.sub')}</Text>

      {aCarregar ? (
        <Carregar />
      ) : (
        <ScrollView contentContainerStyle={styles.corpo}>
          {erro && <Erro texto={erro} />}
          {negocios.length === 0 && <Vazio texto={t('apres.vazio')} />}
          {negocios.map((orc) => {
            const destaque = destaques.find((d) => d.orcamento_id === orc.id);
            // Quem é a outra parte depende do carril em que estive neste negócio.
            const souA = orc.de_perfil === uid;
            const outroNome = (souA ? orc.para?.nome : orc.de?.nome) ?? null;
            const foto = orc.evolucao_ficheiro ?? fotos[orc.id] ?? null;
            const data = (orc.selado_em ?? orc.criado_em).slice(0, 10);
            return (
              <Cartao key={orc.id} style={styles.cartao}>
                <View style={styles.linha}>
                  {foto ? (
                    <MiniFoto caminho={foto} />
                  ) : (
                    <View style={[styles.miniatura, styles.miniaturaVazia]}>
                      <Text style={styles.miniaturaVaziaTxt}>✓</Text>
                    </View>
                  )}
                  <View style={styles.meio}>
                    <Text style={styles.desc} numberOfLines={1}>
                      {orc.descricao || t('apres.negocio')}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {outroNome ? `${t('apres.com', { nome: outroNome })} · ` : ''}
                      {formatarData(data)}
                    </Text>
                  </View>
                </View>

                {/* Os toggles falam a língua dos Chips (como a disponibilidade
                    no perfil): ativo = verde suave, verde = significado. */}
                <View style={styles.chips}>
                  <Chip
                    texto={t('apres.destacar')}
                    ativo={!!destaque}
                    onPress={() => alternarDestaque(orc, destaque)}
                  />
                  {destaque && (
                    <Chip
                      texto={t('apres.mostrar_nome')}
                      ativo={destaque.mostrar_contratante}
                      onPress={() => alternarNome(destaque)}
                    />
                  )}
                </View>

                {destaque && !destaque.mostrar_contratante && (
                  <Text style={styles.nota}>{t('apres.pede_consentimento')}</Text>
                )}
                {destaque?.mostrar_contratante && (
                  /* O estado do consentimento, sem drama: verde só no "sim". */
                  <Text
                    style={[
                      styles.nota,
                      destaque.consentimento_estado === 'aceite' && styles.notaAceite,
                    ]}
                  >
                    {destaque.consentimento_estado === 'aceite'
                      ? t('apres.consent_aceite')
                      : destaque.consentimento_estado === 'recusado'
                        ? t('apres.consent_recusado')
                        : t('apres.consent_pendente')}
                  </Text>
                )}

                {destaque && (
                  <CampoTitulo
                    key={destaque.id}
                    inicial={destaque.titulo ?? ''}
                    placeholder={t('apres.titulo_ph')}
                    aoGuardar={(texto) => guardarTitulo(destaque, texto)}
                  />
                )}
              </Cartao>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  voltar: { paddingHorizontal: Espaco.xl, paddingTop: Espaco.sm, alignSelf: 'flex-start' },
  voltarTxt: { color: Honra.verde, fontSize: 16, fontWeight: '700' },
  titulo: {
    fontSize: 28,
    fontWeight: '800',
    color: Honra.tinta,
    paddingHorizontal: Espaco.xl,
    paddingTop: Espaco.xs,
  },
  sub: {
    color: Honra.tintaSuave,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: Espaco.xl,
    paddingTop: Espaco.xs,
  },
  corpo: { padding: Espaco.md, gap: Espaco.sm, paddingBottom: Espaco.xxl },
  cartao: { gap: Espaco.sm },
  linha: { flexDirection: 'row', alignItems: 'center', gap: Espaco.md },
  miniatura: {
    width: 56,
    height: 56,
    borderRadius: Raio.sm,
    backgroundColor: Honra.cremeEscuro,
  },
  miniaturaVazia: { alignItems: 'center', justifyContent: 'center', backgroundColor: Honra.verdeSuave },
  miniaturaVaziaTxt: { color: Honra.verde, fontSize: 22, fontWeight: '800' },
  meio: { flex: 1 },
  desc: { color: Honra.tinta, fontSize: 15, fontWeight: '700' },
  meta: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '600', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Espaco.sm },
  nota: { color: Honra.tintaSuave, fontSize: 12, lineHeight: 17 },
  notaAceite: { color: Honra.verde, fontWeight: '700' },
});
