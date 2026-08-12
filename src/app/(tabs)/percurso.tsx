import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type DimensionValue,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Carregar, Cartao, confiancaPct, MoedaInsignia } from '@/components/ui';
import { nomeEscalao, useT, type ChaveI18n, type TFn } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { ESTADOS_HONRADOS } from '@/lib/contratante';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, LARGURA_SECRETARIA, Raio } from '@/theme/honra';
import {
  ESCALOES,
  estiloPrestigio,
  nivelDeCredencial,
  requisitosProximo,
  type Requisito,
} from '@/theme/prestigio';

/**
 * O TEU PERCURSO — o "quarto" de quem está no Honra (Vítor, 31/07): o sítio
 * onde a pessoa vê a SUA reputação a crescer. Não é um formulário de progresso;
 * é uma sala com uma peça ao centro.
 *
 * A ordem da sala:
 *   VITRINE  — a credencial (moeda) num nicho escuro que faz o ouro cantar.
 *              A nobreza da moldura NÃO é decorativa: lê-se de `estiloPrestigio`
 *              (a lei do prestígio §3), por isso o dourado escala com o escalão.
 *   JORNADA  — os 5 escalões como caminho com um ANTES (trilho cheio, degraus
 *              conquistados a peso inteiro) e um DEPOIS (trilho ténue). O que
 *              falta vive DENTRO do degrau atual, em barras de progresso — não
 *              em caixas por picar (uma caixa vazia humilha; uma barra que já
 *              tem um bocado feito diz a verdade sem humilhar).
 *   CONFIANÇA— a conduta (30% base · +5 honrado · −10 falha) com as zonas.
 *              NUNCA se confunde com as ESTRELAS, que são das críticas: está
 *              escrito, preto no branco, por baixo da barra.
 *   MARCOS   — a linha do tempo com datas REAIS da BD. O que não tem data não
 *              entra (as subidas de escalão ainda não se registam — dito na
 *              nota, não inventado).
 *   NÚMEROS  — o historial em linhas reais.
 *
 * Regra que não se quebra: nenhum número aqui é decorativo. Tudo deriva de
 * linhas da base de dados; o que não existe, não aparece.
 */

// Rótulo i18n de cada requisito do próximo escalão.
const REQ_TXT: Record<Requisito['chave'], ChaveI18n> = {
  verdes: 'percurso.req_verdes',
  honrados: 'percurso.req_honrados',
  confianca: 'percurso.req_confianca',
  recentes: 'percurso.req_recentes',
};

// Zonas da barra de Confiança (desenho travado 20/07: 30 base · 60 sólida · 90
// exemplar — condição dos escalões no rank vivo, por agora leitura honesta).
function zonaConfianca(pct: number): ChaveI18n {
  if (pct >= 90) return 'percurso.zona_exemplar';
  if (pct >= 60) return 'percurso.zona_solida';
  return 'percurso.zona_base';
}

// O ouro em transparência — a única forma de o dourado tocar o nicho escuro
// sem virar "bling". A opacidade é que escala com o escalão.
const OURO = (a: number) => `rgba(197, 164, 95, ${a})`;

// Entrada suave, uma só vez (a mesma curva/compasso do Início). O Honra mostra,
// não grita: sem laços, sem festa permanente.
const CURVA = Easing.bezier(0.2, 0.7, 0.2, 1);
const DURACAO = 900;

/** Um marco do percurso: só existe se tiver data REAL. */
type Marco = { chave: ChaveI18n; quando: number };

export default function Percurso() {
  const { session } = useAuth();
  const { t, idioma } = useT();
  const uid = session?.user.id;
  // SECRETÁRIA: a jornada ganha ar e duas colunas (a sala é maior, não é a
  // mesma coluna esticada). Telemóvel: coluna única, sem regressões.
  const { width } = useWindowDimensions();
  const largo = width >= LARGURA_SECRETARIA;

  const [aCarregar, setACarregar] = useState(true);
  const [perfil, setPerfil] = useState<{
    indice_confianca: number | null;
    negocios_honrados: number | null;
    negocios_falhados: number | null;
    criado_em: string | null;
  } | null>(null);
  // A recência vem da migração 067 — pode ainda não estar aplicada nesta BD.
  // Por isso vive numa leitura À PARTE e TOLERANTE: se a coluna não existir, o
  // marco simplesmente não nasce (nunca derruba o resto do ecrã).
  const [ultimoHonrado, setUltimoHonrado] = useState<string | null>(null);
  const [verdes, setVerdes] = useState(0);
  const [numAval, setNumAval] = useState(0);
  const [numAvalRecentes, setNumAvalRecentes] = useState(0);
  // Contrapartes DISTINTAS com quem já honrei (dos dois lados) — a diversidade,
  // o sinal que o conluio não compra.
  const [contrapartes, setContrapartes] = useState(0);
  const [trabalhosPub, setTrabalhosPub] = useState({ abertos: 0, fechados: 0 });
  // As DATAS que a BD já sabe provar — a matéria-prima dos marcos. Tudo
  // opcional: sem carimbo, o marco simplesmente não nasce.
  const [datas, setDatas] = useState<{
    primeiroSelo: string | null;
    credencial: string | null;
    primeiroHonrado: string | null;
    primeiraAval: string | null;
  }>({ primeiroSelo: null, credencial: null, primeiroHonrado: null, primeiraAval: null });

  const carregar = useCallback(() => {
    if (!uid) return;
    setACarregar(true);
    Promise.all([
      supabase
        .from('perfis')
        .select('indice_confianca, negocios_honrados, negocios_falhados, criado_em')
        .eq('id', uid)
        .single(),
      // `verificado_em` (schema base) é o carimbo de cada aba a acender.
      supabase.from('verificacoes').select('aba, estado, verificado_em').eq('perfil_id', uid),
      supabase.from('avaliacoes').select('criado_em').eq('para_perfil', uid),
      // `selado_em`/`aceite_em` (migração 005) datam o negócio; `criado_em` é a
      // âncora de recurso — a mesma régua do backfill da 067.
      supabase
        .from('orcamentos')
        .select('de_perfil, para_perfil, criado_em, selado_em, aceite_em')
        .or(`de_perfil.eq.${uid},para_perfil.eq.${uid}`)
        .in('estado', [...ESTADOS_HONRADOS]),
      supabase.from('trabalhos').select('estado').eq('autor_perfil', uid),
      supabase.from('perfis').select('ultimo_honrado_em').eq('id', uid).maybeSingle(),
    ]).then(([p, v, a, o, tr, uh]) => {
      setPerfil((p.data as typeof perfil) ?? null);
      const recencia = uh.data as { ultimo_honrado_em: string | null } | null;
      setUltimoHonrado(recencia?.ultimo_honrado_em ?? null);

      const verifs = (v.data as { estado: string; verificado_em: string | null }[]) ?? [];
      const acesas = verifs.filter((x) => x.estado === 'verificado');
      setVerdes(acesas.length);
      const carimbos = acesas
        .map((x) => x.verificado_em)
        .filter((d): d is string => !!d)
        .sort();

      const avals = (a.data as { criado_em: string }[]) ?? [];
      setNumAval(avals.length);
      const seisMeses = Date.now() - 182 * 86400000;
      setNumAvalRecentes(
        avals.filter((r) => new Date(r.criado_em).getTime() > seisMeses).length
      );

      const pares =
        (o.data as {
          de_perfil: string;
          para_perfil: string;
          criado_em: string;
          selado_em: string | null;
          aceite_em: string | null;
        }[]) ?? [];
      setContrapartes(
        new Set(pares.map((l) => (l.de_perfil === uid ? l.para_perfil : l.de_perfil))).size
      );
      const honrados = pares
        .map((l) => l.selado_em ?? l.aceite_em ?? l.criado_em)
        .filter((d): d is string => !!d)
        .sort();

      const trabs = (tr.data as { estado: string }[]) ?? [];
      setTrabalhosPub({
        abertos: trabs.filter((x) => x.estado === 'aberto').length,
        fechados: trabs.filter((x) => x.estado === 'fechado').length,
      });

      setDatas({
        primeiroSelo: carimbos[0] ?? null,
        // A credencial só fica "completa" com as 4 abas — o marco é o carimbo
        // da ÚLTIMA a acender. Sem as 4, o marco não existe.
        credencial: acesas.length >= 4 ? (carimbos[carimbos.length - 1] ?? null) : null,
        primeiroHonrado: honrados[0] ?? null,
        primeiraAval: avals.length
          ? avals.map((r) => r.criado_em).sort()[0]
          : null,
      });
      setACarregar(false);
    });
  }, [uid]);
  useFocusEffect(carregar);

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
  const nivel = nivelDeCredencial(sinais);
  const estilo = estiloPrestigio(nivel);
  const requisitos = requisitosProximo(sinais);
  const pct = confiancaPct(perfil?.negocios_honrados, perfil?.negocios_falhados);
  const loc = idioma === 'pt' ? 'pt-PT' : 'en-GB';
  const desde = perfil?.criado_em
    ? new Date(perfil.criado_em).toLocaleDateString(loc, { month: 'long', year: 'numeric' })
    : null;

  // ===== ENTRADA (uma só vez, quando os dados assentam) =====
  // Condutor JS de propósito: as barras animam LARGURAS em percentagem.
  const entrada = useRef(new Animated.Value(0)).current;
  const entrou = useRef(false);
  useEffect(() => {
    if (aCarregar || entrou.current) return;
    entrou.current = true;
    Animated.timing(entrada, {
      toValue: 1,
      duration: DURACAO,
      easing: CURVA,
      useNativeDriver: false,
    }).start();
  }, [aCarregar, entrada]);

  /** Uma barra que cresce da esquerda até à sua percentagem. */
  const largura = useCallback(
    (valor: number) =>
      entrada.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', `${Math.max(0, Math.min(100, valor))}%`],
      }),
    [entrada]
  );

  /** Cada bloco entra com o seu compasso — subir e assentar, nada mais. */
  const surgir = useCallback(
    (atraso: number) => {
      const fim = Math.min(1, atraso + 0.45);
      const janela = { inputRange: [atraso, fim], extrapolate: 'clamp' as const };
      return {
        opacity: entrada.interpolate({ ...janela, outputRange: [0, 1] }),
        transform: [{ translateY: entrada.interpolate({ ...janela, outputRange: [14, 0] }) }],
      };
    },
    [entrada]
  );

  // ===== MARCOS — só com data real; ordenados pelo tempo. =====
  const marcos = useMemo<Marco[]>(() => {
    const bruto: (Marco | null)[] = [
      perfil?.criado_em
        ? { chave: 'percurso.marco_entrada', quando: Date.parse(perfil.criado_em) }
        : null,
      datas.primeiroSelo
        ? { chave: 'percurso.marco_selo1', quando: Date.parse(datas.primeiroSelo) }
        : null,
      // A credencial completa só entra se for um MOMENTO distinto do 1º selo
      // (quem acendeu tudo de uma vez não merece a mesma linha duas vezes).
      datas.credencial && datas.credencial !== datas.primeiroSelo
        ? { chave: 'percurso.marco_credencial', quando: Date.parse(datas.credencial) }
        : null,
      datas.primeiroHonrado
        ? { chave: 'percurso.marco_honrado1', quando: Date.parse(datas.primeiroHonrado) }
        : null,
      datas.primeiraAval
        ? { chave: 'percurso.marco_aval1', quando: Date.parse(datas.primeiraAval) }
        : null,
      // O último honrado só é marco quando JÁ NÃO é o primeiro (senão repete).
      ultimoHonrado &&
      (!datas.primeiroHonrado ||
        Date.parse(ultimoHonrado) - Date.parse(datas.primeiroHonrado) > 86400000)
        ? { chave: 'percurso.marco_ultimo_honrado', quando: Date.parse(ultimoHonrado) }
        : null,
    ];
    return bruto
      .filter((m): m is Marco => !!m && Number.isFinite(m.quando))
      .sort((a, b) => a.quando - b.quando);
  }, [perfil, ultimoHonrado, datas]);

  // ===== OS BLOCOS DA SALA (montados uma vez, arrumados nas duas plantas) =====

  const vitrine = (
    <Animated.View style={surgir(0)}>
      <View
        style={[
          styles.vitrine,
          largo && styles.vitrineLarga,
          // A moldura lê a LEI do prestígio: a presença do ouro sobe com o
          // escalão e só começa a sentir-se em Reconhecido.
          {
            borderColor: OURO(0.12 + estilo.brilho * 0.13),
            borderWidth: estilo.moldura ? 2 : 1,
          },
        ]}
      >
        {/* Referência+: o segundo fio, por dentro — o "anel duplo" da lei. */}
        {estilo.anelDuplo ? (
          <View pointerEvents="none" style={[styles.vitrineAnel, { borderColor: OURO(0.22) }]} />
        ) : null}
        {/* Mestre: o monograma discreto no canto. */}
        {estilo.emblema ? <Text style={styles.vitrineEmblema}>H</Text> : null}

        <Text style={styles.vitrineRotulo}>{t('percurso.credencial')}</Text>
        {/* Reconhecido+: o hairline dourado que separa o rótulo da peça. */}
        {estilo.hairline ? (
          <View style={[styles.vitrineFio, { backgroundColor: OURO(0.3) }]} />
        ) : null}

        <MoedaInsignia nivel={nivel} tamanho={largo ? 190 : 160} />

        <Text style={styles.vitrineEscalao}>{nomeEscalao(t, ESCALOES[nivel])}</Text>
        {desde ? <Text style={styles.vitrineDesde}>{t('percurso.desde', { data: desde })}</Text> : null}
        <Text style={styles.vitrineDica}>{t('moeda.virar')}</Text>
      </View>
    </Animated.View>
  );

  const jornada = (
    <Animated.View style={surgir(0.12)}>
      <View style={styles.cabecaSeccao}>
        <Text style={styles.rotulo}>{t('percurso.jornada')}</Text>
        <Text style={styles.contaDegraus}>
          {t('percurso.conquistados', { n: nivel + 1, total: ESCALOES.length })}
        </Text>
      </View>

      <Cartao style={styles.blocoJornada}>
        {ESCALOES.map((e, i) => {
          const feito = i < nivel;
          const atual = i === nivel;
          const ultimo = i === ESCALOES.length - 1;
          return (
            <View key={e} style={styles.degrau}>
              {/* Coluna do trilho: o caminho andado fica CHEIO; o que falta,
                  ténue. É este contraste que dá o antes-e-depois. */}
              <View style={styles.trilhoCol}>
                <View
                  style={[
                    styles.marca,
                    feito && styles.marcaFeita,
                    atual && styles.marcaAtual,
                  ]}
                >
                  {feito ? <Text style={styles.marcaCheck}>✓</Text> : null}
                  {atual ? <View style={styles.marcaNucleo} /> : null}
                </View>
                {!ultimo ? (
                  <View style={[styles.trilho, feito && styles.trilhoFeito]} />
                ) : null}
              </View>

              <View style={[styles.degrauCorpo, ultimo && styles.degrauCorpoUltimo]}>
                <View style={styles.degrauCabeca}>
                  <Text
                    style={[
                      styles.degrauNome,
                      feito && styles.degrauNomeFeito,
                      atual && styles.degrauNomeAtual,
                    ]}
                  >
                    {nomeEscalao(t, e)}
                  </Text>
                  {feito ? (
                    <Text style={styles.degrauFeitoTxt}>{t('percurso.degrau_feito')}</Text>
                  ) : null}
                  {atual ? <Text style={styles.degrauAqui}>{t('percurso.aqui')}</Text> : null}
                </View>

                {/* O que falta vive DENTRO do degrau onde estamos. */}
                {atual ? (
                  requisitos ? (
                    <View style={styles.faltaCaixa}>
                      <Text style={styles.faltaTitulo}>
                        {t('percurso.para_proximo', {
                          escalao: nomeEscalao(t, ESCALOES[nivel + 1]),
                        })}
                      </Text>
                      {requisitos.map((r) => (
                        <BarraRequisito key={r.chave} r={r} t={t} largura={largura} />
                      ))}
                    </View>
                  ) : (
                    <View style={styles.faltaCaixa}>
                      <Text style={styles.topoTxt}>{t('percurso.topo')}</Text>
                    </View>
                  )
                ) : null}
              </View>
            </View>
          );
        })}
      </Cartao>
    </Animated.View>
  );

  const confianca = (
    <Animated.View style={surgir(0.24)}>
      <Text style={styles.rotulo}>{t('confianca.rotulo')}</Text>
      <Cartao style={styles.confBloco}>
        <View style={styles.confTopo}>
          <Text style={styles.confPct}>{pct}%</Text>
          <Text style={styles.confRegisto}>
            {t('confianca.registo', {
              h: perfil?.negocios_honrados ?? 0,
              f: perfil?.negocios_falhados ?? 0,
            })}
          </Text>
        </View>
        <View style={styles.confBarra}>
          <Animated.View style={[styles.confFill, { width: largura(pct) }]} />
          <View style={[styles.confTick, { left: '60%' as DimensionValue }]} />
          <View style={[styles.confTick, { left: '90%' as DimensionValue }]} />
        </View>
        {/* Os nomes das zonas, cada um no seu território da barra. */}
        <View style={styles.confZonas}>
          <Text style={[styles.confZonaTxt, styles.confZonaBase, pct < 60 && styles.confZonaAtiva]}>
            {t('percurso.z_base')}
          </Text>
          <Text
            style={[
              styles.confZonaTxt,
              styles.confZona60,
              pct >= 60 && pct < 90 && styles.confZonaAtiva,
            ]}
          >
            {t('percurso.z_solida')}
          </Text>
          <Text style={[styles.confZonaTxt, styles.confZona90, pct >= 90 && styles.confZonaAtiva]}>
            {t('percurso.z_exemplar')}
          </Text>
        </View>
        {/* A mecânica (+5/−10) NÃO se escreve — cotar a palavra distorce
            o propósito (Vítor, 20/07). Descobre-se a viver: a barra mexe. */}
        <Text style={styles.confDesc}>{t(zonaConfianca(pct))}</Text>
        {/* A fronteira que nunca se pode borrar: conduta ≠ estrelas. */}
        <Text style={styles.confNota}>{t('percurso.conf_conduta')}</Text>
      </Cartao>
    </Animated.View>
  );

  // Sem uma única data real não há linha do tempo — e não se inventa uma.
  const linhaDoTempo = marcos.length === 0 ? null : (
    <Animated.View style={surgir(0.34)}>
      <Text style={styles.rotulo}>{t('percurso.marcos')}</Text>
      <Cartao style={styles.blocoMarcos}>
        {marcos.map((m, i) => (
          <View key={m.chave} style={styles.marco}>
            <View style={styles.trilhoCol}>
              <View style={styles.marcoPonto} />
              {i < marcos.length - 1 ? <View style={styles.marcoTrilho} /> : null}
            </View>
            <View style={styles.marcoCorpo}>
              <Text style={styles.marcoTxt}>{t(m.chave)}</Text>
              <Text style={styles.marcoData}>
                {new Date(m.quando).toLocaleDateString(loc, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
            </View>
          </View>
        ))}
      </Cartao>
      <Text style={styles.notaFina}>{t('percurso.marcos_nota')}</Text>
    </Animated.View>
  );

  const numeros = (
    <Animated.View style={surgir(0.42)}>
      <Text style={styles.rotulo}>{t('percurso.numeros')}</Text>
      <View style={styles.grelha}>
        <Metrica
          n={perfil?.negocios_honrados ?? 0}
          rotulo={t('percurso.honrados')}
          verde={(perfil?.negocios_honrados ?? 0) > 0}
        />
        <Metrica n={perfil?.negocios_falhados ?? 0} rotulo={t('percurso.falhas')} />
        <Metrica n={contrapartes} rotulo={t('percurso.contrapartes')} verde={contrapartes > 1} />
        <Metrica n={numAval} rotulo={t('percurso.avaliacoes')} />
        <Metrica n={trabalhosPub.abertos} rotulo={t('percurso.trab_abertos')} />
        <Metrica n={trabalhosPub.fechados} rotulo={t('percurso.trab_fechados')} />
      </View>
      <Text style={styles.nota}>{t('percurso.nota')}</Text>
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <Pressable style={styles.voltar} onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.voltarTxt}>{t('comum.voltar_seta')}</Text>
      </Pressable>

      {aCarregar && !perfil ? (
        <Carregar />
      ) : (
        <ScrollView contentContainerStyle={[styles.corpo, largo && styles.corpoLargo]}>
          <Text style={styles.titulo}>{t('percurso.titulo')}</Text>

          {largo ? (
            // SECRETÁRIA: a peça e a conduta de um lado; o caminho do outro.
            <View style={styles.duasColunas}>
              <View style={styles.colEsq}>
                {vitrine}
                {confianca}
                {numeros}
              </View>
              <View style={styles.colDir}>
                {jornada}
                {linhaDoTempo}
              </View>
            </View>
          ) : (
            <>
              {vitrine}
              {jornada}
              {confianca}
              {linhaDoTempo}
              {numeros}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/**
 * Um requisito do próximo escalão como BARRA, não como caixa por picar: mostra
 * o que já está andado (o pedaço cheio) e diz com precisão o que falta. Uma
 * caixa vazia diz "não tens nada"; uma barra a um terço diz a verdade.
 */
function BarraRequisito({
  r,
  t,
  largura,
}: {
  r: Requisito;
  t: TFn;
  largura: (valor: number) => Animated.AnimatedInterpolation<string | number>;
}) {
  const dec = false; // nenhum requisito é decimal desde 01/08 (honrados e % são inteiros)
  const pct = r.alvo > 0 ? Math.min(100, (r.atual / r.alvo) * 100) : 0;
  return (
    <View style={styles.req}>
      <View style={styles.reqTopo}>
        <Text style={[styles.reqTxt, r.feito && styles.reqTxtFeito]}>{t(REQ_TXT[r.chave])}</Text>
        <Text style={[styles.reqNum, r.feito && styles.reqNumFeito]}>
          {r.feito
            ? '✓'
            : t('percurso.req_de', {
                atual: dec ? r.atual.toFixed(1) : r.atual,
                alvo: dec ? r.alvo.toFixed(1) : r.alvo,
              })}
        </Text>
      </View>
      <View style={styles.reqBarra}>
        <Animated.View
          style={[styles.reqFill, r.feito && styles.reqFillFeito, { width: largura(pct) }]}
        />
      </View>
    </View>
  );
}

function Metrica({ n, rotulo, verde }: { n: number; rotulo: string; verde?: boolean }) {
  return (
    <View style={styles.metrica}>
      <Text style={[styles.metricaNum, verde && styles.metricaNumVerde]}>{n}</Text>
      <Text style={styles.metricaRotulo}>{rotulo}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  voltar: { paddingHorizontal: Espaco.md, paddingTop: Espaco.sm },
  voltarTxt: { color: Honra.verde, fontSize: 16, fontWeight: '700' },
  corpo: { padding: Espaco.xl, gap: Espaco.md, paddingBottom: Espaco.xxl },
  corpoLargo: { width: '100%', maxWidth: 1080, alignSelf: 'center' },
  titulo: { fontSize: 28, fontWeight: '800', color: Honra.tinta },
  rotulo: {
    color: Honra.tintaSuave,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: Espaco.xs,
    marginBottom: Espaco.sm,
  },

  // Secretária: duas colunas, a sala respira.
  duasColunas: { flexDirection: 'row', gap: Espaco.xl, alignItems: 'flex-start' },
  colEsq: { flex: 1, gap: Espaco.md },
  colDir: { flex: 1.15, gap: Espaco.md },

  // ===== VITRINE — o nicho escuro onde a moeda é a peça, não um ícone. =====
  vitrine: {
    backgroundColor: '#0C2C1F',
    borderRadius: Raio.lg,
    paddingVertical: Espaco.lg,
    paddingHorizontal: Espaco.md,
    alignItems: 'center',
    gap: Espaco.xs,
    // Sem `overflow: hidden` de propósito: a moeda vira em 3D (rotateY) e um
    // recorte no pai baralha o backface em alguns browsers.
  },
  vitrineLarga: { paddingVertical: Espaco.xl },
  vitrineAnel: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderRadius: Raio.md,
    borderWidth: 1,
  },
  vitrineEmblema: {
    position: 'absolute',
    top: Espaco.sm,
    right: Espaco.md,
    color: OURO(0.45),
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  vitrineRotulo: {
    color: Honra.douradoClaro,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    opacity: 0.75,
  },
  vitrineFio: { height: 1, width: 44, marginTop: Espaco.xs },
  vitrineEscalao: {
    color: Honra.creme,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginTop: Espaco.xs,
  },
  vitrineDesde: { color: Honra.verdeSuave, fontSize: 13, opacity: 0.75 },
  vitrineDica: {
    color: Honra.douradoClaro,
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.5,
    marginTop: Espaco.sm,
  },

  // ===== JORNADA =====
  cabecaSeccao: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  // "{n} de 5 degraus conquistados" — contagem de factos, logo verde.
  contaDegraus: { fontSize: 12, fontWeight: '700', color: Honra.verde, marginBottom: Espaco.sm },
  blocoJornada: { paddingVertical: Espaco.md },
  degrau: { flexDirection: 'row', gap: Espaco.md, alignItems: 'stretch' },
  trilhoCol: { alignItems: 'center', width: 22 },
  marca: {
    width: 22,
    height: 22,
    borderRadius: Raio.pill,
    borderWidth: 1.5,
    borderColor: Honra.cremeEscuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Conquistado = VERDE, não ouro. Um degrau vencido é um FACTO PROVADO — a
  // mesma gramática do ✓ verde da identidade verificada. Se o ouro marcasse
  // todos os degraus já feitos, quem acabou de se verificar via ouro logo no
  // primeiro, e o ouro deixava de escalar com o escalão (lei do prestígio) ao
  // mesmo tempo que passava a ter duas funções (lei "uma cor, uma função").
  // O ouro fica reservado a ONDE ESTÁS — e como o sítio onde estás sobe, o
  // ouro escala sozinho, sem regra nenhuma a impô-lo.
  marcaFeita: { backgroundColor: Honra.verde, borderColor: Honra.verde },
  marcaCheck: { color: Honra.creme, fontSize: 12, fontWeight: '900' },
  marcaAtual: { borderColor: Honra.dourado, borderWidth: 2, backgroundColor: Honra.brancoCreme },
  marcaNucleo: { width: 8, height: 8, borderRadius: Raio.pill, backgroundColor: Honra.dourado },
  // O trilho: cheio no que ficou para trás, ténue no que falta.
  trilho: { flex: 1, width: 2, backgroundColor: Honra.cremeEscuro, marginVertical: 2 },
  trilhoFeito: { backgroundColor: Honra.verde, opacity: 0.5 },
  degrauCorpo: { flex: 1, paddingBottom: Espaco.md },
  degrauCorpoUltimo: { paddingBottom: 0 },
  degrauCabeca: { flexDirection: 'row', alignItems: 'center', gap: Espaco.sm, minHeight: 22 },
  degrauNome: { flex: 1, fontSize: 15, color: Honra.tintaSuave, fontWeight: '600' },
  // O passado pesa tanto como o futuro: mesmo corpo, mesma tinta.
  degrauNomeFeito: { color: Honra.tinta, fontWeight: '700' },
  degrauNomeAtual: { color: Honra.tinta, fontWeight: '800', fontSize: 17 },
  // "Conquistado" fala verde (é facto); "ESTÁS AQUI" fala ouro (é prestígio).
  degrauFeitoTxt: { fontSize: 11, fontWeight: '700', color: Honra.verde, opacity: 0.9 },
  degrauAqui: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, color: Honra.dourado },

  // O que falta — dentro do degrau onde se está.
  faltaCaixa: {
    marginTop: Espaco.sm,
    gap: Espaco.sm,
    backgroundColor: Honra.creme,
    borderRadius: Raio.md,
    padding: Espaco.md,
  },
  faltaTitulo: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: Honra.tintaSuave },
  req: { gap: 5 },
  reqTopo: { flexDirection: 'row', alignItems: 'baseline', gap: Espaco.sm },
  reqTxt: { flex: 1, fontSize: 13, color: Honra.tinta, fontWeight: '600' },
  reqTxtFeito: { color: Honra.tintaSuave },
  reqNum: { fontSize: 13, fontWeight: '800', color: Honra.tinta },
  reqNumFeito: { color: Honra.verde },
  reqBarra: {
    height: 5,
    borderRadius: Raio.pill,
    backgroundColor: Honra.cremeEscuro,
    overflow: 'hidden',
  },
  // Verde = ação/progresso (o que ainda se anda). O ouro fica para o prestígio.
  reqFill: { height: '100%', borderRadius: Raio.pill, backgroundColor: Honra.verde },
  reqFillFeito: { opacity: 0.45 },
  topoTxt: { fontSize: 14, color: Honra.tinta, lineHeight: 21 },

  // ===== CONFIANÇA =====
  confBloco: { gap: Espaco.sm },
  confTopo: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  confPct: { fontSize: 24, fontWeight: '800', color: Honra.verde },
  confRegisto: { fontSize: 13, color: Honra.tintaSuave, fontWeight: '600' },
  confBarra: {
    height: 10,
    borderRadius: Raio.pill,
    backgroundColor: Honra.cremeEscuro,
    overflow: 'hidden',
  },
  confFill: { height: '100%', borderRadius: Raio.pill, backgroundColor: Honra.verde },
  confTick: { position: 'absolute', top: 0, bottom: 0, width: 1.5, backgroundColor: Honra.creme },
  confZonas: { height: 16 },
  // Sem `left` no estilo base: no merge do RN, `undefined` não anula um left
  // herdado — cada zona carrega a SUA posição.
  confZonaTxt: {
    position: 'absolute',
    fontSize: 11,
    fontWeight: '600',
    color: Honra.tintaSuave,
    opacity: 0.7,
  },
  confZonaBase: { left: 0 },
  confZona60: { left: '60%' as DimensionValue },
  confZona90: { right: 0 },
  confZonaAtiva: { color: Honra.verde, fontWeight: '800', opacity: 1 },
  confDesc: { fontSize: 13, color: Honra.tinta, fontWeight: '600' },
  confNota: { fontSize: 12, color: Honra.tintaSuave, lineHeight: 17 },

  // ===== MARCOS =====
  blocoMarcos: { paddingVertical: Espaco.md },
  marco: { flexDirection: 'row', gap: Espaco.md, alignItems: 'stretch' },
  marcoPonto: {
    width: 9,
    height: 9,
    borderRadius: Raio.pill,
    backgroundColor: Honra.dourado,
    marginTop: 5,
  },
  marcoTrilho: { flex: 1, width: 2, backgroundColor: Honra.cremeEscuro, marginVertical: 3 },
  marcoCorpo: { flex: 1, paddingBottom: Espaco.md, gap: 1 },
  marcoTxt: { fontSize: 14, color: Honra.tinta, fontWeight: '700' },
  marcoData: { fontSize: 12, color: Honra.tintaSuave },
  notaFina: { fontSize: 12, color: Honra.tintaSuave, lineHeight: 17, marginTop: Espaco.sm },

  // ===== NÚMEROS =====
  grelha: { flexDirection: 'row', flexWrap: 'wrap', gap: Espaco.sm },
  metrica: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.md,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    padding: Espaco.md,
    gap: 2,
  },
  metricaNum: { color: Honra.tinta, fontSize: 24, fontWeight: '800', lineHeight: 28 },
  metricaNumVerde: { color: Honra.verde },
  metricaRotulo: { color: Honra.tintaSuave, fontSize: 11, fontWeight: '600' },
  nota: { fontSize: 12, color: Honra.tintaSuave, lineHeight: 17, marginTop: Espaco.sm },
});
