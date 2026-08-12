import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Botao, Campo, CampoHora, Carregar, Erro, formatarData, hojeISO } from '@/components/ui';
import { useT, type ChaveI18n, type TFn } from '@/i18n';
import { useAuth } from '@/lib/auth';
import {
  agendarAlerta,
  cancelarAlerta,
  DESPERTADOR_VIVO,
  type DesfechoAlerta,
} from '@/lib/despertador';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, LARGURA_SECRETARIA, Raio } from '@/theme/honra';

/**
 * AGENDA — o calendário da casa. DUAS coisas no ecrã, não quatro:
 *
 *   1. O MÊS — a grelha, com marca discreta nos dias que têm alguma coisa.
 *   2. O DIA ABERTO — UMA lista com TUDO o que esse dia tem, e UM campo para
 *      escrever nele. Nada mais.
 *
 * PORQUÊ ASSIM (refeito a 31/07, depois do veredito "muito confuso"):
 * o ecrã tinha quatro secções em fila — NESTE DIA, COMPROMISSOS, AS MINHAS
 * TAREFAS, POR FAZER — quase sempre vazias, cada uma com o seu placeholder a
 * explicar o produto, e DOIS campos de escrita (nota e tarefa) que ninguém
 * conseguia distinguir. Quatro caixas de vazio a dizer o mesmo de maneiras
 * diferentes é ruído, não é agenda. Agora:
 *
 *   · UMA lista por dia. Compromissos, notas e tarefas convivem nela; o que os
 *     distingue é o ADN visual à esquerda (ponto cheio = palavra dada, círculo
 *     por piscar = coisa minha), não um cabeçalho por cada natureza.
 *   · UM campo de escrita. Quem escreve num dia está a apontar NESSE dia — a
 *     distinção nota-vs-tarefa é da base de dados, não do olho de quem usa.
 *   · UMA frase no vazio, sem caixa. Um dia livre tem de parecer calmo, não
 *     avariado.
 *   · A gaveta SEM DIA (as tarefas antigas que nunca tiveram data) só existe
 *     quando tem lá alguma coisa. Secção vazia não se desenha.
 *
 * REGRA DE OURO (trancada pelo dono): os COMPROMISSOS são de LEITURA — sem
 * toque, sem seta. O calendário INFORMA; quem AGE é a fila do Início ("A tua
 * vez"). Por isso a antiga lista de compromissos com setas saiu daqui: era a
 * fila do Início outra vez, a duplicar informação e ação (lei "uma interação
 * por negócio"). O que ficou é a marca no mês + a leitura dentro do dia.
 */

// ---------- COMPROMISSOS (derivados das tabelas reais, read-only) ----------

type Compromisso = {
  chave: string;
  /** Momento (ms) para ordenar — o prazo ou o dia do evento. */
  quandoMs: number;
  /** O que se lê à direita: "até 21/07" ou "16/07 – 18/07". */
  dataTxt: string;
  titulo: string;
  sub: string | null;
  /** Relógio a fechar (<48h) → dourado: pressão digna, não alarme. */
  aperta: boolean;
};

type ConviteRow = {
  id: string;
  estado: string;
  servico: string | null;
  data_inicio: string;
  data_fim: string | null;
  formulario_em: string;
  cliente: { nome: string | null } | null;
};

type OrcRow = {
  id: string;
  descricao: string | null;
  estado: string;
  aceite_em: string | null;
  selado_em: string | null;
  a_agiu_em: string | null;
  b_agiu_em: string | null;
  souA: boolean;
  outroNome: string | null;
};

const DIA_MS = 86_400_000;

/** ms → 'AAAA-MM-DD' local (para o formatarData da casa). */
function isoLocal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

// Estados do contrato-convite em que o evento está de pé (pós-aceite).
const CONVITE_EVENTO = ['aguarda_assinatura', 'assinado', 'caucionado', 'sem_caucao'];
const CONVITE_EVENTO_SUB: Record<string, ChaveI18n> = {
  aguarda_assinatura: 'agenda.evento.aguarda_assinatura',
  assinado: 'agenda.evento.assinado',
  caucionado: 'agenda.evento.caucionado',
  sem_caucao: 'agenda.evento.sem_caucao',
};

/** Convites → compromissos: responder (prazo 7 dias) e eventos marcados.
 *  Recebe o `t` do ecrã (useT) — os textos vivem nos dicionários i18n. */
function compromissosDeConvites(
  linhas: ConviteRow[],
  agora: number,
  hoje: string,
  t: TFn,
): Compromisso[] {
  const lista: Compromisso[] = [];
  for (const c of linhas) {
    const nome = c.cliente?.nome ?? t('agenda.cliente_convidado');
    if (c.estado === 'formulario_recebido') {
      // A janela de 7 dias do formulário (a mesma do aviso da migração 025).
      const prazo = new Date(c.formulario_em).getTime() + 7 * DIA_MS;
      lista.push({
        chave: `convite-${c.id}`,
        quandoMs: prazo,
        dataTxt: t('agenda.ate', { data: formatarData(isoLocal(prazo)) }),
        titulo: t('agenda.responder_convite'),
        sub: t('agenda.de', { nome }) + (c.servico ? ` · ${c.servico}` : ''),
        aperta: prazo - agora < 2 * DIA_MS,
      });
    } else if (CONVITE_EVENTO.includes(c.estado) && (c.data_fim ?? c.data_inicio) >= hoje) {
      // O dia do evento — só enquanto ainda não passou.
      const chaveEstado = CONVITE_EVENTO_SUB[c.estado];
      lista.push({
        chave: `evento-${c.id}`,
        quandoMs: new Date(c.data_inicio).getTime(),
        dataTxt:
          formatarData(c.data_inicio) + (c.data_fim ? ` – ${formatarData(c.data_fim)}` : ''),
        titulo: c.servico ?? t('agenda.servico_marcado'),
        sub: t('agenda.com_estado', { nome, estado: chaveEstado ? t(chaveEstado) : c.estado }),
        aperta: false,
      });
    }
  }
  return lista;
}

/** Orçamentos vivos com relógio real: selar (48h) e checkpoint (6 dias). */
function compromissosDeOrcamentos(linhas: OrcRow[], agora: number, t: TFn): Compromisso[] {
  const lista: Compromisso[] = [];
  for (const o of linhas) {
    const nome = o.outroNome ?? t('agenda.outra_parte');
    if (o.estado === 'aceite' && o.aceite_em) {
      // Janela de 48h para A selar (migração 006: aceite_em + 48 horas).
      const prazo = new Date(o.aceite_em).getTime() + 2 * DIA_MS;
      lista.push({
        chave: `selo-${o.id}`,
        quandoMs: prazo,
        dataTxt: t('agenda.ate', { data: formatarData(isoLocal(prazo)) }),
        titulo: o.souA ? t('agenda.selar') : t('agenda.selo_por_dar'),
        sub: o.souA ? t('agenda.com', { nome }) : t('agenda.espera_selo', { nome }),
        aperta: prazo - agora < DIA_MS,
      });
    } else if (o.estado === 'selado' && o.selado_em) {
      // Checkpoint aos 6 dias do selo (migrações 006/007).
      const prazo = new Date(o.selado_em).getTime() + 6 * DIA_MS;
      const euAgi = o.souA ? !!o.a_agiu_em : !!o.b_agiu_em;
      lista.push({
        chave: `check-${o.id}`,
        quandoMs: prazo,
        dataTxt: t('agenda.ate', { data: formatarData(isoLocal(prazo)) }),
        titulo: euAgi
          ? t('agenda.check_espera')
          : o.souA
            ? t('agenda.check_confirma')
            : t('agenda.check_mostra'),
        sub: t('agenda.com', { nome }),
        aperta: !euAgi && prazo - agora < 2 * DIA_MS,
      });
    }
  }
  return lista;
}

// ---------- AS MINHAS COISAS (tarefas antigas + notas do dia) ----------

type Tarefa = {
  id: string;
  titulo: string;
  nota: string | null;
  quando: string | null; // 'AAAA-MM-DD' | null
  feita: boolean;
  feita_em: string | null;
  criado_em: string;
};

/** Uma nota do dia (migração 069). O alerta é opcional e vive no aparelho. */
type NotaDia = {
  id: string;
  dia: string; // 'AAAA-MM-DD'
  texto: string;
  /** Momento absoluto do despertador (nulo = sem alerta). */
  alerta_em: string | null;
  /** Id da notificação LOCAL — só serve para a poder cancelar. */
  alerta_id: string | null;
  confirmada: boolean;
  confirmada_em: string | null;
  criado_em: string;
};

/**
 * Um item da lista do dia. Três naturezas, UMA lista — quem lê distingue-as
 * pelo ADN da linha (ponto cheio vs. círculo por piscar), não por cabeçalhos.
 * `ordem` é a chave única de ordenação: a palavra dada primeiro, depois o que
 * tem hora marcada (por hora), e por fim o resto pela ordem em que foi escrito.
 */
type ItemDia = { chave: string; ordem: string } & (
  | { tipo: 'compromisso'; comp: Compromisso }
  | { tipo: 'nota'; nota: NotaDia }
  | { tipo: 'tarefa'; tarefa: Tarefa }
);

/** O que o calendário marca num dia — cada marca aponta para algo real. */
type MarcaDia = { comp: boolean; aperta: boolean; meu: boolean };

/** (ano, mês 0-11, dia) → 'AAAA-MM-DD'. */
const isoDe = (ano: number, mes: number, dia: number) =>
  `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

/** 'AAAA-MM-DD' + 'HH:MM' → o momento LOCAL (o despertador é do fuso de quem o põe). */
function momento(dia: string, hora: string): Date {
  const [a, m, d] = dia.split('-').map(Number);
  const [h, min] = hora.split(':').map(Number);
  return new Date(a, m - 1, d, h, min, 0, 0);
}

/** timestamptz → 'HH:MM' local ('' quando não há alerta). */
function horaLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function Agenda() {
  const { session } = useAuth();
  const { t, idioma } = useT();
  const uid = session?.user.id;
  // SECRETÁRIA: o mês à esquerda, o dia aberto à direita (duas colunas).
  // Telemóvel: coluna única, mês → dia → gaveta.
  const { width } = useWindowDimensions();
  const largo = width >= LARGURA_SECRETARIA;

  const [compromissos, setCompromissos] = useState<Compromisso[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // ----- O calendário -----
  const [notas, setNotas] = useState<NotaDia[]>([]);
  // Mês visível na grelha (começa no mês de hoje).
  const [mesVisivel, setMesVisivel] = useState(() => {
    const h = new Date();
    return { ano: h.getFullYear(), mes: h.getMonth() };
  });
  // Dia aberto por baixo da grelha. Começa em HOJE: é o dia que se vem ver.
  const [diaSel, setDiaSel] = useState<string>(hojeISO);
  const [novaNotaDia, setNovaNotaDia] = useState('');
  const [novaHora, setNovaHora] = useState('');
  const [aGuardarNota, setAGuardarNota] = useState(false);
  // O que aconteceu ao despertador — dito em voz baixa, sempre com verdade.
  const [avisoAlerta, setAvisoAlerta] = useState<string | null>(null);
  // O "agora" de referência (para saber que alertas já passaram). Fixa-se na
  // abertura do ecrã em vez de se ler o relógio a cada render — o render é puro
  // e a hora não pode andar a mudar por baixo dos pés da lista.
  const [agoraMs, setAgoraMs] = useState(() => Date.now());

  const carregar = useCallback(() => {
    if (!uid) return;
    setErro(null);
    const agora = Date.now();
    setAgoraMs(agora);
    const hoje = hojeISO();

    const camposOrc = 'id, descricao, estado, aceite_em, selado_em, a_agiu_em, b_agiu_em';
    Promise.all([
      // Convites do profissional (por responder + eventos vivos).
      supabase
        .from('contratos_convite')
        .select(
          'id, estado, servico, data_inicio, data_fim, formulario_em, cliente:clientes_convidados(nome)',
        )
        .eq('profissional_id', uid)
        .in('estado', ['formulario_recebido', ...CONVITE_EVENTO]),
      // Orçamentos com relógio, dos DOIS lados (o padrão do Início).
      supabase
        .from('orcamentos')
        .select(`${camposOrc}, para:perfis!para_perfil(nome)`)
        .eq('de_perfil', uid)
        .in('estado', ['aceite', 'selado']),
      supabase
        .from('orcamentos')
        .select(`${camposOrc}, de:perfis!de_perfil(nome)`)
        .eq('para_perfil', uid)
        .in('estado', ['aceite', 'selado']),
      // As minhas tarefas.
      supabase.from('tarefas').select('*').eq('perfil_id', uid),
    ]).then(([conv, env, rec, tar]) => {
      if (conv.error || env.error || rec.error || tar.error) {
        setErro(t('agenda.erro_carregar'));
        setACarregar(false);
        return;
      }
      const orcs: OrcRow[] = [
        ...((env.data as any[]) ?? []).map((o) => ({ ...o, souA: true, outroNome: o.para?.nome ?? null })),
        ...((rec.data as any[]) ?? []).map((o) => ({ ...o, souA: false, outroNome: o.de?.nome ?? null })),
      ];
      setCompromissos(
        [
          ...compromissosDeConvites(((conv.data as any) ?? []) as ConviteRow[], agora, hoje, t),
          ...compromissosDeOrcamentos(orcs, agora, t),
        ].sort((a, b) => a.quandoMs - b.quandoMs),
      );
      setTarefas((tar.data as Tarefa[]) ?? []);
      setACarregar(false);
    });

    // As notas do dia vêm FORA do Promise.all de propósito: enquanto a migração
    // 069 não estiver aplicada a tabela não existe, e a Agenda tem de abrir na
    // mesma com o que já mostrava (o mesmo padrão de tolerância do 067 no
    // Pesquisar). O erro aqui não é erro do ecrã — é uma camada que ainda não há.
    supabase
      .from('agenda_notas')
      .select('*')
      .eq('perfil_id', uid)
      .then(({ data, error }) => {
        setNotas(error ? [] : ((data as NotaDia[]) ?? []));
      });
  }, [uid, t]);

  useFocusEffect(carregar);

  /** O desfecho do despertador em voz humana (null = correu bem, cala-se). */
  const avisoDoDesfecho = useCallback(
    (desfecho: DesfechoAlerta): string | null => {
      if (desfecho === 'agendado') return null;
      if (desfecho === 'passado') return t('agenda.alerta_passado');
      // Na web nunca se promete o que não toca; no telemóvel, o que falta é
      // quase sempre a autorização.
      if (!DESPERTADOR_VIVO) return t('agenda.alerta_web');
      return t('agenda.alerta_sem_permissao');
    },
    [t],
  );

  /** Apontar no dia aberto, com despertador opcional. É o ÚNICO campo do ecrã. */
  async function criarNota() {
    const texto = novaNotaDia.trim();
    if (!uid || !texto) return;
    setAGuardarNota(true);
    setAvisoAlerta(null);

    // O alerta primeiro: é aqui — e só aqui — que se pede a permissão de
    // notificações, porque é agora que existe motivo para a pedir.
    let alerta_em: string | null = null;
    let alerta_id: string | null = null;
    if (novaHora) {
      const quando = momento(diaSel, novaHora);
      alerta_em = quando.toISOString();
      const alerta = await agendarAlerta({
        titulo: t('agenda.notif_titulo'),
        corpo: texto,
        quando,
      });
      alerta_id = alerta.id;
      setAvisoAlerta(avisoDoDesfecho(alerta.desfecho));
    }

    const { data, error } = await supabase
      .from('agenda_notas')
      .insert({ perfil_id: uid, dia: diaSel, texto, alerta_em, alerta_id })
      .select()
      .single();
    setAGuardarNota(false);
    if (error || !data) {
      // Se a nota não ficou, o alarme não pode sobreviver-lhe: um despertador
      // a tocar por uma nota que não existe é o pior bug possível aqui.
      await cancelarAlerta(alerta_id);
      setErro(t('agenda.erro_nota'));
      return;
    }
    setNotas((ns) => [...ns, data as NotaDia]);
    setNovaNotaDia('');
    setNovaHora('');
  }

  /** Mudar (ou tirar) a hora do alerta de uma nota já apontada. */
  async function mudarAlerta(nota: NotaDia, hora: string) {
    setAvisoAlerta(null);
    // O velho morre SEMPRE primeiro — senão ficavam dois a tocar.
    await cancelarAlerta(nota.alerta_id);

    let alerta_em: string | null = null;
    let alerta_id: string | null = null;
    if (hora) {
      const quando = momento(nota.dia, hora);
      alerta_em = quando.toISOString();
      const alerta = await agendarAlerta({
        titulo: t('agenda.notif_titulo'),
        corpo: nota.texto,
        quando,
      });
      alerta_id = alerta.id;
      setAvisoAlerta(avisoDoDesfecho(alerta.desfecho));
    }
    setNotas((ns) => ns.map((n) => (n.id === nota.id ? { ...n, alerta_em, alerta_id } : n)));
    const { error } = await supabase
      .from('agenda_notas')
      .update({ alerta_em, alerta_id })
      .eq('id', nota.id);
    if (error) {
      setErro(t('agenda.erro_nota'));
      carregar();
    }
  }

  /**
   * Confirmar uma nota. NÃO apaga (apagar é o × , um gesto à parte), mas
   * SILENCIA o despertador: um alarme para coisa já feita é ruído. Repor por
   * confirmar volta a armá-lo, se a hora ainda estiver à frente.
   */
  async function confirmarNota(nota: NotaDia) {
    const confirmada = !nota.confirmada;
    const confirmada_em = confirmada ? new Date().toISOString() : null;
    let alerta_id = nota.alerta_id;
    if (confirmada) {
      await cancelarAlerta(nota.alerta_id);
      alerta_id = null;
    } else if (nota.alerta_em) {
      const alerta = await agendarAlerta({
        titulo: t('agenda.notif_titulo'),
        corpo: nota.texto,
        quando: new Date(nota.alerta_em),
      });
      alerta_id = alerta.id;
    }

    setNotas((ns) =>
      ns.map((n) => (n.id === nota.id ? { ...n, confirmada, confirmada_em, alerta_id } : n)),
    );
    const { error } = await supabase
      .from('agenda_notas')
      .update({ confirmada, confirmada_em, alerta_id })
      .eq('id', nota.id);
    if (error) {
      // Volta atrás com honestidade — nunca fingir que ficou.
      setNotas((ns) => ns.map((n) => (n.id === nota.id ? nota : n)));
      setErro(t('agenda.erro_registar'));
    }
  }

  /** Apagar a nota — e, antes dela, o alerta que lhe pertencia. */
  async function eliminarNota(nota: NotaDia) {
    await cancelarAlerta(nota.alerta_id);
    setNotas((ns) => ns.filter((n) => n.id !== nota.id));
    const { error } = await supabase.from('agenda_notas').delete().eq('id', nota.id);
    if (error) {
      setErro(t('agenda.erro_eliminar'));
      carregar();
    }
  }

  // O pisco — o gesto central. Verde com significado; sem festa.
  async function piscar(tarefa: Tarefa) {
    const feita = !tarefa.feita;
    const feita_em = feita ? new Date().toISOString() : null;
    setTarefas((ts) => ts.map((x) => (x.id === tarefa.id ? { ...x, feita, feita_em } : x)));
    const { error } = await supabase.from('tarefas').update({ feita, feita_em }).eq('id', tarefa.id);
    if (error) {
      // Volta atrás com honestidade — nunca fingir que ficou.
      setTarefas((ts) =>
        ts.map((x) =>
          x.id === tarefa.id ? { ...x, feita: tarefa.feita, feita_em: tarefa.feita_em } : x,
        ),
      );
      setErro(t('agenda.erro_registar'));
    }
  }

  async function eliminar(id: string) {
    setTarefas((ts) => ts.filter((x) => x.id !== id));
    const { error } = await supabase.from('tarefas').delete().eq('id', id);
    if (error) {
      setErro(t('agenda.erro_eliminar'));
      carregar();
    }
  }

  /**
   * Limpar as feitas DA GAVETA — só as que não têm dia. O botão limpa o que
   * está debaixo dele e mais nada: uma tarefa com data pertence ao seu dia e
   * apaga-se lá, com o ×. Um botão que varre coisas que não se veem é uma
   * armadilha.
   */
  async function limparFeitas() {
    if (!uid) return;
    setTarefas((ts) => ts.filter((x) => !(x.feita && !x.quando)));
    const { error } = await supabase
      .from('tarefas')
      .delete()
      .eq('perfil_id', uid)
      .eq('feita', true)
      .is('quando', null);
    if (error) {
      setErro(t('agenda.erro_limpar'));
      carregar();
    }
  }

  const hoje = hojeISO();

  // ----- A LENTE DO CALENDÁRIO -----
  // As marcas nascem das MESMAS listas que o ecrã já mostra: um dia só ganha
  // ponto se tiver algo real por trás (compromisso, nota minha ou tarefa).
  const marcas = useMemo(() => {
    const mapa = new Map<string, MarcaDia>();
    const dia = (chave: string) => {
      let m = mapa.get(chave);
      if (!m) {
        m = { comp: false, aperta: false, meu: false };
        mapa.set(chave, m);
      }
      return m;
    };
    for (const c of compromissos) {
      const m = dia(isoLocal(c.quandoMs));
      m.comp = true;
      if (c.aperta) m.aperta = true;
    }
    for (const n of notas) dia(n.dia).meu = true;
    for (const tarefa of tarefas) if (tarefa.quando) dia(tarefa.quando).meu = true;
    return mapa;
  }, [compromissos, notas, tarefas]);

  /**
   * A LISTA DO DIA — as três naturezas fundidas e ordenadas de uma só vez.
   * A palavra dada abre o dia ('0'); depois o que tem hora marcada, por hora
   * ('1'); por fim o que não tem hora, pela ordem em que foi escrito ('2').
   */
  const itensDoDia = useMemo<ItemDia[]>(() => {
    const itens: ItemDia[] = [
      ...compromissos
        .filter((c) => isoLocal(c.quandoMs) === diaSel)
        .map((comp) => ({
          tipo: 'compromisso' as const,
          chave: `c-${comp.chave}`,
          ordem: `0-${String(comp.quandoMs).padStart(15, '0')}`,
          comp,
        })),
      ...notas
        .filter((n) => n.dia === diaSel)
        .map((nota) => ({
          tipo: 'nota' as const,
          chave: `n-${nota.id}`,
          ordem: nota.alerta_em ? `1-${nota.alerta_em}` : `2-${nota.criado_em}`,
          nota,
        })),
      ...tarefas
        .filter((tarefa) => tarefa.quando === diaSel)
        .map((tarefa) => ({
          tipo: 'tarefa' as const,
          chave: `t-${tarefa.id}`,
          ordem: `2-${tarefa.criado_em}`,
          tarefa,
        })),
    ];
    return itens.sort((a, b) => (a.ordem < b.ordem ? -1 : a.ordem > b.ordem ? 1 : 0));
  }, [compromissos, notas, tarefas, diaSel]);

  // A GAVETA — as tarefas antigas que nunca tiveram dia. Não se criam mais
  // daqui (escreve-se sempre DENTRO de um dia), mas as que existem continuam
  // vivas: piscam-se e apagam-se. Só se desenha quando tem lá alguma coisa.
  const semDiaPorFazer = useMemo(
    () =>
      tarefas
        .filter((x) => !x.quando && !x.feita)
        .sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1)),
    [tarefas],
  );
  const semDiaFeitas = useMemo(
    () =>
      tarefas
        .filter((x) => !x.quando && x.feita)
        .sort((a, b) => ((a.feita_em ?? '') > (b.feita_em ?? '') ? -1 : 1)),
    [tarefas],
  );

  // O dia aberto, por extenso na língua ativa ('T00:00:00' força a leitura
  // LOCAL — sem ele, 'AAAA-MM-DD' é lido como UTC e a véspera aparece a oeste).
  // Este título é TAMBÉM a data de hoje quando o ecrã abre (diaSel começa em
  // hoje) — por isso a linha de data que vivia sob o cabeçalho saiu: dizia
  // exatamente o mesmo, no mesmo formato, duas linhas acima.
  const diaCru = new Date(`${diaSel}T00:00:00`).toLocaleDateString(
    idioma === 'pt' ? 'pt-PT' : 'en-GB',
    { weekday: 'long', day: 'numeric', month: 'long' },
  );
  const rotuloDia = diaCru.charAt(0).toUpperCase() + diaCru.slice(1);

  /**
   * Uma linha de coisa minha: pisco + texto (+ despertador) + ×.
   *
   * É uma FUNÇÃO que devolve JSX, não um componente — de propósito. Declarado
   * aqui dentro como componente, o seu tipo mudava a cada render e o React
   * remontava a linha inteira; o relógio do despertador (que guarda estado
   * próprio) fechava-se sozinho a cada tecla escrita no campo. Assim a linha
   * fica costurada na árvore do ecrã e o alarme mantém-se aberto.
   */
  function linhaMinha({
    chave,
    feita,
    texto,
    sub,
    aoPiscar,
    aoEliminar,
    a11yPisco,
    direita,
  }: {
    chave: string;
    feita: boolean;
    texto: string;
    sub?: string | null;
    aoPiscar: () => void;
    aoEliminar: () => void;
    a11yPisco: string;
    /** O que vive à direita do texto (o despertador das notas), se houver. */
    direita?: ReactNode;
  }) {
    return (
      <View key={chave} style={[styles.linha, feita && styles.linhaFeita]}>
        <Pressable
          style={[styles.pisco, feita && styles.piscoFeito]}
          onPress={aoPiscar}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: feita }}
          accessibilityLabel={a11yPisco}
        >
          {feita ? <Text style={styles.piscoTxt}>✓</Text> : null}
        </Pressable>
        <View style={styles.linhaTextos}>
          <Text style={feita ? styles.itemTituloFeito : styles.itemTitulo}>{texto}</Text>
          {sub ? <Text style={styles.itemSub}>{sub}</Text> : null}
        </View>
        {direita}
        {/* O ALVO DE APAGAR MEDE 44px. Media 12×24 e apagava sem perguntar —
            um polegar acerta-lhe por acidente ao rolar a lista, e o que
            desaparece é uma coisa que a pessoa escreveu. O `hitSlop` ajudava
            no toque mas não no engano: a área maior está agora no próprio
            botão, com o × a manter o tamanho discreto que tinha. */}
        <Pressable
          onPress={aoEliminar}
          style={styles.eliminarAlvo}
          accessibilityRole="button"
          accessibilityLabel={t('agenda.a11y_eliminar', { titulo: texto })}
        >
          <Text style={styles.eliminar}>×</Text>
        </Pressable>
      </View>
    );
  }

  // A gaveta desenha-se em sítios diferentes conforme a largura (ao pé do mês
  // na secretária, no fundo no telemóvel) — por isso mora numa variável.
  const gaveta =
    semDiaPorFazer.length + semDiaFeitas.length > 0 ? (
      <View style={styles.gaveta}>
        <View style={styles.gavetaCabeca}>
          <Text style={styles.rotulo}>{t('agenda.sem_dia')}</Text>
          {semDiaFeitas.length > 0 && (
            <Pressable onPress={limparFeitas} hitSlop={8}>
              <Text style={styles.limparTxt}>{t('agenda.limpar')}</Text>
            </Pressable>
          )}
        </View>
        {[...semDiaPorFazer, ...semDiaFeitas].map((tarefa) =>
          linhaMinha({
            chave: tarefa.id,
            feita: tarefa.feita,
            texto: tarefa.titulo,
            sub: tarefa.nota,
            aoPiscar: () => piscar(tarefa),
            aoEliminar: () => eliminar(tarefa.id),
            a11yPisco: tarefa.feita
              ? t('agenda.a11y_repor', { titulo: tarefa.titulo })
              : t('agenda.a11y_feita', { titulo: tarefa.titulo }),
          }),
        )}
      </View>
    ) : null;

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <View style={styles.topo}>
        <Text style={styles.voltar} onPress={() => router.back()}>
          {t('comum.voltar_seta')}
        </Text>
        <Text style={styles.titulo}>{t('agenda.titulo')}</Text>
        <View style={{ width: 60 }} />
      </View>

      {aCarregar ? (
        <Carregar />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.corpo, largo && styles.corpoLargo]}
          keyboardShouldPersistTaps="handled"
        >
          {erro && <Erro texto={erro} />}

          <View style={largo ? styles.grelha : undefined}>
            {/* ===== O MÊS — a grelha, com marca discreta nos dias que têm algo ===== */}
            <View style={largo ? styles.colMes : undefined}>
              <Mes
                ano={mesVisivel.ano}
                mes={mesVisivel.mes}
                diaSel={diaSel}
                marcas={marcas}
                onEscolher={setDiaSel}
                onRodar={(passo) =>
                  setMesVisivel(({ ano, mes }) => {
                    const total = mes + passo;
                    return { ano: ano + Math.floor(total / 12), mes: ((total % 12) + 12) % 12 };
                  })
                }
                onHoje={() => {
                  const h = new Date();
                  setMesVisivel({ ano: h.getFullYear(), mes: h.getMonth() });
                  setDiaSel(hojeISO());
                }}
              />
              {/* Na secretária a gaveta vive debaixo do mês; no telemóvel, no fundo. */}
              {largo ? gaveta : null}
            </View>

            {/* ===== O DIA — uma lista e um campo. Mais nada. ===== */}
            <View style={largo ? styles.colDia : undefined}>
              <View style={styles.diaCabeca}>
                <Text style={styles.diaTitulo}>{rotuloDia}</Text>
                {/* Uma cor, uma função — MAS A COR NÃO PODE ESTAR SOZINHA.
                    Estas duas coisas diziam ambas "Hoje", e só a cor as
                    separava: em creme era a etiqueta ("estás em hoje"), em
                    verde era a ação ("leva-me a hoje"). Ao abrir o dia 1 de
                    agosto lia-se "Sábado, 1 de agosto · Hoje" — a app parecia
                    dizer que o dia 1 era hoje.

                    Numa agenda, dizer o dia errado é o pior erro possível: é
                    a única coisa que ela tem de acertar. Agora a etiqueta diz
                    "Hoje" e a ação diz "Ir a hoje" — a cor continua a ajudar,
                    mas já não é ela a carregar o significado sozinha. */}
                {diaSel === hoje ? (
                  <View style={styles.hojePill}>
                    <Text style={styles.hojePillTxt}>{t('agenda.hoje_etiqueta')}</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => {
                      const h = new Date();
                      setMesVisivel({ ano: h.getFullYear(), mes: h.getMonth() });
                      setDiaSel(hojeISO());
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('agenda.ir_hoje')}
                  >
                    <Text style={styles.hojeAcao}>{t('agenda.ir_hoje')}</Text>
                  </Pressable>
                )}
              </View>

              {itensDoDia.map((item) => {
                // COMPROMISSO — leitura. Ponto CHEIO no lugar do pisco: cheio
                // porque não há nada para piscar (isto não é meu para marcar),
                // verde = palavra dada, dourado = relógio a fechar. Sem seta e
                // sem toque: quem age é a fila do Início.
                if (item.tipo === 'compromisso') {
                  const c = item.comp;
                  return (
                    <View
                      key={item.chave}
                      style={[styles.linha, styles.linhaLeitura]}
                      accessible
                      accessibilityLabel={`${c.titulo}, ${c.dataTxt}`}
                    >
                      <View style={styles.selo}>
                        <View
                          style={[
                            styles.seloPonto,
                            c.aperta ? styles.seloAperta : styles.seloComp,
                          ]}
                        />
                      </View>
                      <View style={styles.linhaTextos}>
                        <Text style={styles.itemTitulo} numberOfLines={2}>
                          {c.titulo}
                        </Text>
                        {c.sub ? (
                          <Text style={styles.itemSub} numberOfLines={1}>
                            {c.sub}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={[styles.compData, c.aperta && styles.compDataAperta]}>
                        {c.dataTxt}
                      </Text>
                    </View>
                  );
                }

                // NOTA do dia — a única que carrega despertador (a pílula do
                // sino põe, muda e tira a hora, sempre no mesmo sítio).
                if (item.tipo === 'nota') {
                  const n = item.nota;
                  const hora = horaLocal(n.alerta_em);
                  const passou = !!n.alerta_em && new Date(n.alerta_em).getTime() <= agoraMs;
                  return linhaMinha({
                    chave: item.chave,
                    feita: n.confirmada,
                    texto: n.texto,
                    aoPiscar: () => confirmarNota(n),
                    aoEliminar: () => eliminarNota(n),
                    a11yPisco: n.confirmada
                      ? t('agenda.a11y_repor_nota', { texto: n.texto })
                      : t('agenda.a11y_confirmar', { texto: n.texto }),
                    direita: (
                      <CampoHora
                        compacto
                        value={hora}
                        passado={passou || n.confirmada}
                        // O sino segue o alarme que EXISTE, não a hora que se
                        // escreveu: sem `alerta_id` ninguém foi acordado, e a
                        // pílula mostra um relógio (marcado) em vez de um sino
                        // (avisado). A regra vale nos dois sentidos — quem
                        // agendou no telemóvel continua a ver o sino aqui,
                        // porque o despertador está mesmo montado lá.
                        alarme={!!n.alerta_id}
                        onChange={(nova) => mudarAlerta(n, nova)}
                      />
                    ),
                  });
                }

                // TAREFA antiga marcada para este dia — mesma linha, mesma
                // pele. Quem usa não tem de saber que vem de outra tabela.
                const tarefa = item.tarefa;
                return linhaMinha({
                  chave: item.chave,
                  feita: tarefa.feita,
                  texto: tarefa.titulo,
                  sub: tarefa.nota,
                  aoPiscar: () => piscar(tarefa),
                  aoEliminar: () => eliminar(tarefa.id),
                  a11yPisco: tarefa.feita
                    ? t('agenda.a11y_repor', { titulo: tarefa.titulo })
                    : t('agenda.a11y_feita', { titulo: tarefa.titulo }),
                });
              })}

              {/* O VAZIO — uma frase, sem caixa. Um dia livre não é um erro:
                  não leva moldura nem instruções, que o campo aqui em baixo já
                  convida a escrever. */}
              {itensDoDia.length === 0 && <Text style={styles.livre}>{t('agenda.dia_vazio')}</Text>}

              {/* O ÚNICO campo do ecrã: escreve-se, e só então aparece a hora
                  (opcional) e o botão. Sem texto não há nada a decidir. */}
              <View style={styles.nova}>
                <Campo
                  placeholder={t('agenda.nota_dia_ph')}
                  value={novaNotaDia}
                  onChangeText={setNovaNotaDia}
                  onSubmitEditing={criarNota}
                  returnKeyType="done"
                />
                {novaNotaDia.trim().length > 0 && (
                  <View style={styles.novaLinha}>
                    <View style={styles.novaData}>
                      <CampoHora value={novaHora} onChange={setNovaHora} />
                    </View>
                    <Botao
                      titulo={t('agenda.apontar')}
                      onPress={criarNota}
                      aCarregar={aGuardarNota}
                      style={styles.novaBtn}
                    />
                  </View>
                )}
                {/* Honestidade sobre o despertador: na web ele não toca, e isso
                    diz-se — não se esconde nem se finge. */}
                {!DESPERTADOR_VIVO &&
                (novaHora !== '' ||
                  itensDoDia.some((i) => i.tipo === 'nota' && i.nota.alerta_em)) ? (
                  <Text style={styles.aviso}>{t('agenda.alerta_web')}</Text>
                ) : null}
                {avisoAlerta ? <Text style={styles.aviso}>{avisoAlerta}</Text> : null}
              </View>
            </View>
          </View>

          {largo ? null : gaveta}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/**
 * A GRELHA DO MÊS — a lente por dia. Um dia só ganha ponto se tiver algo real
 * por trás, e cada ponto tem função: verde = compromisso (a palavra dada),
 * dourado = compromisso com o relógio a fechar (pressão digna, nunca alarme
 * vermelho), neutro = o que eu próprio apontei. Nenhum é decorativo.
 * A semana começa à segunda, como no CampoData — a casa conta os dias sempre
 * da mesma maneira.
 */
function Mes({
  ano,
  mes,
  diaSel,
  marcas,
  onEscolher,
  onRodar,
  onHoje,
}: {
  ano: number;
  mes: number;
  diaSel: string;
  marcas: Map<string, MarcaDia>;
  onEscolher: (dia: string) => void;
  onRodar: (passo: -1 | 1) => void;
  onHoje: () => void;
}) {
  const { t } = useT();
  const meses = t('data.meses').split(',');
  const diasSemana = t('data.dias_semana').split(',');
  const hoje = hojeISO();
  const agora = new Date();
  const noMesDeHoje = agora.getFullYear() === ano && agora.getMonth() === mes;

  const primeiraColuna = (new Date(ano, mes, 1).getDay() + 6) % 7;
  const totalDias = new Date(ano, mes + 1, 0).getDate();
  const celulas: (number | null)[] = [
    ...Array.from({ length: primeiraColuna }, () => null),
    ...Array.from({ length: totalDias }, (_, i) => i + 1),
  ];
  while (celulas.length % 7 !== 0) celulas.push(null);
  const semanas: (number | null)[][] = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));

  return (
    <View style={styles.mes}>
      <View style={styles.mesCabeca}>
        <Pressable
          style={styles.mesSeta}
          onPress={() => onRodar(-1)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('agenda.mes_anterior')}
        >
          <Feather name="chevron-left" size={22} color={Honra.verde} />
        </Pressable>
        <View style={styles.mesTituloBloco}>
          <Text style={styles.mesTitulo}>
            {meses[mes]} {ano}
          </Text>
          {/* "Hoje" só aparece quando faz falta — a porta de volta ao presente. */}
          {!noMesDeHoje && (
            <Pressable onPress={onHoje} hitSlop={8}>
              <Text style={styles.mesHoje}>{t('agenda.ir_hoje')}</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          style={styles.mesSeta}
          onPress={() => onRodar(1)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('agenda.mes_seguinte')}
        >
          <Feather name="chevron-right" size={22} color={Honra.verde} />
        </Pressable>
      </View>

      <View style={styles.mesLinha}>
        {diasSemana.map((d, i) => (
          <Text key={i} style={styles.mesDiaSemana}>
            {d}
          </Text>
        ))}
      </View>

      {semanas.map((semana, s) => (
        <View key={s} style={styles.mesLinha}>
          {semana.map((dia, i) => {
            if (!dia) return <View key={i} style={styles.mesCelula} />;
            const chave = isoDe(ano, mes, dia);
            const sel = chave === diaSel;
            const marca = marcas.get(chave);
            return (
              <Pressable
                key={i}
                style={[
                  styles.mesCelula,
                  chave === hoje && styles.mesCelulaHoje,
                  sel && styles.mesCelulaSel,
                ]}
                onPress={() => onEscolher(chave)}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                accessibilityLabel={t('agenda.a11y_dia', { data: formatarData(chave) })}
              >
                <Text style={[styles.mesDiaTxt, sel && styles.mesDiaTxtSel]}>{dia}</Text>
                {/* Os pontos vivem por baixo do número — a marca é discreta,
                    lê-se de relance e nunca tapa o dia. */}
                <View style={styles.mesPontos}>
                  {marca?.comp ? (
                    <View
                      style={[
                        styles.ponto,
                        marca.aperta ? styles.pontoAperta : styles.pontoComp,
                        sel && styles.pontoSel,
                      ]}
                    />
                  ) : null}
                  {marca?.meu ? (
                    <View style={[styles.ponto, styles.pontoMeu, sel && styles.pontoSel]} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Espaco.md,
    paddingTop: Espaco.md,
  },
  voltar: { color: Honra.verde, fontSize: 16, fontWeight: '700', width: 60 },
  titulo: { fontSize: 20, fontWeight: '800', color: Honra.tinta },
  corpo: { padding: Espaco.md, gap: Espaco.sm, paddingBottom: Espaco.xxl },
  corpoLargo: { paddingHorizontal: Espaco.xl },
  // Secretária: o mês (a lente) à esquerda, o dia aberto à direita. A coluna
  // do dia é a maior — é onde se lê e se escreve.
  grelha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Espaco.xl,
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
  },
  colMes: { flex: 4, minWidth: 0, gap: Espaco.md },
  colDia: { flex: 5, minWidth: 0, gap: Espaco.sm },

  rotulo: {
    color: Honra.tintaSuave,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // ---- A LINHA — a mesma pele para tudo o que o dia tem ----
  linha: {
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.md,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    padding: Espaco.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.md,
  },
  // A mesma linha sem convite ao toque: fundo do papel em vez do branco que
  // salta. O olho percebe "isto é para saber", não "isto é para clicar".
  linhaLeitura: { backgroundColor: Honra.creme },
  linhaFeita: { opacity: 0.7, paddingVertical: Espaco.sm },
  linhaTextos: { flex: 1, gap: 2 },
  itemTitulo: { fontSize: 15, fontWeight: '600', color: Honra.tinta },
  itemTituloFeito: {
    fontSize: 14,
    fontWeight: '600',
    color: Honra.tintaSuave,
    textDecorationLine: 'line-through',
  },
  itemSub: { fontSize: 13, color: Honra.tintaSuave },
  compData: { fontSize: 12, fontWeight: '700', color: Honra.tintaSuave },
  // Dourado = pressão digna (o relógio a fechar) — nunca alarme vermelho.
  compDataAperta: { color: Honra.dourado },

  // O pisco: círculo de traço fino; feito = verde cheio (verde = significado).
  pisco: {
    width: 24,
    height: 24,
    borderRadius: Raio.pill,
    borderWidth: 1.5,
    borderColor: Honra.cremeEscuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  piscoFeito: { backgroundColor: Honra.verde, borderColor: Honra.verde },
  piscoTxt: { color: Honra.creme, fontSize: 13, fontWeight: '900' },
  // O selo do compromisso ocupa a MESMA coluna do pisco (24) para a lista ter
  // um só eixo à esquerda; o ponto lá dentro é cheio e pequeno — não se pisca.
  selo: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  seloPonto: { width: 10, height: 10, borderRadius: Raio.pill },
  seloComp: { backgroundColor: Honra.verde },
  seloAperta: { backgroundColor: Honra.dourado },
  eliminar: { color: Honra.tintaSuave, fontSize: 20, fontWeight: '400', opacity: 0.7 },
  eliminarAlvo: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  // O vazio: uma frase serena, sem moldura. Um dia livre não é um estado de erro.
  livre: {
    color: Honra.tintaSuave,
    fontSize: 14,
    paddingVertical: Espaco.md,
    paddingHorizontal: Espaco.xs,
  },

  // O campo único.
  nova: { gap: Espaco.sm, marginTop: Espaco.xs },
  novaLinha: { flexDirection: 'row', gap: Espaco.sm, alignItems: 'stretch' },
  novaData: { flex: 1 },
  novaBtn: { paddingHorizontal: Espaco.lg },

  // ---- A GAVETA (tarefas antigas sem dia) ----
  gaveta: { gap: Espaco.sm, marginTop: Espaco.md },
  gavetaCabeca: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  limparTxt: { color: Honra.tintaSuave, fontSize: 13, fontWeight: '700' },

  // ---- O MÊS ----
  // A grelha é uma folha, não um cartão a mais: mesma pele dos outros blocos.
  mes: {
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.md,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    padding: Espaco.md,
  },
  mesCabeca: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Espaco.sm,
  },
  mesSeta: { padding: Espaco.xs },
  mesTituloBloco: { flexDirection: 'row', alignItems: 'baseline', gap: Espaco.sm, flexShrink: 1 },
  mesTitulo: { fontSize: 16, fontWeight: '700', color: Honra.tinta },
  // Verde porque é AÇÃO (leva-me de volta ao presente), não enfeite.
  mesHoje: { fontSize: 13, fontWeight: '700', color: Honra.verde },
  mesLinha: { flexDirection: 'row' },
  mesDiaSemana: {
    flex: 1,
    textAlign: 'center',
    color: Honra.tintaSuave,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: Espaco.xs,
  },
  mesCelula: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: Raio.sm,
    margin: 1,
    gap: 3,
  },
  mesCelulaHoje: { borderWidth: 1, borderColor: Honra.tintaSuave },
  mesCelulaSel: { backgroundColor: Honra.verde },
  mesDiaTxt: { fontSize: 14, color: Honra.tinta },
  mesDiaTxtSel: { color: Honra.brancoCreme, fontWeight: '700' },
  // Fila de pontos: altura fixa para os dias sem marca não encolherem a linha.
  mesPontos: { flexDirection: 'row', gap: 3, height: 4, alignItems: 'center' },
  ponto: { width: 4, height: 4, borderRadius: Raio.pill },
  pontoComp: { backgroundColor: Honra.verde },
  pontoAperta: { backgroundColor: Honra.dourado },
  pontoMeu: { backgroundColor: Honra.pendente },
  // Sobre o verde cheio do dia escolhido, os pontos passam a creme para não
  // desaparecerem — a marca não pode sumir só por o dia estar aberto.
  pontoSel: { backgroundColor: Honra.creme },

  // ---- O DIA ----
  diaCabeca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.sm,
    marginTop: Espaco.sm,
    marginBottom: Espaco.xs,
  },
  diaTitulo: { fontSize: 17, fontWeight: '800', color: Honra.tinta, flexShrink: 1 },
  hojePill: {
    borderRadius: Raio.pill,
    backgroundColor: Honra.verdeSuave,
    paddingHorizontal: Espaco.sm,
    paddingVertical: 2,
  },
  hojePillTxt: { color: Honra.verde, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  // Verde nu = ação (voltar a hoje). A etiqueta acima é fundo, esta é gesto.
  hojeAcao: { color: Honra.verde, fontSize: 13, fontWeight: '700' },
  // A verdade dita em voz baixa (o despertador na web, a permissão em falta).
  aviso: { fontSize: 12, color: Honra.tintaSuave, lineHeight: 17, fontStyle: 'italic' },
});
