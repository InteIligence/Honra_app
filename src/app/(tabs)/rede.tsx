import { router, useFocusEffect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Botao, Carregar, Cartao, Erro, formatarData } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useRede } from '@/lib/contratante';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, LARGURA_SECRETARIA, Raio } from '@/theme/honra';

/**
 * A REDE DE CONFIANÇA — os profissionais com quem JÁ se honrou negócios.
 * Não é uma lista de contactos: é história provada (derivada dos orçamentos
 * honrados como cliente, nunca declarada). Cada linha leva de volta ao perfil,
 * onde o "Voltar a contratar" é o pedir orçamento de sempre — simples e honesto.
 *
 * Escondido da barra (href: null, como convites/agenda); entra-se pelo Início
 * da empresa e pelo perfil próprio. É geral: uma pessoa que contrate também
 * constrói rede.
 *
 * DESENHO (31/07) — o cartão passou a ter DOIS ANDARES. Antes era uma linha
 * só: avatar + texto + botão "Voltar a contratar", tudo a disputar a mesma
 * largura. O botão (pílula com 3 palavras, que não encolhe) comia ~130px dos
 * ~290px do telemóvel e esmagava a coluna do meio: o nome truncava ao 3.º
 * caracter e a prova partia-se letra a letra numa coluna de dedo. Agora:
 *   1.º andar — avatar · nome/função (coluna elástica, minWidth 0) · a PROVA
 *               como número (largura fixa e pequena, ao jeito da Pesquisa);
 *   2.º andar — data do último negócio + a pílula de ação, numa linha que
 *               ENVOLVE (flexWrap): se não couber, a pílula desce sozinha.
 * Nenhum elemento pode voltar a roubar a largura do texto.
 */
export default function Rede() {
  const { session } = useAuth();
  const { t } = useT();
  const uid = session?.user.id;
  const { membros, aCarregar, erro, carregar } = useRede(uid);
  // Selo mini: quem, na rede, tem a identidade verificada (✓ junto ao nome).
  const [verificados, setVerificados] = useState<Set<string>>(new Set());
  // Quem está a aceitar trabalho agora — o ponto verde da Pesquisa. Num ecrã
  // que existe para VOLTAR a contratar, saber quem está disponível é o sinal
  // mais útil que a base de dados tem para dar (nunca inventado: se a consulta
  // falhar, o ponto simplesmente não aparece).
  const [disponiveis, setDisponiveis] = useState<Set<string>>(new Set());
  // SECRETÁRIA: a rede ganha ar (margens e limite de leitura).
  const { width } = useWindowDimensions();
  const largo = width >= LARGURA_SECRETARIA;
  // A GRELHA de 2 colunas não pode decidir-se pela largura da JANELA: no
  // browser o rail come ~90px e o átrio limita a coluna, pelo que uma janela
  // de 1280 dá pouco mais de 700 ao corpo — duas colunas aí voltariam a
  // apertar o nome. Mede-se o corpo REAL e só se abre a segunda coluna quando
  // cada cartão fica com largura de gente.
  const [larguraCorpo, setLarguraCorpo] = useState(0);
  const duasColunas = larguraCorpo >= 820;

  useFocusEffect(carregar);

  useEffect(() => {
    const ids = membros.map((m) => m.id);
    if (ids.length === 0) return;
    let vivo = true;
    supabase
      .from('verificacoes')
      .select('perfil_id')
      .eq('aba', 'identidade')
      .eq('estado', 'verificado')
      .in('perfil_id', ids)
      .then(({ data }) => {
        if (vivo) setVerificados(new Set(((data as any[]) ?? []).map((v) => v.perfil_id as string)));
      });
    supabase
      .from('perfis')
      .select('id, disponibilidade')
      .in('id', ids)
      .then(({ data }) => {
        if (!vivo) return;
        setDisponiveis(
          new Set(
            ((data as any[]) ?? [])
              .filter((p) => p.disponibilidade === 'disponivel')
              .map((p) => p.id as string)
          )
        );
      });
    return () => {
      vivo = false;
    };
  }, [membros]);

  // O peso da rede inteira — soma REAL dos negócios honrados com estas pessoas.
  const totalHonrados = membros.reduce((soma, m) => soma + m.vezes, 0);

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <View style={styles.topo}>
        <Text style={styles.voltar} onPress={() => router.back()}>
          {t('comum.voltar_seta')}
        </Text>
        <Text style={styles.titulo}>{t('rede.titulo')}</Text>
        <View style={{ width: 60 }} />
      </View>

      {aCarregar ? (
        <Carregar />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.corpo, largo && styles.corpoLargo]}
          onLayout={(e) => setLarguraCorpo(e.nativeEvent.layout.width)}
        >
          {erro && <Erro texto={erro} />}

          {/* A LEI DO ECRÃ — deixou de ser rodapé perdido: é a primeira coisa
              que se lê, marcada por um fio verde (verde = significado: aqui o
              significado é a prova). Vale nos dois estados, cheio e vazio. */}
          <View style={styles.tese}>
            <Text style={styles.teseTxt}>{t('rede.nota')}</Text>
          </View>

          {membros.length === 0 ? (
            // Estado vazio honesto — a rede não se compra, constrói-se.
            <View style={styles.vazio}>
              <Text style={styles.vazioTitulo}>{t('rede.vazio_titulo')}</Text>
              <Text style={styles.vazioTxt}>{t('rede.vazio_txt')}</Text>
              <Botao
                titulo={t('rede.ir_pesquisa')}
                variante="secundario"
                onPress={() => router.push('/pesquisar')}
                style={styles.vazioBotao}
              />
            </View>
          ) : (
            <>
              {/* Cabeça da lista: quem à esquerda, quanto à direita. Os dois
                  números saem dos mesmos dados — nada é estimado. */}
              <View style={styles.rotuloLinha}>
                <Text style={styles.rotulo}>
                  {membros.length === 1 ? t('rede.um') : t('rede.varios', { n: membros.length })}
                </Text>
                <Text style={styles.rotuloTotal}>
                  {totalHonrados === 1
                    ? t('rede.total_um')
                    : t('rede.total_varios', { n: totalHonrados })}
                </Text>
              </View>

              <View style={duasColunas ? styles.grelha : styles.coluna}>
                {membros.map((m) => {
                  const nome = m.nome ?? t('rede.sem_nome');
                  const juntos =
                    m.vezes === 1 ? t('rede.honraram_um') : t('rede.honraram', { n: m.vezes });
                  return (
                    <Cartao
                      key={m.id}
                      style={[styles.cartao, duasColunas && styles.cartaoLargo]}
                      onPress={() => router.push(`/perfil/${m.id}`)}
                    >
                      {/* 1.º ANDAR — quem é, e a prova em número. */}
                      <View style={styles.andarTopo}>
                        <Avatar
                          iniciais={m.avatar}
                          imagem={
                            m.avatar_url
                              ? supabase.storage.from('avatares').getPublicUrl(m.avatar_url).data
                                  .publicUrl
                              : null
                          }
                          tamanho={44}
                        />
                        {/* minWidth:0 é o que deixa o texto encolher em vez de
                            empurrar a linha (a causa raiz do cartão partido). */}
                        <View style={styles.meio}>
                          <View style={styles.nomeLinha}>
                            <Text style={styles.nome} numberOfLines={1}>
                              {nome}
                            </Text>
                            {verificados.has(m.id) && <Text style={styles.selo}>✓</Text>}
                            {disponiveis.has(m.id) && (
                              <View
                                style={styles.dispDot}
                                accessibilityLabel={t('rede.disponivel')}
                              />
                            )}
                          </View>
                          <Text style={styles.sub} numberOfLines={1}>
                            {m.papel ?? t('rede.sem_funcao')}
                          </Text>
                        </View>
                        {/* A PROVA — mostrar, não dizer: o número em verde, a
                            palavra pequena por baixo. Largura pequena e fixa,
                            nunca disputa o espaço do nome. A frase inteira vai
                            para o leitor de ecrã. */}
                        <View
                          style={styles.prova}
                          accessible
                          accessibilityLabel={juntos}
                        >
                          <Text style={styles.provaNum}>{m.vezes}</Text>
                          <Text style={styles.provaTxt}>
                            {m.vezes === 1 ? t('rede.stat_um') : t('rede.stat_varios')}
                          </Text>
                        </View>
                      </View>

                      {/* 2.º ANDAR — a história (quando) e a ação. Envolve: se a
                          pílula não couber ao lado da data, desce para baixo em
                          vez de esmagar seja o que for. */}
                      <View style={styles.andarBaixo}>
                        {m.ultimoEm ? (
                          <Text style={styles.ultimo} numberOfLines={1}>
                            {t('rede.ultimo', { data: formatarData(m.ultimoEm.slice(0, 10)) })}
                          </Text>
                        ) : (
                          <View style={styles.ultimoVazio} />
                        )}
                        {/* Voltar a contratar → o perfil, onde o pedir orçamento já vive. */}
                        <Pressable
                          style={styles.contratar}
                          onPress={() => router.push(`/perfil/${m.id}`)}
                          accessibilityRole="button"
                          accessibilityLabel={t('rede.a11y_contratar', {
                            nome: m.nome ?? t('rede.este_profissional'),
                          })}
                        >
                          <Text style={styles.contratarTxt}>{t('rede.voltar_contratar')}</Text>
                        </Pressable>
                      </View>
                    </Cartao>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      )}
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
    paddingTop: Espaco.sm,
  },
  voltar: { color: Honra.verde, fontSize: 16, fontWeight: '700', width: 60 },
  titulo: { fontSize: 20, fontWeight: '800', color: Honra.tinta },

  // Telemóvel: margem de 24 (a do Início) em vez de 32 — cada ponto de largura
  // que a moldura devolve é largura que o NOME ganha. Na secretária, o ar volta.
  corpo: { padding: Espaco.lg, gap: Espaco.md, paddingBottom: Espaco.xxl },
  corpoLargo: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    paddingHorizontal: Espaco.xl,
  },

  // A tese do ecrã — fio verde à esquerda, texto sereno. Não é um cartão: é
  // uma nota de rodapé promovida a lei da casa.
  tese: {
    borderLeftWidth: 2,
    borderLeftColor: Honra.verde,
    paddingLeft: Espaco.md,
    paddingVertical: 2,
    marginBottom: Espaco.xs,
  },
  teseTxt: { color: Honra.tintaSuave, fontSize: 13.5, lineHeight: 20 },

  // Cabeça da lista: rótulo à esquerda, peso total à direita.
  // Envolve em vez de partir o rótulo a meio: se os dois não couberem lado a
  // lado, o total desce inteiro para a linha de baixo, encostado à direita.
  rotuloLinha: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: Espaco.xs,
  },
  rotulo: {
    color: Honra.tintaSuave,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    flexShrink: 0,
  },
  rotuloTotal: {
    color: Honra.verde,
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 0,
    marginLeft: 'auto',
  },

  coluna: { gap: Espaco.sm },
  // Secretária: cartões da rede em grelha de 2 colunas — com um mínimo, para
  // a coluna nunca voltar a ficar estreita ao ponto de partir o texto.
  grelha: { flexDirection: 'row', flexWrap: 'wrap', gap: Espaco.md },
  cartaoLargo: { flexBasis: '48%', flexGrow: 1, minWidth: 360 },

  cartao: { gap: Espaco.sm },
  andarTopo: { flexDirection: 'row', alignItems: 'center', gap: Espaco.md },
  // flex:1 + minWidth:0 → a coluna do texto encolhe (com reticências) em vez
  // de empurrar os vizinhos. Sem isto, nomes longos partem o cartão.
  meio: { flex: 1, minWidth: 0 },
  nomeLinha: { flexDirection: 'row', alignItems: 'center', gap: Espaco.xs },
  nome: { fontSize: 16, fontWeight: '700', color: Honra.tinta, flexShrink: 1 },
  selo: { color: Honra.verde, fontWeight: '800', flexShrink: 0 },
  // Ponto de disponibilidade — a esfera da Pesquisa, mesma língua.
  dispDot: {
    width: 8,
    height: 8,
    borderRadius: Raio.pill,
    backgroundColor: Honra.verde,
    flexShrink: 0,
  },
  sub: { fontSize: 13, color: Honra.tintaSuave, marginTop: 1 },

  // A prova em número — verde com significado, largura própria, não encolhe.
  prova: { alignItems: 'center', flexShrink: 0, minWidth: 44 },
  provaNum: { fontSize: 20, fontWeight: '800', color: Honra.verde, lineHeight: 23 },
  provaTxt: { fontSize: 10.5, fontWeight: '700', color: Honra.tintaSuave },

  // 2.º andar — separado por um fio; envolve em vez de esmagar.
  andarBaixo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espaco.sm,
    borderTopWidth: 1,
    borderTopColor: Honra.creme,
    paddingTop: Espaco.sm,
  },
  ultimo: { fontSize: 12, color: Honra.tintaSuave, flexShrink: 0 },
  ultimoVazio: { flexShrink: 0 },
  contratar: {
    borderWidth: 1,
    borderColor: Honra.verde,
    borderRadius: Raio.pill,
    paddingHorizontal: Espaco.md,
    paddingVertical: 6,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  contratarTxt: { color: Honra.verde, fontSize: 12, fontWeight: '700' },

  // Estado vazio — voz Honra, sem drama.
  vazio: { alignItems: 'center', gap: Espaco.sm, paddingTop: Espaco.xl },
  vazioTitulo: { fontSize: 18, fontWeight: '800', color: Honra.tinta },
  vazioTxt: {
    textAlign: 'center',
    color: Honra.tintaSuave,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 300,
  },
  vazioBotao: { marginTop: Espaco.md, alignSelf: 'stretch' },
});
