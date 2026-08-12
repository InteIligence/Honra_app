import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Avatar,
  Campo,
  Carregar,
  Cartao,
  Chip,
  confiancaPct,
  CursorConfianca,
  Erro,
  formatarData,
  MIN_APERTOS_RACIO,
  PainelCategorias,
  Pill,
  Vazio,
  type CategoriaNo,
  type EscolhaCategoria,
} from '@/components/ui';
import { ICONE_AREA } from '@/components/ui/SeletorCategorias';
import { useT, type ChaveI18n, type TFn } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTrabalhos, type Trabalho } from '@/lib/trabalho';
import { Espaco, Honra, LARGURA_SECRETARIA, Raio, TextoAcao } from '@/theme/honra';
import { escalaoDeCredencial, honrasEfetivas } from '@/theme/prestigio';

/** Eixo principal do Pesquisar: "o que procuro". Os filtros refinam DENTRO daqui. */
type Segmento = 'todas' | 'trabalho' | 'profissionais' | 'empresas';
// Ordem "o quê → quem": o mix, os serviços, as empresas e, à parte, as
// pessoas. O 'profissionais' leva ícone (glifo de gente) por ser de outra
// natureza — procurar QUEM não é o mesmo que procurar O QUÊ.
const SEGMENTOS: {
  chave: Segmento;
  rotulo: ChaveI18n;
  icone?: keyof typeof Feather.glyphMap;
  inverso?: boolean;
}[] = [
  { chave: 'todas', rotulo: 'pesq.seg.todas' },
  { chave: 'trabalho', rotulo: 'pesq.seg.trabalho' },
  { chave: 'empresas', rotulo: 'pesq.seg.empresas' },
  // Invertido (verde cheio, palavra a creme): destaca-se dos irmãos porque é
  // de outra natureza — aqui procuram-se PESSOAS, não coisas.
  { chave: 'profissionais', rotulo: 'pesq.seg.profissionais', icone: 'user', inverso: true },
];

/**
 * Como se ordenam os resultados. Todos os eixos são de REPUTAÇÃO ou neutros —
 * não há (nem pode haver) ordenação por preço: era isso que transformava as
 * lead-mills em leilões, e o travão do Honra é a reputação.
 */
type Ordem = 'honrados' | 'confianca' | 'recentes' | 'zona';
const ORDENS: { chave: Ordem; rotulo: ChaveI18n }[] = [
  { chave: 'honrados', rotulo: 'pesq.ord.honrados' },
  { chave: 'confianca', rotulo: 'pesq.ord.confianca' },
  { chave: 'recentes', rotulo: 'pesq.ord.recentes' },
  { chave: 'zona', rotulo: 'pesq.ord.zona' },
];

type Perfil = {
  id: string;
  nome: string | null;
  handle: string | null;
  papel: string | null;
  cidade: string | null;
  avatar: string | null;
  avatar_url: string | null;
  tipo: string | null;
  disponibilidade: string | null;
  indice_confianca: number | null;
  negocios_honrados: number | null;
  /** Falhas à palavra — a Confiança precisa das duas metades (conduta, não estrelas). */
  negocios_falhados: number | null;
  apertos_selados: number | null;
  /** Recência (067). Opcional: ausente enquanto a coluna não estiver na BD. */
  ultimo_honrado_em?: string | null;
  /** Quando a conta nasceu — alimenta o "N novos desde a última vez" (071). */
  criado_em?: string | null;
};

/** Uma pesquisa posta de vigia (071). O critério é forma livre de propósito. */
type PesquisaGuardada = {
  id: string;
  nome: string;
  criterio: Criterio;
  visto_em: string;
};

/** Os filtros congelados — o que se guarda e o que se volta a aplicar. */
type Criterio = {
  segmento?: Segmento;
  busca?: string;
  zona?: string | null;
  cat?: { id: string; nome: string; modo: 'area' | 'sub' } | null;
  soVerificados?: boolean;
  soDisponiveis?: boolean;
  soHonras?: boolean;
  soPortfolio?: boolean;
  confMin?: number;
  ordem?: Ordem;
};

type Lista = { id: string; nome: string; membros: number };
// A taxonomia vem em hierarquia (052): mães (parent_id null) e filhas.

/** "há 2 semanas" — a recência do último honrado, em voz humana (067). */
function tempoAtras(iso: string, t: TFn): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias < 1) return t('tempo.hoje');
  if (dias === 1) return t('tempo.dia');
  if (dias < 7) return t('tempo.dias', { n: dias });
  const sem = Math.floor(dias / 7);
  if (dias < 30) return sem === 1 ? t('tempo.semana') : t('tempo.semanas', { n: sem });
  const meses = Math.floor(dias / 30);
  if (dias < 365) return meses === 1 ? t('tempo.mes') : t('tempo.meses', { n: meses });
  const anos = Math.floor(dias / 365);
  return anos === 1 ? t('tempo.ano') : t('tempo.anos', { n: anos });
}

/**
 * A MÉDIA das críticas — estrelas. Só aparece quando já há críticas.
 * (Chamava-se "SeloConfianca" e mentia: isto é opinião, não conduta.)
 */
function SeloMedia({ indice }: { indice: number | null }) {
  const valor = Number(indice ?? 0);
  if (valor <= 0) return null;
  return (
    <View style={styles.conf}>
      <Text style={styles.confEstrela}>★</Text>
      <Text style={styles.confNum}>{valor.toFixed(1)}</Text>
    </View>
  );
}

/**
 * A CONFIANÇA — conduta, em percentagem (30% de base, +5 por honrado, −10 por
 * falha). Nunca leva estrela: as estrelas são das críticas. Fala baixo, mas vem
 * primeiro — é ela que decide, não a opinião.
 */
function SeloConfianca({ pct, t }: { pct: number; t: TFn }) {
  return (
    <View style={styles.conf}>
      <Text style={styles.confPct}>{pct}%</Text>
      <Text style={styles.confPctRotulo}>{t('confianca.rotulo')}</Text>
    </View>
  );
}

export default function Pesquisar() {
  const { session } = useAuth();
  const { t } = useT();
  // SECRETÁRIA: a descoberta é uma ferramenta de BUSCA — no ecrã largo os
  // resultados abrem em GRELHA de 2 colunas (não a coluna única do telemóvel),
  // com a barra e os filtros centrados sobre a grelha.
  const { width } = useWindowDimensions();
  const largo = width >= LARGURA_SECRETARIA;
  const colunas = largo ? 2 : 1;
  // Segmento activo — o eixo "o que procuro". 'trabalho' abre o mural; os restantes são perfis.
  const [segmento, setSegmento] = useState<Segmento>('todas');
  // Mural de oportunidades (contrato partilhado em @/lib/trabalho).
  const { trabalhos, aCarregar: trabACarregar, erro: trabErro } = useTrabalhos();
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [verificados, setVerificados] = useState<Set<string>>(new Set());
  const [bloqueados, setBloqueados] = useState<Set<string>>(new Set());
  const [categorias, setCategorias] = useState<CategoriaNo[]>([]);
  // Filtro de categoria: uma subcategoria OU uma área inteira (painel).
  const [catFiltro, setCatFiltro] = useState<EscolhaCategoria | null>(null);
  const [painelAberto, setPainelAberto] = useState(false);
  // Pares perfil↔categoria (tabela inteira; é pequena) — a busca por texto
  // apanha categorias e o filtro de área resolve-se localmente, sem ida à BD.
  const [pares, setPares] = useState<{ perfil_id: string; categoria_id: string }[]>([]);
  // Texto de pesquisa (nome / função / cidade), reativo.
  const [busca, setBusca] = useState('');
  // FILTROS DE REPUTAÇÃO — a Pesquisa do Honra refina por CONDUTA PROVADA.
  // O preço não entra aqui e nunca ordena (guarda 3 do orçamento): quem
  // aparece primeiro aparece por reputação, não por ser o mais barato.
  const [soVerificados, setSoVerificados] = useState(false);
  const [soDisponiveis, setSoDisponiveis] = useState(false);
  const [soHonras, setSoHonras] = useState(false);
  const [soPortfolio, setSoPortfolio] = useState(false);
  /** Piso de Confiança (0–100, de 5 em 5). Abre em 0: o corte é gesto de quem
   *  procura, nunca o estado inicial — senão ninguém novo conseguiria o primeiro
   *  negócio. Ver CursorConfianca. */
  const [confMin, setConfMin] = useState(0);
  /** Ordenação — sempre um eixo de reputação (ou a proximidade, que é neutra). */
  const [ordem, setOrdem] = useState<Ordem>('honrados');
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  /** Quem tem pelo menos um trabalho comprovado (portefólio provado, 055). */
  const [comPortfolio, setComPortfolio] = useState<Set<string>>(new Set());
  /** O MEU perfil — a cidade ordena a "minha zona", e a cara vai colada ao
   *  pedido de orçamento: aqui não se dispara anónimo (guarda 2). */
  const [eu, setEu] = useState<Perfil | null>(null);
  const minhaCidade = eu?.cidade ?? null;
  /** ZONA. É uma CIDADE real, não um raio em quilómetros: a base guarda texto,
   *  não coordenadas — um "· 30 km" seria pintura a prometer o que a app não
   *  sabe calcular. As cidades da lista saem dos perfis que existem mesmo, por
   *  isso nunca se oferece uma zona onde não há ninguém. Quando houver geo a
   *  sério, isto passa a raio sem mexer no resto do ecrã. */
  const [zona, setZona] = useState<string | null>(null);
  /** As sugestões só existem com o campo em foco — fechadas, zero espaço. */
  const [sugAbertas, setSugAbertas] = useState(false);
  /** O que já se passou entre mim e cada pessoa (negócios reais). */
  const [elos, setElos] = useState<Map<string, { honrados: number; vivo: boolean; ultimo: string | null }>>(
    new Map()
  );
  /** Quem está em foco na lista — alimenta a coluna das PROVAS (3a). Ver as
   *  provas de alguém deixa de custar sair da busca e perder o sítio. */
  const [focadoId, setFocadoId] = useState<string | null>(null);
  /** As provas do focado: quem o honrou, com estrela e trabalho. */
  const [provas, setProvas] = useState<
    { id: string; nome: string | null; avatar: string | null; nota: number | null; titulo: string | null; quando: string | null }[]
  >([]);
  /** Selos verdes do focado (as 4 abas) e nº de abas verificadas. */
  const [selosFocado, setSelosFocado] = useState<string[]>([]);
  /** As vigias e as listas (071). Tolerantes: sem a migração ficam vazias. */
  const [guardadas, setGuardadas] = useState<PesquisaGuardada[]>([]);
  const [listas, setListas] = useState<Lista[]>([]);
  const [aGuardarPesq, setAGuardarPesq] = useState(false);
  /** Diálogo de nome — serve tanto para guardar pesquisa como para criar lista. */
  const [batismo, setBatismo] = useState<null | { tipo: 'pesquisa' | 'lista'; nome: string }>(null);
  /** Quem marquei. SEM TETO — mas o número anda à vista de quem recebe. */
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [pedidoAberto, setPedidoAberto] = useState(false);
  const [pedidoDesc, setPedidoDesc] = useState('');
  const [aPedir, setAPedir] = useState(false);
  const [pedidoErro, setPedidoErro] = useState<string | null>(null);
  const [pedidoFeito, setPedidoFeito] = useState(0);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let vivo = true;
      setErro(null);
      setACarregar(true);
      // Perfis (é a lista principal — o seu erro é o erro do ecrã).
      // Tolerância 067 (padrão da 058): enquanto ultimo_honrado_em não estiver
      // na BD, cai para o select antigo — o ecrã abre na mesma.
      const CAMPOS_PERFIL =
        'id, nome, handle, papel, cidade, avatar, avatar_url, tipo, disponibilidade, indice_confianca, negocios_honrados, negocios_falhados, apertos_selados, criado_em';
      supabase
        .from('perfis')
        .select(`${CAMPOS_PERFIL}, ultimo_honrado_em`)
        .neq('id', session.user.id)
        .then(async ({ data, error }) => {
          if (error) {
            const fb = await supabase
              .from('perfis')
              .select(CAMPOS_PERFIL)
              .neq('id', session.user.id);
            data = fb.data as typeof data;
            error = fb.error;
          }
          if (!vivo) return;
          if (error) setErro(t('pesq.erro_perfis'));
          else setPerfis((data as Perfil[]) ?? []);
          setACarregar(false);
        });
      // quem tem a identidade verde
      supabase
        .from('verificacoes')
        .select('perfil_id')
        .eq('aba', 'identidade')
        .eq('estado', 'verificado')
        .then(({ data }) => {
          if (vivo) setVerificados(new Set((data ?? []).map((v) => v.perfil_id)));
        });
      // taxonomia em hierarquia p/ o painel (tolerante: se a tabela não existir, fica vazio)
      supabase
        .from('categorias')
        .select('id, nome, slug, parent_id')
        .order('ordem')
        .order('nome')
        .then(({ data }) => {
          if (vivo) setCategorias((data as CategoriaNo[]) ?? []);
        });
      // pares perfil↔categoria (filtro de área + busca por categoria) — tolerante.
      supabase
        .from('perfil_categorias')
        .select('perfil_id, categoria_id')
        .then(({ data }) => {
          if (vivo) setPares((data as { perfil_id: string; categoria_id: string }[]) ?? []);
        });
      // quem eu bloqueei (esconder da pesquisa) — tolerante.
      supabase
        .from('bloqueios')
        .select('bloqueado')
        .eq('bloqueador', session.user.id)
        .then(({ data }) => {
          if (vivo) setBloqueados(new Set(((data as any[]) ?? []).map((b) => b.bloqueado as string)));
        });
      // quem tem portefólio PROVADO — cada item nasceu de um negócio honrado na
      // máquina real (055), por isso é impossível de forjar. Tolerante: sem a
      // vista aplicada, o filtro fica simplesmente sem ninguém a cumprir.
      supabase
        .from('trabalhos_comprovados_publico')
        .select('perfil_id')
        .then(({ data }) => {
          if (vivo) setComPortfolio(new Set(((data as any[]) ?? []).map((c) => c.perfil_id as string)));
        });
      // O ELO — os meus negócios com cada pessoa. É daqui que sai a linha
      // dourada da lista ("honraste-o em maio", "trabalho em curso contigo"):
      // nunca uma sugestão de algoritmo, sempre um facto que aconteceu.
      supabase
        .from('orcamentos')
        .select('de_perfil, para_perfil, estado, criado_em')
        .or(`de_perfil.eq.${session.user.id},para_perfil.eq.${session.user.id}`)
        .then(({ data }) => {
          if (!vivo) return;
          const m = new Map<string, { honrados: number; vivo: boolean; ultimo: string | null }>();
          for (const o of (data as any[]) ?? []) {
            const outro = o.de_perfil === session.user.id ? o.para_perfil : o.de_perfil;
            if (!outro || outro === session.user.id) continue;
            const e = m.get(outro) ?? { honrados: 0, vivo: false, ultimo: null };
            if (o.estado === 'honrado') {
              e.honrados += 1;
              if (!e.ultimo || o.criado_em > e.ultimo) e.ultimo = o.criado_em;
            } else if (['aceite', 'selado', 'entregue'].includes(o.estado)) {
              e.vivo = true;
            }
            m.set(outro, e);
          }
          setElos(m);
        });
      // as minhas vigias e as minhas listas (071) — tolerantes: sem a migração
      // aplicada os blocos ficam simplesmente vazios e o ecrã abre na mesma.
      supabase
        .from('pesquisas_guardadas')
        .select('id, nome, criterio, visto_em')
        .order('criado_em', { ascending: false })
        .then(({ data }) => {
          if (vivo) setGuardadas((data as PesquisaGuardada[]) ?? []);
        });
      supabase
        .from('listas')
        .select('id, nome, listas_membros(perfil_id)')
        .order('criado_em', { ascending: false })
        .then(({ data }) => {
          if (!vivo) return;
          setListas(
            ((data as any[]) ?? []).map((l) => ({
              id: l.id as string,
              nome: l.nome as string,
              membros: (l.listas_membros ?? []).length,
            }))
          );
        });
      // o meu perfil — ordena a "minha zona" e é a cara que vai no pedido.
      supabase
        .from('perfis')
        .select(CAMPOS_PERFIL)
        .eq('id', session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (vivo) setEu((data as Perfil) ?? null);
        });
      return () => {
        vivo = false;
      };
    }, [session, t])
  );

  /**
   * As PROVAS de quem está em foco (3a) — quem o honrou, com a estrela.
   *
   * Só entram avaliações REVELADAS: as críticas do Honra são double-blind e uma
   * que ainda não abriu não é prova de nada — mostrá-la aqui furava a regra
   * pelas costas. Carrega-se só quando alguém é escolhido, não para a lista
   * toda: seriam dezenas de consultas para provas que ninguém pediu.
   */
  useEffect(() => {
    // Trocar de pessoa limpa o recado da anterior — um erro sobre o Miguel não
    // pode ficar pendurado por baixo da credencial da Rute.
    setFalarMsg(null);
    if (!focadoId) {
      setProvas([]);
      setSelosFocado([]);
      return;
    }
    let vivo = true;
    supabase
      .from('avaliacoes')
      .select('id, nota, criado_em, revelado_em, de:perfis!de_perfil(nome, avatar)')
      .eq('para_perfil', focadoId)
      .not('revelado_em', 'is', null)
      .order('criado_em', { ascending: false })
      .limit(3)
      .then(({ data }) => {
        if (!vivo) return;
        setProvas(
          ((data as any[]) ?? []).map((a) => ({
            id: a.id as string,
            nome: a.de?.nome ?? null,
            avatar: a.de?.avatar ?? null,
            nota: a.nota ?? null,
            titulo: null,
            quando: a.criado_em ?? null,
          }))
        );
      });
    supabase
      .from('verificacoes')
      .select('aba, estado')
      .eq('perfil_id', focadoId)
      .eq('estado', 'verificado')
      .then(({ data }) => {
        if (vivo) setSelosFocado(((data as any[]) ?? []).map((v) => v.aba as string));
      });
    return () => {
      vivo = false;
    };
  }, [focadoId]);

  // Ids de CATEGORIAS abrangidas pelo filtro (área = mãe + filhas). Deriva-se
  // localmente — os pares e a taxonomia já cá estão, sem ida à BD por toque.
  const idsCatFiltro = useMemo(() => {
    if (!catFiltro) return new Set<string>();
    const ids = new Set<string>([catFiltro.id]);
    if (catFiltro.modo === 'area') {
      for (const c of categorias) if (c.parent_id === catFiltro.id) ids.add(c.id);
    }
    return ids;
  }, [catFiltro, categorias]);

  // Perfis abrangidos pelo filtro de categoria.
  const idsFiltro = useMemo(() => {
    if (!catFiltro) return new Set<string>();
    const ids = new Set<string>();
    for (const p of pares) if (idsCatFiltro.has(p.categoria_id)) ids.add(p.perfil_id);
    return ids;
  }, [catFiltro, idsCatFiltro, pares]);

  // Nomes das categorias de cada perfil, normalizados — a busca por texto
  // encontra "dj" mesmo que a função da pessoa diga outra coisa.
  const catsDePerfil = useMemo(() => {
    if (pares.length === 0 || categorias.length === 0) return new Map<string, string>();
    const nomePorCat = new Map(categorias.map((c) => [c.id, c.nome.toLowerCase()]));
    const m = new Map<string, string>();
    for (const p of pares) {
      const nome = nomePorCat.get(p.categoria_id);
      if (!nome) continue;
      m.set(p.perfil_id, `${m.get(p.perfil_id) ?? ''} ${nome}`);
    }
    return m;
  }, [pares, categorias]);

  /** As zonas que EXISTEM — as cidades dos perfis, as mais povoadas primeiro.
   *  Nunca se oferece uma zona onde não há ninguém para encontrar. */
  const zonas = useMemo(() => {
    const conta = new Map<string, number>();
    for (const p of perfis) {
      const c = (p.cidade ?? '').trim();
      if (c) conta.set(c, (conta.get(c) ?? 0) + 1);
    }
    return [...conta.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([c]) => c);
  }, [perfis]);

  /** As áreas-mãe da taxonomia — a porta rápida para as categorias grandes.
   *  O painel completo continua a existir para quem quer descer ao detalhe. */
  const areas = useMemo(() => categorias.filter((c) => !c.parent_id).slice(0, 8), [categorias]);


  const temFiltro =
    !!catFiltro ||
    !!zona ||
    busca.trim().length > 0 ||
    soVerificados ||
    soDisponiveis ||
    soHonras ||
    soPortfolio ||
    confMin > 0;
  // Quantos filtros do painel estão ativos — alimenta o chip líder "Filtros · n".
  // A ordenação NÃO conta: ordenar não esconde ninguém, e o chip deve dizer
  // quanto do mundo está a ser cortado, não como está arrumado.
  const numFiltros = [
    soVerificados,
    soDisponiveis,
    soHonras,
    soPortfolio,
    confMin > 0,
    !!zona,
    !!catFiltro,
  ].filter(Boolean).length;

  // Lista final: pesquisa + categoria + filtros + ordenação, tudo reativo.
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let lista = catFiltro ? perfis.filter((p) => idsFiltro.has(p.id)) : perfis;
    // Esconde quem eu bloqueei.
    if (bloqueados.size > 0) lista = lista.filter((p) => !bloqueados.has(p.id));
    // Eixo principal: o tipo de perfil que procuro.
    if (segmento === 'profissionais') {
      lista = lista.filter((p) => p.tipo === 'pessoa' || p.tipo === 'equipa');
    } else if (segmento === 'empresas') {
      lista = lista.filter((p) => p.tipo === 'empresa');
    }
    if (q) {
      lista = lista.filter(
        (p) =>
          [p.nome, p.handle, p.papel, p.cidade].some((c) => (c ?? '').toLowerCase().includes(q)) ||
          (catsDePerfil.get(p.id) ?? '').includes(q)
      );
    }
    // --- os cortes (quem fica de fora) ---
    if (zona) lista = lista.filter((p) => (p.cidade ?? '').trim() === zona);
    if (soVerificados) lista = lista.filter((p) => verificados.has(p.id));
    if (soDisponiveis) lista = lista.filter((p) => p.disponibilidade === 'disponivel');
    if (soHonras) lista = lista.filter((p) => (p.negocios_honrados ?? 0) > 0);
    if (soPortfolio) lista = lista.filter((p) => comPortfolio.has(p.id));
    if (confMin > 0) {
      lista = lista.filter((p) => confiancaPct(p.negocios_honrados, p.negocios_falhados) >= confMin);
    }

    // --- a arrumação (por que ordem aparecem) ---
    // Sempre reputação ou proximidade. Empates caem no mesmo desempate: mais
    // honrados → mais confiança → nome. Assim a lista é estável, não dança.
    const conf = (p: Perfil) => confiancaPct(p.negocios_honrados, p.negocios_falhados);
    const porReputacao = (a: Perfil, b: Perfil) =>
      (b.negocios_honrados ?? 0) - (a.negocios_honrados ?? 0) ||
      conf(b) - conf(a) ||
      (a.nome ?? '').localeCompare(b.nome ?? '');
    // A MINHA cidade (para a ordenação "da minha zona") — não confundir com o
    // filtro `zona`, que é a cidade que o utilizador escolheu na bancada.
    const minhaZona = (minhaCidade ?? '').trim().toLowerCase();
    lista = [...lista].sort((a, b) => {
      if (ordem === 'confianca') return conf(b) - conf(a) || porReputacao(a, b);
      if (ordem === 'recentes') {
        // Sem data ainda? Vai para o fim — mas por reputação, não em desgraça.
        const ta = a.ultimo_honrado_em ? new Date(a.ultimo_honrado_em).getTime() : -1;
        const tb = b.ultimo_honrado_em ? new Date(b.ultimo_honrado_em).getTime() : -1;
        return tb - ta || porReputacao(a, b);
      }
      if (ordem === 'zona' && minhaZona) {
        const na = (a.cidade ?? '').trim().toLowerCase() === minhaZona ? 0 : 1;
        const nb = (b.cidade ?? '').trim().toLowerCase() === minhaZona ? 0 : 1;
        return na - nb || porReputacao(a, b);
      }
      return porReputacao(a, b);
    });
    return lista;
  }, [
    perfis,
    segmento,
    catFiltro,
    idsFiltro,
    catsDePerfil,
    busca,
    zona,
    soVerificados,
    soDisponiveis,
    soHonras,
    soPortfolio,
    confMin,
    ordem,
    minhaCidade,
    comPortfolio,
    verificados,
    bloqueados,
  ]);

  /**
   * AS SUGESTÕES DA FRASE — a busca deixa de ser só texto e passa a propor.
   *
   * São 84 categorias na base, e as que as pessoas procuram são as FILHAS:
   * "DJ", "Catering", "Tatuagem", "Wedding Planner". Nenhuma delas cabia nas
   * oito pastilhas da bancada, que mostravam áreas-mãe — ninguém procura
   * "Eventos & Casamentos"; procura "DJ". A lista de pastilhas mostrava a
   * taxonomia como está arrumada na BD, não como as pessoas a pensam.
   *
   * Com escrita, quem quer um mecânico escreve "mec" e vê UMA linha. Nunca
   * mais de cinco de cada vez, por muito que a lista cresça — é a única forma
   * que escala quando amanhã houver 200 categorias.
   *
   * Com o campo VAZIO mostram-se as áreas-mãe: quem não sabe o que procura
   * também tem de poder passear. Ganham-se os dois comportamentos na mesma
   * caixa, sem a parede de pastilhas.
   */
  const sugestoes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) {
      // Passeio: as portas grandes, para quem ainda não sabe o que quer.
      return { cats: categorias.filter((c) => !c.parent_id).slice(0, 6), pessoas: [] as Perfil[] };
    }
    const bate = (s: string | null | undefined) => (s ?? '').toLowerCase().includes(q);
    // As FILHAS primeiro: são o que se procura. As mães entram a seguir, se
    // sobrar espaço — quem escreve "eventos" também merece encontrar a área.
    const filhas = categorias.filter((c) => c.parent_id && bate(c.nome));
    const maes = categorias.filter((c) => !c.parent_id && bate(c.nome));
    return {
      cats: [...filhas, ...maes].slice(0, 5),
      pessoas: visiveis.filter((p) => bate(p.nome) || bate(p.handle)).slice(0, 3),
    };
  }, [busca, categorias, visiveis]);

  // Trabalhos sob o filtro de categoria (o mural usa este).
  const trabalhosCat = useMemo(
    () =>
      catFiltro
        ? trabalhos.filter(
            (tr) =>
              (tr.categoria_id && idsCatFiltro.has(tr.categoria_id)) ||
              (tr.categoria2_id && idsCatFiltro.has(tr.categoria2_id))
          )
        : trabalhos,
    [trabalhos, catFiltro, idsCatFiltro]
  );
  // + busca por texto (título/descrição/categorias/autor) — p/ o mix do "Todas".
  const trabalhosVisiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return trabalhosCat;
    return trabalhosCat.filter((tr) =>
      [tr.titulo, tr.descricao, tr.categoria?.nome, tr.categoria2?.nome, tr.autor?.nome].some(
        (c) => (c ?? '').toLowerCase().includes(q)
      )
    );
  }, [trabalhosCat, busca]);

  // Ícone de cada trabalho = o ícone da ÁREA-MÃE da sua categoria (052).
  const slugMaePorCat = useMemo(() => {
    const porId = new Map(categorias.map((c) => [c.id, c]));
    const m = new Map<string, string>();
    for (const c of categorias) m.set(c.id, (c.parent_id ? porId.get(c.parent_id) : c)?.slug ?? c.slug);
    return m;
  }, [categorias]);

  // "TODAS" é um MERCADO, não uma rede social (Vítor, 20/07) — e TECE-SE, não
  // se divide em secções: um trabalho a abrir, depois um a cada 3 pessoas. A
  // distinção é o ADN do cartão (ícone de área vs avatar), nunca uma etiqueta.
  type ItemMisto =
    | { k: 'trab'; id: string; trab: Trabalho }
    | { k: 'perfil'; id: string; p: Perfil };
  const dados: ItemMisto[] = useMemo(() => {
    if (segmento !== 'todas') return visiveis.map((p) => ({ k: 'perfil' as const, id: p.id, p }));
    const out: ItemMisto[] = [];
    let ti = 0;
    let pi = 0;
    while (ti < trabalhosVisiveis.length || pi < visiveis.length) {
      if (ti < trabalhosVisiveis.length) {
        const tr = trabalhosVisiveis[ti++];
        out.push({ k: 'trab', id: `t-${tr.id}`, trab: tr });
      }
      for (let k = 0; k < 3 && pi < visiveis.length; k++) {
        const p = visiveis[pi++];
        out.push({ k: 'perfil', id: p.id, p });
      }
    }
    return out;
  }, [segmento, visiveis, trabalhosVisiveis]);

  // Os marcados, pela ordem em que aparecem na lista — a barra diz os NOMES,
  // não só o número: quem se marca são pessoas, não unidades.
  const marcadosLista = useMemo(
    () => visiveis.filter((p) => marcados.has(p.id)),
    [visiveis, marcados]
  );

  function alternarMarca(id: string) {
    setMarcados((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  /**
   * Pede orçamento a todos os marcados de uma vez.
   *
   * SEM TETO: pedir a oito pintores para pintar a casa é são, não é spray. O
   * travão não é uma regra que se imponha — é o número a andar à vista. Cada
   * pessoa que recebe vê a quantas mais foi pedido, e decide se vale o tempo
   * ANTES de o gastar. É o oposto exato da lead-mill, que vende o mesmo pedido
   * a cinco pessoas e deixa cada uma pensar que é a única.
   */
  async function enviarPedidos() {
    if (!session || marcadosLista.length === 0) return;
    setPedidoErro(null);
    setAPedir(true);
    const quantos = marcadosLista.length;
    const base = marcadosLista.map((p) => ({
      de_perfil: session.user.id,
      para_perfil: p.id,
      descricao: pedidoDesc.trim() || t('pesq.pedido.sem_texto'),
      estado: 'pedido',
    }));
    // O cliente NÃO manda o número (073): quem conta é o servidor, que vê as
    // linhas do mesmo insert e carimba a contagem real. Enviá-lo daqui era
    // deixar o único travão contra a lead-mill nas mãos de quem devia travar.
    const { error } = await supabase.from('orcamentos').insert(base);
    setAPedir(false);
    if (error) {
      setPedidoErro(t('pesq.pedido.erro'));
      return;
    }
    setPedidoFeito(quantos);
    setMarcados(new Set());
    setPedidoDesc('');
    setPedidoAberto(false);
  }

  // A fila de refinamento — o chip "Filtros" (só faz sentido em perfis) e o
  // campo "Categorias" (vale para perfis E mural). Vive nos dois segmentos.
  /**
   * A FRASE (maquete 3a). Os filtros deixam de ser um formulário escondido e
   * passam a ser uma frase que se LÊ: "faz Música ao Vivo, perto de Lisboa,
   * confiança 40% ou mais". Cada pedaço diz o que faz e sai com um toque.
   *
   * Isto muda mais do que parece: um formulário obriga a pessoa a lembrar-se
   * do que ligou; uma frase mostra-lho sempre. Nunca há um corte a atuar em
   * silêncio — e num sítio onde o corte esconde PESSOAS, isso é uma questão
   * de honestidade, não de conveniência.
   */
  const pastilhas: { chave: string; rotulo: string; valor: string; limpar: () => void }[] = [];
  if (catFiltro)
    pastilhas.push({
      chave: 'cat',
      rotulo: t('pesq.p.faz'),
      valor: catFiltro.nome,
      limpar: () => setCatFiltro(null),
    });
  if (zona)
    pastilhas.push({
      chave: 'zona',
      rotulo: t('pesq.p.perto'),
      valor: zona,
      limpar: () => setZona(null),
    });
  if (confMin > 0)
    pastilhas.push({
      chave: 'conf',
      rotulo: t('confianca.rotulo'),
      valor: t('pesq.p.conf_val', { n: confMin }),
      limpar: () => setConfMin(0),
    });
  if (soVerificados)
    pastilhas.push({
      chave: 'ver',
      rotulo: t('pesq.p.com'),
      valor: t('pesq.p.identidade'),
      limpar: () => setSoVerificados(false),
    });
  if (soDisponiveis)
    pastilhas.push({
      chave: 'disp',
      rotulo: t('pesq.p.esta'),
      valor: t('pesq.p.disponivel'),
      limpar: () => setSoDisponiveis(false),
    });
  if (soHonras)
    pastilhas.push({
      chave: 'honras',
      rotulo: t('pesq.p.com'),
      valor: t('pesq.p.honras'),
      limpar: () => setSoHonras(false),
    });
  if (soPortfolio)
    pastilhas.push({
      chave: 'port',
      rotulo: t('pesq.p.com'),
      valor: t('pesq.p.portfolio'),
      limpar: () => setSoPortfolio(false),
    });

  /**
   * Abrir conversa com alguém, a partir das PROVAS.
   *
   * Um botão que diz "Falar com X" tem de levar à conversa — levava ao perfil,
   * e um botão que mente sobre o que faz é pior do que não existir.
   *
   * A conversa do Honra vive dentro de um negócio (não há caixa de entrada
   * solta): reaproveita-se a pasta que já exista com esta pessoa e, se não
   * houver, nasce uma. Como criar uma conversa cria um pedido, exige identidade
   * verificada — a mesma guarda da 043 que o perfil já aplica. Falar aqui não
   * pode ser uma porta das traseiras para a regra.
   */
  const [aFalar, setAFalar] = useState(false);
  const [falarMsg, setFalarMsg] = useState<string | null>(null);

  async function abrirConversa(comId: string) {
    if (!session || aFalar) return;
    setFalarMsg(null);
    setAFalar(true);
    // CONVERSA LIVRE (075): falar deixou de custar um orçamento. Antes, dizer
    // "olá" a alguém criava um pedido de orçamento chamado *Conversa* que a
    // outra pessoa tinha de aceitar ou recusar — e recusar matava a conversa.
    // A função do servidor ordena o par, reaproveita a conversa que já exista
    // e trava bloqueios nos dois sentidos, por isso nunca nascem duplicados.
    const { data, error } = await supabase.rpc('abrir_conversa_livre', { p_com: comId });
    setAFalar(false);
    if (error || !data) {
      // A razão vem do servidor: sem identidade verificada, a RLS recusa.
      setFalarMsg(
        String(error?.message ?? '').includes('bloqueado')
          ? t('pesq.falar_bloqueado')
          : t('idverif.conversa')
      );
      return;
    }
    router.push(`/conversa/${data as string}?livre=1`);
  }


  /** O perfil em foco, resolvido a partir do id. */
  const focado = useMemo(
    () => (focadoId ? (perfis.find((p) => p.id === focadoId) ?? null) : null),
    [focadoId, perfis]
  );

  /** A frase do elo, em português de gente. Devolve null quando não há nada
   *  verdadeiro a dizer — melhor calar que encher. */
  function eloDe(id: string): string | null {
    const e = elos.get(id);
    if (!e) return null;
    if (e.vivo) return t('pesq.elo_em_curso');
    if (e.honrados > 0) {
      const quando = e.ultimo ? tempoAtras(e.ultimo, t) : null;
      return e.honrados === 1
        ? quando
          ? t('pesq.elo_um_quando', { quando })
          : t('pesq.elo_um')
        : t('pesq.elo_varios', { n: e.honrados });
    }
    return null;
  }

  /** Os filtros de agora, prontos a congelar numa vigia. */
  const criterioAtual = (): Criterio => ({
    segmento,
    busca: busca.trim() || undefined,
    zona,
    cat: catFiltro ? { id: catFiltro.id, nome: catFiltro.nome, modo: catFiltro.modo } : null,
    soVerificados,
    soDisponiveis,
    soHonras,
    soPortfolio,
    confMin,
    ordem,
  });

  /** Volta a pôr o ecrã como estava quando a vigia foi guardada. */
  function aplicarCriterio(c: Criterio) {
    setSegmento(c.segmento ?? 'todas');
    setBusca(c.busca ?? '');
    setZona(c.zona ?? null);
    setCatFiltro(c.cat ?? null);
    setSoVerificados(!!c.soVerificados);
    setSoDisponiveis(!!c.soDisponiveis);
    setSoHonras(!!c.soHonras);
    setSoPortfolio(!!c.soPortfolio);
    setConfMin(c.confMin ?? 0);
    setOrdem(c.ordem ?? 'honrados');
  }

  /**
   * Quantos perfis ENTRARAM nesta vigia desde a última visita.
   *
   * Conta-se quem nasceu depois do `visto_em` e cabe no critério — é a única
   * definição honesta que os dados suportam. Não se conta quem já lá estava e
   * mudou, porque a base não guarda quando é que alguém passou a caber.
   */
  function novosDesde(p: PesquisaGuardada): number {
    const marca = new Date(p.visto_em).getTime();
    const c = p.criterio ?? {};
    const q = (c.busca ?? '').trim().toLowerCase();
    return perfis.filter((x) => {
      if (!x.criado_em || new Date(x.criado_em).getTime() <= marca) return false;
      if (bloqueados.has(x.id)) return false;
      if (c.zona && (x.cidade ?? '').trim() !== c.zona) return false;
      if (c.soVerificados && !verificados.has(x.id)) return false;
      if (c.soDisponiveis && x.disponibilidade !== 'disponivel') return false;
      if (c.soHonras && (x.negocios_honrados ?? 0) <= 0) return false;
      if (c.soPortfolio && !comPortfolio.has(x.id)) return false;
      if ((c.confMin ?? 0) > 0 && confiancaPct(x.negocios_honrados, x.negocios_falhados) < c.confMin!)
        return false;
      if (q) {
        const bate =
          [x.nome, x.handle, x.papel, x.cidade].some((s) => (s ?? '').toLowerCase().includes(q)) ||
          (catsDePerfil.get(x.id) ?? '').includes(q);
        if (!bate) return false;
      }
      return true;
    }).length;
  }

  /** Abre a vigia: repõe os filtros e marca-a como vista (o contador zera). */
  async function abrirGuardada(p: PesquisaGuardada) {
    aplicarCriterio(p.criterio ?? {});
    const agora = new Date().toISOString();
    setGuardadas((gs) => gs.map((g) => (g.id === p.id ? { ...g, visto_em: agora } : g)));
    await supabase.from('pesquisas_guardadas').update({ visto_em: agora }).eq('id', p.id);
  }

  async function guardarPesquisa(nome: string) {
    if (!session) return;
    setAGuardarPesq(true);
    const { data } = await supabase
      .from('pesquisas_guardadas')
      .insert({ perfil_id: session.user.id, nome, criterio: criterioAtual() })
      .select('id, nome, criterio, visto_em')
      .single();
    setAGuardarPesq(false);
    if (data) setGuardadas((gs) => [data as PesquisaGuardada, ...gs]);
  }

  /** Cria a lista JÁ com os marcados lá dentro — é para isso que se cria. */
  async function criarLista(nome: string) {
    if (!session) return;
    const { data } = await supabase
      .from('listas')
      .insert({ perfil_id: session.user.id, nome })
      .select('id, nome')
      .single();
    if (!data) return;
    const ids = marcadosLista.map((p) => p.id);
    if (ids.length > 0) {
      await supabase
        .from('listas_membros')
        .insert(ids.map((perfil_id) => ({ lista_id: (data as any).id as string, perfil_id })));
    }
    setListas((ls) => [{ id: (data as any).id, nome: (data as any).nome, membros: ids.length }, ...ls]);
    setMarcados(new Set());
  }

  function limparFiltros() {
    setSugAbertas(false);
    setSoVerificados(false);
    setSoDisponiveis(false);
    setSoHonras(false);
    setSoPortfolio(false);
    setConfMin(0);
    setZona(null);
    setCatFiltro(null);
  }

  /**
   * O corpo dos filtros — UM só, servido em dois móveis.
   *
   * No telemóvel vive dentro de um modal (o ecrã não tem coluna a dar). Na
   * Secretária vive numa BANCADA fixa à esquerda: com 1280px de largura,
   * esconder o refinamento atrás de um botão é desperdiçar a mesa de trabalho.
   * Mesmo conteúdo, mesma ordem, mesmo comportamento — muda o continente.
   */
  const corpoFiltros = (
    <>
      {/* As pastilhas de CATEGORIA saíram daqui (01/08). Eram as oito
          áreas-MÃE, e ninguém procura "Eventos & Casamentos" — procura "DJ",
          que é uma das 84 filhas e não cabia numa parede de pastilhas. A
          escolha faz-se agora a escrever na frase, que sugere e nunca mostra
          mais de cinco. A ZONA fica: são poucas e são reais. */}
      {/* ZONA — cidades reais, nunca um raio inventado. */}
      {zonas.length > 0 ? (
        <>
          <Text style={styles.seccao}>{t('pesq.sec.zona')}</Text>
          <View style={styles.pastilhas}>
            {zonas.map((z) => {
              const on = zona === z;
              return (
                <Pressable
                  key={z}
                  style={[styles.pastilha, on && styles.pastilhaOn]}
                  onPress={() => setZona(on ? null : z)}
                >
                  <Text style={[styles.pastilhaTxt, on && styles.pastilhaTxtOn]} numberOfLines={1}>
                    {z}
                  </Text>
                  {on ? <Feather name="x" size={11} color={Honra.creme} /> : null}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {/* O que CORTA — cada linha esconde gente, por isso vem primeiro. */}
      <Text style={styles.seccao}>{t('pesq.sec.mostrar')}</Text>
      <FiltroLinha
        texto={t('pesq.filtro.verificada')}
        ativo={soVerificados}
        onPress={() => setSoVerificados((v) => !v)}
      />
      <FiltroLinha
        texto={t('pesq.filtro.disponiveis')}
        ativo={soDisponiveis}
        onPress={() => setSoDisponiveis((v) => !v)}
      />
      <FiltroLinha
        texto={t('pesq.filtro.honras')}
        ativo={soHonras}
        onPress={() => setSoHonras((v) => !v)}
      />
      <FiltroLinha
        texto={t('pesq.filtro.portfolio')}
        ativo={soPortfolio}
        onPress={() => setSoPortfolio((v) => !v)}
      />

      {/* O piso de Confiança — o cursor traz o seu próprio rótulo e diz
          quantas pessoas sobram ao piso, para se ver o preço do corte. */}
      <View style={styles.cursorBloco}>
        <CursorConfianca valor={confMin} onMudar={setConfMin} sobram={visiveis.length} />
      </View>

      <Text style={styles.nota}>{t('pesq.nota_preco')}</Text>
    </>
  );

  /**
   * A arrumação — separada dos cortes de propósito.
   *
   * A bancada decide QUEM aparece; isto decide POR QUE ORDEM. São naturezas
   * diferentes e é por isso que na Secretária vive por cima da lista, colada
   * ao que arruma, e não na coluna da esquerda. No telemóvel, sem coluna nem
   * espaço por cima, viaja com os cortes para dentro do modal.
   *
   * Nunca por preço: só conduta ou proximidade.
   */
  const blocoOrdenar = (
    <>
      <Text style={styles.seccao}>{t('pesq.sec.ordenar')}</Text>
      {ORDENS.map((o) => (
        <OrdemLinha
          key={o.chave}
          texto={t(o.rotulo)}
          ativo={ordem === o.chave}
          onPress={() => setOrdem(o.chave)}
        />
      ))}
    </>
  );

  const filaFiltros = (
    <View style={styles.filtro}>
      {/* O chip "Filtros" é a PORTA do modal — só existe onde o modal existe.
          Na Secretária a bancada já está aberta à esquerda: um botão para abrir
          o que já está aberto seria mobília a mentir. */}
      {segmento !== 'trabalho' && !largo && (
        <>
          <Chip
            texto={numFiltros > 0 ? t('pesq.filtros_n', { n: numFiltros }) : t('pesq.filtros')}
            ativo={numFiltros > 0}
            onPress={() => setFiltrosAbertos(true)}
          />
          <View style={styles.filtroDivisor} />
        </>
      )}
      {catFiltro ? (
        <Pressable style={styles.catCampoAtivo} onPress={() => setPainelAberto(true)}>
          <Feather
            name={catFiltro.modo === 'area' ? 'layers' : 'tag'}
            size={13}
            color={Honra.creme}
          />
          <Text style={styles.catCampoAtivoTxt} numberOfLines={1}>
            {catFiltro.nome}
          </Text>
          {/* padding real (não hitSlop): no web o hitSlop não estica o alvo. */}
          <Pressable onPress={() => setCatFiltro(null)} style={styles.catLimpar}>
            <Feather name="x" size={14} color={Honra.creme} />
          </Pressable>
        </Pressable>
      ) : (
        <Pressable style={styles.catCampo} onPress={() => setPainelAberto(true)}>
          <Feather name="tag" size={13} color={Honra.verde} />
          <Text style={styles.catCampoTxt}>{t('cats.titulo')}</Text>
          <Feather name="chevron-down" size={14} color={Honra.tintaSuave} />
        </Pressable>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      {/* CABEÇA (maquete 1a). Na Secretária é UMA linha: o nome do ecrã, o eixo
          do que se procura e a busca encostada à direita. Assim tudo o que
          decide "onde estou a procurar" mora junto, e a coluna de resultados
          começa logo nos resultados. No telemóvel continua empilhado — uma
          linha só não caberia sem espremer as três coisas. */}
      {largo ? (
        <View style={styles.cabeca}>
          <Text style={styles.tituloLinha}>{t('pesq.titulo')}</Text>
          <View style={styles.segmentosLinha}>
            {SEGMENTOS.map((s) => (
              <Chip
                key={s.chave}
                texto={t(s.rotulo)}
                ativo={segmento === s.chave}
                onPress={() => setSegmento(s.chave)}
                icone={s.icone}
                inverso={s.inverso}
              />
            ))}
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.titulo}>{t('pesq.titulo')}</Text>
          {/* Segmentação — o eixo "o que procuro". Refina-se DENTRO com os filtros. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filtroFaixa}
            contentContainerStyle={styles.filtro}
          >
            {SEGMENTOS.map((s) => (
              <Chip
                key={s.chave}
                texto={t(s.rotulo)}
                ativo={segmento === s.chave}
                onPress={() => setSegmento(s.chave)}
                icone={s.icone}
                inverso={s.inverso}
              />
            ))}
          </ScrollView>
        </>
      )}

      {/* A FRASE — a barra que lê os filtros em voz alta (maquete 3a). Só na
          Secretária: no telemóvel não há linha que chegue para a frase inteira
          sem a partir, e uma frase partida deixa de ser frase. */}
      {largo && segmento !== 'trabalho' && (
        <View style={styles.frase}>
          <View style={styles.fraseCaixa}>
            <Feather name="search" size={17} color={Honra.tintaSuave} />
            {pastilhas.map((p) => (
              <View key={p.chave} style={styles.fraseP}>
                <Text style={styles.frasePRotulo}>{p.rotulo}</Text>
                <Text style={styles.frasePValor} numberOfLines={1}>
                  {p.valor}
                </Text>
                {/* padding real, não hitSlop: na web o hitSlop não estica o alvo */}
                <Pressable onPress={p.limpar} style={styles.frasePX}>
                  <Feather name="x" size={12} color={Honra.verdeEscuro} />
                </Pressable>
              </View>
            ))}
            {/* A porta para o resto dos filtros — o painel completo continua a
                existir para o que não cabe numa pastilha. */}
            <Pressable style={styles.fraseMais} onPress={() => setFiltrosAbertos(true)}>
              <Feather name="plus" size={13} color={Honra.tinta} />
              <Text style={styles.fraseMaisTxt}>{t('pesq.filtro_um')}</Text>
            </Pressable>
            <Campo
              style={styles.fraseCampo}
              value={busca}
              // Abrir na ESCRITA, não no foco: o `onFocus` do Campo não chega
              // cá acima em todas as plataformas, e um painel que só abre às
              // vezes é pior do que não abrir.
              onChangeText={(v) => {
                setBusca(v);
                setSugAbertas(true);
              }}
              placeholder={pastilhas.length > 0 ? t('pesq.ou_nome') : t('pesq.busca_ph')}
              autoCorrect={false}
              returnKeyType="search"
            />
            <Pressable
              style={styles.fraseGuardar}
              onPress={() => setBatismo({ tipo: 'pesquisa', nome: '' })}
            >
              <Feather name="bookmark" size={14} color={Honra.creme} />
              <Text style={styles.fraseGuardarTxt}>{t('pesq.guardar_curto')}</Text>
            </Pressable>
          </View>

          {/* AS SUGESTÕES — uma caixa, dois tipos de resposta: a CATEGORIA vira
              pastilha na frase; a PESSOA leva ao perfil. Só existe enquanto o
              campo tem o foco: fechada, não ocupa um pixel. */}
          {sugAbertas && (sugestoes.cats.length > 0 || sugestoes.pessoas.length > 0) ? (
            <View style={styles.sugCaixa}>
              {sugestoes.cats.map((c) => (
                <Pressable
                  key={c.id}
                  style={styles.sugLinha}
                  onPress={() => {
                    // Uma mãe filtra a ÁREA inteira; uma filha filtra só ela.
                    setCatFiltro({ id: c.id, nome: c.nome, modo: c.parent_id ? 'sub' : 'area' });
                    setBusca('');
                    setSugAbertas(false);
                  }}
                >
                  <Text style={styles.sugRotulo}>{t('pesq.p.faz')}</Text>
                  <Text style={styles.sugNome} numberOfLines={1}>
                    {c.nome}
                  </Text>
                  {/* A mãe diz que é área — para não parecer uma profissão. */}
                  {!c.parent_id ? <Text style={styles.sugArea}>{t('pesq.sug_area')}</Text> : null}
                </Pressable>
              ))}
              {sugestoes.cats.length > 0 && sugestoes.pessoas.length > 0 ? (
                <View style={styles.sugRisco} />
              ) : null}
              {sugestoes.pessoas.map((p) => (
                <Pressable
                  key={p.id}
                  style={styles.sugLinha}
                  onPress={() => {
                    setSugAbertas(false);
                    router.push(`/perfil/${p.id}`);
                  }}
                >
                  <Avatar iniciais={p.avatar} tamanho={22} />
                  <Text style={styles.sugNome} numberOfLines={1}>
                    {p.nome ?? t('pesq.sem_nome')}
                  </Text>
                  {p.handle ? <Text style={styles.sugHandle}>@{p.handle}</Text> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      )}

      {/* O painel de categorias serve os dois segmentos (perfis e mural). */}
      <PainelCategorias
        visivel={painelAberto}
        onFechar={() => setPainelAberto(false)}
        categorias={categorias}
        onEscolher={setCatFiltro}
        permitirArea
        selecionadasIds={catFiltro ? [catFiltro.id] : []}
      />

      {segmento === 'trabalho' ? (
        <>
          {filaFiltros}
          <Mural
            trabalhos={trabalhosCat}
            aCarregar={trabACarregar}
            erro={trabErro}
            filtrado={!!catFiltro}
            slugMaePorCat={slugMaePorCat}
          />
        </>
      ) : (
        <View style={[styles.corpo, largo && styles.corpoLargo]}>
      {/* A BANCADA — só na Secretária. Com 1280px de mesa, esconder o
          refinamento atrás de um botão é desperdiçar a mesa: os filtros ficam
          abertos à esquerda, à mão, e o resultado muda debaixo do olho. No
          telemóvel não há coluna a dar, e o mesmo corpo vive no modal. */}
      {largo && (
        <ScrollView
          style={styles.bancada}
          contentContainerStyle={styles.bancadaInterior}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.bancadaTopo}>
            {/* Título da bancada: o mesmo versalete das secções, mas SEM a
                margem de topo delas — dentro de uma linha, essa margem
                empurrava-o para baixo e o "Limpar" ficava a boiar acima. */}
            <Text style={styles.bancadaTitulo}>{t('pesq.filtros')}</Text>
            {numFiltros > 0 ? (
              <Pressable onPress={limparFiltros} hitSlop={10}>
                <Text style={styles.bancadaLimpar}>{t('data.limpar')}</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.bancadaRisco} />
          {corpoFiltros}

          {/* GUARDAR A PESQUISA — o gesto que transforma uma busca de hoje numa
              VIGIA. É a melhor ideia da maquete: em vez de trazer a pessoa de
              volta com um feed, traz-se com uma pergunta que ela própria fez. */}
          <Pressable
            style={[styles.guardarPesq, aGuardarPesq && styles.barraAcaoInativa]}
            onPress={() => setBatismo({ tipo: 'pesquisa', nome: '' })}
            disabled={aGuardarPesq}
          >
            <Text style={styles.guardarPesqTxt}>{t('pesq.guardar_pesquisa')}</Text>
          </Pressable>

          {guardadas.length > 0 ? (
            <>
              <Text style={styles.seccao}>{t('pesq.sec.guardadas')}</Text>
              {guardadas.map((g) => {
                const novos = novosDesde(g);
                return (
                  <Pressable key={g.id} style={styles.linhaGuardada} onPress={() => abrirGuardada(g)}>
                    <View style={styles.meio}>
                      <Text style={styles.guardadaNome} numberOfLines={1}>
                        {g.nome}
                      </Text>
                      {/* O número só aparece quando há novidade: um "0 novos"
                          repetido em cada linha seria ruído a fingir vida. */}
                      <Text style={[styles.guardadaSub, novos > 0 && styles.guardadaSubVivo]}>
                        {novos > 0
                          ? novos === 1
                            ? t('pesq.novo_desde_um')
                            : t('pesq.novos_desde', { n: novos })
                          : t('pesq.sem_novidades')}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={15} color={Honra.tintaSuave} />
                  </Pressable>
                );
              })}
            </>
          ) : null}

          {/* AS MINHAS LISTAS — curadoria privada. Estar numa lista não envia
              nada a ninguém: quem lá está não sabe, e não tem de saber. */}
          <View style={styles.listasTopo}>
            <Text style={styles.seccao}>{t('pesq.sec.listas')}</Text>
            <Pressable
              onPress={() => setBatismo({ tipo: 'lista', nome: '' })}
              hitSlop={10}
              style={styles.listaMais}
              accessibilityLabel={t('pesq.lista_nova')}
            >
              <Feather name="plus" size={13} color={Honra.verdeEscuro} />
            </Pressable>
          </View>
          {listas.length > 0 ? (
            listas.map((l) => (
              <View key={l.id} style={styles.linhaLista}>
                <View style={styles.listaPonto} />
                <Text style={styles.listaNome} numberOfLines={1}>
                  {l.nome}
                </Text>
                <Text style={styles.listaConta}>{l.membros}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.listaVazia}>{t('pesq.listas_vazio')}</Text>
          )}
        </ScrollView>
      )}

      <View style={styles.resultados}>
      {/* No telemóvel a busca vive aqui; na Secretária subiu para a cabeça. */}
      {!largo && (
        <View style={styles.buscaCaixa}>
          <Text style={styles.buscaGlifo}>⌕</Text>
          <Campo
            style={styles.buscaCampo}
            value={busca}
            onChangeText={setBusca}
            placeholder={t('pesq.busca_ph')}
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
      )}

      {filaFiltros}

      {/* CABEÇA DOS RESULTADOS (só na Secretária): quantos há e por que ordem.
          A contagem não é enfeite — é a noção do universo em que se está a
          mexer, e é ela que dá sentido ao corte que se acabou de fazer na
          bancada. A arrumação vem colada a ela porque arruma isto, não a
          bancada. */}
      {largo && (
        <View style={styles.cabecaRes}>
          <Text style={styles.contagem} numberOfLines={1}>
            <Text style={styles.contagemForte}>
              {visiveis.length === 1
                ? t(segmento === 'empresas' ? 'pesq.uma_empresa' : 'pesq.um_profissional')
                : t(segmento === 'empresas' ? 'pesq.n_empresas' : 'pesq.n_profissionais', {
                    n: visiveis.length,
                  })}
            </Text>
            {catFiltro ? ` · ${catFiltro.nome}` : ''}
            {minhaCidade && ordem === 'zona' ? ` · ${minhaCidade}` : ''}
          </Text>
          <Text style={styles.ordRotulo}>{t('pesq.sec.ordenar')}</Text>
          {ORDENS.map((o) => (
            <Chip
              key={o.chave}
              texto={t(o.rotulo)}
              ativo={ordem === o.chave}
              onPress={() => setOrdem(o.chave)}
            />
          ))}
        </View>
      )}

      {/* Painel de filtros — leve, em RN puro (como o CampoData): véu escuro
          nobre, cartão creme, três linhas tocáveis com o check verde. */}
      <Modal
        visible={filtrosAbertos}
        transparent
        animationType="fade"
        onRequestClose={() => setFiltrosAbertos(false)}
      >
        <Pressable style={styles.veu} onPress={() => setFiltrosAbertos(false)}>
          {/* Pressable interior "come" o toque para o véu não fechar o painel. */}
          <Pressable style={styles.carta} onPress={() => {}}>
            <Text style={styles.cartaTitulo}>{t('pesq.filtros')}</Text>
            {/* No telemóvel o modal leva tudo: cortes E arrumação. */}
            <ScrollView style={styles.cartaRolo} showsVerticalScrollIndicator={false}>
              {corpoFiltros}
              {blocoOrdenar}
            </ScrollView>
            <View style={styles.cartaRodape}>
              {numFiltros > 0 ? (
                <Pressable onPress={limparFiltros} hitSlop={8}>
                  <Text style={styles.cartaRodapeTxt}>{t('data.limpar')}</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable onPress={() => setFiltrosAbertos(false)} hitSlop={8}>
                <Text style={styles.cartaRodapeTxt}>{t('comum.fechar')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {aCarregar ? (
        <Carregar />
      ) : erro ? (
        <View style={styles.centroErro}>
          <Erro texto={erro} />
        </View>
      ) : (
        <FlatList
          data={dados}
          keyExtractor={(i) => i.id}
          key={largo ? 'lista' : colunas} /* remonta ao mudar de forma */
          numColumns={largo ? 1 : colunas}
          columnWrapperStyle={!largo && colunas > 1 ? styles.gridLinha : undefined}
          contentContainerStyle={[styles.lista, largo && styles.listaLarga]}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={largo ? () => <View style={styles.linhaRisco} /> : undefined}
          renderItem={({ item: misto }) => {
            // SECRETÁRIA: a busca é uma LISTA (3a) — compara-se melhor em
            // colunas alinhadas do que em cartões lado a lado. No telemóvel o
            // cartão continua a ser a forma certa: não há colunas a alinhar.
            if (largo && misto.k === 'perfil') {
              const pf = misto.p;
              return (
                <LinhaPessoa
                  p={pf}
                  marcado={marcados.has(pf.id)}
                  focado={focadoId === pf.id}
                  verificado={verificados.has(pf.id)}
                  disponivel={pf.disponibilidade === 'disponivel'}
                  elo={eloDe(pf.id)}
                  onMarcar={() => alternarMarca(pf.id)}
                  onFocar={() => setFocadoId(pf.id)}
                  t={t}
                />
              );
            }
            if (misto.k === 'trab')
              return (
                <View style={largo ? styles.gridCel : undefined}>
                  <CartaoTrabalho
                    item={misto.trab}
                    iconeSlug={misto.trab.categoria_id ? slugMaePorCat.get(misto.trab.categoria_id) : undefined}
                  />
                </View>
              );
            const item = misto.p;
            const disponivel = item.disponibilidade === 'disponivel';
            // Liquido: na montra o numero aparece sozinho (ver a regra no
            // honra-card.tsx). Quem falhou nao mostra o volume de antes.
            const honrados = honrasEfetivas(item.negocios_honrados, item.negocios_falhados);
            const apertos = item.apertos_selados ?? 0;
            const marcado = marcados.has(item.id);
            return (
              <View style={largo ? styles.gridCel : undefined}>
              <Cartao
                style={[styles.cartao, marcado && styles.cartaoMarcado]}
                onPress={() => router.push(`/perfil/${item.id}`)}
              >
                {/* CABEÇA — quem é. */}
                <View style={styles.cartaoCabeca}>
                  {/* Anel dourado sóbrio (nível 0) — a credencial em miniatura. */}
                  <Avatar
                    iniciais={item.avatar}
                    imagem={
                      item.avatar_url
                        ? supabase.storage.from('avatares').getPublicUrl(item.avatar_url).data
                            .publicUrl
                        : undefined
                    }
                    tamanho={46}
                  />
                  <View style={styles.meio}>
                    <View style={styles.linhaNome}>
                      <Text style={styles.nome} numberOfLines={1}>
                        {item.nome ?? t('pesq.sem_nome')}
                      </Text>
                      {verificados.has(item.id) && <Text style={styles.selo}>✓</Text>}
                      {/* Disponibilidade = a esfera junto ao ✓ (sem a palavra: o
                          ponto verde já diz tudo). */}
                      {disponivel && <View style={styles.dispDotInline} />}
                      {item.tipo === 'empresa' && (
                        <Pill texto={t('pesq.empresa_pill')} variante="empresa" />
                      )}
                    </View>
                    <Text style={styles.sub} numberOfLines={1}>
                      {item.papel ?? t('pesq.sem_funcao')}
                      {item.cidade ? ` · ${item.cidade}` : ''}
                      {item.handle ? ' · ' : ''}
                      {item.handle ? <Text style={styles.handle}>@{item.handle}</Text> : null}
                    </Text>
                    {/* Recência (067) — só no ecrã largo (browser tem espaço) e
                        só quando existe: reputação viva, nunca vergonha de novato. */}
                    {largo && item.ultimo_honrado_em ? (
                      <Text style={styles.recencia} numberOfLines={1}>
                        {t('pesq.ultimo_honrado', { quando: tempoAtras(item.ultimo_honrado_em, t) })}
                      </Text>
                    ) : null}
                  </View>
                  {/* A marca no canto — canto superior direito, como na maquete:
                      escolhe-se DEPOIS de ler quem é, não antes. */}
                  <Pressable
                    style={styles.marcaAlvo}
                    onPress={() => alternarMarca(item.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: marcado }}
                    accessibilityLabel={t('pesq.marcar', { nome: item.nome ?? '' })}
                  >
                    <View style={[styles.marca, marcado && styles.marcaOn]}>
                      {marcado ? <Text style={styles.marcaTxt}>✓</Text> : null}
                    </View>
                  </Pressable>
                </View>

                {/* RODAPÉ — o que vale. Três números com rótulo, pela ordem da
                    lei: CONDUTA primeiro (Confiança), depois o volume provado
                    (honrados) e só no fim a opinião dos outros (média). */}
                <View style={styles.cartaoRodape}>
                  <Numero
                    valor={`${confiancaPct(item.negocios_honrados, item.negocios_falhados)}%`}
                    rotulo={t('confianca.rotulo')}
                    verde
                  />
                  <Numero
                    valor={
                      apertos >= MIN_APERTOS_RACIO
                        ? `${honrados}/${apertos}`
                        : String(honrados)
                    }
                    rotulo={t('pesq.honrados')}
                  />
                  <Numero
                    valor={
                      Number(item.indice_confianca ?? 0) > 0
                        ? Number(item.indice_confianca).toFixed(1)
                        : '—'
                    }
                    rotulo={t('pesq.media')}
                    apagado={!(Number(item.indice_confianca ?? 0) > 0)}
                  />
                  {/* Falar com a pessoa sem sair da busca. */}
                  <Pressable
                    style={styles.acaoCartao}
                    onPress={() => router.push(`/perfil/${item.id}`)}
                    accessibilityLabel={t('pesq.falar')}
                  >
                    <Feather
                      name="message-square"
                      size={16}
                      color={Honra.tinta}
                      style={styles.espelhado}
                    />
                  </Pressable>
                </View>
              </Cartao>
              </View>
            );
          }}
          ListEmptyComponent={
            <Vazio texto={temFiltro ? t('pesq.vazio_filtro') : t('pesq.vazio')} />
          }
        />
      )}

      {/* A BARRA DOS MARCADOS — só existe quando há alguém marcado. Diz os
          nomes, não só a contagem: são pessoas. Não há "marcar todos" (era o
          spray por outra porta) nem teto (pedir a oito pintores é são). */}
      {marcadosLista.length > 0 && (
        <View style={[styles.barra, largo && styles.barraLarga]}>
          <View style={styles.barraNum}>
            <Text style={styles.barraNumTxt}>{marcadosLista.length}</Text>
          </View>
          <View style={styles.barraTextos}>
            <Text style={styles.barraTitulo}>{t('pesq.marcados')}</Text>
            <Text style={styles.barraNomes} numberOfLines={1}>
              {marcadosLista.map((p) => p.nome ?? t('pesq.sem_nome')).join(', ')}
            </Text>
          </View>
          <Pressable style={styles.barraLimpar} onPress={() => setMarcados(new Set())} hitSlop={8}>
            <Text style={styles.barraLimparTxt}>{t('data.limpar')}</Text>
          </Pressable>
          {/* Guardar é curadoria (privado, não avisa ninguém); pedir orçamento é
              um ato público. Por isso guardar fala baixo e pedir fala alto. */}
          <Pressable
            style={styles.barraSegunda}
            onPress={() => setBatismo({ tipo: 'lista', nome: '' })}
          >
            <Text style={styles.barraSegundaTxt}>{t('pesq.guardar_lista')}</Text>
          </Pressable>
          <Pressable style={styles.barraAcao} onPress={() => setPedidoAberto(true)}>
            <Text style={styles.barraAcaoTxt}>
              {t('pesq.pedir_a_n', { n: marcadosLista.length })}
            </Text>
          </Pressable>
        </View>
      )}

      {/* BATISMO — o mesmo diálogo para dar nome a uma vigia ou a uma lista.
          São gestos irmãos (ambos guardam algo meu, ambos privados), e um só
          sítio para escrever o nome poupa um padrão duplicado no ecrã. */}
      <Modal
        visible={!!batismo}
        transparent
        animationType="fade"
        onRequestClose={() => setBatismo(null)}
      >
        <Pressable style={styles.veu} onPress={() => setBatismo(null)}>
          <Pressable style={styles.carta} onPress={() => {}}>
            <Text style={styles.cartaTitulo}>
              {batismo?.tipo === 'lista' ? t('pesq.lista_nova') : t('pesq.guardar_pesquisa')}
            </Text>
            <Text style={styles.nota}>
              {batismo?.tipo === 'lista'
                ? marcadosLista.length > 0
                  ? t('pesq.lista_com_marcados', { n: marcadosLista.length })
                  : t('pesq.lista_vazia_aviso')
                : t('pesq.guardar_explica')}
            </Text>
            <Campo
              value={batismo?.nome ?? ''}
              onChangeText={(v) => setBatismo((b) => (b ? { ...b, nome: v } : b))}
              placeholder={
                batismo?.tipo === 'lista' ? t('pesq.lista_ph') : t('pesq.guardar_ph')
              }
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => {
                const b = batismo;
                if (!b || !b.nome.trim()) return;
                if (b.tipo === 'lista') criarLista(b.nome.trim());
                else guardarPesquisa(b.nome.trim());
                setBatismo(null);
              }}
            />
            <View style={styles.cartaRodape}>
              <Pressable onPress={() => setBatismo(null)} hitSlop={8}>
                <Text style={styles.cartaRodapeTxt}>{t('comum.cancelar')}</Text>
              </Pressable>
              <Pressable
                style={[styles.barraAcao, !batismo?.nome.trim() && styles.barraAcaoInativa]}
                disabled={!batismo?.nome.trim()}
                onPress={() => {
                  const b = batismo;
                  if (!b || !b.nome.trim()) return;
                  if (b.tipo === 'lista') criarLista(b.nome.trim());
                  else guardarPesquisa(b.nome.trim());
                  setBatismo(null);
                }}
              >
                <Text style={styles.barraAcaoTxt}>{t('pesq.guardar')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* O PEDIDO. Mostra a MINHA cara e a MINHA confiança antes de enviar —
          quem recebe vê exatamente isto, e por isso eu também o vejo. Nada
          sai daqui anónimo (guarda 2). */}
      <Modal
        visible={pedidoAberto}
        transparent
        animationType="fade"
        onRequestClose={() => setPedidoAberto(false)}
      >
        <Pressable style={styles.veu} onPress={() => setPedidoAberto(false)}>
          <Pressable style={styles.carta} onPress={() => {}}>
            <Text style={styles.cartaTitulo}>
              {t('pesq.pedir_a_n', { n: marcadosLista.length })}
            </Text>

            {/* DE / PARA. O bloco de cima dizia só "assim chegas a quem
                recebe" e o Vítor leu a SUA própria cara como sendo a do
                destinatário — se o dono do produto se engana, toda a gente se
                engana. Agora as duas pontas estão nomeadas e à vista: de quem
                sai, para quem vai. A cara continua cá porque aqui não se
                dispara anónimo (guarda 2); o que muda é deixar de haver dúvida
                sobre de quem ela é. */}
            <Text style={styles.seccao}>{t('pesq.pedido.de_ti')}</Text>
            <View style={styles.euLinha}>
              <Avatar
                iniciais={eu?.avatar}
                imagem={
                  eu?.avatar_url
                    ? supabase.storage.from('avatares').getPublicUrl(eu.avatar_url).data.publicUrl
                    : undefined
                }
                tamanho={40}
              />
              <View style={styles.meio}>
                <Text style={styles.nome} numberOfLines={1}>
                  {eu?.nome ?? t('pesq.sem_nome')}
                </Text>
                <Text style={styles.euConf}>
                  {confiancaPct(eu?.negocios_honrados, eu?.negocios_falhados)}%{' '}
                  {t('confianca.rotulo')}
                </Text>
              </View>
            </View>

            <Text style={styles.seccao}>
              {marcadosLista.length === 1
                ? t('pesq.pedido.para_um')
                : t('pesq.pedido.para_n', { n: marcadosLista.length })}
            </Text>
            {marcadosLista.map((p) => (
              <View key={p.id} style={styles.paraLinha}>
                <Avatar
                  iniciais={p.avatar}
                  imagem={
                    p.avatar_url
                      ? supabase.storage.from('avatares').getPublicUrl(p.avatar_url).data.publicUrl
                      : undefined
                  }
                  tamanho={28}
                />
                <Text style={styles.paraNome} numberOfLines={1}>
                  {p.nome ?? t('pesq.sem_nome')}
                </Text>
                <Text style={styles.paraPapel} numberOfLines={1}>
                  {p.papel ?? ''}
                </Text>
              </View>
            ))}

            <Text style={styles.seccao}>{t('pesq.pedido.o_que')}</Text>
            <Campo
              value={pedidoDesc}
              onChangeText={setPedidoDesc}
              placeholder={t('pesq.pedido.ph')}
              multiline
              numberOfLines={3}
            />

            {marcadosLista.length > 1 ? (
              <Text style={styles.nota}>
                {t('pesq.pedido.verao_quantos', { n: marcadosLista.length })}
              </Text>
            ) : null}
            {pedidoErro ? <Erro texto={pedidoErro} /> : null}

            <View style={styles.cartaRodape}>
              <Pressable onPress={() => setPedidoAberto(false)} hitSlop={8}>
                <Text style={styles.cartaRodapeTxt}>{t('comum.fechar')}</Text>
              </Pressable>
              <Pressable
                style={[styles.barraAcao, aPedir && styles.barraAcaoInativa]}
                onPress={enviarPedidos}
                disabled={aPedir}
              >
                <Text style={styles.barraAcaoTxt}>
                  {aPedir ? t('comum.a_enviar') : t('pesq.pedido.enviar')}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
        </View>
      {/* ══ PROVAS (3a) ══ — quem está em foco, sem sair da busca.
          Ver de quem se trata deixa de custar abrir o perfil e perder o sítio
          na lista. Só existe quando alguém foi escolhido: um painel vazio à
          espera seria mobília. */}
      {largo && focado ? (
        <ScrollView
          style={styles.provas}
          contentContainerStyle={styles.provasInterior}
          showsVerticalScrollIndicator={false}
        >
          {/* A CREDENCIAL — a peça verde, como no Honra Card. */}
          <View style={styles.credencial}>
            <View style={styles.credTopo}>
              <Avatar
                iniciais={focado.avatar}
                imagem={
                  focado.avatar_url
                    ? supabase.storage.from('avatares').getPublicUrl(focado.avatar_url).data
                        .publicUrl
                    : undefined
                }
                tamanho={52}
              />
              <View style={styles.meio}>
                <View style={styles.linhaNome}>
                  <Text style={styles.credNome} numberOfLines={1}>
                    {focado.nome ?? t('pesq.sem_nome')}
                  </Text>
                  {verificados.has(focado.id) ? <Text style={styles.credSelo}>✓</Text> : null}
                </View>
                <Text style={styles.credSub} numberOfLines={1}>
                  {focado.papel ?? t('pesq.sem_funcao')}
                  {focado.cidade ? ` · ${focado.cidade}` : ''}
                </Text>
              </View>
            </View>

            <View style={styles.credConfLinha}>
              <Text style={styles.credPct}>
                {confiancaPct(focado.negocios_honrados, focado.negocios_falhados)}%
              </Text>
              <Text style={styles.credPctRot}>{t('confianca.rotulo')}</Text>
              {/* O escalão em dourado: é o prestígio, e escala com ele. */}
              <View style={styles.credEscalao}>
                <Text style={styles.credEscalaoTxt}>
                  {escalaoDeCredencial({
                    indice_confianca: focado.indice_confianca,
                    verificacoesVerdes: selosFocado.length,
                    numAvaliacoes: provas.length,
                    negociosHonrados: focado.negocios_honrados ?? 0,
                    negociosFalhados: focado.negocios_falhados ?? 0,
                  })}
                </Text>
              </View>
            </View>
            <View style={styles.credBarra}>
              <View
                style={[
                  styles.credBarraCheia,
                  { width: `${confiancaPct(focado.negocios_honrados, focado.negocios_falhados)}%` },
                ]}
              />
            </View>

            {/* As abas do selo que ESTÃO verdes. As que faltam não se listam:
                a montra de outra pessoa não é sítio para lhe apontar falhas. */}
            {selosFocado.length > 0 ? (
              <View style={styles.credSelos}>
                {selosFocado.map((s) => (
                  <View key={s} style={styles.credAba}>
                    <Text style={styles.credAbaTxt}>✓ {t(`selo.${s}` as ChaveI18n)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {/* PROVAS — quem o honrou. Só avaliações já reveladas (double-blind). */}
          <View style={styles.blocoProvas}>
            <View style={styles.bancadaTopo}>
              <Text style={styles.bancadaTitulo}>{t('pesq.sec.provas')}</Text>
              <Text style={styles.provasConta}>
                {(focado.negocios_honrados ?? 0) === 1
                  ? t('pesq.uma_honra_recebida')
                  : t('pesq.honras_recebidas', { n: focado.negocios_honrados ?? 0 })}
              </Text>
            </View>
            {provas.length > 0 ? (
              provas.map((pr) => (
                <View key={pr.id} style={styles.provaLinha}>
                  <Avatar iniciais={pr.avatar} tamanho={28} />
                  <View style={styles.meio}>
                    <Text style={styles.provaNome} numberOfLines={1}>
                      {t('pesq.honrou_o', { nome: pr.nome ?? t('pesq.alguem') })}
                    </Text>
                    {pr.quando ? (
                      <Text style={styles.provaQuando}>{formatarData(pr.quando.slice(0, 10))}</Text>
                    ) : null}
                  </View>
                  {pr.nota ? (
                    <Text style={styles.provaEstrelas}>{'★'.repeat(Math.round(pr.nota))}</Text>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.listaVazia}>{t('pesq.sem_provas')}</Text>
            )}
          </View>

          <Pressable
            style={[styles.provasFalar, aFalar && styles.barraAcaoInativa]}
            onPress={() => abrirConversa(focado.id)}
            disabled={aFalar}
          >
            <Feather name="message-square" size={16} color={Honra.dourado} style={styles.espelhado} />
            <Text style={styles.provasFalarTxt}>
              {aFalar
                ? t('comum.a_enviar')
                : t('pesq.falar_com', { nome: (focado.nome ?? '').split(' ')[0] })}
            </Text>
          </Pressable>
          {/* O motivo, quando a porta não abre. Sem isto, o toque não fazia
              nada visível e parecia avaria — quando na verdade é uma regra. */}
          {falarMsg ? <Text style={styles.falarMsg}>{falarMsg}</Text> : null}
          <Pressable
            style={styles.provasGuardar}
            onPress={() => {
              setMarcados((s) => new Set(s).add(focado.id));
              setBatismo({ tipo: 'lista', nome: '' });
            }}
          >
            <Text style={styles.provasGuardarTxt}>{t('pesq.guardar_lista')}</Text>
          </Pressable>
        </ScrollView>
      ) : null}

        </View>
      )}
    </SafeAreaView>
  );
}

/**
 * Uma linha do painel de filtros — tocável, com o check verde a dizer o estado.
 * (Verde = significado: o filtro está a atuar.)
 */
function FiltroLinha({
  texto,
  ativo,
  onPress,
}: {
  texto: string;
  ativo: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.filtroLinha}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: ativo }}
      accessibilityLabel={texto}
    >
      <View style={[styles.filtroCheck, ativo && styles.filtroCheckOn]}>
        {ativo ? <Text style={styles.filtroCheckTxt}>✓</Text> : null}
      </View>
      <Text style={[styles.filtroLinhaTxt, ativo && styles.filtroLinhaTxtOn]}>{texto}</Text>
    </Pressable>
  );
}

/**
 * UMA LINHA DA LISTA (maquete 3a). A grelha de cartões deu lugar a linhas:
 * numa busca compara-se, e comparar exige que as mesmas grandezas caiam sempre
 * na mesma coluna. Um cartão empurra os números para onde couber; uma linha
 * segura-os alinhados, e o olho desce a coluna da Confiança de uma só vez.
 *
 * A ordem da linha é a ordem da decisão: marcar → quem é → o que prova.
 */
function LinhaPessoa({
  p,
  marcado,
  focado,
  verificado,
  disponivel,
  elo,
  onMarcar,
  onFocar,
  t,
}: {
  p: Perfil;
  marcado: boolean;
  focado: boolean;
  verificado: boolean;
  disponivel: boolean;
  elo: string | null;
  onMarcar: () => void;
  onFocar: () => void;
  t: TFn;
}) {
  const pct = confiancaPct(p.negocios_honrados, p.negocios_falhados);
  const honrados = honrasEfetivas(p.negocios_honrados, p.negocios_falhados);
  const media = Number(p.indice_confianca ?? 0);
  return (
    <Pressable
      style={[styles.linha, focado && styles.linhaFocada]}
      onPress={onFocar}
      accessibilityRole="button"
    >
      <Pressable
        onPress={onMarcar}
        style={styles.linhaMarcaAlvo}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: marcado }}
        accessibilityLabel={t('pesq.marcar', { nome: p.nome ?? '' })}
      >
        <View style={[styles.linhaMarca, marcado && styles.linhaMarcaOn]}>
          {marcado ? <Text style={styles.marcaTxt}>✓</Text> : null}
        </View>
      </Pressable>

      <Avatar
        iniciais={p.avatar}
        imagem={
          p.avatar_url
            ? supabase.storage.from('avatares').getPublicUrl(p.avatar_url).data.publicUrl
            : undefined
        }
        tamanho={42}
      />

      <View style={styles.meio}>
        <View style={styles.linhaNome}>
          <Text style={styles.linhaNomeTxt} numberOfLines={1}>
            {p.nome ?? t('pesq.sem_nome')}
          </Text>
          {verificado ? <Text style={styles.selo}>✓</Text> : null}
          {p.tipo === 'empresa' ? <Pill texto={t('pesq.empresa_pill')} variante="empresa" /> : null}
          {/* "Disponível agora" é o estado que a pessoa declara — não é uma
              data. A maquete promete "LIVRE A 14 AGO"; isso exigiria saber os
              dias tomados de cada um, que a base ainda não guarda. */}
          {disponivel ? (
            <View style={styles.pilulaLivre}>
              <View style={styles.dispDotInline} />
              <Text style={styles.pilulaLivreTxt}>{t('pesq.disponivel')}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.sub} numberOfLines={1}>
          {p.papel ?? t('pesq.sem_funcao')}
          {p.cidade ? ` · ${p.cidade}` : ''}
          {p.handle ? ' · ' : ''}
          {p.handle ? <Text style={styles.handle}>@{p.handle}</Text> : null}
        </Text>
        {/* O ELO — a joia da maquete. Só aparece quando é verdade, e é sempre
            um facto verificável: nasceu de um negócio honrado, não de uma
            sugestão de algoritmo. */}
        {elo ? (
          <View style={styles.eloLinha}>
            <Feather name="user-check" size={12} color={Honra.dourado} />
            <Text style={styles.eloTxt} numberOfLines={1}>
              {elo}
            </Text>
          </View>
        ) : (
          <Text style={styles.semElo}>{t('pesq.sem_elo')}</Text>
        )}
      </View>

      {/* A coluna que decide: percentagem, barra e o resumo em voz baixa. */}
      <View style={styles.linhaConf}>
        <View style={styles.linhaConfTopo}>
          <Text style={styles.linhaConfPct}>{pct}%</Text>
          <Text style={styles.linhaConfRotulo}>{t('confianca.rotulo')}</Text>
        </View>
        <View style={styles.linhaBarra}>
          <View style={[styles.linhaBarraCheia, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.linhaResumo} numberOfLines={1}>
          {honrados === 1 ? t('pesq.uma_honra') : t('pesq.n_honras', { n: honrados })}
          {media > 0 ? ` · ${media.toFixed(1)} ${t('pesq.media_min')}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Um número do rodapé do cartão: valor grande, rótulo em versalete por baixo.
 *
 * É esta forma que deixa comparar duas pessoas de relance — três grandezas na
 * mesma posição, no mesmo tamanho, em todos os cartões. Só a Confiança veste
 * verde: é conduta, o eixo que decide. As outras duas são tinta normal, para
 * que o olho vá primeiro ao sítio certo.
 */
function Numero({
  valor,
  rotulo,
  verde = false,
  apagado = false,
}: {
  valor: string;
  rotulo: string;
  verde?: boolean;
  apagado?: boolean;
}) {
  return (
    <View style={styles.num}>
      <Text
        style={[styles.numValor, verde && styles.numValorVerde, apagado && styles.numValorApagado]}
      >
        {valor}
      </Text>
      <Text style={styles.numRotulo} numberOfLines={1}>
        {rotulo}
      </Text>
    </View>
  );
}

/**
 * Uma linha da ordenação — escolha ÚNICA, por isso veste o disco cheio do rádio
 * e não o quadrado do check. A forma diz a regra antes de a pessoa a descobrir.
 */
function OrdemLinha({
  texto,
  ativo,
  onPress,
}: {
  texto: string;
  ativo: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.filtroLinha}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: ativo }}
      accessibilityLabel={texto}
    >
      <View style={[styles.radio, ativo && styles.radioOn]}>
        {ativo ? <View style={styles.radioMiolo} /> : null}
      </View>
      <Text style={[styles.filtroLinhaTxt, ativo && styles.filtroLinhaTxtOn]}>{texto}</Text>
    </Pressable>
  );
}

/**
 * Cartão de um trabalho — o irmão do cartão de pessoa, com outro ADN: entra
 * pelo ÍCONE DA ÁREA (círculo verde-suave; a pessoa entra pelo avatar escuro
 * de anel dourado), valor em pílula, prazo em voz baixa. Mesma geometria,
 * pele diferente — o olho separa trabalho de pessoa sem precisar de etiqueta.
 */
function CartaoTrabalho({ item, iconeSlug }: { item: Trabalho; iconeSlug?: string }) {
  const { t } = useT();
  return (
    <Cartao style={styles.cartaoTrabalho} onPress={() => router.push(`/trabalho/${item.id}`)}>
      <View style={styles.trabIcone}>
        <Feather name={ICONE_AREA[iconeSlug ?? ''] ?? 'briefcase'} size={20} color={Honra.verde} />
      </View>
      <View style={styles.meio}>
        <Text style={styles.nome} numberOfLines={2}>
          {item.titulo}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {[item.categoria?.nome, item.categoria2?.nome].filter(Boolean).join(' · ') ||
            t('pesq.sem_categoria')}
          {item.autor?.nome ? ` · ${item.autor.nome}` : ''}
        </Text>
        {item.descricao ? (
          <Text style={styles.excerto} numberOfLines={1}>
            {item.descricao}
          </Text>
        ) : null}
        {item.orcamento_valor != null || item.prazo ? (
          <View style={styles.metaTrab}>
            {item.orcamento_valor != null ? (
              <View style={styles.pillValor}>
                <Text style={styles.pillValorTxt}>{item.orcamento_valor}€</Text>
              </View>
            ) : null}
            {item.prazo ? (
              <Text style={styles.metaPrazo}>
                {t('pesq.ate_prazo', { data: formatarData(item.prazo) })}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <Text style={styles.seta}>›</Text>
    </Cartao>
  );
}

/**
 * Mural de oportunidades — o segmento "Trabalho". Não são perfis: são trabalhos
 * publicados (título, categoria, autor, excerto), tocáveis até ao detalhe.
 */
function Mural({
  trabalhos,
  aCarregar,
  erro,
  filtrado = false,
  slugMaePorCat,
}: {
  trabalhos: ReturnType<typeof useTrabalhos>['trabalhos'];
  aCarregar: boolean;
  erro: string | null;
  filtrado?: boolean;
  slugMaePorCat: Map<string, string>;
}) {
  const { t } = useT();
  // A MESMA grelha dos perfis (coerência entre segmentos — pedido 28/07):
  // 2 colunas na secretária, 1 no telemóvel.
  const { width } = useWindowDimensions();
  const largo = width >= LARGURA_SECRETARIA;
  const colunas = largo ? 2 : 1;
  return (
    <View style={styles.muralFlex}>
      {/* Publicar trabalho vive agora no Início (criar = o teu hub). Aqui só se descobre. */}
      {aCarregar ? (
        <Carregar />
      ) : erro ? (
        <View style={styles.centroErro}>
          <Erro texto={erro} />
        </View>
      ) : (
        <FlatList
          data={trabalhos}
          keyExtractor={(t) => t.id}
          key={colunas}
          numColumns={colunas}
          columnWrapperStyle={largo ? styles.gridLinha : undefined}
          contentContainerStyle={[styles.lista, largo && styles.listaLarga]}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View style={largo ? styles.gridCel : undefined}>
              <CartaoTrabalho
                item={item}
                iconeSlug={item.categoria_id ? slugMaePorCat.get(item.categoria_id) : undefined}
              />
            </View>
          )}
          ListEmptyComponent={
            <Vazio texto={filtrado ? t('pesq.vazio_mural_filtro') : t('pesq.vazio_mural')} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  metaTrab: { flexDirection: 'row', alignItems: 'center', gap: Espaco.sm, marginTop: 2 },
  metaValor: { color: Honra.verde, fontSize: 13, fontWeight: '800' },
  metaPrazo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '600' },
  titulo: {
    fontSize: 28,
    fontWeight: '800',
    color: Honra.tinta,
    paddingHorizontal: Espaco.xl,
    paddingTop: Espaco.md,
  },
  buscaCaixa: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Espaco.md,
    paddingTop: Espaco.md,
  },
  buscaGlifo: {
    position: 'absolute',
    left: Espaco.md + Espaco.md,
    zIndex: 1,
    fontSize: 18,
    color: Honra.tintaSuave,
  },
  buscaCampo: { flex: 1, paddingLeft: Espaco.xl + 4 },
  // A cabeça da Secretária: nome do ecrã · eixo · busca, tudo numa linha.
  cabeca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.md,
    paddingHorizontal: Espaco.xl,
    paddingTop: Espaco.md,
  },
  tituloLinha: { fontSize: 26, fontWeight: '800', color: Honra.tinta, letterSpacing: -0.7 },
  segmentosLinha: { flexDirection: 'row', gap: Espaco.xs },
  // ===== A FRASE (3a) =====
  // zIndex no PAI: sem ele o painel das sugestões existe mas fica por baixo
  // da bancada, que vem depois no DOM e tem fundo opaco. Um filho com zIndex
  // alto não sobe acima de um irmão do pai — tem de ser o pai a subir.
  frase: { paddingHorizontal: Espaco.xl, paddingTop: Espaco.md, zIndex: 30 },
  fraseCaixa: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Espaco.sm,
    paddingVertical: Espaco.sm,
    paddingHorizontal: Espaco.md,
    borderRadius: Raio.lg,
    backgroundColor: Honra.brancoCreme,
    borderWidth: 1.5,
    borderColor: Honra.verde,
  },
  // Cada pedaço da frase: o RÓTULO diz a função em voz baixa ("FAZ", "PERTO
  // DE") e o valor diz a coisa. Ler-se-ia bem em voz alta — é esse o teste.
  fraseP: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingLeft: Espaco.sm + 2,
    paddingRight: 2,
    borderRadius: Raio.pill,
    backgroundColor: Honra.verdeSuave,
    maxWidth: 260,
  },
  frasePRotulo: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: Honra.tintaSuave,
  },
  frasePValor: { ...TextoAcao, fontSize: 12.5, fontWeight: '700', color: Honra.verdeEscuro, flexShrink: 1 },
  frasePX: { padding: 6 },
  fraseMais: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: Espaco.sm + 2,
    borderRadius: Raio.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Honra.cremeEscuro,
  },
  fraseMaisTxt: { ...TextoAcao, fontSize: 12, fontWeight: '600', color: Honra.tinta },
  // O campo de texto vive DENTRO da frase, a seguir às pastilhas: continua-se
  // a escrever onde a frase acaba, como numa linha de escrita mesmo.
  fraseCampo: { flex: 1, minWidth: 140, borderWidth: 0, backgroundColor: 'transparent' },
  fraseGuardar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: Espaco.sm + 1,
    paddingHorizontal: Espaco.md,
    borderRadius: Raio.md,
    backgroundColor: Honra.verdeEscuro,
  },
  fraseGuardarTxt: { ...TextoAcao, color: Honra.creme, fontSize: 13, fontWeight: '700' },
  // O painel das sugestões cai POR CIMA do resto (posição absoluta): enquanto
  // se escreve, a lista de resultados não pode saltar para baixo.
  sugCaixa: {
    position: 'absolute',
    top: '100%',
    left: Espaco.xl,
    right: Espaco.xl,
    marginTop: Espaco.xs,
    zIndex: 20,
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.lg,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    paddingVertical: Espaco.xs,
    shadowColor: Honra.verdeMaisEscuro,
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  sugLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.sm,
    paddingVertical: Espaco.sm + 2,
    paddingHorizontal: Espaco.md,
  },
  // O mesmo rótulo da pastilha ("FAZ"): quem escolhe já vê a frase que vai
  // construir, antes de a construir.
  sugRotulo: {
    ...TextoAcao,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: Honra.tintaSuave,
  },
  sugNome: { ...TextoAcao, fontSize: 14, fontWeight: '700', color: Honra.tinta, flexShrink: 1 },
  // A mãe diz que é área — senão lia-se como profissão, e "Eventos &
  // Casamentos" não é profissão de ninguém.
  sugArea: { ...TextoAcao, marginLeft: 'auto', fontSize: 11, color: Honra.tintaSuave },
  sugHandle: { ...TextoAcao, marginLeft: 'auto', fontSize: 12, color: Honra.verde, fontWeight: '600' },
  sugRisco: { height: 1, backgroundColor: Honra.cremeEscuro, marginVertical: Espaco.xs },
  // flexGrow/Shrink 0: a faixa não rouba nem cede altura à lista. O padding
  // vertical no CONTEÚDO é obrigatório — sem paddingBottom, o RN-web corta o
  // fundo dos chips (era o que fazia o topo parecer "esmagado" no telemóvel).
  filtroFaixa: { flexGrow: 0, flexShrink: 0 },
  filtro: {
    paddingHorizontal: Espaco.md,
    paddingTop: Espaco.sm,
    paddingBottom: Espaco.sm,
    gap: Espaco.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Traço fino a separar o chip líder "Filtros" do campo Categorias.
  filtroDivisor: { width: 1, height: 20, backgroundColor: Honra.cremeEscuro },
  // Campo "Categorias" — a porta do painel. Em repouso é uma pílula serena;
  // com escolha feita veste o verde (uma cor, uma função: o filtro está a atuar).
  catCampo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.pill,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    paddingVertical: 7,
    paddingHorizontal: Espaco.md,
  },
  catCampoTxt: { ...TextoAcao, fontSize: 13, fontWeight: '600', color: Honra.tinta },
  catCampoAtivo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Honra.verde,
    borderRadius: Raio.pill,
    borderWidth: 1,
    borderColor: Honra.verde,
    paddingVertical: 7,
    paddingHorizontal: Espaco.md,
    flexShrink: 1,
  },
  catCampoAtivoTxt: { ...TextoAcao, fontSize: 13, fontWeight: '700', color: Honra.creme, flexShrink: 1 },
  // Alvo confortável para o dedo sem crescer visualmente (margem negativa).
  catLimpar: { padding: 10, margin: -10 },

  // Painel de filtros — véu escuro nobre (o mesmo do CampoData), cartão creme.
  veu: {
    flex: 1,
    backgroundColor: 'rgba(18, 33, 27, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Espaco.lg,
  },
  carta: {
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.lg,
    padding: Espaco.lg,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    gap: Espaco.xs,
  },
  cartaTitulo: { fontSize: 18, fontWeight: '800', color: Honra.tinta, marginBottom: Espaco.sm },
  // O painel cresceu (cortes + piso + arrumação): rola por dentro em vez de
  // empurrar o rodapé para fora do ecrã no telemóvel.
  cartaRolo: { maxHeight: 420 },
  // Rótulo de secção — versalete sereno, o mesmo tom das etiquetas da Secretária.
  seccao: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: Honra.tintaSuave,
    marginTop: Espaco.md,
    marginBottom: Espaco.xs,
  },
  // O cursor da Confiança respira acima e abaixo — é o único gesto contínuo
  // do painel e não deve encostar às linhas de check.
  cursorBloco: { marginTop: Espaco.md },
  // O primeiro rótulo da bancada não leva margem de topo — já lá está o fio.
  seccaoPrim: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: Honra.tintaSuave,
    marginBottom: Espaco.xs,
  },
  // Pastilhas de categoria e de zona: escolha rápida, uma de cada vez.
  pastilhas: { flexDirection: 'row', flexWrap: 'wrap', gap: Espaco.xs, marginBottom: Espaco.xs },
  pastilha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: Espaco.sm + 2,
    borderRadius: Raio.pill,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    backgroundColor: Honra.creme,
    maxWidth: '100%',
  },
  pastilhaOn: { backgroundColor: Honra.verdeEscuro, borderColor: Honra.verdeEscuro },
  pastilhaTxt: { ...TextoAcao, fontSize: 12, fontWeight: '600', color: Honra.tinta, flexShrink: 1 },
  pastilhaTxtOn: { color: Honra.creme, fontWeight: '700' },
  // O disco do rádio — escolha única (a ordenação), ao contrário do check.
  radio: {
    width: 24,
    height: 24,
    borderRadius: Raio.pill,
    borderWidth: 1.5,
    borderColor: Honra.cremeEscuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: Honra.verde },
  radioMiolo: { width: 12, height: 12, borderRadius: Raio.pill, backgroundColor: Honra.verde },
  // A promessa dita em voz baixa, no fundo do painel: aqui não se ordena por preço.
  nota: {
    fontSize: 12,
    color: Honra.tintaSuave,
    lineHeight: 17,
    marginTop: Espaco.md,
    fontStyle: 'italic',
  },
  filtroLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.md,
    paddingVertical: Espaco.sm,
  },
  filtroCheck: {
    width: 24,
    height: 24,
    borderRadius: Raio.pill,
    borderWidth: 1.5,
    borderColor: Honra.cremeEscuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtroCheckOn: { backgroundColor: Honra.verde, borderColor: Honra.verde },
  filtroCheckTxt: { color: Honra.creme, fontSize: 13, fontWeight: '900' },
  filtroLinhaTxt: { ...TextoAcao, flex: 1, fontSize: 15, color: Honra.tinta, fontWeight: '600' },
  filtroLinhaTxtOn: { color: Honra.verde },
  cartaRodape: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Espaco.md,
  },
  cartaRodapeTxt: { ...TextoAcao, color: Honra.tintaSuave, fontSize: 14, fontWeight: '700', padding: Espaco.xs },
  // O corpo do ecrã. No telemóvel é uma coluna só; na Secretária parte-se em
  // BANCADA (fixa, à esquerda) + RESULTADOS, e o conjunto centra-se nos 1100.
  corpo: { flex: 1 },
  // Três colunas (272 · resto · 328) — e SEM teto de 1100: com duas colunas
  // fixas nas pontas, um teto apertado roubava tudo ao meio, e é o meio que
  // tem o trabalho. A mesa é a mesa toda.
  corpoLargo: {
    flexDirection: 'row',
    gap: Espaco.lg,
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: Espaco.xl,
    paddingTop: Espaco.md,
  },
  bancada: {
    width: 272,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.lg,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
  },
  bancadaInterior: { padding: Espaco.lg },
  // Alinhados pela BASE do texto, não pelo centro da caixa: assim as duas
  // palavras assentam na mesma linha invisível, como numa folha pautada.
  bancadaTopo: { flexDirection: 'row', alignItems: 'baseline' },
  bancadaTitulo: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: Honra.tintaSuave,
  },
  // "Limpar" em dourado e mais pequeno que o título: é um gesto de recomeço
  // disponível, não uma ação de avanço nem um segundo cabeçalho a competir.
  bancadaLimpar: { ...TextoAcao, marginLeft: 'auto', fontSize: 12, fontWeight: '700', color: Honra.dourado },
  // Um fio a fechar o cabeçalho da bancada e a abrir o campo de trabalho.
  bancadaRisco: {
    height: 1,
    backgroundColor: Honra.cremeEscuro,
    marginTop: Espaco.sm,
  },
  // Guardar a pesquisa: verde escuro e largura toda — é o remate da bancada,
  // o gesto que fecha o trabalho de refinar.
  guardarPesq: {
    marginTop: Espaco.lg,
    paddingVertical: Espaco.sm + 3,
    borderRadius: Raio.md,
    backgroundColor: Honra.verdeEscuro,
    alignItems: 'center',
  },
  guardarPesqTxt: { ...TextoAcao, color: Honra.creme, fontSize: 13.5, fontWeight: '700' },
  linhaGuardada: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.sm,
    paddingVertical: Espaco.sm,
  },
  guardadaNome: { fontSize: 13.5, fontWeight: '700', color: Honra.tinta },
  guardadaSub: { fontSize: 11.5, color: Honra.tintaSuave, marginTop: 1 },
  // Com novidade, a linha acende — é o único sítio da bancada que "chama".
  guardadaSubVivo: { color: Honra.verde, fontWeight: '700' },
  listasTopo: { flexDirection: 'row', alignItems: 'center' },
  listaMais: {
    marginLeft: 'auto',
    marginTop: Espaco.md,
    width: 20,
    height: 20,
    borderRadius: Raio.pill,
    backgroundColor: Honra.cremeEscuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linhaLista: { flexDirection: 'row', alignItems: 'center', gap: Espaco.sm, paddingVertical: 7 },
  // O ponto dourado da lista: marca de arrumação, não de prestígio.
  listaPonto: { width: 8, height: 8, borderRadius: Raio.pill, backgroundColor: Honra.dourado },
  listaNome: { flex: 1, fontSize: 13.5, fontWeight: '700', color: Honra.tinta },
  listaConta: { fontSize: 12.5, fontWeight: '700', color: Honra.tintaSuave },
  listaVazia: { fontSize: 12, color: Honra.tintaSuave, lineHeight: 17 },
  // A segunda ação da barra: presente, mas em voz baixa.
  barraSegunda: {
    paddingVertical: Espaco.sm + 2,
    paddingHorizontal: Espaco.md,
    borderRadius: Raio.md,
    borderWidth: 1,
    borderColor: 'rgba(230,210,162,0.35)',
  },
  barraSegundaTxt: { ...TextoAcao, color: Honra.douradoClaro, fontSize: 13, fontWeight: '700' },
  // ===== A LISTA (3a) =====
  // Linhas, não cartões: as mesmas grandezas caem sempre na mesma coluna, e o
  // olho desce a coluna da Confiança de uma vez só.
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.md,
    paddingVertical: Espaco.md,
    paddingHorizontal: Espaco.md,
    backgroundColor: Honra.brancoCreme,
  },
  // Em foco: fundo mais quente e um traço verde à esquerda — a mesma marca que
  // um marcador deixa numa página. Não muda de cor: continua a ler-se igual.
  linhaFocada: { backgroundColor: Honra.creme, borderLeftWidth: 3, borderLeftColor: Honra.verde },
  linhaRisco: { height: 1, backgroundColor: Honra.cremeEscuro },
  linhaMarcaAlvo: { padding: Espaco.xs, margin: -Espaco.xs },
  linhaMarca: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Honra.cremeEscuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linhaMarcaOn: { backgroundColor: Honra.verdeEscuro, borderColor: Honra.verdeEscuro },
  linhaNomeTxt: { fontSize: 15.5, fontWeight: '800', color: Honra.tinta, flexShrink: 1 },
  pilulaLivre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
    paddingHorizontal: Espaco.sm,
    borderRadius: Raio.pill,
    backgroundColor: Honra.verdeSuave,
  },
  pilulaLivreTxt: { fontSize: 10, fontWeight: '800', color: Honra.verde },
  // O elo fala dourado — é património de relação, não uma ação a fazer.
  eloLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  eloTxt: { fontSize: 12, fontWeight: '700', color: Honra.dourado, flexShrink: 1 },
  semElo: { fontSize: 12, color: Honra.tintaSuave, marginTop: 3, opacity: 0.8 },
  linhaConf: { width: 108, alignItems: 'flex-end', gap: 4 },
  linhaConfTopo: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  linhaConfPct: { fontSize: 17, fontWeight: '800', color: Honra.verde },
  linhaConfRotulo: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4, color: Honra.tintaSuave },
  linhaBarra: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: Honra.cremeEscuro,
    overflow: 'hidden',
  },
  linhaBarraCheia: { height: 4, borderRadius: 2, backgroundColor: Honra.verde },
  linhaResumo: { fontSize: 11.5, color: Honra.tintaSuave },
  // ===== PROVAS (3a) — a coluna da direita =====
  provas: { width: 328, flexGrow: 0, flexShrink: 0 },
  provasInterior: { gap: Espaco.md, paddingBottom: Espaco.xl },
  // A credencial: a mesma pele verde do Honra Card. É a peça de prestígio do
  // ecrã, e por isso é a única coisa aqui que veste o gradiente escuro.
  credencial: {
    padding: Espaco.lg,
    borderRadius: Raio.lg,
    backgroundColor: Honra.verdeEscuro,
    gap: Espaco.md,
  },
  credTopo: { flexDirection: 'row', alignItems: 'center', gap: Espaco.md },
  credNome: { fontSize: 18, fontWeight: '800', color: Honra.creme, flexShrink: 1 },
  credSelo: { color: Honra.verdeVivo, fontWeight: '800' },
  credSub: { fontSize: 12.5, color: Honra.salvia, marginTop: 2 },
  credConfLinha: { flexDirection: 'row', alignItems: 'baseline', gap: Espaco.sm },
  credPct: { fontSize: 28, fontWeight: '800', color: Honra.creme, letterSpacing: -0.8 },
  credPctRot: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: Honra.salvia },
  credEscalao: {
    marginLeft: 'auto',
    paddingVertical: 3,
    paddingHorizontal: Espaco.sm + 3,
    borderRadius: Raio.pill,
    borderWidth: 1,
    borderColor: 'rgba(197,164,95,0.42)',
    backgroundColor: 'rgba(197,164,95,0.14)',
  },
  credEscalaoTxt: { fontSize: 11.5, fontWeight: '700', color: Honra.douradoClaro },
  credBarra: { height: 4, borderRadius: 2, backgroundColor: 'rgba(242,237,226,0.16)' },
  credBarraCheia: { height: 4, borderRadius: 2, backgroundColor: Honra.dourado },
  credSelos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  credAba: {
    paddingVertical: 4,
    paddingHorizontal: Espaco.sm + 2,
    borderRadius: Raio.pill,
    borderWidth: 1,
    borderColor: 'rgba(230,210,162,0.25)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  credAbaTxt: { fontSize: 11, fontWeight: '700', color: Honra.douradoClaro },
  blocoProvas: {
    padding: Espaco.lg,
    borderRadius: Raio.lg,
    backgroundColor: Honra.brancoCreme,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    gap: Espaco.sm,
  },
  provasConta: { marginLeft: 'auto', fontSize: 12, color: Honra.tintaSuave },
  provaLinha: { flexDirection: 'row', alignItems: 'center', gap: Espaco.sm + 3 },
  provaNome: { fontSize: 13.5, fontWeight: '700', color: Honra.tinta },
  provaQuando: { fontSize: 11.5, color: Honra.tintaSuave, marginTop: 1 },
  provaEstrelas: { fontSize: 11, letterSpacing: 1.5, color: Honra.dourado },
  provasFalar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Espaco.sm,
    height: 48,
    borderRadius: Raio.lg,
    backgroundColor: Honra.verdeEscuro,
  },
  provasFalarTxt: { ...TextoAcao, color: Honra.creme, fontSize: 14.5, fontWeight: '700' },
  provasGuardar: {
    height: 44,
    borderRadius: Raio.md,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    backgroundColor: Honra.brancoCreme,
    alignItems: 'center',
    justifyContent: 'center',
  },
  provasGuardarTxt: { ...TextoAcao, color: Honra.verdeEscuro, fontSize: 13.5, fontWeight: '700' },
  falarMsg: { fontSize: 12.5, color: Honra.erro, lineHeight: 18 },
  resultados: { flex: 1, minWidth: 0 },
  // A cabeça dos resultados: contagem à esquerda, arrumação empurrada para a
  // direita. Uma linha só — se rebentar, é sinal de que há chips a mais.
  cabecaRes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.sm,
    paddingHorizontal: Espaco.md,
    paddingTop: Espaco.sm,
  },
  contagem: { flex: 1, minWidth: 0, fontSize: 13, color: Honra.tintaSuave },
  contagemForte: { color: Honra.tinta, fontWeight: '700' },
  ordRotulo: { ...TextoAcao, fontSize: 12.5, color: Honra.tintaSuave },
  lista: { padding: Espaco.md, gap: Espaco.sm },
  // SECRETÁRIA: a grelha já vive DENTRO da coluna de resultados — quem centra e
  // limita a 1100 é o corpo. Aqui só se tira o padding lateral, que a bancada
  // já deu, e se dá ar em baixo para a barra dos marcados não tapar o último.
  listaLarga: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 88 },
  gridLinha: { gap: Espaco.md }, // espaço entre as 2 colunas de cartões
  gridCel: { flex: 1, minWidth: 0 }, // cada cartão divide a linha em partes iguais
  // Cabeçalho (título, busca) alinhado com a grelha centrada (máx. 1100).
  blocoLargo: { width: '100%', maxWidth: 1100, alignSelf: 'center' },
  // Recência do último honrado — verde: é confiança viva, não decoração.
  recencia: { fontSize: 12, color: Honra.verde, fontWeight: '600', marginTop: 2 },
  // O círculo do trabalho — geometria do avatar (44), pele de oportunidade:
  // verde-suave com o ícone da área. O par distingue-se num relance.
  trabIcone: {
    width: 44,
    height: 44,
    borderRadius: Raio.pill,
    backgroundColor: Honra.verdeSuave,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillValor: {
    backgroundColor: Honra.verdeSuave,
    borderRadius: Raio.pill,
    paddingHorizontal: Espaco.sm,
    paddingVertical: 2,
  },
  pillValorTxt: { color: Honra.verde, fontSize: 12, fontWeight: '800' },
  // O cartão de pessoa em DOIS ANDARES (maquete 1a): em cima quem é, em baixo
  // o que vale. A linha única de antes obrigava os números a competir com o
  // nome pelo mesmo espaço — e num cartão de meia coluna ganhava sempre o
  // truncar. Assim cada andar tem a largura toda.
  cartao: { gap: Espaco.md },
  // Marcado = anel verde e um pouco de elevação. O cartão sobe, não muda de cor:
  // continua a ler-se igual, só está escolhido.
  cartaoMarcado: {
    borderColor: Honra.verde,
    borderWidth: 1.5,
    shadowColor: Honra.verdeMaisEscuro,
    shadowOpacity: 0.09,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  cartaoCabeca: { flexDirection: 'row', alignItems: 'flex-start', gap: Espaco.md },
  cartaoRodape: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.md,
    paddingTop: Espaco.md,
    borderTopWidth: 1,
    borderTopColor: Honra.cremeEscuro,
  },
  // Os três números: mesma caixa, mesma posição em todos os cartões — é isso
  // que os torna comparáveis de relance.
  num: { minWidth: 46 },
  numValor: { fontSize: 15, fontWeight: '800', color: Honra.tinta },
  numValorVerde: { color: Honra.verde },
  numValorApagado: { color: Honra.tintaSuave },
  numRotulo: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: Honra.tintaSuave,
    marginTop: 1,
  },
  // A ação discreta do cartão — encostada à direita, sem roubar o toque ao
  // cartão inteiro (que abre o perfil).
  acaoCartao: {
    marginLeft: 'auto',
    width: 34,
    height: 34,
    borderRadius: Raio.md,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    backgroundColor: Honra.creme,
    alignItems: 'center',
    justifyContent: 'center',
  },
  espelhado: { transform: [{ scaleX: -1 }] },
  cartaoTrabalho: { flexDirection: 'row', alignItems: 'flex-start', gap: Espaco.md },
  meio: { flex: 1 },
  linhaNome: { flexDirection: 'row', alignItems: 'center', gap: Espaco.xs },
  nome: { fontSize: 16, fontWeight: '700', color: Honra.tinta, flexShrink: 1 },
  selo: { color: Honra.verde, fontWeight: '800' },
  dispDotInline: { width: 8, height: 8, borderRadius: Raio.pill, backgroundColor: Honra.verdeVivo },
  handle: { fontSize: 13, color: Honra.verde, fontWeight: '600', marginTop: 1 },
  sub: { fontSize: 13, color: Honra.tintaSuave, marginTop: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Espaco.sm, marginTop: 4 },
  conf: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  confEstrela: { color: Honra.dourado, fontSize: 12 },
  confNum: { color: Honra.tinta, fontSize: 12, fontWeight: '700' },
  // A Confiança em percentagem — verde (é conduta, é significado), com o rótulo
  // em voz baixa a seguir. Sem estrela: a estrela é da crítica, não da conduta.
  confPct: { color: Honra.verde, fontSize: 13, fontWeight: '800' },
  confPctRotulo: {
    color: Honra.tintaSuave,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginRight: Espaco.xs,
  },
  disp: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dispDot: { width: 6, height: 6, borderRadius: Raio.pill, backgroundColor: Honra.verdeVivo },
  dispTxt: { color: Honra.verde, fontSize: 12, fontWeight: '600' },
  // "On Honra" no lado direito do cartão — negócios honrados, o sinal da casa.
  onHonra: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 52,
    paddingHorizontal: Espaco.sm,
    paddingVertical: Espaco.xs,
    borderRadius: Raio.md,
    backgroundColor: Honra.verdeSuave,
  },
  onHonraNum: { color: Honra.verde, fontSize: 18, fontWeight: '800', lineHeight: 20 },
  // "de N" mais pequeno e sereno — o denominador acompanha, não grita.
  onHonraDe: { color: Honra.verde, fontSize: 12, fontWeight: '700' },
  onHonraTxt: { color: Honra.verde, fontSize: 10, fontWeight: '700' },
  seta: { fontSize: 22, color: Honra.tintaSuave },

  // A marca do cartão. Quadrado (escolha múltipla), ao contrário do disco da
  // ordenação. Alvo grande por margem negativa: cresce para o dedo, não para o olho.
  marcaAlvo: { padding: Espaco.sm, margin: -Espaco.sm },
  marca: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: Honra.cremeEscuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marcaOn: { backgroundColor: Honra.verde, borderColor: Honra.verde },
  marcaTxt: { ...TextoAcao, color: Honra.creme, fontSize: 12, fontWeight: '900' },

  // A BARRA DOS MARCADOS — verde da casa, pousada sobre a lista. Só aparece
  // quando há gente marcada: é consequência de um gesto, não mobília do ecrã.
  barra: {
    position: 'absolute',
    left: Espaco.md,
    right: Espaco.md,
    bottom: Espaco.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.md,
    paddingVertical: Espaco.md,
    paddingHorizontal: Espaco.lg,
    borderRadius: Raio.lg,
    backgroundColor: Honra.verdeEscuro,
    shadowColor: Honra.verdeMaisEscuro,
    shadowOpacity: 0.26,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  // Na Secretária a barra já vive dentro da coluna de resultados: cola-se às
  // margens dessa coluna, não às do ecrã (senão passava por baixo da bancada).
  barraLarga: { left: 0, right: 0 },
  // O número em dourado: é prestígio contido — diz quantos, sem gritar.
  barraNum: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: Espaco.xs,
    borderRadius: Raio.pill,
    backgroundColor: Honra.dourado,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barraNumTxt: { color: Honra.verdeMaisEscuro, fontSize: 13, fontWeight: '800' },
  barraTextos: { flex: 1, minWidth: 0 },
  barraTitulo: { color: Honra.creme, fontSize: 14, fontWeight: '700' },
  // Os nomes em voz baixa — quem se marca são pessoas, não unidades.
  barraNomes: { color: Honra.douradoClaro, fontSize: 12, marginTop: 1 },
  barraLimpar: { padding: Espaco.xs },
  barraLimparTxt: { ...TextoAcao, color: Honra.douradoClaro, fontSize: 13, fontWeight: '700' },
  barraAcao: {
    paddingVertical: Espaco.sm + 2,
    paddingHorizontal: Espaco.lg,
    borderRadius: Raio.md,
    backgroundColor: Honra.brancoCreme,
  },
  barraAcaoTxt: { ...TextoAcao, color: Honra.verde, fontSize: 13.5, fontWeight: '700' },
  barraAcaoInativa: { opacity: 0.6 },

  // A minha cara no pedido — vejo exatamente o que a outra pessoa vai ver.
  euLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.md,
    paddingVertical: Espaco.sm,
  },
  euConf: { color: Honra.verde, fontSize: 12, fontWeight: '700', marginTop: 2 },
  // Para quem vai: nomes e caras, um por linha. Nunca só um número — quem
  // recebe um pedido é uma pessoa, e vê-se a lista antes de a coisa sair.
  paraLinha: { flexDirection: 'row', alignItems: 'center', gap: Espaco.sm, paddingVertical: 5 },
  paraNome: { fontSize: 13.5, fontWeight: '700', color: Honra.tinta, flexShrink: 1 },
  paraPapel: { flex: 1, minWidth: 0, fontSize: 12, color: Honra.tintaSuave },
  centroErro: { padding: Espaco.xl, alignItems: 'center' },
  // Mural de trabalhos
  muralFlex: { flex: 1 },
  excerto: { fontSize: 13, color: Honra.tinta, marginTop: 4, lineHeight: 18 },
  publicar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Espaco.sm,
    marginHorizontal: Espaco.md,
    marginTop: Espaco.md,
    paddingHorizontal: Espaco.md,
    paddingVertical: Espaco.sm,
    borderRadius: Raio.pill,
    backgroundColor: Honra.verde,
  },
  publicarMais: { color: Honra.brancoCreme, fontSize: 18, fontWeight: '800', marginTop: -1 },
  publicarTxt: { color: Honra.brancoCreme, fontSize: 14, fontWeight: '700' },
});
