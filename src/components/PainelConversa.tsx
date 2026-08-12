/**
 * PAINEL DA CONVERSA — o fio inteiro de uma conversa (handoff "Conversas 4a").
 *
 * PORQUÊ UM COMPONENTE E NÃO UM ECRÃ: na SECRETÁRIA a maquete põe a lista e a
 * conversa lado a lado, na mesma vista; no TELEMÓVEL continuam a ser dois
 * ecrãs (lista → conversa), porque num ecrã estreito duas colunas não são duas
 * colunas — são duas prisões. O fio é o mesmo nos dois sítios, por isso vive
 * aqui e é chamado pelos dois. Nunca escrito duas vezes.
 *
 * O QUE A MAQUETE PEDE E ESTE PAINEL NÃO FAZ, de propósito:
 *   · "Marcar combinado" — a prova de presença que lhe daria sentido (e que
 *     mexeria na Confiança) ainda não existe. Um botão que não faz nada é pior
 *     do que não existir.
 *   · "Propor data" — não há caminho para propor uma data a DUAS pessoas: a
 *     agenda é privada de cada um. Também não se inventa.
 *   · Clipe de anexo — a tabela `mensagens` só tem `corpo`. Sem sítio onde
 *     guardar o ficheiro, o clipe seria uma promessa falsa.
 *   · Menu "⋮" — o que lá estaria já se toca à vista: o nome abre a pessoa, a
 *     pílula abre o negócio. Um menu para repetir o que já existe é ruído.
 *   · "entregue" por baixo do balão — a leitura do outro lado é PRIVADA
 *     (`leitura_conversa` só se lê a si própria, por RLS). Fica só a hora,
 *     que é real.
 *
 * O QUE FAZ, e é tudo dado verdadeiro: separadores de dia, o MARCO do aperto
 * de mão no instante em que aconteceu (`orcamentos.selado_em`), a hora de cada
 * balão, e o aviso de silêncio contado do carimbo da última mensagem.
 */
import { Feather } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  Modal,
} from 'react-native';

import { Avatar, Campo, CampoData, CampoHora, Carregar, hojeISO } from '@/components/ui';
import { CartaoCombinado } from './CartaoCombinado';
import { useCombinado } from '@/lib/combinado';
import { useT, type TFn } from '@/i18n';
import { iniciaisDe, useChatNaoLidas, useMensagens, type Mensagem, type TipoConversa } from '@/lib/chat';
import { mensagemAuth } from '@/lib/erros';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, LARGURA_SECRETARIA, Raio, TextoAcao } from '@/theme/honra';

/**
 * Ao fim de quantos dias o silêncio ganha voz. Três: menos do que isto é
 * pressa (há gente que trabalha e responde ao fim do dia), mais do que isto já
 * é um negócio a arrefecer sem ninguém dar por ela.
 */
const DIAS_SEM_RESPOSTA = 3;

type Outro = {
  id: string;
  nome: string | null;
  papel: string | null;
  cidade: string | null;
  avatar: string | null;
  avatar_url: string | null;
};

/** Um nó do fio: um separador de dia, um marco do negócio ou uma mensagem. */
type No =
  | { k: string; tipo: 'dia'; rotulo: string }
  | { k: string; tipo: 'marco'; titulo: string; detalhe: string }
  | { k: string; tipo: 'msg'; m: Mensagem };

/** "5 DE JULHO" — ou HOJE/ONTEM, que é como as pessoas falam dos dias perto. */
function rotuloDia(iso: string, loc: string, t: TFn): string {
  const d = new Date(iso);
  const hoje = new Date();
  const soDia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const delta = Math.round((soDia(hoje) - soDia(d)) / 86400000);
  if (delta === 0) return t('conversa.hoje').toUpperCase();
  if (delta === 1) return t('conversa.ontem').toUpperCase();
  const opcoes: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  // O ano só aparece quando NÃO é o corrente — dizer "2026" a toda a hora é
  // ruído; calá-lo num fio antigo seria confusão.
  if (d.getFullYear() !== hoje.getFullYear()) opcoes.year = 'numeric';
  return d.toLocaleDateString(loc, opcoes).toUpperCase();
}

const horaDe = (iso: string, loc: string) =>
  new Date(iso).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });

/** A foto do perfil, quando existe (o `avatar` é texto: iniciais à mão). */
const fotoDe = (caminho: string | null | undefined) =>
  caminho ? supabase.storage.from('avatares').getPublicUrl(caminho).data.publicUrl : null;

type Props = {
  id: string;
  tipo: TipoConversa;
  /** Telemóvel: a seta de voltar. Na secretária a lista fica ao lado — não há
   *  para onde voltar, e uma seta que não leva a lado nenhum mente. */
  aoVoltar?: () => void;
};

export function PainelConversa({ id, tipo, aoVoltar }: Props) {
  const { t, idioma } = useT();
  const loc = idioma === 'pt' ? 'pt-PT' : 'en-GB';
  const { width } = useWindowDimensions();
  const largo = width >= LARGURA_SECRETARIA;

  const { mensagens, aCarregar, aEnviar, uid, enviar } = useMensagens(id, tipo);
  const { marcarLido } = useChatNaoLidas();
  const focado = useIsFocused();

  const ehGrupo = tipo === 'grupo';
  const [texto, setTexto] = useState('');
  const [erroEnvio, setErroEnvio] = useState(false);
  /** O compositor da secretária acende quando tem o cursor (ver estilos). */
  const [focoCampo, setFocoCampo] = useState(false);
  const [outro, setOutro] = useState<Outro | null>(null);
  /** MARCAR COMBINADO (078): um encontro com consequência real — cumprido dá
   *  +2 de Confiança aos dois, falhado tira −2 a quem faltou. Não compete com
   *  os checkpoints: o checkpoint é o TRABALHO, o combinado é a PRESENÇA. */
  const [combinarAberto, setCombinarAberto] = useState(false);
  const [combDia, setCombDia] = useState('');
  const [combHora, setCombHora] = useState('');
  const [combOnde, setCombOnde] = useState('');
  const [aCombinar, setACombinar] = useState(false);
  const [combErro, setCombErro] = useState<string | null>(null);
  /** O combinado JÁ MARCADO desta conversa — ver, responder, confirmar,
   *  acusar, contestar (081). Só existe em conversa a dois: um combinado é
   *  entre duas pessoas, e num grupo não se sabe com quem seria. */
  const comb = useCombinado(ehGrupo ? null : (uid ?? null), ehGrupo ? null : (outro?.id ?? null));
  const [verificado, setVerificado] = useState(false);
  /** O negócio a que a conversa pertence: o nome (pílula) e o instante do
   *  aperto de mão (marco no fio). Só existe no tipo 'negocio'. */
  const [negocio, setNegocio] = useState<{ titulo: string | null; selado_em: string | null } | null>(
    null,
  );
  const [grupoNome, setGrupoNome] = useState<string | null>(null);
  const [numMembros, setNumMembros] = useState(0);
  const [nomesMembros, setNomesMembros] = useState<Record<string, string>>({});
  const scroll = useRef<ScrollView>(null);

  // Quem está do outro lado (ou o grupo). Uma ida à base por natureza.
  useEffect(() => {
    if (!id) return;
    let vivo = true;
    // Trocar de conversa limpa o cabeçalho: mostrar a cara da anterior enquanto
    // a nova carrega seria dizer que estamos a falar com quem não estamos.
    setOutro(null);
    setNegocio(null);
    setGrupoNome(null);
    setNumMembros(0);
    setNomesMembros({});
    setTexto('');
    setErroEnvio(false);

    const PERFIL = 'nome, papel, cidade, avatar, avatar_url';

    if (ehGrupo) {
      supabase
        .from('grupos_conversa')
        .select('nome')
        .eq('id', id)
        .single()
        .then(({ data }) => {
          if (vivo) setGrupoNome((data as { nome?: string } | null)?.nome ?? null);
        });
      supabase
        .from('grupo_membros')
        .select('perfil_id, perfil:perfis!perfil_id(nome)')
        .eq('grupo_id', id)
        .then(({ data }) => {
          if (!vivo) return;
          const linhas = (data as any[]) ?? [];
          setNumMembros(linhas.length);
          const nomes: Record<string, string> = {};
          for (const l of linhas) if (l.perfil?.nome) nomes[l.perfil_id] = l.perfil.nome;
          setNomesMembros(nomes);
        });
      return () => {
        vivo = false;
      };
    }

    if (tipo === 'livre') {
      // O par é ordenado por uuid (075) — a outra parte é a que não sou eu.
      supabase
        .from('conversas_livres')
        .select(`a, b, pa:perfis!a(${PERFIL}), pb:perfis!b(${PERFIL})`)
        .eq('id', id)
        .single()
        .then(({ data }) => {
          if (!vivo || !data) return;
          const d = data as any;
          const souA = uid === d.a;
          const p = souA ? d.pb : d.pa;
          setOutro(p ? { id: souA ? d.b : d.a, ...p } : null);
        });
      return () => {
        vivo = false;
      };
    }

    supabase
      .from('orcamentos')
      .select(
        `de_perfil, para_perfil, descricao, selado_em, de:perfis!de_perfil(${PERFIL}), para:perfis!para_perfil(${PERFIL}), trabalho:trabalhos!trabalho_id(titulo)`,
      )
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!vivo || !data) return;
        const d = data as any;
        const souA = uid === d.de_perfil;
        const p = souA ? d.para : d.de;
        setOutro(p ? { id: souA ? d.para_perfil : d.de_perfil, ...p } : null);
        setNegocio({
          // O título do trabalho é o melhor nome do negócio; sem trabalho, a
          // descrição serve. Nunca a palavra "Conversa" — essas pastas já
          // convergiram (076).
          titulo:
            d.trabalho?.titulo ??
            (d.descricao && d.descricao !== 'Conversa' ? d.descricao : null),
          selado_em: d.selado_em ?? null,
        });
      });
    return () => {
      vivo = false;
    };
  }, [id, uid, tipo, ehGrupo]);

  // O ✓ verde do cabeçalho: identidade verificada, e mais nada. É o mesmo
  // sinal do resto da app — o verde só acende quando há prova.
  useEffect(() => {
    const alvo = outro?.id;
    if (!alvo) {
      setVerificado(false);
      return;
    }
    let vivo = true;
    supabase
      .from('verificacoes')
      .select('perfil_id')
      .eq('perfil_id', alvo)
      .eq('aba', 'identidade')
      .eq('estado', 'verificado')
      .maybeSingle()
      .then(({ data }) => {
        if (vivo) setVerificado(!!data);
      });
    return () => {
      vivo = false;
    };
  }, [outro?.id]);

  // Estar a VER a conversa = ler. Só marca lida com o ecrã em foco — o
  // navegador mantém-no montado por trás, e não queremos que "leia" mensagens
  // que chegam enquanto olhamos para outro lado.
  useEffect(() => {
    // As TRÊS naturezas marcam-se lidas (077). Antes só os negócios contavam:
    // grupos e conversas livres escreviam numa coluna com chave estrangeira
    // para `orcamentos`, a inserção falhava em silêncio, e essas conversas
    // ficavam por-ler para sempre.
    if (id && focado && !aCarregar) marcarLido(id, tipo);
  }, [id, focado, aCarregar, mensagens.length, marcarLido, tipo]);

  // Auto-scroll para o fim — a conversa abre onde ela está agora.
  useEffect(() => {
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [mensagens.length, id]);

  /**
   * O FIO: mensagens e marcos do negócio na MESMA linha do tempo, com os
   * separadores de dia intercalados. O aperto de mão não é um cartão fixo no
   * topo — aconteceu num instante, e é nesse instante que se lê.
   */
  const fio = useMemo<No[]>(() => {
    const eventos: { ts: string; no: No }[] = mensagens.map((m) => ({
      ts: m.criado_em,
      no: { k: `m:${m.id}`, tipo: 'msg', m },
    }));
    if (negocio?.selado_em) {
      eventos.push({
        ts: negocio.selado_em,
        no: {
          k: 'marco:aperto',
          tipo: 'marco',
          titulo: t('conversa.marco_aperto'),
          detalhe: [negocio.titulo, t('conversa.marco_aperto_det')].filter(Boolean).join(' · '),
        },
      });
    }
    eventos.sort((a, b) => (a.ts < b.ts ? -1 : 1));

    const saida: No[] = [];
    let diaAnterior = '';
    for (const e of eventos) {
      // Chave de dia LOCAL (não o ISO cru): à meia-noite o UTC troca o dia e o
      // separador aparecia no sítio errado.
      const dia = new Date(e.ts).toDateString();
      if (dia !== diaAnterior) {
        saida.push({ k: `d:${dia}`, tipo: 'dia', rotulo: rotuloDia(e.ts, loc, t) });
        diaAnterior = dia;
      }
      saida.push(e.no);
    }
    return saida;
  }, [mensagens, negocio, loc, t]);

  /**
   * Dias de silêncio depois de EU falar. Só conta quando a última palavra é
   * minha: é aí que estou à espera. Num grupo não se aplica — o silêncio de
   * muitos não é o silêncio de alguém.
   */
  const semResposta = useMemo(() => {
    if (ehGrupo) return 0;
    const ultima = mensagens[mensagens.length - 1];
    if (!ultima || ultima.autor_perfil !== uid) return 0;
    const dias = Math.floor((Date.now() - new Date(ultima.criado_em).getTime()) / 86400000);
    return dias >= DIAS_SEM_RESPOSTA ? dias : 0;
  }, [mensagens, uid, ehGrupo]);

  const nome = ehGrupo ? grupoNome : outro?.nome;
  const subtitulo = ehGrupo
    ? numMembros > 0
      ? numMembros === 1
        ? t('conversa.membro')
        : t('conversa.membros', { n: numMembros })
      : null
    : [outro?.papel, outro?.cidade].filter(Boolean).join(' · ') || null;

  async function submeter() {
    const txt = texto;
    if (!txt.trim()) return;
    setTexto('');
    setErroEnvio(false);
    const ok = await enviar(txt);
    if (!ok) {
      setTexto(txt); // falhou → devolve o texto e diz porquê
      setErroEnvio(true);
    }
  }

  // ===== CABEÇALHO =====
  const pilula =
    tipo === 'negocio' && negocio?.titulo ? (
      <Pressable
        style={styles.pilula}
        onPress={() => router.push(`/projeto/${id}`)}
        accessibilityRole="button"
        accessibilityLabel={t('conversa.abrir_negocio')}
      >
        <View style={styles.pilulaPonto} />
        <Text style={styles.pilulaTxt} numberOfLines={1}>
          {negocio.titulo}
        </Text>
      </Pressable>
    ) : null;

  const cabecalho = (
    <View style={styles.cabecalhoWrap}>
      <View style={styles.cabecalho}>
        {aoVoltar ? (
          <Pressable onPress={aoVoltar} hitSlop={8} accessibilityRole="button">
            <Text style={styles.voltar}>{t('comum.voltar_seta')}</Text>
          </Pressable>
        ) : null}

        {ehGrupo ? (
          <View style={styles.avatarGrupo}>
            <Feather name="users" size={18} color={Honra.douradoClaro} />
          </View>
        ) : (
          <Avatar
            iniciais={outro?.avatar?.trim() || iniciaisDe(outro?.nome)}
            imagem={fotoDe(outro?.avatar_url)}
            tamanho={32}
          />
        )}

        {/* Tocar na pessoa abre a pessoa. É a porta que a maquete escondia num
            menu "⋮" — aqui está à vista, e não precisa de menu nenhum. */}
        <Pressable
          style={styles.cabecalhoMeio}
          onPress={() => outro?.id && router.push(`/perfil/${outro.id}`)}
          disabled={!outro?.id}
          hitSlop={6}
        >
          <View style={styles.nomeLinha}>
            <Text style={styles.nome} numberOfLines={1}>
              {nome ?? t('chat.conversa')}
            </Text>
            {/* Identidade verificada: o ✓ verde. Verde = significado, e este é
                o significado maior da casa — esta pessoa é mesmo esta pessoa. */}
            {verificado ? (
              <View style={styles.check}>
                <Feather name="check" size={9} color={Honra.creme} />
              </View>
            ) : null}
          </View>
          {subtitulo ? (
            <Text style={styles.subtitulo} numberOfLines={1}>
              {subtitulo}
            </Text>
          ) : null}
        </Pressable>

        {largo ? pilula : null}
      </View>

      {/* Telemóvel: a pílula do negócio desce para uma linha só dela. Em cima
          roubava a linha ao nome — e o nome manda sempre. */}
      {!largo && pilula ? <View style={styles.pilulaLinha}>{pilula}</View> : null}
    </View>
  );

  // ===== FIO =====
  const corpo = aCarregar ? (
    <Carregar />
  ) : (
    <ScrollView
      ref={scroll}
      style={styles.fioScroll}
      contentContainerStyle={[styles.fio, largo && styles.fioLargo]}
    >
      {fio.length === 0 && <Text style={styles.vazio}>{t('chat.vazio_mensagens')}</Text>}
      {fio.map((no, i) => {
        // Com pouca conversa, o fio encosta-se ao FUNDO (como a maquete): a
        // margem automática no primeiro nó faz isso sem o bug clássico do
        // `justify-content:flex-end`, que esconderia o topo quando há muito.
        const primeiro = i === 0 ? styles.primeiro : undefined;
        if (no.tipo === 'dia') {
          return (
            <Text key={no.k} style={[styles.dia, primeiro]}>
              {no.rotulo}
            </Text>
          );
        }
        if (no.tipo === 'marco') {
          // O MARCO ao centro, em verde-escuro: não é mensagem de ninguém, é um
          // facto do negócio — por isso não tem lado.
          return (
            <View key={no.k} style={[styles.marco, primeiro]}>
              <Feather name="award" size={16} color={Honra.douradoClaro} />
              <Text style={styles.marcoTitulo}>{no.titulo}</Text>
              <Text style={styles.marcoDetalhe} numberOfLines={1}>
                {no.detalhe}
              </Text>
            </View>
          );
        }
        const m = no.m;
        const meu = m.autor_perfil === uid;
        return (
          <View key={no.k} style={[styles.balaoBloco, meu ? styles.dir : styles.esq, primeiro]}>
            <View style={[styles.balao, meu ? styles.balaoMeu : styles.balaoOutro]}>
              {/* No grupo, os balões alheios dizem quem fala. */}
              {ehGrupo && !meu && nomesMembros[m.autor_perfil] ? (
                <Text style={styles.autor}>{nomesMembros[m.autor_perfil]}</Text>
              ) : null}
              <Text style={[styles.corpo, meu && styles.corpoMeu]}>{m.corpo}</Text>
            </View>
            {/* Só a HORA. O "entregue" da maquete precisaria de saber se o outro
                lado leu, e isso é privado dele (RLS) — não se inventa. */}
            <Text style={styles.hora}>{horaDe(m.criado_em, loc)}</Text>
          </View>
        );
      })}

      {/* O silêncio ao centro, em dourado tracejado. Dourado porque no Honra o
          silêncio não é um detalhe de interface: é conduta, e conduta é
          exatamente aquilo que o dourado guarda. */}
      {semResposta > 0 ? (
        <View style={styles.silencio}>
          <Feather name="clock" size={13} color={Honra.dourado} />
          <Text style={styles.silencioTxt}>{t('conversa.sem_resposta', { n: semResposta })}</Text>
        </View>
      ) : null}
    </ScrollView>
  );

  // ===== COMPOSITOR =====
  // Secretária: a caixa creme da maquete (campo em cima, Enviar em baixo).
  // Telemóvel: a barra de sempre — uma linha, o polegar alcança tudo.
  async function marcarCombinado() {
    const alvo = outro?.id;
    if (!uid || !alvo || !combDia || aCombinar) return;
    setCombErro(null);
    setACombinar(true);
    // O par guarda-se ORDENADO (a < b), como manda a 078: assim não há duas
    // linhas para o mesmo par consoante quem marcou.
    const [a, b] = uid < alvo ? [uid, alvo] : [alvo, uid];
    const quando = new Date(`${combDia}T${combHora || '09:00'}:00`).toISOString();
    const { error } = await supabase.from('combinados').insert({
      a,
      b,
      proposto_por: uid,
      quando,
      onde: combOnde.trim() || null,
      // Contexto opcional: se a conversa é de um negócio, o combinado herda-o.
      orcamento_id: tipo === 'negocio' ? id : null,
    });
    setACombinar(false);
    if (error) {
      // A razão do SERVIDOR — mas TRADUZIDA. O `.message` de uma recusa do
      // Postgres vem em inglês e em linguagem de base de dados ("new row
      // violates row-level security policy for table..."), e isso na cara de
      // quem só queria marcar um café não é honestidade, é despejo. O que a
      // casa reconhece, diz-se em português; o resto cai no genérico digno.
      setCombErro(mensagemAuth(error, t, 'conversa.comb_erro'));
      return;
    }
    setCombinarAberto(false);
    // Sem isto, marcava-se o combinado e o cartão só aparecia da próxima vez
    // que se abrisse a conversa — parecia que não tinha acontecido nada.
    comb.recarregar();
    setCombDia('');
    setCombHora('');
    setCombOnde('');
  }

  const compositor = largo ? (
    <View style={styles.compositorWrap}>
      {/* O foco vive na CAIXA, não num contorno do browser à volta do campo: a
          caixa toda é o campo, e é ela que tem de acender. Assim tira-se o
          outline do navegador sem tirar a quem navega por teclado o sinal de
          onde está. */}
      <View style={[styles.compositor, focoCampo && styles.compositorFocado]}>
        <TextInput
          style={styles.campoLargo}
          onFocus={() => setFocoCampo(true)}
          onBlur={() => setFocoCampo(false)}
          placeholder={
            nome ? t('conversa.escreve_para', { nome }) : t('chat.escreve_ph')
          }
          placeholderTextColor={Honra.tintaSuave}
          value={texto}
          onChangeText={(v) => {
            setTexto(v);
            if (erroEnvio) setErroEnvio(false);
          }}
          multiline
          onKeyPress={(e) => {
            // Enter envia, Shift+Enter muda de linha — o gesto que qualquer
            // pessoa já tem nos dedos.
            const ev = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
            if (Platform.OS === 'web' && ev.key === 'Enter' && !ev.shiftKey) {
              (e as unknown as { preventDefault: () => void }).preventDefault?.();
              submeter();
            }
          }}
        />
        <View style={styles.compositorAcoes}>
          {/* Só em conversa de DUAS pessoas: um combinado é entre duas partes,
              e num grupo não se sabe quem prometeu presença a quem. */}
          {!ehGrupo && outro?.id ? (
            <Pressable style={styles.acaoComp} onPress={() => setCombinarAberto(true)}>
              <Feather name="calendar" size={14} color={Honra.verdeEscuro} />
              <Text style={styles.acaoCompTxt}>{t('comb.marcar')}</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.enviarLargo, (!texto.trim() || aEnviar) && styles.enviarOff]}
            onPress={submeter}
            disabled={!texto.trim() || aEnviar}
            accessibilityRole="button"
          >
            <Text style={styles.enviarLargoTxt}>{t('chat.enviar_curto')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  ) : (
    <View style={styles.barra}>
      <TextInput
        style={styles.input}
        placeholder={t('chat.escreve_ph')}
        placeholderTextColor={Honra.tintaSuave}
        value={texto}
        onChangeText={(v) => {
          setTexto(v);
          if (erroEnvio) setErroEnvio(false);
        }}
        multiline
      />
      <Pressable
        style={[styles.enviar, (!texto.trim() || aEnviar) && styles.enviarOff]}
        onPress={submeter}
        disabled={!texto.trim() || aEnviar}
        accessibilityRole="button"
        accessibilityLabel={t('chat.enviar')}
      >
        <Text style={styles.enviarTxt}>›</Text>
      </Pressable>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      {cabecalho}
      {corpo}
      {/* O combinado marcado, logo por cima do compositor: é a última coisa
          que se vê antes de escrever, que é onde a decisão de aparecer (ou de
          dizer que não se pode) tem de estar à mão. */}
      {comb.combinado && uid ? (
        <CartaoCombinado
          combinado={comb.combinado}
          uid={uid}
          aAgir={comb.aAgir}
          erro={comb.erro}
          onResponder={comb.responder}
          onConfirmar={comb.confirmar}
          onDeclararFalha={comb.declararFalha}
          onContestar={comb.contestar}
        />
      ) : null}
      {erroEnvio && <Text style={styles.erroEnvio}>{t('chat.erro_enviar')}</Text>}
      {compositor}

      {/* MARCAR COMBINADO — o encontro com consequência (078). O texto diz o
          preço À FRENTE: quem marca sabe o que está a pôr em jogo, dos dois
          lados. Uma consequência que só se descobre depois não é regra, é
          armadilha. */}
      <Modal
        visible={combinarAberto}
        transparent
        animationType="fade"
        onRequestClose={() => setCombinarAberto(false)}
      >
        <Pressable style={styles.veuComb} onPress={() => setCombinarAberto(false)}>
          <Pressable style={styles.cartaComb} onPress={() => {}}>
            <Text style={styles.combTitulo}>{t('comb.titulo')}</Text>
            <Text style={styles.combExplica}>{t('comb.explica')}</Text>

            <Text style={styles.combRotulo}>{t('comb.dia')}</Text>
            <CampoData value={combDia} onChange={setCombDia} minimo={hojeISO()} />

            <Text style={styles.combRotulo}>{t('comb.hora')}</Text>
            <CampoHora value={combHora} onChange={setCombHora} />

            <Text style={styles.combRotulo}>{t('comb.onde')}</Text>
            <Campo
              value={combOnde}
              onChangeText={setCombOnde}
              placeholder={t('comb.onde_ph')}
            />

            {combErro ? <Text style={styles.combErro}>{combErro}</Text> : null}

            <View style={styles.combRodape}>
              <Pressable onPress={() => setCombinarAberto(false)} hitSlop={8}>
                <Text style={styles.combCancelar}>{t('comum.cancelar')}</Text>
              </Pressable>
              <Pressable
                style={[styles.combOk, (!combDia || aCombinar) && styles.enviarOff]}
                onPress={marcarCombinado}
                disabled={!combDia || aCombinar}
              >
                <Text style={styles.combOkTxt}>
                  {aCombinar ? t('comum.a_enviar') : t('comb.marcar_botao')}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minHeight: 0 },

  // ===== cabeçalho =====
  cabecalhoWrap: {
    paddingBottom: Espaco.md,
    paddingHorizontal: Espaco.sm,
    borderBottomWidth: 1,
    borderBottomColor: Honra.cremeEscuro,
  },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: Espaco.sm + 4 },
  pilulaLinha: { flexDirection: 'row', marginTop: Espaco.sm },
  voltar: { color: Honra.verde, fontSize: 16, fontWeight: '700', ...TextoAcao },
  avatarGrupo: {
    width: 40,
    height: 40,
    borderRadius: Raio.pill,
    backgroundColor: Honra.verdeEscuro,
    borderWidth: 1.6,
    borderColor: Honra.dourado,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cabecalhoMeio: { flex: 1, minWidth: 0, gap: 2 },
  nomeLinha: { flexDirection: 'row', alignItems: 'center', gap: Espaco.sm },
  nome: { fontSize: 18, fontWeight: '800', color: Honra.tinta, flexShrink: 1 },
  check: {
    width: 16,
    height: 16,
    borderRadius: Raio.pill,
    backgroundColor: Honra.verde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitulo: { fontSize: 13, color: Honra.tintaSuave, flexShrink: 1 },
  // A pílula do NEGÓCIO: leva ao projeto. O ponto verde diz que há ali um
  // negócio vivo — não é enfeite, é a porta.
  pilula: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.sm,
    height: 32,
    paddingHorizontal: Espaco.md - 2,
    borderRadius: Raio.pill,
    backgroundColor: Honra.brancoCreme,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    maxWidth: 240,
  },
  pilulaPonto: { width: 7, height: 7, borderRadius: Raio.pill, backgroundColor: Honra.verde },
  pilulaTxt: { fontSize: 13, fontWeight: '700', color: Honra.tinta, flexShrink: 1, ...TextoAcao },

  // ===== fio =====
  fioScroll: { flex: 1, minHeight: 0 },
  fio: { flexGrow: 1, padding: Espaco.md, gap: Espaco.md, paddingBottom: Espaco.lg },
  /** Empurra o fio todo para o fundo quando ainda cabe no ecrã. */
  primeiro: { marginTop: 'auto' },
  // Secretária: o fio centra-se e não passa dos 760 — linhas mais largas do que
  // isto cansam a vista, e uma conversa lê-se.
  fioLargo: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 0 },
  vazio: { color: Honra.tintaSuave, textAlign: 'center', marginTop: Espaco.xxl },
  dia: {
    alignSelf: 'center',
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: Honra.tintaSuave,
  },
  marco: {
    alignSelf: 'center',
    maxWidth: '92%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.sm + 4,
    paddingVertical: Espaco.sm + 5,
    paddingHorizontal: Espaco.md + 2,
    borderRadius: Raio.lg,
    backgroundColor: Honra.verdeEscuro,
  },
  marcoTitulo: { fontSize: 13.5, fontWeight: '800', color: Honra.creme },
  marcoDetalhe: { fontSize: 12.5, color: Honra.douradoClaro, flexShrink: 1 },

  balaoBloco: { maxWidth: '78%', gap: 5 },
  esq: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  dir: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  balao: { borderRadius: Raio.lg + 2, paddingVertical: Espaco.sm + 4, paddingHorizontal: Espaco.md + 2 },
  balaoMeu: { backgroundColor: Honra.verdeEscuro, borderBottomRightRadius: Raio.sm - 2 },
  balaoOutro: { backgroundColor: Honra.brancoCreme, borderBottomLeftRadius: Raio.sm - 2 },
  corpo: { fontSize: 15, color: Honra.tinta, lineHeight: 22 },
  corpoMeu: { color: Honra.creme },
  autor: { fontSize: 12, fontWeight: '700', color: Honra.verde, marginBottom: 2 },
  hora: { fontSize: 11, color: Honra.tintaSuave, paddingHorizontal: 4 },

  silencio: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.sm + 1,
    paddingVertical: Espaco.sm,
    paddingHorizontal: Espaco.md - 2,
    borderRadius: Raio.lg,
    backgroundColor: Honra.creme,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Honra.dourado,
  },
  silencioTxt: { fontSize: 12.5, fontWeight: '700', color: Honra.dourado },

  // ===== compositor (secretária) =====
  compositorWrap: { paddingHorizontal: Espaco.md, paddingBottom: Espaco.md },
  compositor: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    gap: Espaco.sm + 3,
    paddingVertical: Espaco.md - 1,
    paddingHorizontal: Espaco.md + 2,
    borderRadius: Raio.lg + 2,
    backgroundColor: Honra.brancoCreme,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
  },
  // Com o cursor lá dentro: o fio passa a verde. Verde = ação, e aqui a ação
  // está mesmo prestes a acontecer.
  compositorFocado: { borderColor: Honra.verde },
  campoLargo: {
    minHeight: 24,
    maxHeight: 140,
    fontSize: 15,
    lineHeight: 21,
    color: Honra.tinta,
    // Sem contorno próprio: a caixa toda já É o campo (maquete 4a).
    outlineWidth: 0,
  },
  compositorAcoes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  // A ação secundária do compositor: presente, em voz baixa. Marcar um
  // encontro é um gesto sério mas não é o gesto principal — enviar é.
  acaoComp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Espaco.sm,
    paddingHorizontal: Espaco.md,
    borderRadius: Raio.md,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    backgroundColor: Honra.creme,
    marginRight: 'auto',
  },
  acaoCompTxt: { ...TextoAcao, fontSize: 13, fontWeight: '600', color: Honra.verdeEscuro },
  veuComb: {
    flex: 1,
    backgroundColor: 'rgba(18, 33, 27, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Espaco.lg,
  },
  cartaComb: {
    width: '100%',
    maxWidth: 380,
    padding: Espaco.lg,
    borderRadius: Raio.lg,
    backgroundColor: Honra.brancoCreme,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    gap: Espaco.xs,
  },
  combTitulo: { fontSize: 18, fontWeight: '800', color: Honra.tinta },
  // O preço dito ANTES do gesto — não depois.
  combExplica: { fontSize: 13, color: Honra.tintaSuave, lineHeight: 19, marginBottom: Espaco.sm },
  combRotulo: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1,
    color: Honra.tintaSuave,
    marginTop: Espaco.sm,
  },
  combErro: { fontSize: 12.5, color: Honra.erro, marginTop: Espaco.sm, lineHeight: 18 },
  combRodape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Espaco.lg,
  },
  combCancelar: { ...TextoAcao, fontSize: 14, fontWeight: '700', color: Honra.tintaSuave },
  combOk: {
    paddingVertical: Espaco.sm + 2,
    paddingHorizontal: Espaco.lg,
    borderRadius: Raio.md,
    backgroundColor: Honra.verdeEscuro,
  },
  combOkTxt: { ...TextoAcao, fontSize: 14, fontWeight: '700', color: Honra.creme },
  enviarLargo: {
    height: 42,
    paddingHorizontal: 22,
    borderRadius: Raio.md + 1,
    backgroundColor: Honra.verdeEscuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enviarLargoTxt: { color: Honra.creme, fontSize: 14, fontWeight: '700', ...TextoAcao },

  // ===== compositor (telemóvel) =====
  barra: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Espaco.sm,
    padding: Espaco.sm,
    borderTopWidth: 1,
    borderTopColor: Honra.cremeEscuro,
    backgroundColor: Honra.brancoCreme,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: Honra.creme,
    borderRadius: Raio.lg,
    paddingHorizontal: Espaco.md,
    paddingVertical: Espaco.sm,
    fontSize: 15,
    color: Honra.tinta,
  },
  enviar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Honra.verde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enviarOff: { opacity: 0.4 },
  enviarTxt: { color: Honra.creme, fontSize: 22, fontWeight: '800', lineHeight: 24, ...TextoAcao },
  erroEnvio: {
    color: Honra.erro,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: Espaco.md,
    paddingBottom: Espaco.xs,
  },
});
