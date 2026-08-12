/**
 * HONRA — Criar grupo de conversa (068). O líder dá o nome, junta os elementos
 * da equipa (busca por nome/@handle na montra pública) e o grupo nasce com a
 * conversa pronta. Browser e telemóvel — a mesma porta.
 */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Botao, Campo, Erro } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, Raio } from '@/theme/honra';

type Pessoa = { id: string; nome: string | null; handle: string | null; papel: string | null };

export default function CriarGrupo() {
  const { session } = useAuth();
  const { t } = useT();
  const uid = session?.user.id;
  const [nome, setNome] = useState('');
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<Pessoa[]>([]);
  const [membros, setMembros] = useState<Pessoa[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aCriar, setACriar] = useState(false);

  // Busca viva (com folga de 250ms) na montra pública — nome ou @handle.
  useEffect(() => {
    const termo = busca.trim().replace(/^@/, '');
    if (termo.length < 2) {
      setResultados([]);
      return;
    }
    const timer = setTimeout(() => {
      supabase
        .from('perfis')
        .select('id, nome, handle, papel')
        .or(`nome.ilike.%${termo}%,handle.ilike.%${termo}%`)
        .neq('id', uid ?? '')
        .limit(8)
        .then(({ data }) => setResultados((data as Pessoa[]) ?? []));
    }, 250);
    return () => clearTimeout(timer);
  }, [busca, uid]);

  function adicionar(p: Pessoa) {
    if (!membros.some((m) => m.id === p.id)) setMembros((xs) => [...xs, p]);
    setBusca('');
    setResultados([]);
  }

  async function criar() {
    if (!uid || !nome.trim() || membros.length === 0) return;
    setErro(null);
    setACriar(true);
    // 1) O grupo (o trigger da 068 põe o líder como membro).
    const { data: grupo, error: eGrupo } = await supabase
      .from('grupos_conversa')
      .insert({ nome: nome.trim(), criador_perfil: uid })
      .select('id')
      .single();
    if (eGrupo || !grupo) {
      setACriar(false);
      // A razão VERDADEIRA, quando o servidor a dá. A mensagem fixa que aqui
      // estava dizia sempre "precisas da identidade verificada" — e mostrava-a
      // a quem TINHA a identidade verificada, escondendo a causa real. Um erro
      // que mente é pior do que um erro cru: manda a pessoa resolver o que não
      // está partido.
      setErro(eGrupo?.message ? `${t('grupo.erro_criar_curto')} ${eGrupo.message}` : t('grupo.erro_criar'));
      return;
    }
    // 2) Os membros escolhidos.
    const { error: eMembros } = await supabase
      .from('grupo_membros')
      .insert(membros.map((m) => ({ grupo_id: grupo.id, perfil_id: m.id })));
    setACriar(false);
    if (eMembros) {
      // O grupo JÁ existe neste ponto: se os membros falham, apaga-se para não
      // ficar um grupo órfão e vazio a cada nova tentativa.
      await supabase.from('grupos_conversa').delete().eq('id', grupo.id);
      setErro(eMembros.message ? `${t('grupo.erro_membros')} ${eMembros.message}` : t('grupo.erro_membros'));
      return;
    }
    router.replace(`/conversa/${grupo.id}?grupo=1`);
  }

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <View style={styles.topo}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
          <Text style={styles.voltar}>{t('comum.voltar_seta')}</Text>
        </Pressable>
        <Text style={styles.titulo}>{t('grupo.titulo')}</Text>
        <View style={styles.espaco} />
      </View>

      <ScrollView contentContainerStyle={styles.corpo} keyboardShouldPersistTaps="handled">
        <Text style={styles.rotulo}>{t('grupo.nome_rotulo')}</Text>
        <Campo placeholder={t('grupo.nome_ph')} value={nome} onChangeText={setNome} />

        <Text style={[styles.rotulo, styles.rotuloMembros]}>{t('grupo.membros_rotulo')}</Text>
        {/* Os escolhidos — chips com o x para tirar. */}
        {membros.length > 0 && (
          <View style={styles.chips}>
            {membros.map((m) => (
              <Pressable
                key={m.id}
                style={styles.chip}
                onPress={() => setMembros((xs) => xs.filter((x) => x.id !== m.id))}
                accessibilityRole="button"
                accessibilityLabel={t('grupo.tirar', { nome: m.nome ?? '' })}
              >
                <Text style={styles.chipTxt}>{m.nome ?? m.handle ?? '?'}</Text>
                <Feather name="x" size={13} color={Honra.verde} />
              </Pressable>
            ))}
          </View>
        )}
        <Campo placeholder={t('grupo.busca_ph')} value={busca} onChangeText={setBusca} />
        {resultados.map((p) => (
          <Pressable key={p.id} style={styles.resultado} onPress={() => adicionar(p)}>
            <View style={styles.resultadoAvatar}>
              <Text style={styles.resultadoAvatarTxt}>
                {(p.nome ?? '?').slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={styles.resultadoMeio}>
              <Text style={styles.resultadoNome} numberOfLines={1}>
                {p.nome ?? t('pesq.sem_nome')}
              </Text>
              <Text style={styles.resultadoSub} numberOfLines={1}>
                {p.handle ? `@${p.handle}` : ''}
                {p.papel ? ` · ${p.papel}` : ''}
              </Text>
            </View>
            <Feather name="plus" size={18} color={Honra.verde} />
          </Pressable>
        ))}
        {busca.trim().length >= 2 && resultados.length === 0 && (
          <Text style={styles.semResultados}>{t('grupo.sem_resultados')}</Text>
        )}

        {erro && <Erro texto={erro} />}
        <Botao
          titulo={t('grupo.criar')}
          onPress={criar}
          aCarregar={aCriar}
          desativado={!nome.trim() || membros.length === 0}
          style={styles.botao}
        />
        <Text style={styles.nota}>{t('grupo.nota')}</Text>
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
    paddingVertical: Espaco.sm,
    borderBottomWidth: 1,
    borderBottomColor: Honra.cremeEscuro,
  },
  voltar: { color: Honra.verde, fontSize: 16, fontWeight: '700' },
  titulo: { fontSize: 17, fontWeight: '800', color: Honra.tinta },
  espaco: { width: 52 },
  corpo: { padding: Espaco.md, gap: Espaco.sm, paddingBottom: Espaco.xxl },
  rotulo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  rotuloMembros: { marginTop: Espaco.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Espaco.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Honra.verdeSuave,
    borderRadius: Raio.pill,
    paddingHorizontal: Espaco.md,
    paddingVertical: 6,
  },
  chipTxt: { color: Honra.verde, fontWeight: '700', fontSize: 13 },
  resultado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.md,
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.md,
    padding: Espaco.md,
  },
  resultadoAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Honra.verdeEscuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultadoAvatarTxt: { color: Honra.creme, fontWeight: '800', fontSize: 15 },
  resultadoMeio: { flex: 1 },
  resultadoNome: { fontSize: 15, fontWeight: '700', color: Honra.tinta },
  resultadoSub: { fontSize: 12, color: Honra.tintaSuave },
  semResultados: { color: Honra.tintaSuave, fontSize: 13, textAlign: 'center', padding: Espaco.sm },
  botao: { marginTop: Espaco.lg },
  nota: { color: Honra.tintaSuave, fontSize: 12, textAlign: 'center', lineHeight: 17 },
});
