/**
 * CONVERSAS — o separador das conversas (handoff "Conversas 4a").
 *
 * SECRETÁRIA (>= 1024px): UMA vista, duas colunas. A lista de 340px à esquerda,
 * com um fio a separá-la, e a conversa aberta ao lado. Antes eram dois ecrãs e
 * abrir uma conversa custava perder a lista de vista — numa mesa de trabalho
 * isso é um passo a mais em cada troca.
 *
 * TELEMÓVEL: como sempre — lista → conversa, um ecrã de cada vez. Num ecrã
 * estreito duas colunas não são duas colunas, são duas prisões.
 *
 * A LISTA LEVA A PÍLULA DO NEGÓCIO, que a maquete não tem. Sem ela, duas
 * conversas com a MESMA pessoa ficam duas linhas idênticas (a própria maquete
 * mostra duas "Paula Vaz" iguais, e é um bug, não um desenho). O nome manda
 * sempre; o negócio entra ao lado como contexto, nunca como título. A conversa
 * livre não leva pílula nenhuma: é o normal, e o normal não se anuncia.
 */
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PainelConversa } from '@/components/PainelConversa';
import { Avatar, Carregar, Erro, Vazio } from '@/components/ui';
import { norm } from '@/components/ui/SeletorCategorias';
import { useT, type TFn } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { iniciaisDe, type TipoConversa } from '@/lib/chat';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, LARGURA_SECRETARIA, Raio, TextoAcao } from '@/theme/honra';

/** A coluna da lista, tal como a maquete a mede. */
const LARGURA_LISTA = 340;

type Conversa = {
  /** Negócio (1-para-1), grupo de equipa (068) ou conversa LIVRE (075). */
  tipo: TipoConversa;
  id: string;
  titulo: string | null;
  /** O negócio a que a conversa pertence — a pílula de contexto. Só as de
   *  negócio a têm: a conversa livre é o normal, e o normal não se anuncia. */
  contexto?: string | null;
  /** A cara de quem fala: iniciais à mão (`avatar`) ou foto (`avatar_url`). */
  avatar?: string | null;
  avatarUrl?: string | null;
  ultima: string;
  quando: string;
  minha: boolean;
  /** Carimbo bruto — ordena negócios e grupos na mesma fila, por recência. */
  ts: string;
};

/** Descrições que a app escreve sozinha — não identificam negócio nenhum. */
const GENERICOS = new Set(['Conversa', 'Pedido de orçamento', 'Pedido de orcamento', '']);

function relativo(iso: string, t: TFn): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return t('chat.agora');
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

/** A foto do perfil, quando existe. */
const fotoDe = (caminho: string | null | undefined) =>
  caminho ? supabase.storage.from('avatares').getPublicUrl(caminho).data.publicUrl : null;

export default function Chat() {
  const { session } = useAuth();
  const { t } = useT();
  const uid = session?.user.id;
  const { width } = useWindowDimensions();
  const largo = width >= LARGURA_SECRETARIA;
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  // Uma falha de leitura NÃO se disfarça de "sem conversas" (063 · #5): mentir
  // sobre os dados podia fazer um profissional crer que ninguém lhe falou.
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [focoBusca, setFocoBusca] = useState(false);
  /**
   * A conversa aberta ao lado (só na secretária). Começa VAZIA de propósito:
   * abrir a primeira sozinha marcaria como lida uma conversa que ninguém leu, e
   * o contador de por-ler é do dono, não da app.
   */
  const [aberta, setAberta] = useState<{ tipo: TipoConversa; id: string } | null>(null);

  const carregar = useCallback(async () => {
    if (!uid) return;
    setACarregar(true);
    setErro(null);
    // As minhas mensagens (o RLS já limita ao que posso ver), com a outra parte
    // resolvida; e os meus GRUPOS (068). Uma linha por conversa, tudo na mesma
    // fila, ordenado por recência.
    const PERFIL = 'nome, avatar, avatar_url';
    const [rMsgs, rGrupos, rLivres] = await Promise.all([
      supabase
        .from('mensagens')
        .select(
          `orcamento_id, grupo_id, conversa_livre_id, corpo, criado_em, autor_perfil, orcamento:orcamentos!orcamento_id(de_perfil, para_perfil, descricao, de:perfis!de_perfil(${PERFIL}), para:perfis!para_perfil(${PERFIL}), trabalho:trabalhos!trabalho_id(titulo))`,
        )
        .order('criado_em', { ascending: false }),
      // Tolerante: sem a 068 aplicada, os grupos simplesmente não existem.
      supabase.from('grupos_conversa').select('id, nome, criado_em'),
      // As conversas LIVRES (075) vêm à parte porque podem existir SEM uma
      // única mensagem — alguém abriu e ainda não escreveu. Tolerante: sem a
      // migração, a lista fica como estava.
      supabase
        .from('conversas_livres')
        .select(`id, a, b, criado_em, pa:perfis!a(${PERFIL}), pb:perfis!b(${PERFIL})`),
    ]);
    if (rMsgs.error) {
      setErro(t('chat.erro'));
      setACarregar(false);
      return;
    }
    const lista: Conversa[] = [];
    // 1) Negócios: a 1ª (mais recente) por orçamento.
    const vistos = new Set<string>();
    for (const m of (rMsgs.data as any[]) ?? []) {
      if (!m.orcamento_id || vistos.has(m.orcamento_id)) continue;
      vistos.add(m.orcamento_id);
      const o = m.orcamento ?? {};
      const souA = uid === o.de_perfil;
      const p = souA ? o.para : o.de;
      lista.push({
        tipo: 'negocio',
        id: m.orcamento_id,
        titulo: p?.nome ?? null,
        // O título do trabalho é o melhor nome do negócio; sem trabalho, a
        // descrição do orçamento serve. Nunca a palavra "Conversa" — essas
        // pastas são as antigas, e agora têm sítio próprio.
        // A pílula tem de dizer QUAL negócio. O título do trabalho diz;
        // "Pedido de orçamento" e "Conversa" são rótulos genéricos que a app
        // escreve sozinha — dizem nada e ainda ocupam espaço. Sem nome
        // próprio, não há pílula.
        contexto: o.trabalho?.titulo ?? (GENERICOS.has(o.descricao ?? '') ? null : o.descricao),
        avatar: p?.avatar ?? null,
        avatarUrl: p?.avatar_url ?? null,
        ultima: m.corpo,
        quando: relativo(m.criado_em, t),
        minha: m.autor_perfil === uid,
        ts: m.criado_em,
      });
    }
    // 2) Grupos: a última mensagem de cada um (as de grupo vêm na mesma query).
    const ultimaDoGrupo = new Map<string, { corpo: string; criado_em: string; minha: boolean }>();
    for (const m of (rMsgs.data as any[]) ?? []) {
      if (m.grupo_id && !ultimaDoGrupo.has(m.grupo_id)) {
        ultimaDoGrupo.set(m.grupo_id, {
          corpo: m.corpo,
          criado_em: m.criado_em,
          minha: m.autor_perfil === uid,
        });
      }
    }
    for (const g of (rGrupos.data as { id: string; nome: string; criado_em: string }[]) ?? []) {
      const u = ultimaDoGrupo.get(g.id);
      lista.push({
        tipo: 'grupo',
        id: g.id,
        titulo: g.nome,
        ultima: u?.corpo ?? t('chat.grupo_novo'),
        quando: relativo(u?.criado_em ?? g.criado_em, t),
        minha: u?.minha ?? false,
        ts: u?.criado_em ?? g.criado_em,
      });
    }
    // 3) Conversas LIVRES: sem contexto de negócio, por desenho.
    const ultimaDaLivre = new Map<string, { corpo: string; criado_em: string; minha: boolean }>();
    for (const m of (rMsgs.data as any[]) ?? []) {
      if (m.conversa_livre_id && !ultimaDaLivre.has(m.conversa_livre_id)) {
        ultimaDaLivre.set(m.conversa_livre_id, {
          corpo: m.corpo,
          criado_em: m.criado_em,
          minha: m.autor_perfil === uid,
        });
      }
    }
    for (const c of (rLivres.data as any[]) ?? []) {
      const u = ultimaDaLivre.get(c.id);
      // O par é ordenado por uuid (075): a outra parte é a que não sou eu.
      const outro = c.a === uid ? c.pb : c.pa;
      lista.push({
        tipo: 'livre',
        id: c.id,
        titulo: outro?.nome ?? null,
        avatar: outro?.avatar ?? null,
        avatarUrl: outro?.avatar_url ?? null,
        ultima: u?.corpo ?? t('chat.livre_nova'),
        quando: relativo(u?.criado_em ?? c.criado_em, t),
        minha: u?.minha ?? false,
        ts: u?.criado_em ?? c.criado_em,
      });
    }

    lista.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    setConversas(lista);
    setACarregar(false);
  }, [uid, t]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  // A busca procura onde uma pessoa procuraria: no nome, no negócio e no que
  // foi dito. Sem acentos, para "joao" encontrar o João.
  const visiveis = useMemo(() => {
    const q = norm(busca.trim());
    if (!q) return conversas;
    return conversas.filter((c) =>
      norm([c.titulo, c.contexto, c.ultima].filter(Boolean).join(' ')).includes(q),
    );
  }, [conversas, busca]);

  function abrir(c: Conversa) {
    if (largo) {
      setAberta({ tipo: c.tipo, id: c.id });
      return;
    }
    router.push(
      c.tipo === 'grupo'
        ? `/conversa/${c.id}?grupo=1`
        : c.tipo === 'livre'
          ? `/conversa/${c.id}?livre=1`
          : `/conversa/${c.id}`
    );
  }

  const linhas = (
    <>
      {visiveis.length === 0 && (
        <Vazio texto={busca.trim() ? t('chat.sem_resultados') : t('chat.vazio')} />
      )}
      {visiveis.map((c) => {
        const escolhida = largo && aberta?.tipo === c.tipo && aberta.id === c.id;
        return (
          <Pressable
            key={`${c.tipo}:${c.id}`}
            style={[styles.linha, largo ? styles.linhaLarga : styles.linhaCartao, escolhida && styles.linhaEscolhida]}
            onPress={() => abrir(c)}
            accessibilityRole="button"
            accessibilityState={{ selected: escolhida }}
          >
            {c.tipo === 'grupo' ? (
              <View style={styles.avatarGrupo}>
                <Feather name="users" size={18} color={Honra.douradoClaro} />
              </View>
            ) : (
              <Avatar
                iniciais={c.avatar?.trim() || iniciaisDe(c.titulo)}
                imagem={fotoDe(c.avatarUrl)}
                tamanho={30}
              />
            )}
            <View style={styles.meio}>
              {/* O NOME manda sempre — é quem falou, e é isso que se procura.
                  O negócio entra ao lado como CONTEXTO, nunca como título. */}
              <View style={styles.linhaNome}>
                <Text style={[styles.nome, escolhida && styles.nomeEscolhido]} numberOfLines={1}>
                  {c.titulo ?? t('inicio.alguem')}
                </Text>
                {c.contexto ? (
                  <View style={[styles.pilulaCtx, escolhida && styles.pilulaCtxEscolhida]}>
                    <View style={[styles.pilulaPonto, escolhida && styles.pilulaPontoEscolhido]} />
                    <Text
                      style={[styles.pilulaCtxTxt, escolhida && styles.pilulaCtxTxtEscolhido]}
                      numberOfLines={1}
                    >
                      {c.contexto}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.previa, escolhida && styles.previaEscolhida]} numberOfLines={1}>
                {c.minha ? t('chat.tu') : ''}
                {c.ultima}
              </Text>
            </View>
            <Text style={[styles.quando, escolhida && styles.quandoEscolhido]}>{c.quando}</Text>
          </Pressable>
        );
      })}
    </>
  );

  const cabecalhoLista = (
    <View style={[styles.topo, largo && styles.topoLargo]}>
      <Text style={[styles.titulo, largo && styles.tituloLargo]}>{t('chat.titulo')}</Text>
      {/* Criar grupo de equipa (068) — browser e telemóvel. */}
      <Pressable
        onPress={() => router.push('/criar-grupo')}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('chat.criar_grupo')}
        style={[styles.criarGrupo, largo && styles.criarGrupoLargo]}
      >
        <Feather
          name="user-plus"
          size={largo ? 18 : 20}
          color={largo ? Honra.douradoClaro : Honra.verde}
        />
      </Pressable>
    </View>
  );

  // ===== SECRETÁRIA: lista + conversa na mesma vista =====
  if (largo) {
    return (
      <SafeAreaView style={styles.fundoMesa} edges={['top']}>
        <View style={styles.mesa}>
          <View style={styles.coluna}>
            {cabecalhoLista}
            {/* O foco acende a CAIXA (fio verde), não um contorno do browser à
                volta do campo: assim tira-se o outline sem tirar a quem navega
                por teclado o sinal de onde está. */}
            <View style={[styles.procurar, focoBusca && styles.procurarFocado]}>
              <Feather name="search" size={16} color={Honra.tintaSuave} />
              <TextInput
                style={styles.procurarCampo}
                placeholder={t('chat.procurar')}
                placeholderTextColor={Honra.tintaSuave}
                value={busca}
                onChangeText={setBusca}
                onFocus={() => setFocoBusca(true)}
                onBlur={() => setFocoBusca(false)}
                accessibilityLabel={t('chat.procurar')}
              />
            </View>
            {aCarregar && conversas.length === 0 ? (
              <Carregar />
            ) : erro ? (
              <Erro texto={erro} />
            ) : (
              <ScrollView style={styles.listaScroll} contentContainerStyle={styles.corpoLargo}>
                {linhas}
              </ScrollView>
            )}
          </View>

          <View style={styles.painel}>
            {aberta ? (
              // A chave remonta o painel a cada troca: uma conversa nova começa
              // limpa, sem restos da anterior.
              <PainelConversa
                key={`${aberta.tipo}:${aberta.id}`}
                id={aberta.id}
                tipo={aberta.tipo}
              />
            ) : (
              <View style={styles.semEscolha}>
                <Vazio texto={t('chat.escolhe')} />
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ===== TELEMÓVEL: só a lista; a conversa abre em ecrã próprio =====
  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      {cabecalhoLista}
      {aCarregar && conversas.length === 0 ? (
        <Carregar />
      ) : erro ? (
        <View style={styles.corpo}>
          <Erro texto={erro} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.corpo}
          refreshControl={
            <RefreshControl refreshing={aCarregar} onRefresh={carregar} tintColor={Honra.verde} />
          }
        >
          {linhas}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  fundoMesa: { flex: 1, backgroundColor: Honra.begeSecretaria },
  // A mesa da maquete: duas colunas, fio no meio, respiro à volta.
  mesa: { flex: 1, flexDirection: 'row', paddingVertical: 26, paddingLeft: 26, paddingRight: 34 },
  coluna: {
    width: LARGURA_LISTA,
    minWidth: 0,
    gap: Espaco.md - 2,
    paddingRight: Espaco.lg,
    borderRightWidth: 1,
    borderRightColor: Honra.cremeEscuro,
  },
  painel: { flex: 1, minWidth: 0, paddingLeft: 26 },
  semEscolha: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Espaco.xl,
    paddingTop: Espaco.md,
  },
  // Na coluna da secretária o cabeçalho alinha com a margem da coluna: as
  // goteiras do telemóvel só serviriam para a lista nascer torta.
  topoLargo: { paddingHorizontal: 0, paddingTop: 0 },
  titulo: { fontSize: 28, fontWeight: '800', color: Honra.tinta },
  tituloLargo: { fontSize: 24, letterSpacing: -0.6 },
  criarGrupo: {
    width: 38,
    height: 38,
    borderRadius: Raio.pill,
    backgroundColor: Honra.verdeSuave,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Secretária: o quadrado verde-escuro da maquete, com o traço dourado. É a
  // única ação da coluna — ganha peso por ser a única, não por ser grande.
  criarGrupoLargo: {
    width: 40,
    height: 40,
    borderRadius: Raio.md + 1,
    backgroundColor: Honra.verdeEscuro,
  },

  // Campo de busca da coluna (só na secretária).
  procurar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.sm + 2,
    height: 44,
    paddingHorizontal: Espaco.md - 1,
    borderRadius: Raio.lg - 2,
    backgroundColor: Honra.brancoCreme,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
  },
  procurarFocado: { borderColor: Honra.verde },
  procurarCampo: { flex: 1, fontSize: 13.5, color: Honra.tinta, outlineWidth: 0 },

  corpo: { padding: Espaco.md, gap: Espaco.xs, paddingBottom: Espaco.xxl },
  listaScroll: { flex: 1, minHeight: 0 },
  corpoLargo: { gap: 2, paddingBottom: Espaco.lg },

  linha: { flexDirection: 'row', alignItems: 'center', gap: Espaco.md, padding: Espaco.md },
  // Telemóvel: o cartão de sempre.
  linhaCartao: { backgroundColor: Honra.brancoCreme, borderRadius: Raio.md },
  // Secretária: linha lisa — é a ESCOLHIDA que tem de saltar à vista, e ela só
  // salta se as outras não gritarem.
  linhaLarga: { paddingVertical: 13, paddingHorizontal: 14, borderRadius: Raio.lg - 2 },
  linhaEscolhida: { backgroundColor: Honra.verdeEscuro },

  avatarGrupo: {
    width: 40,
    height: 40,
    borderRadius: Raio.pill,
    backgroundColor: Honra.verdeEscuro,
    borderWidth: 1.4,
    borderColor: Honra.dourado,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meio: { flex: 1, minWidth: 0, gap: 2 },
  linhaNome: { flexDirection: 'row', alignItems: 'center', gap: Espaco.sm, minWidth: 0 },
  nome: { fontSize: 14.5, fontWeight: '700', color: Honra.tinta, flexShrink: 1 },
  nomeEscolhido: { color: Honra.brancoCreme },
  // A pílula do negócio: verde-suave, pequena, com o ponto à frente. Só existe
  // quando a conversa PERTENCE a um negócio — a conversa livre não leva marca
  // nenhuma, porque é o normal, e o normal não se anuncia.
  pilulaCtx: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
    paddingHorizontal: Espaco.sm,
    borderRadius: Raio.pill,
    backgroundColor: Honra.verdeSuave,
    flexShrink: 1,
    maxWidth: 170,
  },
  // Sobre a linha escolhida (verde-escura) o verde-suave desapareceria: a
  // pílula troca para o verde de cima, e o texto para creme.
  pilulaCtxEscolhida: { backgroundColor: Honra.verde },
  pilulaPonto: { width: 5, height: 5, borderRadius: Raio.pill, backgroundColor: Honra.verde },
  // Sobre a pílula já verde, o ponto só se vê no verde vivo.
  pilulaPontoEscolhido: { backgroundColor: Honra.verdeVivo },
  pilulaCtxTxt: { fontSize: 10.5, fontWeight: '700', color: Honra.verde, flexShrink: 1 },
  pilulaCtxTxtEscolhido: { color: Honra.creme },
  previa: { fontSize: 13, color: Honra.tintaSuave },
  previaEscolhida: { color: 'rgba(242,237,226,0.72)' },
  quando: { fontSize: 11.5, color: Honra.tintaSuave, fontWeight: '600', ...TextoAcao },
  quandoEscolhido: { color: 'rgba(242,237,226,0.55)' },
});
