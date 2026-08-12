import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type DimensionValue,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ABAS_SELO,
  Avatar,
  Calendario,
  Carregar,
  Cartao,
  confiancaPct,
  Erro,
  MIN_APERTOS_RACIO,
} from '@/components/ui';
import { AvisoSuspenso } from '@/components/AvisoSuspenso';
import { CerimoniaRank } from '@/components/CerimoniaRank';
import { FasesNegocio, faseDe, TOTAL_FASES } from '@/components/FasesNegocio';
import { PilhaAvatares } from '@/components/PilhaAvatares';
import { nomeEscalao, useT, type ChaveI18n, type Idioma, type TFn } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useSuspensao } from '@/lib/suspensao';
import { useAvisos, type Aviso } from '@/lib/avisos';
import { usePedidosPendentes } from '@/lib/pedidos';
import { umaPastaPorPar } from '@/lib/projeto';
import { ESTADOS_HONRADOS, statsContratante } from '@/lib/contratante';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, LARGURA_SECRETARIA, Raio } from '@/theme/honra';
import {
  escalaoDeCredencial,
  estiloPrestigio,
  nivelDeCredencial,
  proximoEscalao as proximoEscalaoDe,
  requisitosProximo,
  type NivelPrestigio,
} from '@/theme/prestigio';

/**
 * INÍCIO — o hub de trabalho, no desenho "2a — Sóbrio" (handoff 26/07,
 * adaptado à linha do produto): o PERCURSO é a âncora do cabeçalho (cartão
 * clicável com barra de progresso em honras), o corpo é ação em linhas
 * limpas, e o estado (Confiança / rede / avisos) fecha num só bloco de filas.
 *
 * Regras de fusão com o coração do produto (o mock não manda nelas):
 *   → A TUA VEZ fica no topo do corpo — o Honra é anti-feed, liga pessoas
 *     com AÇÃO; a fila é a alma do ecrã. Reestilizada: uma fila única de
 *     linhas, sem cartão-herói (a urgência lê-se na ordem, não no volume).
 *   → A DECORRER mantém-se (gente primeiro); vazio = a secção não aparece.
 *   → Estados vazios NUNCA são cartões simpáticos — a secção some (regra do
 *     próprio handoff; a serenidade não precisa de placeholder).
 *   → O Sino dá lugar ao ponto dourado do mock: adormecido sem avisos, a
 *     pulsar quando há por ler; a CONTAGEM vive na fila "A TUA VEZ". A porta
 *     dos avisos é UMA (o ponto) — a fila do bloco de estado saiu (26/07).
 *
 * SECRETÁRIA (>= 1024px): a mesma história em grelha — coluna principal
 * (a vez + a decorrer + trabalhos) e lateral (credencial por completar +
 * bloco de estado), com o pulso do dia e o publicar no cabeçalho.
 *
 * MODO EMPRESA: o Início vira o PAINEL DO CONTRATANTE — métricas reais,
 * publicar em destaque e a rede de confiança. O percurso de escalões é
 * história de prestador: a empresa mostra o rácio de contratante no lugar.
 */
type Perfil = {
  nome: string | null;
  papel: string | null;
  cidade: string | null;
  avatar: string | null;
  indice_confianca: number | null;
  negocios_honrados: number | null;
  negocios_falhados: number | null;
  tipo: string | null;
};
type Verif = { aba: string; estado: string };

// Só os estados que estão VIVOS (o negócio anda). Dos dois lados do orçamento.
//
// `honrado` SAIU daqui a 01/08, por decisão do Vítor: um negócio honrado está
// FECHADO COM PENDÊNCIA, não a decorrer. As duas pessoas cumpriram o que lhes
// competia — "só falta o Honra fazer o seu papel" (libertar o dinheiro), e
// isso é trabalho da casa, não da fila de ninguém. Deixá-lo em "A decorrer"
// pedia às pessoas um gesto que já não é delas.
const ATIVOS = ['aceite', 'selado'];

// Estado legível (subconjunto vivo do ESTADO_TXT do separador Orçamentos).
const ESTADO_TXT: Record<string, ChaveI18n> = {
  aceite: 'estado.aceite',
  selado: 'estado.selado',
};

// ===== VOZ DO TEMPO E DO DIA (handoff "Dashboard 3a") =====
// Tudo aqui sai do RELÓGIO e do LOCALE — dados tão reais como uma linha da BD.
// Nenhuma destas funções inventa: sem data, devolvem vazio e o bloco cala-se.

/** "há 2 dias" — o mesmo carimbo humano da LinhaTempo, sem chaves novas. */
function quando(iso: string | null | undefined, t: TFn): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const min = Math.round(ms / 60000);
  if (min < 1) return t('tempo.agora');
  if (min < 60) return t('tempo.ha_min', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('tempo.ha_h', { n: h });
  const d = Math.round(h / 24);
  return d === 1 ? t('tempo.ha_dia', { n: d }) : t('tempo.ha_dias', { n: d });
}

/** A saudação segue as HORAS — não é simpatia decorativa, é a hora do dia. */
function chaveSaudacao(agora: Date): ChaveI18n {
  const h = agora.getHours();
  if (h < 13) return 'inicio.bom_dia';
  if (h < 20) return 'inicio.boa_tarde';
  return 'inicio.boa_noite';
}

/** "Sexta-feira, 31 de julho" — pela língua ativa, com maiúscula de abertura. */
function dataLonga(agora: Date, idioma: Idioma): string {
  try {
    const txt = new Intl.DateTimeFormat(idioma === 'pt' ? 'pt-PT' : 'en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(agora);
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  } catch {
    return '';
  }
}

/** Iniciais de um nome ("Rute Silva" → "RU"): a cara quando não há foto. */
function iniciaisDe(nome: string | null | undefined): string {
  const limpo = (nome ?? '').trim();
  if (!limpo) return '··';
  const partes = limpo.split(/\s+/);
  return (partes.length === 1 ? limpo.slice(0, 2) : partes[0][0] + partes[1][0]).toUpperCase();
}

// Um dia que aí vem — só de fontes REAIS com data: eventos de contrato-convite
// marcados e tarefas próprias com dia. O "por confirmar" não é um estilo: é o
// contrato que ainda não foi assinado.
type DiaAVir = {
  chave: string;
  iso: string;
  titulo: string;
  sub: string;
  /** Marcado mas ainda por assinar → quadrado tracejado dourado. */
  porConfirmar: boolean;
  rota: string;
};

// Estados do contrato-convite em que o evento JÁ está de pé (data marcada).
const CONVITE_MARCADO = ['aguarda_assinatura', 'assinado', 'caucionado', 'sem_caucao'];

/** "31" + "JUL" para o quadradinho do dia — pela língua ativa. */
function diaEMes(iso: string, idioma: Idioma): { num: string; mes: string } {
  // Parte-se a data à mão de propósito: `new Date('2026-08-04')` é meia-noite
  // UTC e, conforme o fuso, saltava para o dia anterior no quadrado.
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(a || 1970, (m || 1) - 1, d || 1);
  let mes = '';
  try {
    mes = new Intl.DateTimeFormat(idioma === 'pt' ? 'pt-PT' : 'en-GB', { month: 'short' })
      .format(dt)
      .replace('.', '')
      .toUpperCase();
  } catch {
    mes = String(m ?? '');
  }
  return { num: String(d || ''), mes };
}

// Um facto já acontecido, vindo dos avisos — o feed "MOVIMENTOS" só olha para
// trás; o que é para fazer vive na fila "A TUA VEZ" e em lado nenhum mais.
type Movimento = { chave: string; titulo: string; sub: string; rota: string | null };

/** Cada movimento leva ao sítio onde o facto vive (o mesmo mapa do /avisos). */
function rotaDoAviso(a: Aviso): string {
  if (a.tipo.startsWith('convite')) return '/convites';
  if (a.trabalho_id) return `/trabalho/${a.trabalho_id}`;
  if (!a.orcamento_id) return '/avisos';
  return a.tipo === 'mensagem' ? `/conversa/${a.orcamento_id}` : `/projeto/${a.orcamento_id}`;
}

// Os rótulos das 4 abas do selo — as mesmas chaves que o componente Selo usa.
const ROTULO_ABA: Record<(typeof ABAS_SELO)[number], ChaveI18n> = {
  identidade: 'selo.identidade',
  profissao: 'selo.profissao',
  contacto: 'selo.contacto',
  portefolio: 'selo.portefolio',
};

// A sala que acende cada aba. O 'contacto' não está aqui de propósito: o OTP
// ainda não é real (memória 30/07) e um botão que não abre porta nenhuma é
// uma promessa por cumprir à vista de toda a gente.
const ROTA_ABA: Partial<Record<(typeof ABAS_SELO)[number], Href>> = {
  identidade: '/perfil',
  // '/editar-perfil' NÃO verifica nada — é o formulário do nome e da função.
  // Quem tocava em "Verificar" aterrava lá, preenchia, e o selo continuava
  // apagado. A verificação da profissão vive no ecrã próprio, o mesmo que o
  // Perfil já usa.
  profissao: '/verificar-profissao',
  portefolio: '/apresentar-trabalho',
};

// Um projeto a decorrer, já com o lado (souA = sou o cliente/de_perfil) e o
// nome da outra parte resolvidos.
type Projeto = {
  id: string;
  descricao: string | null;
  estado: string;
  valor_taxa: number;
  a_agiu_em: string | null;
  b_agiu_em: string | null;
  trabalho_id: string | null;
  de_perfil: string;
  para_perfil: string;
  criado_em: string;
  souA: boolean;
  outroNome: string | null;
};

// O estado dos checkpoints de um negócio selado (só as contagens que decidem
// a vez): 'entregue' espera o CLIENTE confirmar; 'pendente' espera o PRESTADOR.
type PulsoCp = { total: number; entregues: number; pendentes: number };

/**
 * A dica do próximo passo, na mesma lógica do separador Orçamentos.
 * `minhaVez` = é a minha vez de agir → verde (significado); senão, à espera.
 *
 * SELADO (regra 27/07, Vítor): mal se sela, a bola está com o PROFISSIONAL —
 * sai da alçada do cliente até haver resposta do outro lado. Com checkpoints,
 * a vez lê-se DELES; sem (legado), a ordem é a mesma: B mostra, A confirma.
 */
function proximoPasso(
  p: Projeto,
  t: TFn,
  cps?: PulsoCp,
): { texto: string; minhaVez: boolean; botao?: ChaveI18n } {
  switch (p.estado) {
    case 'aceite':
      return p.souA
        ? { texto: t('passo.sela'), minhaVez: true, botao: 'inicio.btn_selar' }
        : { texto: t('passo.espera_sele'), minhaVez: false };
    case 'selado': {
      if (cps && cps.total > 0) {
        if (p.souA) {
          return cps.entregues > 0
            ? { texto: t('passo.confirma_evolucao'), minhaVez: true, botao: 'inicio.btn_confirmar' }
            : { texto: t('passo.espera_outra'), minhaVez: false };
        }
        return cps.pendentes > 0
          ? { texto: t('passo.mostra_evolucao'), minhaVez: true, botao: 'inicio.btn_mostrar' }
          : { texto: t('passo.espera_outra'), minhaVez: false };
      }
      const euAgi = p.souA ? !!p.a_agiu_em : !!p.b_agiu_em;
      if (euAgi) return { texto: t('passo.espera_outra'), minhaVez: false };
      // O cliente só volta a ter vez com evolução à frente (B agiu primeiro).
      if (p.souA && !p.b_agiu_em) {
        return { texto: t('passo.espera_outra'), minhaVez: false };
      }
      return p.souA
        ? { texto: t('passo.confirma_evolucao'), minhaVez: true, botao: 'inicio.btn_confirmar' }
        : { texto: t('passo.mostra_evolucao'), minhaVez: true, botao: 'inicio.btn_mostrar' };
    }
    // A entrega+pagamento (065) corre entre honrado e concluido — o profissional
    // apresenta a entrega, o cliente confirma/paga. A avaliação é só no fim.
    // 'honrado' e 'entregue' já não chegam aqui: os ATIVOS deixaram de os
    // incluir (fechado com pendência, 01/08). Ficam os ramos por segurança —
    // um negócio fechado NUNCA pede um gesto, e muito menos "apresenta a
    // entrega", que era o que aparecia num negócio já honrado.
    case 'honrado':
    case 'entregue':
      return { texto: t('passo.fechado'), minhaVez: false };
    default:
      return { texto: t('passo.ve_estado'), minhaVez: false };
  }
}

// Uma entrada da fila "A TUA VEZ" — tudo o que espera por mim, num só sítio.
type Acao = {
  chave: string;
  texto: string;
  sub?: string;
  /** Ponto dourado = pressão digna (gente à espera da tua decisão); verde = avança. */
  dourado?: boolean;
  /**
   * Desde quando isto espera por mim (ISO). É o último movimento REAL do
   * negócio/pedido — sem carimbo na base de dados, fica vazio e a pílula de
   * tempo não se desenha. Nunca se estima uma espera.
   */
  desde?: string | null;
  /** Verbo do botão da linha (secretária). Sem verbo próprio, sem botão. */
  botao?: ChaveI18n;
  rota: string;
};

/**
 * Texto com segmentos **fortes** vindos do i18n. O marcador viaja na própria
 * string (a ordem das palavras muda com a língua — partir a frase em chaves
 * separadas quebrava a tradução).
 */
function Negrito({
  texto,
  estilo,
  forte,
}: {
  texto: string;
  estilo?: StyleProp<TextStyle>;
  forte?: StyleProp<TextStyle>;
}) {
  const partes = texto.split('**');
  return (
    <Text style={estilo}>
      {partes.map((p, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={forte}>
            {p}
          </Text>
        ) : (
          p
        )
      )}
    </Text>
  );
}

// A curva das barras e o compasso do ponto — os tempos do handoff.
const CURVA_BARRA = Easing.bezier(0.2, 0.7, 0.2, 1);
const DURACAO_BARRA = 950;
const COMPASSO_PONTO = 2400;

export default function Inicio() {
  const { session } = useAuth();
  const { t, idioma } = useT();
  // Escada de suspensão (048): se a conta estiver suspensa, o Início abre com o
  // ecrã honesto — até quando dura, porquê, e que a porta reabre sozinha.
  const { suspenso: contaSuspensa, suspensoAte, nivel: nivelSuspensao } = useSuspensao();
  const uid = session?.user.id;
  // Avisos + pedidos: alimentam a fila "A TUA VEZ", o ponto do cabeçalho e a
  // linha de avisos do bloco de estado.
  const { avisos, naoLidas, pulsar } = useAvisos();
  const { pendentes } = usePedidosPendentes();
  // SECRETÁRIA: em ecrã largo o mesmo Início abre em grelha de dashboard.
  const { width } = useWindowDimensions();
  const largo = width >= LARGURA_SECRETARIA;
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [verifs, setVerifs] = useState<Verif[]>([]);
  const [numAval, setNumAval] = useState(0);
  const [numAvalRecentes, setNumAvalRecentes] = useState(0);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  // O pulso dos checkpoints por negócio selado — decide a vez na fila.
  const [cpsPulso, setCpsPulso] = useState<Record<string, PulsoCp>>({});
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // LADO CONTRATANTE (derivado, para todos): negócios honrados como cliente e
  // com quantos profissionais distintos — alimenta a Rede de Confiança.
  const [honradosCli, setHonradosCli] = useState(0);
  const [parceiros, setParceiros] = useState(0);
  // Só EMPRESA: apertos dados como cliente (denominador do rácio, RPC 041),
  // os trabalhos publicados e as candidaturas por rever nos abertos.
  const [apertosCli, setApertosCli] = useState<number | null>(null);
  const [meusTrabalhos, setMeusTrabalhos] = useState<
    { id: string; titulo: string; estado: string }[]
  >([]);
  const [candAbertas, setCandAbertas] = useState<Record<string, number>>({});
  // Desde quando a candidatura mais ANTIGA de cada anúncio espera resposta —
  // é essa que dá o carimbo de tempo da linha (a pressão mede-se pela mais
  // velha, não pela última a chegar).
  const [candDesde, setCandDesde] = useState<Record<string, string>>({});
  // PRÓXIMOS DIAS (secretária): só o que tem DATA marcada na base de dados.
  const [diasAVir, setDiasAVir] = useState<DiaAVir[]>([]);
  // As caras da rede — iniciais de quem já honrou comigo como cliente.
  const [redeCaras, setRedeCaras] = useState<string[]>([]);

  const carregar = useCallback(() => {
    if (!uid) return;
    setACarregar(true);
    setErro(null);

    supabase
      .from('perfis')
      .select('nome, papel, cidade, avatar, indice_confianca, negocios_honrados, negocios_falhados, tipo')
      .eq('id', uid)
      .single()
      .then(({ data, error }) => {
        if (error) setErro(t('inicio.erro_carregar'));
        else setPerfil(data);
        // O rácio de apertos (RPC 041) continua a ser leitura de empresa.
        if (data?.tipo === 'empresa') {
          statsContratante(uid).then((s) => setApertosCli(s?.apertos ?? null));
        }
      });

    // Os MEUS trabalhos publicados — para TODOS (uma pessoa também publica;
    // um trabalho no mural nunca pode "perder o rasto" no Início do autor).
    supabase
      .from('trabalhos')
      .select('id, titulo, estado')
      .eq('autor_perfil', uid)
      .order('criado_em', { ascending: false })
      .then(({ data: trabs }) => {
        const lista = (trabs as { id: string; titulo: string; estado: string }[]) ?? [];
        setMeusTrabalhos(lista);
        const abertos = lista.filter((t) => t.estado === 'aberto').map((t) => t.id);
        if (abertos.length === 0) {
          setCandAbertas({});
          setCandDesde({});
          return;
        }
        // Candidaturas aos MEUS trabalhos abertos (a RLS mostra ao autor).
        supabase
          .from('candidaturas')
          .select('trabalho_id, criado_em')
          .in('trabalho_id', abertos)
          .then(({ data: cands }) => {
            const contagem: Record<string, number> = {};
            const desde: Record<string, string> = {};
            for (const c of (cands as { trabalho_id: string; criado_em: string }[]) ?? []) {
              contagem[c.trabalho_id] = (contagem[c.trabalho_id] ?? 0) + 1;
              // Guarda a MAIS ANTIGA — é essa que mede há quanto tempo há
              // gente à espera de uma decisão minha.
              if (!desde[c.trabalho_id] || c.criado_em < desde[c.trabalho_id]) {
                desde[c.trabalho_id] = c.criado_em;
              }
            }
            setCandAbertas(contagem);
            setCandDesde(desde);
          });
      });

    // PRÓXIMOS DIAS — o que tem DIA marcado, de duas fontes reais:
    //   · eventos de contrato-convite já de pé (data_inicio);
    //   · tarefas próprias por fazer com data.
    // Tolerante por fora do Promise.all: se uma tabela ainda não existir neste
    // ambiente, a outra chega na mesma (o padrão de tolerância da casa).
    {
      const hojeMs = new Date(new Date().toDateString()).getTime();
      const limiteMs = hojeMs + 21 * 86400000; // três semanas de horizonte
      const dentro = (iso: string) => {
        const ms = new Date(iso).getTime();
        return !Number.isNaN(ms) && ms >= hojeMs && ms <= limiteMs;
      };
      Promise.all([
        supabase
          .from('contratos_convite')
          .select('id, estado, servico, data_inicio, cliente:clientes_convidados(nome)')
          .eq('profissional_id', uid)
          .in('estado', CONVITE_MARCADO),
        supabase
          .from('tarefas')
          .select('id, titulo, quando, feita')
          .eq('perfil_id', uid)
          .eq('feita', false),
      ]).then(([conv, tar]) => {
        const lista: DiaAVir[] = [];
        for (const c of (conv.data as any[]) ?? []) {
          if (!c.data_inicio || !dentro(c.data_inicio)) continue;
          lista.push({
            chave: `evento-${c.id}`,
            iso: c.data_inicio,
            titulo: c.servico ?? t('agenda.servico_marcado'),
            // Ainda por assinar = o dia existe mas a palavra não está dada.
            sub:
              c.estado === 'aguarda_assinatura'
                ? t('inicio.por_confirmar')
                : t('inicio.com', { nome: c.cliente?.nome ?? t('inicio.alguem') }),
            porConfirmar: c.estado === 'aguarda_assinatura',
            rota: '/convites',
          });
        }
        for (const x of (tar.data as { id: string; titulo: string; quando: string | null }[]) ??
          []) {
          if (!x.quando || !dentro(x.quando)) continue;
          lista.push({
            chave: `tarefa-${x.id}`,
            iso: x.quando,
            titulo: x.titulo,
            sub: t('inicio.agenda'),
            porConfirmar: false,
            rota: '/agenda',
          });
        }
        lista.sort((a, b) => a.iso.localeCompare(b.iso));
        setDiasAVir(lista.slice(0, 4));
      });
    }

    // Honrados como CLIENTE (a rede de confiança nasce daqui). Para todos:
    // uma pessoa que contrate também constrói rede.
    supabase
      .from('orcamentos')
      .select('para_perfil, para:perfis!para_perfil(nome, avatar)')
      .eq('de_perfil', uid)
      .in('estado', [...ESTADOS_HONRADOS])
      .then(({ data }) => {
        // `as any[]` como no resto do ecrã: o cliente tipado devolve a relação
        // encaixada como array e a forma real é a de um objeto.
        const linhas =
          ((data as any[]) ?? []) as {
            para_perfil: string;
            para: { nome: string | null; avatar: string | null } | null;
          }[];
        setHonradosCli(linhas.length);
        // Um parceiro é uma PESSOA, não um negócio: conta-se e mostra-se a
        // cara uma só vez, mesmo que já tenhamos honrado dez vezes juntos.
        const porPessoa = new Map<string, string>();
        for (const l of linhas) {
          if (porPessoa.has(l.para_perfil)) continue;
          porPessoa.set(l.para_perfil, l.para?.avatar?.trim() || iniciaisDe(l.para?.nome));
        }
        setParceiros(porPessoa.size);
        setRedeCaras([...porPessoa.values()]);
      });

    // Selo (para o prestígio e o ✓): tolerante a tabela vazia.
    supabase
      .from('verificacoes')
      .select('aba, estado')
      .eq('perfil_id', uid)
      .then(({ data }) => setVerifs((data as any) ?? []));

    // Avaliações recebidas — total + recentes (6 meses) para o DECAY do escalão.
    supabase
      .from('avaliacoes')
      .select('criado_em')
      .eq('para_perfil', uid)
      .then(({ data }) => {
        const linhas = (data as { criado_em: string }[]) ?? [];
        setNumAval(linhas.length);
        const seisMeses = Date.now() - 182 * 86400000;
        setNumAvalRecentes(linhas.filter((r) => new Date(r.criado_em).getTime() > seisMeses).length);
      });

    // Projetos a decorrer — dos DOIS lados do orçamento.
    const campos =
      'id, descricao, estado, valor_taxa, a_agiu_em, b_agiu_em, trabalho_id, de_perfil, para_perfil, criado_em';
    Promise.all([
      supabase
        .from('orcamentos')
        .select(`${campos}, para:perfis!para_perfil(nome)`)
        .eq('de_perfil', uid)
        .in('estado', ATIVOS)
        .order('criado_em', { ascending: false }),
      supabase
        .from('orcamentos')
        .select(`${campos}, de:perfis!de_perfil(nome)`)
        .eq('para_perfil', uid)
        .in('estado', ATIVOS)
        .order('criado_em', { ascending: false }),
    ]).then(([env, rec]) => {
      const enviados: Projeto[] = ((env.data as any[]) ?? []).map((o) => ({
        ...o,
        souA: true,
        outroNome: o.para?.nome ?? null,
      }));
      const recebidos: Projeto[] = ((rec.data as any[]) ?? []).map((o) => ({
        ...o,
        souA: false,
        outroNome: o.de?.nome ?? null,
      }));
      // PASTA (decisão 26/07): cada projeto é UM cartão — o histórico vive lá
      // dentro. A regra partilhada (lib/projeto) colapsa irmãos legados do
      // mesmo (trabalho, par) até a migração 060 os limpar de vez.
      const pastas = umaPastaPorPar([...enviados, ...recebidos]);
      setProjetos(pastas);
      setACarregar(false);
      // O pulso dos checkpoints dos SELADOS — é dele que se lê a vez (a máquina
      // D não toca em a_agiu_em/b_agiu_em). Tolerante: sem linhas, fila legada.
      const selados = pastas.filter((p) => p.estado === 'selado').map((p) => p.id);
      if (selados.length === 0) {
        setCpsPulso({});
        return;
      }
      supabase
        .from('checkpoints_orcamento')
        .select('orcamento_id, estado')
        .in('orcamento_id', selados)
        .then(({ data: cps }) => {
          const pulso: Record<string, PulsoCp> = {};
          for (const c of (cps as { orcamento_id: string; estado: string }[]) ?? []) {
            const p = (pulso[c.orcamento_id] ??= { total: 0, entregues: 0, pendentes: 0 });
            p.total += 1;
            if (c.estado === 'entregue') p.entregues += 1;
            if (c.estado === 'pendente') p.pendentes += 1;
          }
          setCpsPulso(pulso);
        });
    });
  }, [uid, t]);

  useFocusEffect(carregar);

  // PERCURSO (§3): o escalão derivado dos sinais vivos (o "onde estou").
  const verdes = verifs.filter((v) => v.estado === 'verificado').length;
  const sinais = {
    // O escalão corre a HONRADOS + CONFIANÇA desde 01/08 (as avaliações são
    // opcionais e dependem de terceiros — não podem trancar o percurso).
    // `avaliacoesRecentes` fica de FORA de propósito: ainda não existe o sinal
    // de "honrados nos últimos 6 meses", e passar avaliações no lugar dele
    // aplicaria um decay falso a quem não o merece.
    indice_confianca: perfil?.indice_confianca,
    verificacoesVerdes: verdes,
    numAvaliacoes: numAval,
    negociosHonrados: perfil?.negocios_honrados ?? 0,
    negociosFalhados: perfil?.negocios_falhados ?? 0,
  };
  const escalao = escalaoDeCredencial(sinais);

  // CERIMÓNIA DE SUBIDA (regra do Vítor, 31/07): a manifestação acontece assim
  // que se sobe, UMA única vez por escalão. Quem perde e reconquista já não a
  // volta a ver — reentrar num lugar onde já se esteve não é estrear-se.
  //
  // Por isso o que se guarda é o TETO já celebrado, não o escalão de agora: a
  // queda não mexe na marca, e o regresso encontra-a no sítio. Sem coluna nova
  // na BD — o rank continua 100% derivado.
  const [cerimonia, setCerimonia] = useState<NivelPrestigio | null>(null);
  const nivelAtual = nivelDeCredencial(sinais);
  useEffect(() => {
    if (aCarregar || !uid || !perfil) return;
    // v2: a chave antiga guardava o escalão de então SEM nunca ter celebrado
    // nada (o bug em cima). Versioná-la é o que devolve a cerimónia a quem já
    // tinha subido antes de isto existir — uma vez, e nunca mais.
    const chave = `honra.escalao.v2.${uid}`;
    AsyncStorage.getItem(chave).then((v) => {
      const primeiraVez = v == null || Number.isNaN(Number(v));
      const celebrado = primeiraVez ? -1 : Number(v);
      // Nunca se desce a marca, e não se repete o que já foi celebrado.
      if (nivelAtual <= celebrado) return;
      // Marca-se JÁ o escalão: a cerimónia é uma só, mesmo que a app feche a
      // meio dela (celebrar duas vezes a mesma subida é indigno).
      AsyncStorage.setItem(chave, String(nivelAtual));
      // Estreia neste aparelho ainda no escalão de entrada: nada a celebrar —
      // 'Verificado' é o ponto de partida, não conquista. Mas quem já ia mais
      // alto quando isto passou a existir MERECE ver a sua: era o caso do
      // Vítor, Reconhecido de longa data, a quem a versão anterior engolia a
      // cerimónia em silêncio na primeira abertura.
      if (primeiraVez && nivelAtual === 0) return;
      setCerimonia(nivelAtual as NivelPrestigio);
    });
  }, [aCarregar, uid, perfil, nivelAtual]);
  const fecharCerimonia = useCallback(() => setCerimonia(null), []);

  // ===== ANIMAÇÕES DE ENTRADA (tempos do handoff) =====
  // As barras (percurso + confiança) crescem da esquerda UMA vez, quando os
  // dados assentam; recargas posteriores mudam sem teatro (anim já em 1).
  const entrada = useRef(new Animated.Value(0)).current;
  const entrou = useRef(false);
  useEffect(() => {
    if (aCarregar || entrou.current) return;
    entrou.current = true;
    Animated.timing(entrada, {
      toValue: 1,
      duration: DURACAO_BARRA,
      easing: CURVA_BARRA,
      useNativeDriver: false, // anima larguras em %
    }).start();
  }, [aCarregar, entrada]);

  // O ponto dourado dos avisos: adormecido quando não há nada por ler; com
  // avisos, um halo a pulsar (a língua do Sino, no compasso de 2,4s do mock).
  // A contagem não precisa de badge — vive na fila e no bloco de estado.
  const pulso = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (naoLidas === 0) {
      pulso.stopAnimation();
      pulso.setValue(0);
      return;
    }
    const laco = Animated.loop(
      Animated.timing(pulso, {
        toValue: 1,
        duration: COMPASSO_PONTO,
        easing: Easing.inOut(Easing.ease),
        // Condutor JS de propósito: na web, loop + driver nativo corre UMA
        // volta e congela no fim (o halo ficava invisível com avisos por ler).
        useNativeDriver: false,
      })
    );
    laco.start();
    return () => laco.stop();
  }, [naoLidas, pulso]);
  const haloEscala = pulso.interpolate({ inputRange: [0, 1], outputRange: [0.8, 2] });
  const haloOpacidade = pulso.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  // O Início muda de pele com o tipo de conta: empresa = painel de contratante.
  const ehEmpresa = perfil?.tipo === 'empresa';

  // PRIMEIROS PASSOS — completar a credencial. Só ações REAIS que existem hoje
  // (identidade via Stripe, função, portefólio). O Contacto/OTP entra quando for
  // real. Deriva do que já temos; some quando estiver tudo feito.
  // Para a EMPRESA os passos falam a quem contrata: identidade, apresentação
  // e o primeiro trabalho no mural (profissão não se pede a uma empresa).
  const identidadeVerde = verifs.some((v) => v.aba === 'identidade' && v.estado === 'verificado');
  const portefolioAceso = verifs.some((v) => v.aba === 'portefolio' && v.estado === 'verificado');
  const profissaoFeita = !!perfil?.papel?.trim();
  type Passo = {
    chave: string;
    feito: boolean;
    titulo: string;
    sub: string;
    rota: '/perfil' | '/editar-perfil' | '/publicar-trabalho' | '/apresentar-trabalho';
  };
  const passos: Passo[] = ehEmpresa
    ? [
        { chave: 'id', feito: identidadeVerde, titulo: t('inicio.passo.identidade'), sub: t('inicio.passo.identidade_sub'), rota: '/perfil' },
        { chave: 'emp', feito: profissaoFeita, titulo: t('inicio.passo.empresa'), sub: t('inicio.passo.empresa_sub'), rota: '/editar-perfil' },
        { chave: 'trab', feito: meusTrabalhos.length > 0, titulo: t('inicio.passo.trabalho'), sub: t('inicio.passo.trabalho_sub'), rota: '/publicar-trabalho' },
      ]
    : [
        { chave: 'id', feito: identidadeVerde, titulo: t('inicio.passo.identidade'), sub: t('inicio.passo.identidade_sub'), rota: '/perfil' },
        { chave: 'prof', feito: profissaoFeita, titulo: t('inicio.passo.profissao'), sub: t('inicio.passo.profissao_sub'), rota: '/editar-perfil' },
        // Aponta ao ecrã dos comprovados (não ao Editar perfil): desde a 057 o
        // selo não se ganha a carregar fotos — ganha-se a concluir trabalhos.
        { chave: 'port', feito: portefolioAceso, titulo: t('inicio.passo.portefolio'), sub: t('inicio.passo.portefolio_sub'), rota: '/apresentar-trabalho' },
      ];
  const feitos = passos.filter((p) => p.feito).length;
  const credencialCompleta = feitos === passos.length;

  // MÉTRICAS DO CONTRATANTE — todas derivadas de linhas reais da BD.
  const trabalhosAbertos = meusTrabalhos.filter((t) => t.estado === 'aberto');
  const totalCandidaturas = Object.values(candAbertas).reduce((soma, n) => soma + n, 0);
  const aDecorrerCliente = projetos.filter((p) => p.souA).length;
  // O rácio do contratante só fala com prova suficiente (regra do OnHonra).
  const racioCli =
    apertosCli != null && apertosCli >= MIN_APERTOS_RACIO
      ? Math.round((honradosCli / apertosCli) * 100)
      : null;

  // Objetivo: o próximo escalão a conquistar (o "para onde vou") — a sequência
  // REAL dos 5 (Verificado → Provado → Reconhecido → Referência → Mestre).
  const proximoEscalao = proximoEscalaoDe(sinais);

  // ===== O CARTÃO DO PERCURSO — números derivados da lei real, nada do mock =====
  // Progresso 0–100 até ao próximo escalão: o requisito MAIS ATRASADO, não a
  // média deles.
  //
  // Era uma média, e a média mentia. Com 5 honras de 25, os selos todos verdes
  // e a Confiança quase no piso, a média dava 78% — a barra dizia "estás quase
  // lá" mesmo por cima da frase "faltam 20 honras". Mas para subir é preciso
  // ter TODOS os requisitos: nenhum outro te faz subir mais cedo, e por isso
  // estás tão perto do escalão quanto o pior deles. A barra passa a medir o
  // gargalo — que é o que a pessoa tem mesmo de resolver.
  const requisitos = requisitosProximo(sinais);
  const progresso = requisitos?.length
    ? Math.round(
        Math.min(...requisitos.map((r) => Math.min(1, r.alvo > 0 ? r.atual / r.alvo : 1))) * 100
      )
    : 100;
  // "Honras" = avaliações recebidas (trabalho honrado E avaliado — a unidade
  // oficial do percurso). Quando as honras já chegam mas falta outro requisito
  // (índice, selo…), a legenda não mente: diz só "a caminho" — o detalhe
  // linha a linha vive no /percurso, que é para onde o cartão leva.
  const reqHonras = requisitos?.find((r) => r.chave === 'honrados');
  const honrasEmFalta = reqHonras && !reqHonras.feito ? reqHonras.alvo - reqHonras.atual : 0;
  const escalaoTxt = nomeEscalao(t, escalao);
  const proximoTxt = nomeEscalao(t, proximoEscalao);
  const legendaPercurso = !proximoEscalao
    ? t('inicio.percurso_topo', { escalao: escalaoTxt })
    : honrasEmFalta === 1
      ? t('inicio.percurso_falta_uma', { proximo: proximoTxt })
      : honrasEmFalta > 1
        ? t('inicio.percurso_falta', { n: honrasEmFalta, proximo: proximoTxt })
        : t('inicio.percurso_caminho', { proximo: proximoTxt });
  const larguraPercurso = entrada.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', `${progresso}%`],
  });

  // CONFIANÇA — o modelo real (base 30, zonas 60/90), a mesma conta de sempre.
  const pctConfianca = confiancaPct(perfil?.negocios_honrados, perfil?.negocios_falhados);
  const larguraConfianca = entrada.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', `${pctConfianca}%`],
  });

  // ===== A TUA VEZ — a fila única do que espera por MIM =====
  // Ordem de urgência: passos de projetos (a palavra dada anda), candidaturas
  // por rever (gente à espera de decisão), pedidos de orçamento, avisos.
  // Sem cartão-herói: a hierarquia é a ORDEM da fila, não o volume do bloco.
  //
  // REGRA (26/07, Vítor): cada negócio aparece UMA vez no Início. Se a vez é
  // minha vive AQUI; se espero pelo outro vive em A DECORRER — nunca nos dois.
  // A mesma frase em duas secções a dar ao mesmo sítio é conflito mental.
  // Os avisos por ler chegam já ordenados do mais recente para o mais antigo
  // (a query do provider ordena por criado_em desc) — o último é o mais velho.
  const avisosPorLer = avisos.filter((a) => !a.lida);

  const passosDeTodos = projetos.map((p) => ({ p, passo: proximoPasso(p, t, cpsPulso[p.id]) }));
  const meusPassos = passosDeTodos.filter((x) => x.passo.minhaVez);
  const passosEspera = passosDeTodos.filter((x) => !x.passo.minhaVez);
  const acoes: Acao[] = [
    ...meusPassos.map((x) => ({
      chave: `passo-${x.p.id}`,
      texto: x.passo.texto,
      // O negócio é anúncio + PESSOA: dois aceites no mesmo anúncio (duas
      // negociações) têm de se distinguir — o nome nunca sai da linha.
      sub: [
        x.p.descricao?.trim(),
        t('inicio.com', { nome: x.p.outroNome ?? t('inicio.alguem') }),
      ]
        .filter(Boolean)
        .join(' · '),
      // O último movimento REAL do negócio (o mais recente dos carimbos que
      // temos em mão) — é desde aí que a bola está deste lado.
      desde: [x.p.a_agiu_em, x.p.b_agiu_em, x.p.criado_em]
        .filter((d): d is string => !!d)
        .sort()
        .pop(),
      botao: x.passo.botao,
      rota: `/projeto/${x.p.id}`,
    })),
    // Candidaturas por rever, trabalho a trabalho (dourado = pressão digna).
    ...trabalhosAbertos
      .filter((tr) => (candAbertas[tr.id] ?? 0) > 0)
      .map((tr) => ({
        chave: `cand-${tr.id}`,
        texto:
          candAbertas[tr.id] === 1
            ? t('inicio.acao_cand_uma')
            : t('inicio.acao_cand', { n: candAbertas[tr.id] }),
        sub: tr.titulo,
        dourado: true,
        desde: candDesde[tr.id] ?? null,
        botao: 'inicio.btn_rever' as ChaveI18n,
        rota: `/trabalho/${tr.id}`,
      })),
    // Pedidos de orçamento dirigidos a mim, por responder (badge dos Orçamentos).
    // Sem carimbo em mão (o contador não traz datas) → linha sem pílula de tempo.
    ...(pendentes > 0
      ? [
          {
            chave: 'pedidos',
            texto:
              pendentes === 1 ? t('inicio.pedido_um') : t('inicio.pedidos_varios', { n: pendentes }),
            botao: 'inicio.btn_responder' as ChaveI18n,
            rota: '/orcamentos',
          },
        ]
      : []),
    // Avisos por ler — na fila quando existem (dourado quando aperta o coração).
    ...(naoLidas > 0
      ? [
          {
            chave: 'avisos',
            texto:
              naoLidas === 1 ? t('inicio.avisos_um') : t('inicio.avisos_varios', { n: naoLidas }),
            dourado: pulsar,
            // O mais ANTIGO por ler — a espera conta-se do primeiro esquecido.
            desde: avisosPorLer.length > 0 ? avisosPorLer[avisosPorLer.length - 1].criado_em : null,
            botao: 'inicio.btn_ler' as ChaveI18n,
            rota: '/avisos',
          },
        ]
      : []),
  ];
  const totalVez = acoes.length;

  const seccaoVez = acoes.length > 0 && (
    <>
      <View style={styles.rotuloLinha}>
        <Text style={styles.rotulo}>{t('inicio.tua_vez')}</Text>
        <Text style={[styles.rotuloConta, styles.rotuloContaDourado]}>{acoes.length}</Text>
      </View>
      {/* A fila — UM cartão, linhas separadas por um fio (não caixas empilhadas). */}
      <Cartao style={styles.fila}>
        {acoes.map((a, i) => (
          <Pressable
            key={a.chave}
            style={[styles.acaoLinha, i > 0 && styles.acaoLinhaSep]}
            onPress={() => router.push(a.rota as Href)}
            accessibilityRole="button"
            accessibilityLabel={a.texto}
          >
            <View style={[styles.acaoDot, a.dourado && styles.acaoDotDourado]} />
            <View style={styles.acaoMeio}>
              <Text style={styles.acaoTxt} numberOfLines={1}>
                {a.texto}
              </Text>
              {a.sub ? (
                <Text style={styles.acaoSub} numberOfLines={1}>
                  {a.sub}
                </Text>
              ) : null}
            </View>
            <Text style={styles.acaoSeta}>›</Text>
          </Pressable>
        ))}
      </Cartao>
    </>
  );

  // TRABALHOS ABERTOS + CONCLUÍDOS — gavetas com nome honesto (decisão 26/07:
  // "Os teus trabalhos" misturava abertos com fechados). Um aberto sem
  // candidaturas é coisa a acontecer: nunca invisível para o autor. Um aberto
  // COM candidaturas está na fila A TUA VEZ ("Rever N") — não se repete. Um
  // anúncio a decorrer já vive na pasta do negócio (058) — também não se
  // repete. Concluídos/fechados ficam em baixo, serenos — o histórico não se
  // apaga. Sem nada, a secção não existe.
  const trabalhosSerenos = trabalhosAbertos.filter((tr) => !(candAbertas[tr.id] ?? 0));
  const trabalhosConcluidos = meusTrabalhos.filter(
    (tr) => tr.estado === 'fechado' || tr.estado === 'concluido'
  );
  const seccaoTrabalhos = (trabalhosSerenos.length > 0 || trabalhosConcluidos.length > 0) && (
    <>
      {trabalhosSerenos.length > 0 && (
        <>
          <View style={styles.rotuloLinha}>
            <Text style={styles.rotulo}>{t('inicio.trabalhos_abertos')}</Text>
            <Text style={styles.rotuloConta}>{trabalhosSerenos.length}</Text>
          </View>
          {trabalhosSerenos.map((trab) => (
            <Cartao
              key={trab.id}
              style={styles.linha}
              onPress={() => router.push(`/trabalho/${trab.id}`)}
            >
              <View style={styles.linhaMeio}>
                <Text style={styles.linhaTitulo} numberOfLines={1}>
                  {trab.titulo}
                </Text>
                <Text style={styles.linhaSub} numberOfLines={1}>
                  {t('inicio.sem_cand')}
                </Text>
              </View>
              <Text style={styles.linhaSeta}>›</Text>
            </Cartao>
          ))}
        </>
      )}
      {trabalhosConcluidos.length > 0 && (
        <>
          <View style={styles.rotuloLinha}>
            <Text style={styles.rotulo}>{t('inicio.concluidos')}</Text>
          </View>
          {trabalhosConcluidos.slice(0, 3).map((trab) => (
            <Pressable
              key={trab.id}
              style={styles.trabalhoFechado}
              onPress={() => router.push(`/trabalho/${trab.id}`)}
            >
              <Text style={styles.trabalhoFechadoTit} numberOfLines={1}>
                {trab.titulo}
              </Text>
              <Text style={styles.trabalhoFechadoTag}>
                {trab.estado === 'concluido'
                  ? t('estado.concluido')
                  : t('inicio.trabalho_fechado')}
              </Text>
            </Pressable>
          ))}
          {trabalhosConcluidos.length > 3 && (
            <Text style={styles.trabalhoFechadoMais}>
              {t('inicio.fechados_mais', { n: trabalhosConcluidos.length - 3 })}
            </Text>
          )}
        </>
      )}
    </>
  );

  // CABEÇALHO — identidade à esquerda (avatar com prestígio + saudação + ✓),
  // Agenda e o ponto de avisos à direita, e o cartão do PERCURSO como âncora.
  // Bloco cheio, sem cantos em baixo (handoff): o Início deixa de imitar a
  // credencial do Perfil — são ecrãs com papéis diferentes.
  // Empresa = o NOME COMPLETO ("Palco & Luz Produções", nunca "Olá, Palco");
  // pessoa = o primeiro nome, como quem cumprimenta.
  const nomeCompleto = (perfil?.nome ?? session?.user.email ?? '').trim();
  const nomeSaudacao =
    (ehEmpresa ? nomeCompleto : nomeCompleto.split(/\s+/)[0]) || t('inicio.bem_vindo');
  // Secretária: "Sexta-feira, 31 de julho" + "Bom dia, Vitor". A hora do dia
  // decide a saudação — é informação, não cortesia decorativa.
  const agoraDia = new Date();
  const dataDeHoje = dataLonga(agoraDia, idioma);
  const saudacaoTxt = t(chaveSaudacao(agoraDia), { nome: nomeSaudacao });
  const prestigio = estiloPrestigio(nivelAtual);
  const iniciais =
    perfil?.avatar?.trim() ||
    nomeCompleto
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

  // O cartão do percurso é história de PRESTADOR; a empresa contratante conta
  // a sua (o rácio) numa linha sóbria sob o nome.
  const linhaEmpresa = ehEmpresa
    ? racioCli != null
      ? t('inicio.empresa_racio', { pct: racioCli })
      : t('inicio.empresa')
    : null;

  const cartaoPercurso = !ehEmpresa && (
    <Pressable
      style={({ pressed }) => [styles.percurso, pressed && styles.percursoPreso]}
      onPress={() => router.push('/percurso' as Href)}
      accessibilityRole="button"
      accessibilityLabel={t('inicio.percurso')}
    >
      <View style={styles.percursoCabeca}>
        <Text style={styles.percursoRotulo}>{t('inicio.percurso')}</Text>
        <View style={styles.percursoEscalao}>
          {/* Ponto dourado = prestígio (a lei §3): assinala o escalão, nada mais. */}
          <View style={styles.percursoPonto} />
          <Text style={styles.percursoEscalaoTxt}>{escalaoTxt}</Text>
        </View>
        <Text style={styles.percursoSeta}>›</Text>
      </View>
      <View style={styles.percursoBarra}>
        <Animated.View style={[styles.percursoFill, { width: larguraPercurso }]} />
      </View>
      <Negrito
        texto={legendaPercurso}
        estilo={styles.percursoLegenda}
        forte={styles.percursoLegendaForte}
      />
    </Pressable>
  );

  const cabecalho = (
    <View style={[styles.cabecalho, largo && styles.cabecalhoLargo]}>
      <View style={[styles.cabecalhoMiolo, largo && styles.cabecalhoMioloLargo]}>
        <View style={styles.identidade}>
          <Avatar iniciais={iniciais} tamanho={34} prestigio={prestigio} />
          <View style={styles.identidadeMeio}>
            {!ehEmpresa && <Text style={styles.ola}>{t('inicio.ola_curto')}</Text>}
            <View style={styles.nomeLinha}>
              <Text style={styles.nome} numberOfLines={1}>
                {nomeSaudacao}
              </Text>
              {/* O ✓ da identidade — a língua da Credencial (dourado no Referência+). */}
              {identidadeVerde && (
                <Text style={[styles.seloNome, prestigio.acentoNome && styles.seloNomeAcento]}>
                  ✓
                </Text>
              )}
            </View>
            {linhaEmpresa ? <Text style={styles.linhaEmpresa}>{linhaEmpresa}</Text> : null}
          </View>
          {/* Secretária: o pulso do dia + publicar, antes dos símbolos. */}
          {largo && (
            <>
              <View style={styles.pulso}>
                <View style={styles.pulsoItem}>
                  <Text style={[styles.pulsoNum, totalVez > 0 && styles.pulsoNumDourado]}>
                    {totalVez}
                  </Text>
                  <Text style={styles.pulsoRotulo}>{t('inicio.pulso_espera')}</Text>
                </View>
                <View style={styles.pulsoSep} />
                <View style={styles.pulsoItem}>
                  {/* O mesmo número da secção A DECORRER — o pulso nunca
                      desmente a fila (regra 26/07). */}
                  <Text style={styles.pulsoNum}>{passosEspera.length}</Text>
                  <Text style={styles.pulsoRotulo}>{t('inicio.pulso_decorrer')}</Text>
                </View>
                <View style={styles.pulsoSep} />
                <View style={styles.pulsoItem}>
                  <Text style={[styles.pulsoNum, pulsar && styles.pulsoNumDourado]}>
                    {naoLidas}
                  </Text>
                  <Text style={styles.pulsoRotulo}>{t('inicio.pulso_avisos')}</Text>
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [styles.publicarPill, pressed && styles.publicarPillPreso]}
                onPress={() => router.push('/publicar-trabalho')}
                accessibilityRole="button"
                accessibilityLabel={t('inicio.publicar_trabalho')}
              >
                <Text style={styles.publicarPillMais}>+</Text>
                <Text style={styles.publicarPillTxt}>{t('inicio.publicar_trabalho')}</Text>
              </Pressable>
            </>
          )}
          <View style={styles.simbolos}>
            <Calendario cor={Honra.creme} />
            {/* O ponto de avisos (substitui o Sino aqui): adormecido a zeros,
                halo a pulsar quando há por ler. A contagem lê-se no corpo. */}
            <Pressable
              onPress={() => router.push('/avisos')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={
                naoLidas > 0 ? t('inicio.avisos_a11y_n', { n: naoLidas }) : t('inicio.avisos_a11y')
              }
              style={styles.pontoToque}
            >
              {naoLidas > 0 && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.pontoHalo,
                    { transform: [{ scale: haloEscala }], opacity: haloOpacidade },
                  ]}
                />
              )}
              <View style={[styles.ponto, naoLidas === 0 && styles.pontoAdormecido]} />
            </Pressable>
          </View>
        </View>
        {cartaoPercurso}
      </View>
    </View>
  );

  // ===== SECRETÁRIA (Shell Desktop 1a) — cabeçalho SOBRE O BEGE (não verde):
  // identidade + pílula de stats em creme + agenda + Publicar anúncio; e o
  // Percurso como FAIXA VERDE separada por baixo. =====
  // A MAIS PERTO (pílula do handoff): de todos os negócios vivos, o que está
  // MAIS ADIANTADO na escada das fases é, por definição, o que está mais perto
  // de virar honra. Não é uma escolha editorial nem um destaque pago — sai da
  // ordem real dos estados. Sem negócios vivos, ou já no topo do percurso, a
  // pílula não existe (nunca se enche o espaço com uma sugestão inventada).
  const maisPerto =
    proximoEscalao && projetos.length > 0
      ? projetos.reduce((m, p) => (faseDe(p.estado) > faseDe(m.estado) ? p : m))
      : null;
  const maisPertoTxt = maisPerto
    ? maisPerto.descricao?.trim() || maisPerto.outroNome?.trim() || ''
    : '';

  const percursoDesktop = !ehEmpresa && (
    <Pressable
      style={styles.pcD}
      onPress={() => router.push('/percurso' as Href)}
      accessibilityRole="button"
      accessibilityLabel={t('inicio.percurso')}
    >
      <View style={styles.pcDEsq}>
        <Text style={styles.pcDRotulo}>{t('inicio.percurso')}</Text>
        <Text style={styles.pcDEscalao}>{escalaoTxt}</Text>
      </View>
      <View style={styles.pcDMeio}>
        <View style={styles.pcDBarra}>
          <Animated.View style={[styles.pcDFill, { width: larguraPercurso }]} />
        </View>
        <Negrito
          texto={legendaPercurso}
          estilo={styles.pcDLegenda}
          forte={styles.pcDLegendaForte}
        />
      </View>
      {maisPertoTxt ? (
        <View style={styles.pcDPilula}>
          <Text style={styles.pcDPilulaTxt} numberOfLines={1}>
            {t('inicio.mais_perto', { nome: maisPertoTxt })}
          </Text>
        </View>
      ) : null}
      <View style={styles.pcDVer}>
        <Text style={styles.pcDVerTxt}>{t('inicio.percurso_ver')}</Text>
        <Text style={styles.pcDVerSeta}>›</Text>
      </View>
    </Pressable>
  );

  const cabecalhoDesktop = (
    <View style={styles.hdrD}>
      <View style={styles.hdrDTopo}>
        <View style={styles.hdrDIdent}>
          <View style={styles.hdrDAvatar}>
            <Text style={styles.hdrDAvatarTxt}>{iniciais}</Text>
          </View>
          <View>
            {/* O dia de hoje, por extenso: a secretária abre com a data como
                quem se senta e olha para a agenda. Vem do relógio e do locale
                — nada aqui é escrito à mão. */}
            {!!dataDeHoje && <Text style={styles.hdrDOla}>{dataDeHoje}</Text>}
            <View style={styles.hdrDNomeLinha}>
              <Text style={styles.hdrDNome} numberOfLines={1}>
                {saudacaoTxt}
              </Text>
              {identidadeVerde && (
                <View style={styles.hdrDCheck}>
                  <Text style={styles.hdrDCheckTxt}>✓</Text>
                </View>
              )}
            </View>
            {linhaEmpresa ? <Text style={styles.hdrDEmpresa}>{linhaEmpresa}</Text> : null}
          </View>
        </View>
        <View style={styles.hdrDDir}>
          <View style={styles.statsPill}>
            <View style={styles.statItem}>
              <View style={styles.statNumLinha}>
                <View style={styles.statDot} />
                <Text style={styles.statNum}>{totalVez}</Text>
              </View>
              <Text style={styles.statLbl}>{t('inicio.pulso_espera')}</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.statItem}>
              <Text style={styles.statNumMuted}>{passosEspera.length}</Text>
              <Text style={styles.statLblMuted}>{t('inicio.pulso_decorrer')}</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.statItem}>
              <Text style={[styles.statNumMuted, pulsar && styles.statNumDourado]}>{naoLidas}</Text>
              <Text style={styles.statLblMuted}>{t('inicio.pulso_avisos')}</Text>
            </View>
          </View>
          {/* O Calendário já navega para a agenda — só a moldura creme à volta. */}
          <View style={styles.hdrDCal}>
            <Calendario cor="#3B4A40" />
          </View>
          <Pressable
            style={({ pressed }) => [styles.publicarD, pressed && styles.publicarDPreso]}
            onPress={() => router.push('/publicar-trabalho')}
            accessibilityRole="button"
            accessibilityLabel={t('inicio.publicar_trabalho')}
          >
            <Text style={styles.publicarDMais}>+</Text>
            <Text style={styles.publicarDTxt}>{t('inicio.publicar_trabalho')}</Text>
          </Pressable>
        </View>
      </View>
      {percursoDesktop}
    </View>
  );

  if (aCarregar && !perfil) {
    return (
      <SafeAreaView style={[styles.fundo, largo && styles.fundoLargo]} edges={['top']}>
        {largo ? cabecalhoDesktop : cabecalho}
        <Carregar />
      </SafeAreaView>
    );
  }

  // ===== PRIMEIROS PASSOS — completar a credencial (só p/ quem falta) =====
  const cartaoPassos = !credencialCompleta && (
    <View style={styles.passos}>
      <View style={styles.passosCabeca}>
        <Text style={styles.rotulo}>{t('inicio.completa_credencial')}</Text>
        <Text style={styles.passosContagem}>
          {t('inicio.passos_contagem', { feitos, total: passos.length })}
        </Text>
      </View>
      {/* Barra fina — o caminho da credencial a encher-se de verde (significado). */}
      <View style={styles.passosBarra}>
        <View
          style={[
            styles.passosBarraFill,
            { width: `${(feitos / passos.length) * 100}%` as DimensionValue },
          ]}
        />
      </View>
      {passos.map((p) => (
        <Pressable
          key={p.chave}
          style={styles.passoLinha}
          onPress={() => router.push(p.rota)}
          disabled={p.feito}
        >
          <View style={[styles.passoCheck, p.feito && styles.passoCheckFeito]}>
            {p.feito ? <Text style={styles.passoCheckTxt}>✓</Text> : null}
          </View>
          <View style={styles.passoTextos}>
            <Text style={[styles.passoTitulo, p.feito && styles.passoTituloFeito]}>
              {p.titulo}
            </Text>
            {!p.feito ? <Text style={styles.passoSub}>{p.sub}</Text> : null}
          </View>
          {!p.feito ? <Text style={styles.passoSeta}>›</Text> : null}
        </Pressable>
      ))}
    </View>
  );

  // ===== PAINEL DO CONTRATANTE (só empresa) — métricas reais =====
  // O CTA de publicar (o do handoff: verde-escuro, "+" dourado, sem subtítulo
  // nem promessas) serve os dois modos; na secretária vive como pill no
  // cabeçalho — não se repete.
  const ctaPublicar = !largo && (
    <Pressable
      style={({ pressed }) => [styles.cta, pressed && styles.ctaPreso]}
      onPress={() => router.push('/publicar-trabalho')}
      accessibilityRole="button"
      accessibilityLabel={t('inicio.publicar_trabalho')}
    >
      <Text style={styles.ctaMais}>+</Text>
      <Text style={styles.ctaTxt}>{t('inicio.publicar_trabalho')}</Text>
    </Pressable>
  );

  const painelEmpresa = ehEmpresa && (
    <>
      <Text style={styles.rotulo}>{t('inicio.painel')}</Text>
      <View style={styles.metricas}>
        <View style={[styles.metrica, largo && styles.metricaLarga]}>
          <Text style={styles.metricaNum}>{trabalhosAbertos.length}</Text>
          <Text style={styles.metricaRotulo}>
            {trabalhosAbertos.length === 1
              ? t('inicio.metrica.trabalho_aberto')
              : t('inicio.metrica.trabalhos_abertos')}
          </Text>
        </View>
        <View style={[styles.metrica, largo && styles.metricaLarga]}>
          {/* Dourado = pressão digna: há candidaturas à tua espera. */}
          <Text style={[styles.metricaNum, totalCandidaturas > 0 && styles.metricaNumDourado]}>
            {totalCandidaturas}
          </Text>
          <Text style={styles.metricaRotulo}>
            {totalCandidaturas === 1 ? t('inicio.metrica.cand') : t('inicio.metrica.cands')}
          </Text>
        </View>
        <View style={[styles.metrica, largo && styles.metricaLarga]}>
          <Text style={styles.metricaNum}>{aDecorrerCliente}</Text>
          <Text style={styles.metricaRotulo}>{t('inicio.metrica.a_decorrer')}</Text>
        </View>
        <View style={[styles.metrica, largo && styles.metricaLarga]}>
          {/* Verde = significado: negócios honrados, a prova da casa. */}
          <Text style={[styles.metricaNum, honradosCli > 0 && styles.metricaNumVerde]}>
            {honradosCli}
          </Text>
          <Text style={styles.metricaRotulo}>
            {honradosCli === 1
              ? t('inicio.metrica.honrado')
              : t('inicio.metrica.honrados')}
          </Text>
        </View>
      </View>
      {ctaPublicar}
    </>
  );

  // (Sem botão "Apresentar trabalho" aqui: o Início liga pessoas com AÇÃO,
  // não é feed de montra. O trabalho honrado entra no PORTEFÓLIO do perfil —
  // referência para o próximo cliente — e gere-se no Editar perfil. 25/07.)

  // ===== A DECORRER — o que anda SEM mim (a bola está com o outro) =====
  // Vazio = não aparece (regra do handoff: sem placeholders).
  // Os negócios em que a vez é MINHA vivem na fila A TUA VEZ — cada negócio
  // aparece uma vez, e muda de secção quando o estado muda (regra 26/07).
  const seccaoDecorrer = passosEspera.length > 0 && (
    <>
      <View style={styles.rotuloLinha}>
        <Text style={styles.rotulo}>{t('inicio.a_decorrer')}</Text>
        <Text style={styles.rotuloConta}>{passosEspera.length}</Text>
      </View>
      {passosEspera.map(({ p, passo }) => {
        return (
          <Cartao key={p.id} style={styles.linha} onPress={() => router.push(`/projeto/${p.id}`)}>
            <View style={styles.linhaMeio}>
              {/* O projeto primeiro (decisão 26/07) — o negócio identifica-se
                  pelo que se combinou; a pessoa vive no interior do projeto.
                  Sem título (rows legadas), vale o nome da outra parte. */}
              <Text style={styles.linhaTitulo} numberOfLines={1}>
                {p.descricao?.trim() ? (
                  p.descricao.trim()
                ) : (
                  <>
                    <Text style={styles.linhaPrefixo}>
                      {p.souA ? t('inicio.para') : t('inicio.de')}
                    </Text>
                    {p.outroNome ?? t('inicio.alguem')}
                  </>
                )}
              </Text>
              {/* O compasso de espera — aqui a bola está sempre com o outro. */}
              <Text style={styles.linhaSub} numberOfLines={1}>
                {passo.texto}
              </Text>
            </View>
            <View style={styles.estadoChip}>
              <Text style={styles.estadoChipTxt}>
                {ESTADO_TXT[p.estado] ? t(ESTADO_TXT[p.estado]) : p.estado}
              </Text>
            </View>
          </Cartao>
        );
      })}
    </>
  );

  // ===== BLOCO DE ESTADO — Confiança / rede num só cartão =====
  // Filas divididas por um fio (handoff): o estado fala baixo e num sítio só.
  const blocoEstado = (
    <Cartao style={styles.blocoEstado}>
      {/* Confiança — o modelo real (base 30 · zonas 60/90); o toque leva ao
          Percurso, onde vive a história completa. */}
      <Pressable
        style={styles.estadoFila}
        onPress={() => router.push('/percurso' as Href)}
        accessibilityRole="button"
        accessibilityLabel={t('confianca.rotulo')}
      >
        <View style={styles.confCabeca}>
          <Text style={styles.confRotulo}>{t('inicio.confianca')}</Text>
          <Text style={styles.confPct}>{pctConfianca}%</Text>
        </View>
        <View style={styles.confBarra}>
          <Animated.View style={[styles.confFill, { width: larguraConfianca }]} />
          <View style={[styles.confTick, { left: '60%' as DimensionValue }]} />
          <View style={[styles.confTick, { left: '90%' as DimensionValue }]} />
        </View>
      </Pressable>
      {/* A rede — só quando há prova (pessoa); a empresa vê sempre a sua. */}
      {(ehEmpresa || parceiros > 0) && (
        <Pressable
          style={[styles.estadoFila, styles.estadoFilaSep, styles.estadoFilaLinha]}
          onPress={() => router.push('/rede' as Href)}
          accessibilityRole="button"
          accessibilityLabel={t('inicio.rede_a11y')}
        >
          <Text style={styles.estadoTxt} numberOfLines={1}>
            {parceiros === 1
              ? t('inicio.rede_linha_um')
              : t('inicio.rede_linha', { n: parceiros })}
          </Text>
          <Text style={styles.estadoSeta}>›</Text>
        </Pressable>
      )}
      {/* Avisos saíram daqui (decisão 26/07): a porta é UMA — o ponto dourado
          do cabeçalho (sempre presente) + a entrada na fila quando há por ler.
          Duas filas para o mesmo sítio era ruído. */}
    </Cartao>
  );

  // ===================================================================
  // SECRETÁRIA — handoff "Dashboard 3a": duas colunas (ação | estado).
  // Tudo o que se segue só se desenha em ecrã largo; o telemóvel mantém a
  // coluna única que já tinha (a secretária ACRESCENTA, nunca substitui).
  // ===================================================================

  // A TUA VEZ — a mesma fila de sempre, agora em linhas de secretária: ponto
  // de estado, o que é, com quem, HÁ QUANTO TEMPO espera e o verbo do gesto.
  // O botão não é uma segunda ação: a linha inteira é que leva ao sítio — o
  // botão só dá NOME ao gesto que lá espera (por isso é View, não Pressable).
  const filaVezD = acoes.length > 0 && (
    <View style={styles.blocoD}>
      <View style={styles.rotuloD}>
        <Text style={styles.rotuloDTxt}>{t('inicio.tua_vez')}</Text>
        <View style={styles.contaD}>
          <Text style={styles.contaDTxt}>{acoes.length}</Text>
        </View>
        {/* O porquê de esta secção vir primeiro, dito baixinho. */}
        <Text style={styles.rotuloDNota}>{t('inicio.vez_frase')}</Text>
      </View>
      <View style={styles.cartaoD}>
        {acoes.map((a, i) => {
          const tempo = quando(a.desde, t);
          return (
            <Pressable
              key={a.chave}
              style={[styles.vezLinha, i > 0 && styles.sepD]}
              onPress={() => router.push(a.rota as Href)}
              accessibilityRole="button"
              accessibilityLabel={a.texto}
            >
              <View style={[styles.vezDot, a.dourado && styles.vezDotDourado]} />
              <View style={styles.vezMeio}>
                <Text style={styles.vezTit} numberOfLines={1}>
                  {a.texto}
                </Text>
                {a.sub ? (
                  <Text style={styles.vezSub} numberOfLines={1}>
                    {a.sub}
                  </Text>
                ) : null}
              </View>
              {/* Pílula de tempo só quando há carimbo real na base de dados. */}
              {tempo ? (
                <View style={[styles.tempoPill, a.dourado && styles.tempoPillDourado]}>
                  <Text style={[styles.tempoPillTxt, a.dourado && styles.tempoPillTxtDourado]}>
                    {tempo}
                  </Text>
                </View>
              ) : null}
              {a.botao ? (
                <View style={styles.vezBotao}>
                  <Text style={styles.vezBotaoTxt}>{t(a.botao)}</Text>
                </View>
              ) : (
                <Text style={styles.acaoSeta}>›</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  // A DECORRER — os negócios que andam SEM mim, com a barra das 5 fases reais.
  // NOTA DE FIDELIDADE: a maquete mostrava o mesmo negócio na fila E aqui em
  // baixo (com a mesma ação repetida). A lei da casa (26/07) diz que cada
  // negócio aparece UMA vez no Início: se a vez é minha vive na fila, se
  // espero pelo outro vive aqui. Por isso adotei o DESENHO da linha — fases,
  // cara, próximo passo — mas nunca a repetição.
  const trabalhosD = passosEspera.length > 0 && (
    <View style={styles.blocoD}>
      <View style={styles.rotuloD}>
        <Text style={styles.rotuloDTxt}>{t('inicio.a_decorrer')}</Text>
        <View style={styles.contaDSuave}>
          <Text style={styles.contaDSuaveTxt}>{passosEspera.length}</Text>
        </View>
        <Pressable style={styles.verTodos} onPress={() => router.push('/orcamentos')}>
          <Text style={styles.verTodosTxt}>{t('inicio.ver_todos')}</Text>
          <Text style={styles.verTodosSeta}>›</Text>
        </Pressable>
      </View>
      <View style={styles.cartaoD}>
        {passosEspera.map(({ p, passo }, i) => (
          <Pressable
            key={p.id}
            style={[styles.trabLinha, i > 0 && styles.sepD]}
            onPress={() => router.push(`/projeto/${p.id}`)}
            accessibilityRole="button"
          >
            <View style={styles.trabIdent}>
              <Text style={styles.vezTit} numberOfLines={1}>
                {p.descricao?.trim() || p.outroNome || t('inicio.alguem')}
              </Text>
              {/* Um negócio tem exatamente DUAS partes — a cara é a do outro
                  lado. Não se empilham caras que não existem. */}
              <PilhaAvatares iniciais={[iniciaisDe(p.outroNome)]} tamanho={24} />
            </View>
            <View style={styles.trabFases}>
              <FasesNegocio estado={p.estado} />
              <Text style={styles.trabFaseTxt} numberOfLines={1}>
                <Text style={styles.trabFaseForte}>
                  {ESTADO_TXT[p.estado] ? t(ESTADO_TXT[p.estado]) : p.estado}
                </Text>
                {` · ${t('inicio.fase', { n: faseDe(p.estado), total: TOTAL_FASES })}`}
              </Text>
            </View>
            {/* Aqui a bola está sempre com o outro: é compasso de espera, não
                um gesto meu — daí o texto sóbrio, sem botão. */}
            <Text style={styles.trabPasso} numberOfLines={1}>
              {passo.texto}
            </Text>
            <Text style={styles.acaoSeta}>›</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  // TRABALHOS ABERTOS — anúncios meus ainda sem candidaturas. Não levam barra
  // de fases porque ainda NÃO estão na escada do aperto de mão: desenhar-lhes
  // cinco fases seria dar-lhes um percurso que não começou.
  const abertosD = trabalhosSerenos.length > 0 && (
    <View style={styles.blocoD}>
      <View style={styles.rotuloD}>
        <Text style={styles.rotuloDTxt}>{t('inicio.trabalhos_abertos')}</Text>
        <View style={styles.contaDSuave}>
          <Text style={styles.contaDSuaveTxt}>{trabalhosSerenos.length}</Text>
        </View>
      </View>
      <View style={styles.cartaoD}>
        {trabalhosSerenos.map((tr, i) => (
          <Pressable
            key={tr.id}
            style={[styles.vezLinha, i > 0 && styles.sepD]}
            onPress={() => router.push(`/trabalho/${tr.id}`)}
            accessibilityRole="button"
          >
            <View style={styles.vezMeio}>
              <Text style={styles.vezTit} numberOfLines={1}>
                {tr.titulo}
              </Text>
              <Text style={styles.vezSub} numberOfLines={1}>
                {t('inicio.sem_cand')}
              </Text>
            </View>
            <Text style={styles.acaoSeta}>›</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  // FECHADOS — uma linha discreta, sem cartão: o histórico não se apaga, mas
  // também não disputa atenção com o que ainda está vivo.
  const fechadosD = trabalhosConcluidos.length > 0 && (
    <Pressable
      style={styles.fechadosD}
      onPress={() => router.push(`/trabalho/${trabalhosConcluidos[0].id}`)}
      accessibilityRole="button"
    >
      <Text style={styles.rotuloDTxt}>{t('inicio.concluidos')}</Text>
      <Text style={styles.fechadosTit} numberOfLines={1}>
        {trabalhosConcluidos[0].titulo}
      </Text>
      <Text style={styles.fechadosTag}>
        {trabalhosConcluidos[0].estado === 'concluido'
          ? t('estado.concluido')
          : t('inicio.trabalho_fechado')}
      </Text>
      {trabalhosConcluidos.length > 1 && (
        <Text style={styles.fechadosMais}>
          {t('inicio.fechados_mais', { n: trabalhosConcluidos.length - 1 })}
        </Text>
      )}
    </Pressable>
  );

  // PRÓXIMOS DIAS — quadradinhos de dia. O tracejado dourado NÃO é um estilo
  // à escolha: é o contrato-convite que tem dia marcado mas ainda não foi
  // assinado. Dia com palavra dada = quadrado cheio; dia por confirmar =
  // contorno aberto. Sem nada marcado, o bloco não existe (a serenidade não
  // precisa de placeholder).
  const proximosDiasD = diasAVir.length > 0 && (
    <View style={styles.cartaoD}>
      <View style={styles.cartaoDCabeca}>
        <Text style={styles.rotuloDTxt}>{t('inicio.proximos_dias')}</Text>
        <Pressable onPress={() => router.push('/agenda')} accessibilityRole="button">
          <Text style={styles.linkD}>{t('inicio.agenda')}</Text>
        </Pressable>
      </View>
      {diasAVir.map((d, i) => {
        const { num, mes } = diaEMes(d.iso, idioma);
        return (
          <Pressable
            key={d.chave}
            style={[styles.diaLinha, i > 0 && styles.sepD]}
            onPress={() => router.push(d.rota as Href)}
            accessibilityRole="button"
          >
            <View style={[styles.diaQuad, d.porConfirmar && styles.diaQuadAberto]}>
              <Text style={[styles.diaNum, d.porConfirmar && styles.diaTintaDourada]}>{num}</Text>
              <Text style={[styles.diaMes, d.porConfirmar && styles.diaTintaDourada]}>{mes}</Text>
            </View>
            <View style={styles.vezMeio}>
              <Text style={styles.diaTit} numberOfLines={1}>
                {d.titulo}
              </Text>
              <Text
                style={[styles.vezSub, d.porConfirmar && styles.diaTintaDourada]}
                numberOfLines={1}
              >
                {d.sub}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  // O TEU SELO — as 4 abas REAIS da tabela `verificacoes`. A percentagem é a
  // conta honesta (acesas ÷ 4), nunca um número simpático.
  const abasAcesas = ABAS_SELO.filter((aba) =>
    verifs.some((v) => v.aba === aba && v.estado === 'verificado')
  );
  const pctSelo = Math.round((abasAcesas.length / ABAS_SELO.length) * 100);
  const abaEmFalta = ABAS_SELO.find((aba) => !abasAcesas.includes(aba));
  const rotaDaAba = abaEmFalta ? ROTA_ABA[abaEmFalta] : undefined;
  const seloD = (
    <View style={[styles.cartaoD, styles.cartaoDPad]}>
      <View style={styles.seloCabeca}>
        <Text style={styles.rotuloDTxt}>{t('inicio.selo_rotulo')}</Text>
        <Text style={styles.seloPct}>{pctSelo}%</Text>
      </View>
      {/* Barra VERDE: aqui o que se mede é verificação — significado puro. */}
      <View style={styles.seloBarra}>
        <View style={[styles.seloFill, { width: `${pctSelo}%` as DimensionValue }]} />
      </View>
      <View style={styles.seloPills}>
        {ABAS_SELO.map((aba) => {
          const aceso = abasAcesas.includes(aba);
          return (
            <View key={aba} style={[styles.seloPill, aceso ? styles.seloPillAceso : styles.seloPillApagado]}>
              {aceso && <Text style={styles.seloPillCheck}>✓</Text>}
              <Text style={[styles.seloPillTxt, aceso && styles.seloPillTxtAceso]}>
                {t(ROTULO_ABA[aba])}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={styles.seloFio} />
      <View style={styles.seloRodape}>
        <Text style={styles.seloRodapeTxt}>
          {abaEmFalta
            ? t('inicio.selo_falta', { aba: t(ROTULO_ABA[abaEmFalta]).toLowerCase() })
            : t('inicio.selo_completo')}
        </Text>
        {/* O botão só aparece quando há mesmo uma porta para abrir. O Contacto
            ainda não tem sala (o OTP não está vivo) — e um botão que não leva
            a lado nenhum é pior do que botão nenhum. */}
        {rotaDaAba ? (
          <Pressable
            style={({ pressed }) => [styles.seloBotao, pressed && styles.seloBotaoPreso]}
            onPress={() => router.push(rotaDaAba)}
            accessibilityRole="button"
          >
            <Text style={styles.seloBotaoTxt}>{t('inicio.selo_verificar')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  // CONFIANÇA — não vem da maquete, mas é o coração do modelo (conduta, base
  // 30, zonas 60/90) e já vivia neste ecrã. Tirá-lo para caber num desenho
  // seria regredir; entra na mesma língua de cartão da coluna.
  const confiancaD = (
    <Pressable
      style={[styles.cartaoD, styles.cartaoDPad]}
      onPress={() => router.push('/percurso' as Href)}
      accessibilityRole="button"
      accessibilityLabel={t('confianca.rotulo')}
    >
      <View style={styles.seloCabeca}>
        <Text style={[styles.rotuloDTxt, styles.rotuloDMaiusc]}>{t('inicio.confianca')}</Text>
        <Text style={styles.seloPct}>{pctConfianca}%</Text>
      </View>
      <View style={styles.seloBarra}>
        <Animated.View style={[styles.seloFill, { width: larguraConfianca }]} />
        <View style={[styles.confTickD, { left: '60%' as DimensionValue }]} />
        <View style={[styles.confTickD, { left: '90%' as DimensionValue }]} />
      </View>
    </Pressable>
  );

  // MOVIMENTOS — factos que JÁ aconteceram, tirados dos avisos reais. Olha
  // só para trás: o que é para fazer vive na fila e em lado nenhum mais.
  const movimentos: Movimento[] = avisos.slice(0, 3).map((a) => ({
    chave: a.id,
    titulo: a.titulo,
    sub: [a.corpo?.trim(), quando(a.criado_em, t)].filter(Boolean).join(' · '),
    rota: rotaDoAviso(a),
  }));
  const movimentosD = movimentos.length > 0 && (
    <View style={styles.cartaoD}>
      <Text style={[styles.rotuloDTxt, styles.cartaoDCabecaSo]}>{t('inicio.movimentos')}</Text>
      {avisos.slice(0, 3).map((a, i) => {
        const m = movimentos[i];
        return (
          <Pressable
            key={m.chave}
            style={[styles.movLinha, i > 0 && styles.sepD]}
            onPress={() => m.rota && router.push(m.rota as Href)}
            accessibilityRole="button"
          >
            {/* Por ler = marca viva (verde-escuro + dourado); já lido = calmo.
                É a única diferença — e diz tudo sem uma palavra a mais. */}
            <View style={[styles.movIcone, !a.lida && styles.movIconeNovo]}>
              <Feather
                name="activity"
                size={15}
                color={a.lida ? Honra.tintaSuave : Honra.douradoClaro}
              />
            </View>
            <View style={styles.vezMeio}>
              <Text style={styles.movTit} numberOfLines={1}>
                {m.titulo}
              </Text>
              {m.sub ? (
                <Text style={styles.vezSub} numberOfLines={1}>
                  {m.sub}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  // A TUA REDE — as caras de quem já honrou comigo. Só existe com prova real.
  const redeD = parceiros > 0 && (
    <Pressable
      style={styles.redeD}
      onPress={() => router.push('/rede' as Href)}
      accessibilityRole="button"
      accessibilityLabel={t('inicio.rede_a11y')}
    >
      <PilhaAvatares iniciais={redeCaras} tamanho={28} />
      <Text style={styles.redeDTxt} numberOfLines={1}>
        {parceiros === 1 ? t('inicio.rede_linha_um') : t('inicio.rede_linha', { n: parceiros })}
      </Text>
      <Text style={styles.acaoSeta}>›</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.fundo, largo && styles.fundoLargo]} edges={['top']}>
      {/* A cerimónia de subida — por cima de tudo, uma vez por conquista. */}
      {cerimonia != null && (
        <CerimoniaRank nivel={cerimonia} visivel onFechar={fecharCerimonia} />
      )}
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={aCarregar} onRefresh={carregar} tintColor={Honra.verde} />
        }
      >
        {/* ===== IDENTIDADE + PERCURSO — o "onde estou hoje" ===== */}
        {largo ? cabecalhoDesktop : cabecalho}

        {largo ? (
          /* ===== SECRETÁRIA: grelha — ação à esquerda, estado à direita ===== */
          <View style={styles.grelha}>
            {/* ESQUERDA — a AÇÃO: a vez, o que anda, o que está fechado. */}
            <View style={styles.grelhaPrincipal}>
              {erro && <Erro texto={erro} />}
              {contaSuspensa && <AvisoSuspenso suspensoAte={suspensoAte} nivel={nivelSuspensao} />}
              {filaVezD}
              {painelEmpresa}
              {trabalhosD}
              {abertosD}
              {fechadosD}
            </View>
            {/* DIREITA — o ESTADO: os dias, o selo, a confiança, os factos e
                a rede. Nada aqui pede um gesto urgente; é o pano de fundo. */}
            <View style={styles.grelhaLateral}>
              {proximosDiasD}
              {seloD}
              {confiancaD}
              {movimentosD}
              {redeD}
            </View>
          </View>
        ) : (
          /* ===== TELEMÓVEL: a mesma história, numa só coluna ===== */
          <View style={styles.corpo}>
            {erro && <Erro texto={erro} />}

            {/* ===== SUSPENSÃO — ecrã honesto no topo (escada, 048) ===== */}
            {contaSuspensa && <AvisoSuspenso suspensoAte={suspensoAte} nivel={nivelSuspensao} />}

            {/* A AÇÃO primeiro (anti-feed); a credencial por completar a seguir. */}
            {seccaoVez}
            {cartaoPassos}
            {painelEmpresa}
            {ehEmpresa && seccaoTrabalhos}
            {seccaoDecorrer}
            {!ehEmpresa && seccaoTrabalhos}
            {!ehEmpresa && ctaPublicar}

            {blocoEstado}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  fundoLargo: { backgroundColor: Honra.begeSecretaria },
  scroll: { paddingBottom: Espaco.xxl },

  // ===== SECRETÁRIA — cabeçalho Shell Desktop 1a (sobre o bege) =====
  hdrD: { paddingHorizontal: Espaco.xl, paddingTop: Espaco.xl, gap: Espaco.lg },
  hdrDTopo: { flexDirection: 'row', alignItems: 'center', gap: Espaco.lg },
  hdrDIdent: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  hdrDAvatar: {
    width: 46,
    height: 46,
    borderRadius: Raio.pill,
    backgroundColor: Honra.verde,
    borderWidth: 2,
    borderColor: Honra.dourado,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hdrDAvatarTxt: { color: Honra.douradoClaro, fontSize: 15, fontWeight: '800' },
  hdrDOla: { fontSize: 12.5, color: '#6C7770', fontWeight: '500' },
  hdrDNomeLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hdrDNome: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4, color: '#18241D' },
  hdrDCheck: {
    width: 17,
    height: 17,
    borderRadius: Raio.pill,
    backgroundColor: '#127A4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hdrDCheckTxt: { color: '#fff', fontSize: 9, fontWeight: '900' },
  hdrDEmpresa: { fontSize: 12, color: '#6C7770', marginTop: 1 },
  hdrDDir: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 14 },
  statsPill: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 54,
    paddingHorizontal: 4,
    borderRadius: 16,
    backgroundColor: '#F7F3E9',
    borderWidth: 1,
    borderColor: 'rgba(18,60,43,0.1)',
  },
  statItem: { justifyContent: 'center', paddingHorizontal: 18, gap: 1 },
  statNumLinha: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statDot: { width: 7, height: 7, borderRadius: Raio.pill, backgroundColor: Honra.dourado },
  statNum: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4, color: '#18241D' },
  statLbl: { fontSize: 11.5, fontWeight: '600', color: '#6C7770' },
  statNumMuted: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4, color: '#48544C' },
  statNumDourado: { color: Honra.dourado },
  statLblMuted: { fontSize: 11.5, fontWeight: '600', color: '#8B948C' },
  statSep: { alignSelf: 'center', width: 1, height: 26, backgroundColor: 'rgba(18,60,43,0.12)' },
  hdrDCal: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#F7F3E9',
    borderWidth: 1,
    borderColor: 'rgba(18,60,43,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  publicarD: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 54,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: '#123C2B',
  },
  publicarDPreso: { backgroundColor: Honra.verde },
  publicarDMais: { color: Honra.dourado, fontSize: 20, fontWeight: '800', marginTop: -2 },
  publicarDTxt: { color: '#F7F3E9', fontSize: 15, fontWeight: '700', letterSpacing: -0.1 },

  // Percurso — FAIXA VERDE horizontal sobre o bege (Shell Desktop 1a).
  pcD: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 34,
    paddingVertical: 22,
    paddingHorizontal: 26,
    borderRadius: 20,
    backgroundColor: Honra.verdeEscuro,
    ...Platform.select({
      web: { boxShadow: '0 16px 36px rgba(11,42,30,.22)' } as object,
      default: {
        shadowColor: '#0B2A1E',
        shadowOpacity: 0.22,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 12 },
        elevation: 6,
      },
    }),
  },
  pcDEsq: { gap: 5 },
  pcDRotulo: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: 'rgba(230,210,162,0.75)' },
  pcDEscalao: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3, color: Honra.creme },
  pcDMeio: { flex: 1, minWidth: 0, gap: 9 },
  pcDBarra: {
    height: 4,
    borderRadius: Raio.pill,
    backgroundColor: 'rgba(242,237,226,0.16)',
    overflow: 'hidden',
  },
  pcDFill: { height: '100%', borderRadius: Raio.pill, backgroundColor: Honra.dourado },
  pcDLegenda: { fontSize: 13.5, color: 'rgba(242,237,226,0.72)' },
  pcDLegendaForte: { color: Honra.creme, fontWeight: '700' },
  pcDVer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pcDVerTxt: { fontSize: 13.5, fontWeight: '700', color: Honra.douradoClaro },
  pcDVerSeta: { fontSize: 16, color: Honra.douradoClaro, fontWeight: '700', lineHeight: 17 },

  // CABEÇALHO — bloco verde cheio, SEM cantos em baixo (handoff 2a): o Início
  // deixa de imitar a faixa da credencial do Perfil. Margens 22≈lg do mock.
  cabecalho: {
    backgroundColor: Honra.verdeEscuro,
    paddingHorizontal: Espaco.lg,
    paddingTop: Espaco.sm,
    paddingBottom: Espaco.lg,
  },
  // Secretária: o pano verde vai de lado a lado; o miolo centra-se.
  cabecalhoLargo: { paddingHorizontal: 0, paddingBottom: Espaco.xl },
  cabecalhoMiolo: {},
  cabecalhoMioloLargo: {
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    paddingHorizontal: Espaco.xl,
  },

  // Linha de identidade — avatar com prestígio, saudação, símbolos à direita.
  identidade: { flexDirection: 'row', alignItems: 'center', gap: Espaco.md },
  identidadeMeio: { flex: 1, minWidth: 0, gap: 1 },
  ola: { color: 'rgba(242,237,226,0.65)', fontSize: 12, fontWeight: '600' },
  nomeLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nome: {
    color: Honra.brancoCreme,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  // O ✓ da identidade — a mesma língua da Credencial, em ponto pequeno.
  seloNome: {
    color: Honra.verdeEscuro,
    backgroundColor: Honra.douradoClaro,
    width: 16,
    height: 16,
    borderRadius: Raio.pill,
    textAlign: 'center',
    lineHeight: 16,
    fontSize: 10,
    fontWeight: '900',
    overflow: 'hidden',
  },
  seloNomeAcento: { backgroundColor: Honra.dourado, color: Honra.verdeMaisEscuro },
  linhaEmpresa: { color: Honra.douradoClaro, fontSize: 13, fontWeight: '600' },
  simbolos: { flexDirection: 'row', alignItems: 'center', gap: Espaco.xs },

  // O ponto de avisos — dourado (pressão digna, nunca alarme). Adormecido
  // quando não há nada por ler; halo a pulsar quando há.
  pontoToque: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  ponto: { width: 13, height: 13, borderRadius: Raio.pill, backgroundColor: Honra.dourado },
  pontoAdormecido: { opacity: 0.45 },
  pontoHalo: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderRadius: Raio.pill,
    backgroundColor: Honra.dourado,
  },

  // O cartão do PERCURSO — a âncora do cabeçalho: painel translúcido com fio
  // dourado ténue (alphas derivados dos tokens creme/douradoClaro).
  percurso: {
    marginTop: Espaco.md,
    backgroundColor: 'rgba(251,248,241,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(230,210,162,0.22)',
    borderRadius: Raio.md,
    padding: Espaco.md,
  },
  percursoPreso: { backgroundColor: 'rgba(251,248,241,0.12)' },
  percursoCabeca: { flexDirection: 'row', alignItems: 'center', gap: Espaco.sm },
  percursoRotulo: {
    color: 'rgba(242,237,226,0.6)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  percursoEscalao: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  percursoPonto: {
    width: 7,
    height: 7,
    borderRadius: Raio.pill,
    backgroundColor: Honra.douradoClaro,
  },
  percursoEscalaoTxt: { color: Honra.douradoClaro, fontSize: 15, fontWeight: '700' },
  percursoSeta: { color: Honra.dourado, fontSize: 19, fontWeight: '400', lineHeight: 20 },
  percursoBarra: {
    marginTop: 13,
    marginBottom: 10,
    height: 4,
    borderRadius: Raio.pill,
    backgroundColor: 'rgba(251,248,241,0.18)',
    overflow: 'hidden',
  },
  percursoFill: { height: '100%', borderRadius: Raio.pill, backgroundColor: Honra.dourado },
  percursoLegenda: { color: 'rgba(242,237,226,0.8)', fontSize: 13 },
  percursoLegendaForte: { color: Honra.brancoCreme, fontWeight: '700' },

  // Secretária: o pulso do dia — números reais, sóbrios como um índice de bolsa.
  pulso: { flexDirection: 'row', alignItems: 'center', gap: Espaco.md },
  pulsoItem: { alignItems: 'center', minWidth: 56 },
  pulsoNum: { color: Honra.creme, fontSize: 22, fontWeight: '800', lineHeight: 26 },
  pulsoNumDourado: { color: Honra.douradoClaro },
  pulsoRotulo: { color: Honra.creme, opacity: 0.65, fontSize: 11, fontWeight: '600' },
  pulsoSep: { width: 1, height: 28, backgroundColor: 'rgba(251,248,241,0.25)' },
  publicarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(251,248,241,0.45)',
    borderRadius: Raio.pill,
    paddingHorizontal: Espaco.md,
    paddingVertical: 6,
  },
  publicarPillPreso: { opacity: 0.75 },
  publicarPillMais: { color: Honra.douradoClaro, fontSize: 15, fontWeight: '800', lineHeight: 16 },
  publicarPillTxt: { color: Honra.creme, fontSize: 13, fontWeight: '700' },

  corpo: { padding: Espaco.lg, gap: Espaco.md },
  // Secretária: grelha de duas colunas, leitura máxima 1280 centrada.
  grelha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Espaco.xl,
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    paddingHorizontal: Espaco.xl,
    paddingTop: Espaco.xl,
  },
  grelhaPrincipal: { flex: 1, minWidth: 0, gap: Espaco.lg },
  // 372 é a medida do handoff "Dashboard 3a" — larga o bastante para os
  // quadradinhos de dia e as pílulas do selo respirarem numa só linha.
  grelhaLateral: { width: 372, flexShrink: 0, gap: 14 },

  rotulo: {
    color: Honra.tintaSuave,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: Espaco.xs,
  },
  // Rótulo com contagem — micro-vida: o número mostra, o texto não grita.
  rotuloLinha: { flexDirection: 'row', alignItems: 'baseline', gap: Espaco.sm },
  rotuloConta: { color: Honra.tinta, fontSize: 12, fontWeight: '800' },
  rotuloContaDourado: { color: Honra.dourado },

  // Primeiros passos — cartão de progresso da credencial.
  passos: {
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.md,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    padding: Espaco.md,
    gap: Espaco.sm,
  },
  passosCabeca: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  passosContagem: { color: Honra.dourado, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  // Barra fina — o caminho da credencial a encher-se de verde (significado).
  passosBarra: {
    height: 3,
    borderRadius: Raio.pill,
    backgroundColor: Honra.cremeEscuro,
    overflow: 'hidden',
  },
  passosBarraFill: { height: '100%', borderRadius: Raio.pill, backgroundColor: Honra.verde },
  passoLinha: { flexDirection: 'row', alignItems: 'center', gap: Espaco.md },
  passoCheck: {
    width: 24,
    height: 24,
    borderRadius: Raio.pill,
    borderWidth: 1.5,
    borderColor: Honra.cremeEscuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passoCheckFeito: { backgroundColor: Honra.verde, borderColor: Honra.verde },
  passoCheckTxt: { color: Honra.creme, fontSize: 13, fontWeight: '900' },
  passoTextos: { flex: 1 },
  passoTitulo: { color: Honra.tinta, fontSize: 15, fontWeight: '700' },
  passoTituloFeito: { color: Honra.tintaSuave, textDecorationLine: 'line-through' },
  passoSub: { color: Honra.tintaSuave, fontSize: 12, marginTop: 1 },
  passoSeta: { color: Honra.tintaSuave, fontSize: 20, fontWeight: '700' },

  // ===== PAINEL DO CONTRATANTE (empresa) =====
  // Métricas em grelha 2×2 (4 em linha na secretária) — cartões sóbrios; a cor
  // só entra com significado (verde = honrados; dourado = candidaturas à espera).
  metricas: { flexDirection: 'row', flexWrap: 'wrap', gap: Espaco.sm },
  metrica: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.md,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    padding: Espaco.md,
    gap: 2,
  },
  metricaLarga: { flexBasis: '22%' },
  metricaNum: { color: Honra.tinta, fontSize: 28, fontWeight: '800', lineHeight: 32 },
  metricaNumVerde: { color: Honra.verde },
  metricaNumDourado: { color: Honra.dourado },
  metricaRotulo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '600' },

  // A fila "A TUA VEZ" — linhas dentro de UM cartão, separadas por um fio.
  // Ponto verde = a tua vez de avançar; dourado = gente à espera de decisão.
  fila: { paddingVertical: Espaco.xs, paddingHorizontal: Espaco.xs },
  acaoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.sm + 2,
    paddingVertical: Espaco.sm + 2,
    paddingHorizontal: Espaco.sm,
  },
  acaoLinhaSep: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Honra.cremeEscuro,
  },
  acaoDot: { width: 7, height: 7, borderRadius: Raio.pill, backgroundColor: Honra.verde },
  acaoDotDourado: { backgroundColor: Honra.dourado },
  acaoMeio: { flex: 1, minWidth: 0 },
  acaoTxt: { color: Honra.tinta, fontSize: 14, fontWeight: '700' },
  acaoSub: { color: Honra.tintaSuave, fontSize: 12, marginTop: 1 },
  acaoSeta: { color: Honra.tintaSuave, fontSize: 20, fontWeight: '400' },

  // LINHA de trabalho/projeto (a `.todo` do handoff): título + estado + seta.
  // Uma coisa por linha; a cor só entra com significado.
  linha: { flexDirection: 'row', alignItems: 'center', gap: Espaco.md },
  linhaMeio: { flex: 1, minWidth: 0, gap: 2 },
  linhaTitulo: { fontSize: 14, fontWeight: '700', color: Honra.tinta },
  linhaPrefixo: { fontSize: 13, color: Honra.tintaSuave, fontWeight: '600' },
  linhaSub: { fontSize: 12, color: Honra.tintaSuave, fontWeight: '600' },
  linhaSeta: { color: Honra.tintaSuave, fontSize: 20, fontWeight: '400' },

  // Pill de estado do projeto — discreta (o significado forte está no passo).
  estadoChip: {
    borderRadius: Raio.pill,
    paddingHorizontal: Espaco.md,
    paddingVertical: 3,
    backgroundColor: Honra.creme,
  },
  estadoChipTxt: { fontSize: 12, fontWeight: '700', color: Honra.tintaSuave },

  // Trabalho fechado — linha serena de histórico (não grita, não desaparece).
  trabalhoFechado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.md,
    paddingHorizontal: Espaco.xs,
    paddingVertical: 2,
  },
  trabalhoFechadoTit: { flex: 1, fontSize: 13, color: Honra.tintaSuave, fontWeight: '600' },
  trabalhoFechadoTag: {
    fontSize: 11,
    fontWeight: '700',
    color: Honra.tintaSuave,
    backgroundColor: Honra.cremeEscuro,
    borderRadius: Raio.pill,
    paddingHorizontal: Espaco.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  trabalhoFechadoMais: { fontSize: 12, color: Honra.tintaSuave, paddingHorizontal: Espaco.xs },

  // CTA Publicar trabalho — verde-escuro, "+" dourado (brilho de marca), sem
  // subtítulo: a ação basta-se.
  cta: {
    marginTop: Espaco.xs,
    height: 52,
    borderRadius: Raio.md,
    backgroundColor: Honra.verdeEscuro,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Espaco.sm,
  },
  ctaPreso: { backgroundColor: Honra.verde },
  ctaMais: { color: Honra.dourado, fontSize: 20, fontWeight: '700', lineHeight: 22 },
  ctaTxt: { color: Honra.brancoCreme, fontSize: 15, fontWeight: '600' },

  // BLOCO DE ESTADO — um cartão, filas divididas por um fio (o estado fala
  // baixo e num sítio só: confiança, rede, avisos).
  blocoEstado: { padding: 0, overflow: 'hidden', marginTop: Espaco.sm },
  estadoFila: { padding: Espaco.md },
  estadoFilaSep: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Honra.cremeEscuro,
  },
  estadoFilaLinha: { flexDirection: 'row', alignItems: 'center', gap: Espaco.sm },
  confCabeca: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  confRotulo: { fontSize: 14, fontWeight: '700', color: Honra.tinta },
  confPct: { fontSize: 14, fontWeight: '700', color: Honra.verde },
  confBarra: {
    marginTop: 11,
    height: 4,
    borderRadius: Raio.pill,
    backgroundColor: Honra.cremeEscuro,
    overflow: 'hidden',
  },
  confFill: { height: '100%', borderRadius: Raio.pill, backgroundColor: Honra.verde },
  // Marcas das ZONAS (60 sólida · 90 exemplar) — leitura do modelo real.
  confTick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: Honra.brancoCreme,
  },
  estadoTxt: { flex: 1, fontSize: 14, color: Honra.tinta, fontWeight: '600' },
  estadoTxtSuave: { flex: 1, fontSize: 14, color: Honra.tintaSuave, fontWeight: '600' },
  estadoSeta: { color: Honra.tintaSuave, fontSize: 20, fontWeight: '400' },

  // =================================================================
  // SECRETÁRIA — "Dashboard 3a". A língua desta pele: cartão creme-claro
  // (#FBF8F0) com fio quase invisível, rótulos pequenos e espaçados, e o
  // fio de separação a fazer o trabalho que as caixas empilhadas faziam.
  // =================================================================
  blocoD: { gap: Espaco.sm + 4 },
  cartaoD: {
    borderRadius: 18,
    backgroundColor: Honra.brancoCreme,
    borderWidth: 1,
    borderColor: 'rgba(18,60,43,0.09)',
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 8px 22px rgba(18,60,43,.05)' } as object,
      default: {
        shadowColor: '#123C2B',
        shadowOpacity: 0.05,
        shadowRadius: 11,
        shadowOffset: { width: 0, height: 4 },
      },
    }),
  },
  cartaoDPad: { padding: 18, gap: 12 },
  cartaoDCabeca: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
  },
  cartaoDCabecaSo: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12 },
  sepD: { borderTopWidth: 1, borderTopColor: 'rgba(18,60,43,0.08)' },

  // Rótulo de secção — versalete espaçado, a voz mais baixa do ecrã.
  rotuloD: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  rotuloDTxt: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1.3, color: '#5F6B60' },
  rotuloDMaiusc: { textTransform: 'uppercase' },
  rotuloDNota: { marginLeft: 'auto', fontSize: 12.5, color: '#8B948C' },
  // Contagem da fila: pastilha verde-escura (a vez é ação, e ação é verde).
  contaD: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: Raio.pill,
    backgroundColor: Honra.verdeEscuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contaDTxt: { color: Honra.creme, fontSize: 11.5, fontWeight: '800' },
  // Contagem do que NÃO pede gesto — o mesmo desenho, sem o peso do verde.
  contaDSuave: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: Raio.pill,
    backgroundColor: 'rgba(18,60,43,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contaDSuaveTxt: { color: '#4B5B50', fontSize: 11.5, fontWeight: '800' },
  verTodos: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 },
  verTodosTxt: { fontSize: 12.5, fontWeight: '700', color: '#9A7740' },
  verTodosSeta: { fontSize: 15, fontWeight: '700', color: '#9A7740', lineHeight: 16 },
  linkD: { marginLeft: 'auto', fontSize: 12.5, fontWeight: '700', color: '#9A7740' },

  // Linha da fila "A TUA VEZ".
  vezLinha: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 17, paddingHorizontal: 20 },
  vezDot: { width: 8, height: 8, borderRadius: Raio.pill, backgroundColor: '#127A4A' },
  vezDotDourado: { backgroundColor: Honra.dourado },
  vezMeio: { flex: 1, minWidth: 0, gap: 3 },
  vezTit: { fontSize: 15.5, fontWeight: '700', letterSpacing: -0.2, color: '#18241D' },
  vezSub: { fontSize: 13, color: '#6C7770' },
  // Pílula de tempo: neutra por norma; com moldura dourada quando a espera é
  // de gente à espera de decisão minha (o dourado é pressão digna, não alarme).
  tempoPill: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: Raio.pill,
    justifyContent: 'center',
    backgroundColor: 'rgba(18,60,43,0.07)',
  },
  tempoPillDourado: {
    backgroundColor: 'rgba(197,164,95,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(197,164,95,0.45)',
  },
  tempoPillTxt: { fontSize: 11.5, fontWeight: '700', color: '#4B5B50' },
  tempoPillTxtDourado: { color: '#7A6431' },
  // O botão nomeia o gesto; quem navega é a linha inteira.
  vezBotao: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 13,
    backgroundColor: Honra.verdeEscuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vezBotaoTxt: { color: '#F7F3E9', fontSize: 13.5, fontWeight: '700' },

  // Linha de negócio a decorrer — identidade | fases | compasso de espera.
  trabLinha: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingVertical: 18, paddingHorizontal: 20 },
  trabIdent: { width: 210, flexShrink: 0, gap: 5 },
  trabFases: { flex: 1, minWidth: 0, gap: 7 },
  trabFaseTxt: { fontSize: 12.5, color: '#6C7770' },
  trabFaseForte: { fontWeight: '700', color: '#18241D' },
  trabPasso: { width: 200, flexShrink: 0, fontSize: 13, fontWeight: '700', color: '#3B4A40' },

  // FECHADOS — uma linha, sem cartão: histórico sereno.
  fechadosD: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4, paddingTop: 6 },
  fechadosTit: { flex: 1, minWidth: 0, fontSize: 13.5, color: '#6C7770' },
  fechadosTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F5334',
    backgroundColor: Honra.verdeSuave,
    borderRadius: Raio.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  fechadosMais: { fontSize: 12, color: '#8B948C' },

  // PRÓXIMOS DIAS — o quadradinho do dia.
  diaLinha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 18 },
  diaQuad: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Honra.verdeEscuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Por confirmar = contorno aberto (o dia existe, a palavra ainda não).
  diaQuadAberto: {
    backgroundColor: 'transparent',
    borderWidth: 1.4,
    borderColor: 'rgba(197,164,95,0.6)',
    borderStyle: 'dashed',
  },
  diaNum: { fontSize: 14, fontWeight: '800', lineHeight: 16, color: '#F7F3E9' },
  diaMes: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4, color: 'rgba(230,210,162,0.85)' },
  diaTintaDourada: { color: '#7A6431' },
  diaTit: { fontSize: 13.5, fontWeight: '700', color: '#18241D' },

  // O TEU SELO / CONFIANÇA — cabeça, barra e pílulas.
  seloCabeca: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  seloPct: { marginLeft: 'auto', fontSize: 19, fontWeight: '800', letterSpacing: -0.3, color: Honra.verdeEscuro },
  seloBarra: {
    height: 4,
    borderRadius: Raio.pill,
    backgroundColor: 'rgba(18,60,43,0.1)',
    overflow: 'hidden',
  },
  seloFill: { height: '100%', borderRadius: Raio.pill, backgroundColor: Honra.verde },
  confTickD: { position: 'absolute', top: 0, bottom: 0, width: 1.5, backgroundColor: Honra.brancoCreme },
  seloPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  seloPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: Raio.pill,
  },
  // Acesa = verde (a aba está verificada). Apagada = contorno picotado.
  seloPillAceso: { backgroundColor: Honra.verdeSuave },
  seloPillApagado: {
    borderWidth: 1,
    borderColor: 'rgba(18,60,43,0.28)',
    borderStyle: 'dashed',
  },
  seloPillCheck: { fontSize: 10, fontWeight: '900', color: '#0F5334' },
  seloPillTxt: { fontSize: 11.5, fontWeight: '700', color: '#5F6B60' },
  seloPillTxtAceso: { color: '#0F5334' },
  seloFio: { height: 1, backgroundColor: 'rgba(18,60,43,0.08)' },
  seloRodape: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  seloRodapeTxt: { flex: 1, fontSize: 13, color: '#6C7770', lineHeight: 19 },
  seloBotao: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 13,
    backgroundColor: Honra.verdeEscuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seloBotaoPreso: { backgroundColor: Honra.verde },
  seloBotaoTxt: { color: '#F7F3E9', fontSize: 13, fontWeight: '700' },

  // MOVIMENTOS — factos, em voz de arquivo.
  movLinha: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, paddingHorizontal: 18 },
  movIcone: {
    width: 30,
    height: 30,
    borderRadius: Raio.pill,
    backgroundColor: 'rgba(18,60,43,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  movIconeNovo: { backgroundColor: Honra.verdeEscuro, borderWidth: 1.4, borderColor: Honra.dourado },
  movTit: { fontSize: 13.5, fontWeight: '700', color: '#18241D' },

  // A TUA REDE — cartão de fecho da coluna.
  redeD: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: Honra.brancoCreme,
    borderWidth: 1,
    borderColor: 'rgba(18,60,43,0.09)',
  },
  redeDTxt: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '600', color: '#18241D' },

  // Pílula "A mais perto" na faixa verde do percurso.
  pcDPilula: {
    flexShrink: 1,
    maxWidth: 280,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 13,
    backgroundColor: 'rgba(251,248,241,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(230,210,162,0.28)',
  },
  pcDPilulaTxt: { fontSize: 12.5, fontWeight: '700', color: Honra.douradoClaro },
});
