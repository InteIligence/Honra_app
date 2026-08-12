import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Botao,
  Campo,
  CampoData,
  Cartao,
  Erro,
  hojeISO,
  PainelCategorias,
  type CategoriaNo,
  type EscolhaCategoria,
} from '@/components/ui';
import { useT } from '@/i18n';
import { useIdentidadeVerificada } from '@/lib/identidade';
import { supabase } from '@/lib/supabase';
import { atualizarTrabalho, publicarTrabalho } from '@/lib/trabalho';
import { Espaco, Honra, LARGURA_SECRETARIA, Raio } from '@/theme/honra';

/**
 * Publicar OU editar um trabalho no mural (contrato: `@/lib/trabalho`).
 * Sem `?id` é o ecrã de criar; com `?id` carrega o trabalho e vira edição
 * (mesmos campos, guarda por UPDATE). Título obrigatório; o resto é opcional.
 *
 * DESENHO (31/07) — era um formulário nu (sete rótulos em fila, todos com o
 * mesmo peso). Publicar aqui é abrir a porta a receber respostas de gente com
 * registo, e o ecrã passou a ter essa hierarquia:
 *   · O ESSENCIAL (título, descrição, categoria) fica em cima, com peso;
 *   · SE QUISERES (orçamento e datas) desce para um bloco TRACEJADO — o mesmo
 *     idioma que a porta da 2.ª categoria já usava para dizer "convite, não
 *     ordem". Opcional passa a PARECER opcional;
 *   · DEPOIS DE PUBLICARES conta os três passos REAIS do ciclo (mural →
 *     respostas com mensagem e registo → escolha e orçamento). Nada aqui é
 *     promessa: é o que o código faz. E como abrir orçamento exige identidade
 *     verificada (043), diz-se ANTES, a quem ainda não a tem, com o caminho.
 * Secretária: o formulário à esquerda, o painel do "depois" à direita.
 */
export default function PublicarTrabalho() {
  const { t } = useT();
  const { id: paramId } = useLocalSearchParams<{ id?: string }>();
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [categorias, setCategorias] = useState<CategoriaNo[]>([]);
  // Até 2 categorias (decisão 20/07): a 1.ª é a principal, a 2.ª acompanha
  // trabalhos híbridos ("filmar casamento + fotografia"). Teto deliberado.
  const [cats, setCats] = useState<EscolhaCategoria[]>([]);
  const [painelAberto, setPainelAberto] = useState(false);
  const [valor, setValor] = useState('');
  const [inicio, setInicio] = useState('');
  const [prazo, setPrazo] = useState('');
  const [aPublicar, setAPublicar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Qual o trabalho carregado no form (null = criar). Guarda-se o piso das
  // datas em edição, para não bloquear uma data que já estava no passado.
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [pisoInicio, setPisoInicio] = useState(hojeISO());
  // Abrir orçamento a um candidato exige identidade verificada (fuga C, 043).
  // Aqui serve para avisar ANTES, não para travar o publicar.
  const { verificada: minhaIdVerificada } = useIdentidadeVerificada();
  // SECRETÁRIA: o corpo ganha ar e limite de leitura.
  const { width } = useWindowDimensions();
  const largo = width >= LARGURA_SECRETARIA;
  // Duas colunas (formulário | o que vem a seguir) só quando o CORPO as
  // aguenta — e quem manda no corpo é a coluna de leitura da casa (~720px no
  // browser), não a largura da janela. Mede-se e decide-se com a verdade.
  const [larguraCorpo, setLarguraCorpo] = useState(0);
  const duasColunas = larguraCorpo >= 880;

  const edicao = !!editandoId;

  function limpar() {
    setTitulo('');
    setDescricao('');
    setCats([]);
    setValor('');
    setInicio('');
    setPrazo('');
    setEditandoId(null);
    setPisoInicio(hojeISO());
    setErro(null);
  }

  useEffect(() => {
    let vivo = true;
    // Taxonomia em hierarquia (tolerante: se a tabela não existir, fica vazio).
    supabase
      .from('categorias')
      .select('id, nome, slug, parent_id')
      .order('ordem')
      .order('nome')
      .then(({ data }) => {
        if (vivo) setCategorias((data as CategoriaNo[]) ?? []);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // O ecrã fica montado atrás das tabs — ao ganhar foco, sincroniza com o
  // `?id`: entrar para editar carrega esse trabalho; voltar para criar
  // (sem id, vindo de uma edição) limpa o formulário.
  useFocusEffect(
    useCallback(() => {
      const alvo = paramId ?? null;
      if (alvo === editandoId) return;
      if (!alvo) {
        limpar();
        return;
      }
      supabase
        .from('trabalhos')
        .select(
          'titulo, descricao, categoria_id, categoria2_id, orcamento_valor, data_inicio, prazo, categoria:categorias!trabalhos_categoria_id_fkey(nome), categoria2:categorias!trabalhos_categoria2_id_fkey(nome)'
        )
        .eq('id', alvo)
        .single()
        .then(({ data }) => {
          if (!data) return;
          const d = data as any;
          setEditandoId(alvo);
          setTitulo(d.titulo ?? '');
          setDescricao(d.descricao ?? '');
          const escolhidas: EscolhaCategoria[] = [];
          if (d.categoria_id && d.categoria?.nome)
            escolhidas.push({ modo: 'sub', id: d.categoria_id, nome: d.categoria.nome });
          if (d.categoria2_id && d.categoria2?.nome)
            escolhidas.push({ modo: 'sub', id: d.categoria2_id, nome: d.categoria2.nome });
          setCats(escolhidas);
          setValor(d.orcamento_valor != null ? String(d.orcamento_valor) : '');
          setInicio(d.data_inicio ?? '');
          setPrazo(d.prazo ?? '');
          // Uma data já no passado continua válida em edição (não se apaga).
          const hoje = hojeISO();
          setPisoInicio(d.data_inicio && d.data_inicio < hoje ? d.data_inicio : hoje);
          setErro(null);
        });
    }, [paramId, editandoId])
  );

  async function publicar() {
    setErro(null);
    // As datas vêm do calendário (sempre AAAA-MM-DD); só falta o cruzamento.
    if (inicio && prazo && prazo < inicio) {
      return setErro(t('pub.erro_prazo'));
    }
    // Valor opcional; se preenchido tem de ser um número >= 0.
    const valorNum = valor.trim() ? Number(valor.trim().replace(',', '.')) : null;
    if (valor.trim() && (valorNum === null || Number.isNaN(valorNum) || valorNum < 0)) {
      return setErro(t('pub.erro_valor'));
    }

    const campos = {
      titulo,
      descricao: descricao.trim() || undefined,
      categoria_id: cats[0]?.id ?? null,
      categoria2_id: cats[1]?.id ?? null,
      orcamento_valor: valorNum,
      data_inicio: inicio.trim() || null,
      prazo: prazo.trim() || null,
    };

    setAPublicar(true);
    if (editandoId) {
      const { erro: falha } = await atualizarTrabalho(editandoId, campos);
      setAPublicar(false);
      if (falha) return setErro(t(falha));
      const alvo = editandoId;
      limpar();
      router.replace(`/trabalho/${alvo}`);
      return;
    }
    const { id, erro: falha } = await publicarTrabalho(campos);
    setAPublicar(false);
    if (id) {
      limpar();
      // `de=pub`: o Voltar do detalhe leva ao Início (não de volta ao formulário).
      router.replace(`/trabalho/${id}?de=pub`);
    } else setErro(t(falha ?? 'trabalho.erro_publicar'));
  }

  // ===== O ESSENCIAL — o que faz um anúncio existir =====
  const blocoEssencial = (
    <View style={styles.bloco}>
      <Text style={styles.secao}>{t('pub.essencial')}</Text>

      <Text style={styles.rotulo}>{t('pub.rotulo_titulo')}</Text>
      <Campo placeholder={t('pub.titulo_ph')} value={titulo} onChangeText={setTitulo} />
      {/* Diz porque é que o botão lá em baixo ainda está apagado. */}
      {!edicao && <Text style={styles.dica}>{t('pub.so_titulo')}</Text>}

      <Text style={styles.rotulo}>{t('pub.rotulo_desc')}</Text>
      <Campo
        placeholder={t('pub.desc_ph')}
        value={descricao}
        onChangeText={setDescricao}
        multiline
      />

      <Text style={styles.rotulo}>{t('pub.rotulo_categoria')}</Text>
      {categorias.length === 0 ? (
        <Text style={styles.nota}>{t('pub.sem_categorias')}</Text>
      ) : cats.length === 0 ? (
        // Por escolher: a porta do painel (as 12 áreas + busca vivem lá dentro).
        <Pressable style={styles.catCampo} onPress={() => setPainelAberto(true)}>
          <Feather name="tag" size={14} color={Honra.verde} />
          <Text style={styles.catCampoTxt}>{t('pub.categoria_ph')}</Text>
          <Feather name="chevron-down" size={15} color={Honra.tintaSuave} />
        </Pressable>
      ) : (
        // Escolhidas: pílulas verdes com ×; até 2, com a porta discreta da 2ª.
        <View style={styles.catsLinha}>
          {cats.map((c) => (
            <Pressable key={c.id} style={styles.catEscolhida} onPress={() => setPainelAberto(true)}>
              <Feather name="tag" size={13} color={Honra.creme} />
              <Text style={styles.catEscolhidaTxt} numberOfLines={1}>
                {c.nome}
              </Text>
              {/* padding real (não hitSlop): no web o hitSlop não estica o alvo. */}
              <Pressable
                onPress={() => setCats((atual) => atual.filter((x) => x.id !== c.id))}
                style={styles.catLimpar}
              >
                <Feather name="x" size={14} color={Honra.creme} />
              </Pressable>
            </Pressable>
          ))}
          {cats.length < 2 && (
            <Pressable style={styles.catMais} onPress={() => setPainelAberto(true)}>
              <Feather name="plus" size={13} color={Honra.verde} />
              <Text style={styles.catMaisTxt}>{t('pub.mais_categoria')}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );

  // ===== SE QUISERES — o opcional, tracejado, a PARECER opcional =====
  const blocoOpcional = (
    <View style={styles.bloco}>
      <Text style={styles.secaoLeve}>{t('pub.opcional')}</Text>
      <Text style={styles.nota}>{t('pub.nota_opcionais')}</Text>
      <View style={styles.caixaOpcional}>
        <Text style={styles.rotulo}>{t('pub.rotulo_valor')}</Text>
        <Campo
          placeholder={t('pub.valor_ph')}
          value={valor}
          onChangeText={setValor}
          keyboardType="decimal-pad"
        />
        <View style={styles.datas}>
          <View style={styles.dataCol}>
            <Text style={styles.rotulo}>{t('pub.rotulo_inicio')}</Text>
            <CampoData
              value={inicio}
              onChange={(data) => {
                setInicio(data);
                // Se o início saltar para lá do prazo, o prazo deixa de fazer sentido.
                if (data && prazo && prazo < data) setPrazo('');
              }}
              placeholder={t('pub.escolher')}
              minimo={pisoInicio}
              testID="data-inicio"
            />
          </View>
          <View style={styles.dataCol}>
            <Text style={styles.rotulo}>{t('pub.rotulo_prazo')}</Text>
            <CampoData
              value={prazo}
              onChange={setPrazo}
              placeholder={t('pub.escolher')}
              minimo={inicio || pisoInicio}
              testID="data-prazo"
            />
          </View>
        </View>
      </View>
    </View>
  );

  // ===== DEPOIS DE PUBLICARES — os três passos reais do ciclo =====
  // Só na criação: quem está a editar já viveu isto.
  const passos = [t('pub.passo1'), t('pub.passo2'), t('pub.passo3')];
  const painelDepois = !edicao && (
    <Cartao style={styles.depois}>
      <Text style={styles.depoisTitulo}>{t('pub.depois')}</Text>
      {passos.map((passo, i) => (
        <View key={passo} style={styles.passo}>
          <View style={styles.passoNum}>
            <Text style={styles.passoNumTxt}>{i + 1}</Text>
          </View>
          <Text style={styles.passoTxt}>{passo}</Text>
        </View>
      ))}
      {/* A verdade dita a tempo: sem identidade verificada não se abre
          orçamento a ninguém — e o caminho fica à mão. */}
      {!minhaIdVerificada && (
        <View style={styles.idAviso}>
          <Text style={styles.idAvisoTxt}>{t('pub.identidade_nota')}</Text>
          <Pressable onPress={() => router.push('/perfil')}>
            <Text style={styles.idAvisoLink}>{t('idverif.botao')} ›</Text>
          </Pressable>
        </View>
      )}
    </Cartao>
  );

  const remate = (
    <View style={styles.remate}>
      {erro && <Erro texto={erro} />}
      <Botao
        titulo={edicao ? t('pub.guardar') : t('pub.publicar')}
        onPress={publicar}
        aCarregar={aPublicar}
        desativado={!titulo.trim()}
      />
      {!edicao && <Text style={styles.remateNota}>{t('pub.editar_depois')}</Text>}
    </View>
  );

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <Pressable style={styles.voltar} onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.voltarTxt}>{t('comum.voltar_seta')}</Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={[styles.corpo, largo && styles.corpoLargo]}
        onLayout={(e) => setLarguraCorpo(e.nativeEvent.layout.width)}
      >
        <View style={styles.cabeca}>
          <Text style={styles.titulo}>{edicao ? t('pub.titulo_editar') : t('pub.titulo')}</Text>
          {/* A tese: o que distingue publicar AQUI. Facto, não folheto. */}
          {!edicao && <Text style={styles.subtitulo}>{t('pub.subtitulo')}</Text>}
        </View>

        {duasColunas ? (
          // SECRETÁRIA LARGA: o formulário à esquerda, o que vem a seguir à direita.
          <View style={styles.duasColunas}>
            <View style={styles.colPrincipal}>
              {blocoEssencial}
              {blocoOpcional}
              {remate}
            </View>
            <View style={styles.colLateral}>{painelDepois}</View>
          </View>
        ) : (
          // TELEMÓVEL: coluna única — o "depois" chega mesmo antes do gesto.
          <>
            {blocoEssencial}
            {blocoOpcional}
            {painelDepois}
            {remate}
          </>
        )}

        <PainelCategorias
          visivel={painelAberto}
          onFechar={() => setPainelAberto(false)}
          categorias={categorias}
          onEscolher={(e) =>
            setCats((atual) =>
              atual.some((c) => c.id === e.id) || atual.length >= 2 ? atual : [...atual, e]
            )
          }
          selecionadasIds={cats.map((c) => c.id)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  voltar: { paddingHorizontal: Espaco.md, paddingTop: Espaco.sm },
  voltarTxt: { color: Honra.verde, fontSize: 16, fontWeight: '700' },
  corpo: { padding: Espaco.xl, gap: Espaco.lg, paddingBottom: Espaco.xxl },
  corpoLargo: { width: '100%', maxWidth: 1080, alignSelf: 'center' },

  cabeca: { gap: Espaco.sm },
  titulo: { fontSize: 28, fontWeight: '800', color: Honra.tinta },
  subtitulo: { fontSize: 14.5, lineHeight: 21, color: Honra.tintaSuave, maxWidth: 460 },

  // Secretária: duas colunas com ar — o gesto à esquerda, o contexto à direita.
  duasColunas: { flexDirection: 'row', gap: Espaco.xl, alignItems: 'flex-start' },
  colPrincipal: { flex: 1, minWidth: 0, gap: Espaco.lg },
  colLateral: { width: 320, flexShrink: 0 },

  bloco: { gap: Espaco.sm },
  // Cabeça de secção: o essencial tem peso de tinta…
  secao: {
    color: Honra.tinta,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  // …e o opcional fala mais baixo. A hierarquia lê-se antes de se ler.
  secaoLeve: {
    color: Honra.tintaSuave,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  rotulo: {
    color: Honra.tintaSuave,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: Espaco.sm,
  },
  dica: { color: Honra.tintaSuave, fontSize: 12.5, marginTop: Espaco.xs },
  nota: { color: Honra.tintaSuave, fontSize: 13, lineHeight: 19 },

  // O opcional dentro de uma caixa TRACEJADA — o mesmo idioma da porta da 2.ª
  // categoria: um convite, não uma ordem. Sem fundo próprio: pesa menos.
  caixaOpcional: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Honra.cremeEscuro,
    borderRadius: Raio.md,
    padding: Espaco.md,
    paddingTop: Espaco.xs,
    marginTop: Espaco.xs,
  },

  catCampo: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.pill,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    paddingVertical: 8,
    paddingHorizontal: Espaco.md,
    marginTop: Espaco.xs,
  },
  catCampoTxt: { fontSize: 14, fontWeight: '600', color: Honra.tinta },
  catEscolhida: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Honra.verde,
    borderRadius: Raio.pill,
    paddingVertical: 8,
    paddingHorizontal: Espaco.md,
    maxWidth: '100%',
  },
  catEscolhidaTxt: { fontSize: 14, fontWeight: '700', color: Honra.creme, flexShrink: 1 },
  catLimpar: { padding: 10, margin: -10 },
  catsLinha: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Espaco.sm,
    marginTop: Espaco.xs,
  },
  // A porta da 2ª categoria — tracejada e serena, um convite, não uma ordem.
  catMais: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: Raio.pill,
    borderWidth: 1,
    borderColor: Honra.verde,
    borderStyle: 'dashed',
    paddingVertical: 8,
    paddingHorizontal: Espaco.md,
  },
  catMaisTxt: { fontSize: 13, fontWeight: '700', color: Honra.verde },
  datas: { flexDirection: 'row', gap: Espaco.md },
  dataCol: { flex: 1, minWidth: 0 },

  // O que vem a seguir — três passos, numerados em verde (verde = o que faz
  // avançar). Não é publicidade: é o ciclo que o código já executa.
  depois: { gap: Espaco.md },
  depoisTitulo: { color: Honra.tinta, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  passo: { flexDirection: 'row', alignItems: 'flex-start', gap: Espaco.md },
  passoNum: {
    width: 22,
    height: 22,
    borderRadius: Raio.pill,
    backgroundColor: Honra.verdeSuave,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  passoNumTxt: { color: Honra.verde, fontSize: 12, fontWeight: '800' },
  passoTxt: { flex: 1, minWidth: 0, color: Honra.tinta, fontSize: 14, lineHeight: 20 },
  // O aviso da identidade — fio em cima, voz baixa, caminho à mão.
  idAviso: {
    borderTopWidth: 1,
    borderTopColor: Honra.creme,
    paddingTop: Espaco.sm,
    gap: Espaco.xs,
  },
  idAvisoTxt: { color: Honra.tintaSuave, fontSize: 13, lineHeight: 19 },
  idAvisoLink: { color: Honra.verde, fontSize: 13, fontWeight: '700' },

  // O remate: o gesto e, por baixo, a saída de emergência (editar/fechar).
  remate: { gap: Espaco.sm, marginTop: Espaco.sm },
  remateNota: { color: Honra.tintaSuave, fontSize: 12.5, textAlign: 'center' },
});
