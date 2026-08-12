import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Carregar, Cartao, Chip, Erro, Vazio } from '@/components/ui';
import { useT, type ChaveI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { proximoPassoProjeto, umaPastaPorPar } from '@/lib/projeto';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, LARGURA_SECRETARIA, Raio } from '@/theme/honra';

type Orc = {
  id: string;
  descricao: string | null;
  estado: string;
  valor_taxa: number;
  de_perfil: string;
  para_perfil: string;
  trabalho_id: string | null;
  criado_em: string;
  a_agiu_em: string | null;
  b_agiu_em: string | null;
  de?: { nome: string | null } | null;
  para?: { nome: string | null } | null;
};

const ESTADO_TXT: Record<string, ChaveI18n> = {
  pedido: 'estado.pedido',
  aceite: 'estado.aceite',
  selado: 'estado.selado_longo',
  // `honrado` NÃO leva o ✓. O ✓ verde lê-se como fim de linha, e este estado é
  // o meio do caminho: o aperto foi honrado, a entrega ainda não aconteceu. No
  // mesmo cartão via-se "Honrado ✓" e por baixo "À espera da entrega" — duas
  // frases que se desmentem. O ✓ fica para `concluido`, que é quando acabou
  // mesmo. Aqui diz-se só "Honrado", que é a verdade sem prometer o resto.
  honrado: 'estado.honrado',
  entregue: 'estado.entregue',
  incumprido: 'estado.nao_cumprido',
  cancelado: 'estado.cancelado',
  expirado: 'estado.expirado',
  recusado: 'estado.recusado',
  // legado (rows antigas)
  em_curso: 'estado.em_curso',
  concluido: 'estado.concluido',
  confirmado_ambos: 'estado.concluido',
  devolvido: 'estado.concluido',
};

// Estados vivos (o negócio ainda anda). Tudo o resto = terminado.
const A_DECORRER = ['pedido', 'aceite', 'selado', 'honrado', 'entregue', 'em_curso'];

// Verde = significado (DESIGN-SYSTEM.md §0): só estados que AVANÇAM ficam verdes.
const ESTADOS_VERDES = ['aceite', 'selado', 'honrado', 'entregue', 'concluido', 'confirmado_ambos', 'devolvido'];

// Pill de estado do orçamento — discreta, cor com função (nunca decorativa).
function EstadoOrc({ estado }: { estado: string }) {
  const { t } = useT();
  const verde = ESTADOS_VERDES.includes(estado);
  const mau = estado === 'recusado' || estado === 'incumprido' || estado === 'expirado';
  return (
    <View style={[styles.estado, verde && styles.estadoVerde, mau && styles.estadoRecusado]}>
      <Text
        style={[styles.estadoTxt, verde && styles.estadoTxtVerde, mau && styles.estadoTxtRecusado]}
      >
        {ESTADO_TXT[estado] ? t(ESTADO_TXT[estado]) : estado}
      </Text>
    </View>
  );
}

// Cartão de overview — quem, estado e próximo passo. Toca → abre o detalhe
// (o MESMO ecrã que o Início abre): a lista é entrada, o detalhe é onde se age.
function CartaoOrc({ o, souA }: { o: Orc; souA: boolean }) {
  const { t } = useT();
  const outroNome = souA ? o.para?.nome : o.de?.nome;
  const passo = proximoPassoProjeto(o.estado, souA, !!o.a_agiu_em, !!o.b_agiu_em, t);
  return (
    <Cartao style={styles.cartao} onPress={() => router.push(`/projeto/${o.id}`)}>
      <View style={styles.cabeca}>
        <Text style={styles.quem} numberOfLines={1}>
          {souA ? t('inicio.para') : t('inicio.de')}
          {outroNome ?? t('inicio.alguem')}
        </Text>
        <EstadoOrc estado={o.estado} />
      </View>
      {o.descricao ? (
        <Text style={styles.desc} numberOfLines={2}>
          {o.descricao}
        </Text>
      ) : null}
      {passo.texto ? (
        <View style={styles.passo}>
          <View style={[styles.passoDot, passo.minhaVez && styles.passoDotVez]} />
          <Text style={[styles.passoTxt, passo.minhaVez && styles.passoTxtVez]}>{passo.texto}</Text>
        </View>
      ) : null}
    </Cartao>
  );
}

export default function Orcamentos() {
  const { session } = useAuth();
  const { t } = useT();
  const uid = session?.user.id;
  const [recebidos, setRecebidos] = useState<Orc[]>([]);
  const [enviados, setEnviados] = useState<Orc[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'a_decorrer' | 'terminados'>('a_decorrer');
  // SECRETÁRIA: em ecrã largo as secções tornam-se COLUNAS de um quadro de
  // trabalho (Recebidos · A decorrer · Enviados), a usar a largura toda.
  const { width } = useWindowDimensions();
  const largo = width >= LARGURA_SECRETARIA;

  const carregar = useCallback(() => {
    if (!uid) return;
    setACarregar(true);
    setErroCarregar(null);
    const campos =
      'id, descricao, estado, valor_taxa, de_perfil, para_perfil, trabalho_id, criado_em, a_agiu_em, b_agiu_em';
    Promise.all([
      supabase
        // Fora as CONVERSAS: abrir conversa com alguém cria um orçamento vazio
        // só para lhe dar uma pasta onde falar. Sem este filtro, do outro lado
        // aparecia um "pedido de orçamento" chamado *Conversa* à espera de ser
        // aceite ou recusado — e recusá-lo matava a conversa. O contador do
        // separador (lib/pedidos) já os excluía; a lista é que não replicou.
        .from('orcamentos')
        .select(`${campos}, de:perfis!de_perfil(nome)`)
        .eq('para_perfil', uid)
        .neq('descricao', 'Conversa')
        .order('criado_em', { ascending: false }),
      supabase
        .from('orcamentos')
        .select(`${campos}, para:perfis!para_perfil(nome)`)
        .eq('de_perfil', uid)
        .neq('descricao', 'Conversa')
        .order('criado_em', { ascending: false }),
    ]).then(([rRecebidos, rEnviados]) => {
      if (rRecebidos.error || rEnviados.error) {
        setErroCarregar(t('orc.erro_carregar'));
      } else {
        setRecebidos((rRecebidos.data as any) ?? []);
        setEnviados((rEnviados.data as any) ?? []);
      }
      setACarregar(false);
    });
  }, [uid, t]);

  useFocusEffect(carregar);

  // SECRETÁRIA LIMPA (decisão 26/07): "Recebidos" é caixa de entrada — só o
  // que espera a MINHA palavra. Ao aceitar, o negócio muda de gaveta: passa a
  // viver em "A decorrer", UMA pasta por projeto (o histórico consulta-se lá
  // dentro, no detalhe). "Enviados" espelha: pedidos à espera da palavra do
  // outro. No Histórico fica tudo o que terminou, sem colapsar — é registo.
  // A pasta colapsa ANTES de repartir pelas gavetas: um pedido irmão de um
  // negócio já vivo (lixo pré-060) não pode aparecer a pedir palavra.
  const vivosTodos = umaPastaPorPar([
    ...recebidos.filter((o) => A_DECORRER.includes(o.estado)).map((o) => ({ ...o, souA: false })),
    ...enviados.filter((o) => A_DECORRER.includes(o.estado)).map((o) => ({ ...o, souA: true })),
  ]);
  const pedidosRecebidos = vivosTodos.filter((o) => o.estado === 'pedido' && !o.souA);
  const pedidosEnviados = vivosTodos.filter((o) => o.estado === 'pedido' && o.souA);
  const vivos = vivosTodos.filter((o) => o.estado !== 'pedido');
  const recebidosTerminados = recebidos.filter((o) => !A_DECORRER.includes(o.estado));
  const enviadosTerminados = enviados.filter((o) => !A_DECORRER.includes(o.estado));

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <View style={[styles.topo, largo && styles.topoLargo]}>
        <Text style={styles.titulo}>{t('orc.titulo')}</Text>
        {/* Aceder aos convites (ver a lista) — sim, no browser também. CRIAR um
            convite é que é fluxo presencial + telemóvel: essa ação esconde-se
            dentro do ecrã de convites no web (não aqui). */}
        <View style={styles.topoDireita}>
          <Text style={styles.convitesLink} onPress={() => router.push('/convites')}>
            {t('orc.convites')}
          </Text>
        </View>
      </View>

      {/* Filtro — a decorrer (vivos) vs terminados. */}
      <View style={[styles.filtros, largo && styles.filtrosLargo]}>
        <Chip
          texto={t('orc.filtro_decorrer')}
          ativo={filtro === 'a_decorrer'}
          onPress={() => setFiltro('a_decorrer')}
        />
        <Chip
          texto={t('orc.filtro_historico')}
          ativo={filtro === 'terminados'}
          onPress={() => setFiltro('terminados')}
        />
      </View>

      {aCarregar && recebidos.length === 0 && enviados.length === 0 ? (
        <Carregar />
      ) : erroCarregar ? (
        <View style={styles.centro}>
          <Erro texto={erroCarregar} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.corpo, largo && styles.corpoLargo]}
          refreshControl={
            <RefreshControl refreshing={aCarregar} onRefresh={carregar} tintColor={Honra.verde} />
          }
        >
          <View style={largo ? styles.board : undefined}>
            {filtro === 'a_decorrer'
              ? [
                  coluna(t('orc.recebidos'), pedidosRecebidos, false, {
                    vazio: t('orc.vazio_recebidos_decorrer'),
                    sempre: true,
                  }),
                  coluna(t('orc.seccao_decorrer'), vivos, undefined, {
                    vazio: t('orc.vazio_decorrer'),
                  }),
                  coluna(t('orc.enviados'), pedidosEnviados, true, {
                    vazio: t('orc.vazio_enviados_decorrer'),
                  }),
                ]
              : [
                  coluna(t('orc.recebidos'), recebidosTerminados, false, {
                    vazio: t('orc.vazio_recebidos_terminados'),
                    sempre: true,
                  }),
                  coluna(t('orc.enviados'), enviadosTerminados, true, {
                    vazio: t('orc.vazio_enviados_terminados'),
                    sempre: true,
                  }),
                ]}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );

  // Uma COLUNA do quadro (secretária) / uma SECÇÃO empilhada (telemóvel):
  // rótulo + cartões, ou o vazio. No telemóvel a secção some se estiver vazia
  // e não for "sempre" (preserva a régua "vazio não é placeholder"); no quadro
  // largo a coluna fica de pé com o seu estado vazio (o quadro não muda de forma).
  function coluna(
    titulo: string,
    itens: Array<Orc & { souA?: boolean }>,
    souAfixo: boolean | undefined,
    opts: { vazio: string; sempre?: boolean },
  ) {
    if (!largo && itens.length === 0 && !opts.sempre) return null;
    return (
      <View key={titulo} style={largo ? styles.boardCol : styles.seccaoMovel}>
        <Text style={styles.rotulo}>{titulo}</Text>
        {itens.length === 0 ? (
          <Vazio texto={opts.vazio} />
        ) : (
          itens.map((o) => <CartaoOrc key={o.id} o={o} souA={souAfixo ?? !!o.souA} />)
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Espaco.xl,
    paddingTop: Espaco.md,
  },
  titulo: {
    fontSize: 28,
    fontWeight: '800',
    color: Honra.tinta,
  },
  topoDireita: { flexDirection: 'row', alignItems: 'center', gap: Espaco.md },
  convitesLink: { color: Honra.verde, fontSize: 15, fontWeight: '700' },
  filtros: {
    flexDirection: 'row',
    gap: Espaco.sm,
    paddingHorizontal: Espaco.md,
    paddingTop: Espaco.md,
  },
  centro: { padding: Espaco.xl, alignItems: 'center' },
  corpo: { padding: Espaco.md, gap: Espaco.sm, paddingBottom: Espaco.xxl },
  corpoLargo: { paddingHorizontal: Espaco.xl, paddingTop: Espaco.lg },

  // SECRETÁRIA — o quadro de trabalho: colunas lado a lado, leitura máx. 1280
  // centrada (o mesmo compasso da grelha do Início).
  board: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Espaco.lg,
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
  },
  boardCol: { flex: 1, minWidth: 0, gap: Espaco.sm },
  seccaoMovel: { gap: Espaco.sm, marginBottom: Espaco.lg },
  // Cabeçalho + filtros centram-se com o quadro no ecrã largo (nada colado à esquerda).
  topoLargo: { width: '100%', maxWidth: 1280, alignSelf: 'center', paddingHorizontal: Espaco.xl },
  filtrosLargo: { width: '100%', maxWidth: 1280, alignSelf: 'center', paddingHorizontal: Espaco.xl },

  // Rótulos de secção — a mesma voz do padrão-ouro (perfil/[id]).
  rotulo: {
    color: Honra.tintaSuave,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginLeft: Espaco.xs,
    marginTop: Espaco.sm,
  },
  rotuloEnviados: { marginTop: Espaco.xl },

  cartao: { gap: Espaco.sm },
  cabeca: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espaco.sm,
  },
  quem: { fontSize: 13, color: Honra.tintaSuave, fontWeight: '600', flexShrink: 1 },
  desc: { fontSize: 15, color: Honra.tinta },

  // Estado do orçamento — pill discreta; verde SÓ com significado (avançar).
  estado: {
    borderRadius: Raio.pill,
    paddingHorizontal: Espaco.md,
    paddingVertical: 3,
    backgroundColor: Honra.creme,
    flexShrink: 1,
  },
  estadoVerde: { backgroundColor: Honra.verdeSuave },
  estadoRecusado: { backgroundColor: Honra.erroSuave },
  estadoTxt: { fontSize: 12, fontWeight: '700', color: Honra.tintaSuave },
  estadoTxtVerde: { color: Honra.verde },
  estadoTxtRecusado: { color: Honra.erro },

  // Próximo passo — verde só quando é a minha vez de agir.
  passo: { flexDirection: 'row', alignItems: 'center', gap: Espaco.sm },
  passoDot: { width: 8, height: 8, borderRadius: Raio.pill, backgroundColor: Honra.pendente },
  passoDotVez: { backgroundColor: Honra.verde },
  passoTxt: { fontSize: 13, color: Honra.tintaSuave, fontWeight: '700' },
  passoTxtVez: { color: Honra.verde },
});
