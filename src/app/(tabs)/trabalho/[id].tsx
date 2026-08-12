import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Botao, Campo, Carregar, Cartao, Chip, Erro, formatarData } from '@/components/ui';
import { useT } from '@/i18n';
import { useIdentidadeVerificada } from '@/lib/identidade';
import { useTrabalho } from '@/lib/trabalho';
import { Espaco, Honra } from '@/theme/honra';

/**
 * Detalhe de um trabalho do mural (contrato: `@/lib/trabalho`).
 * Quem não é autor candidata-se; o autor vê as candidaturas e abre orçamento
 * (entra no ciclo da caução já existente). Segue o padrão de `projeto/[id]`.
 */
export default function TrabalhoDetalhe() {
  const { t } = useT();
  // `de=pub`: cheguei aqui acabado de publicar — o Voltar leva ao Início
  // (voltar ao formulário seria um beco: o trabalho "já está feito").
  const { id, de } = useLocalSearchParams<{ id: string; de?: string }>();
  const {
    trabalho,
    souAutor,
    candidaturas,
    jaCandidatei,
    aCarregar,
    erroCarregar,
    erro,
    aProcessar,
    carregar,
    accoes,
  } = useTrabalho(id);

  // Mensagem da candidatura — vive aqui, no detalhe.
  const [mensagem, setMensagem] = useState('');
  // Abrir um orçamento a um candidato cria um pedido — e pedir exige
  // identidade verificada (fuga C, migração 043).
  const { verificada: minhaIdVerificada } = useIdentidadeVerificada();

  useFocusEffect(useCallback(() => carregar(), [carregar]));

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      {/* Cabeçalho: Voltar à esquerda; para o AUTOR de um trabalho ainda aberto,
          um lápis discreto à direita (o padrão convencional de editar). */}
      <View style={styles.cabecalho}>
        <Pressable
          onPress={() => (de === 'pub' ? router.replace('/inicio') : router.back())}
          hitSlop={8}
        >
          <Text style={styles.voltarTxt}>{t('comum.voltar_seta')}</Text>
        </Pressable>
        {souAutor && trabalho?.estado === 'aberto' && (
          <Pressable
            onPress={() => router.push(`/publicar-trabalho?id=${id}`)}
            hitSlop={10}
            accessibilityLabel={t('trabalho.editar')}
          >
            <Feather name="edit-2" size={20} color={Honra.verde} />
          </Pressable>
        )}
      </View>

      {aCarregar ? (
        <Carregar />
      ) : erroCarregar || !trabalho ? (
        <View style={styles.centro}>
          <Erro texto={erroCarregar ?? t('trabalho.nao_encontrado')} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.corpo}>
          {/* CABEÇALHO — título, categoria, autor, descrição */}
          <Text style={styles.titulo}>{trabalho.titulo}</Text>

          {/* O estado só fala quando tem novidade: aberto é o normal e cala-se.
              A decorrer/concluído são FACTOS que o anúncio herda do aperto (058)
              — ninguém os escreve à mão. */}
          {trabalho.estado !== 'aberto' && (
            <View style={styles.estadoLinha}>
              <View
                style={[
                  styles.estadoPill,
                  trabalho.estado === 'a_decorrer' && styles.estadoPillVivo,
                ]}
              >
                <Text
                  style={[
                    styles.estadoTxt,
                    trabalho.estado === 'a_decorrer' && styles.estadoTxtVivo,
                  ]}
                >
                  {t(
                    trabalho.estado === 'a_decorrer'
                      ? 'trabalho.estado_a_decorrer'
                      : trabalho.estado === 'concluido'
                        ? 'trabalho.estado_concluido'
                        : 'trabalho.estado_fechado',
                  )}
                </Text>
              </View>
              {/* Do anúncio para o projeto vivo: o autor não tem de o ir caçar. */}
              {souAutor && trabalho.orcamento_selado && trabalho.estado !== 'fechado' && (
                <Pressable onPress={() => router.push(`/projeto/${trabalho.orcamento_selado}`)}>
                  <Text style={styles.verProjeto}>{t('trabalho.ver_projeto')}</Text>
                </Pressable>
              )}
            </View>
          )}

          {trabalho.categoria?.nome || trabalho.categoria2?.nome ? (
            <View style={styles.chipsCat}>
              {trabalho.categoria?.nome ? <Chip texto={trabalho.categoria.nome} /> : null}
              {trabalho.categoria2?.nome ? <Chip texto={trabalho.categoria2.nome} /> : null}
            </View>
          ) : null}

          <Pressable
            style={styles.autor}
            onPress={() => router.push(`/perfil/${trabalho.autor_perfil}`)}
          >
            <Text style={styles.autorRotulo}>{t('trabalho.publicado_por')}</Text>
            <Text style={styles.autorNome}>{trabalho.autor?.nome ?? t('trabalho.alguem')}</Text>
            <Text style={styles.verPerfil}>{t('trabalho.ver_perfil')}</Text>
          </Pressable>

          {trabalho.descricao ? (
            <Cartao style={styles.bloco}>
              <Text style={styles.desc}>{trabalho.descricao}</Text>
            </Cartao>
          ) : null}

          {/* Orçamento estimado + datas (só o que foi preenchido). */}
          {(trabalho.orcamento_valor != null || trabalho.data_inicio || trabalho.prazo) && (
            <Cartao style={styles.bloco}>
              {trabalho.orcamento_valor != null && (
                <View style={styles.linha}>
                  <Text style={styles.linhaRotulo}>{t('trabalho.orc_estimado')}</Text>
                  <Text style={styles.linhaValor}>{trabalho.orcamento_valor}€</Text>
                </View>
              )}
              {trabalho.data_inicio && (
                <View style={styles.linha}>
                  <Text style={styles.linhaRotulo}>{t('trabalho.inicio')}</Text>
                  <Text style={styles.linhaValor}>{formatarData(trabalho.data_inicio)}</Text>
                </View>
              )}
              {trabalho.prazo && (
                <View style={styles.linha}>
                  <Text style={styles.linhaRotulo}>{t('trabalho.prazo')}</Text>
                  <Text style={styles.linhaValor}>{formatarData(trabalho.prazo)}</Text>
                </View>
              )}
            </Cartao>
          )}

          {erro && <Erro texto={erro} />}

          {/* ===== NÃO sou o autor: candidatar-me ===== */}
          {!souAutor && trabalho.estado === 'aberto' && (
            <View style={styles.bloco}>
              {jaCandidatei ? (
                <>
                  <Text style={styles.enviada}>{t('trabalho.cand_enviada')}</Text>
                  <Botao titulo={t('trabalho.retirar')} variante="secundario" onPress={accoes.retirar} />
                </>
              ) : (
                <>
                  <Text style={styles.rotulo}>{t('trabalho.candidatar_rotulo')}</Text>
                  <Campo
                    placeholder={t('trabalho.mensagem_ph')}
                    value={mensagem}
                    onChangeText={setMensagem}
                    multiline
                  />
                  <Botao
                    titulo={t('trabalho.candidatar')}
                    onPress={async () => {
                      const ok = await accoes.candidatar(mensagem);
                      if (ok) setMensagem('');
                    }}
                    aCarregar={aProcessar}
                  />
                </>
              )}
            </View>
          )}

          {!souAutor && trabalho.estado !== 'aberto' && (
            <Text style={styles.nota}>
              {t(
                trabalho.estado === 'a_decorrer'
                  ? 'trabalho.ocupado'
                  : trabalho.estado === 'concluido'
                    ? 'trabalho.concluido_nota'
                    : 'trabalho.fechado',
              )}
            </Text>
          )}

          {/* ===== SOU o autor: candidaturas + ações ===== */}
          {souAutor && (
            <View style={styles.bloco}>
              <Text style={styles.rotulo}>{t('trabalho.cands')}</Text>
              {candidaturas.length === 0 ? (
                <Text style={styles.nota}>{t('trabalho.sem_cands')}</Text>
              ) : (
                <>
                  {/* Sem identidade verificada não se abre orçamento (043) —
                      diz-se a verdade uma vez, em cima, e aponta-se o caminho. */}
                  {!minhaIdVerificada && (
                    <>
                      <Text style={styles.nota}>{t('idverif.escolher')}</Text>
                      <Botao
                        titulo={t('idverif.botao')}
                        variante="secundario"
                        onPress={() => router.push('/perfil')}
                      />
                    </>
                  )}
                  {candidaturas.map((c) => (
                    <Cartao key={c.id} style={styles.candidatura}>
                      <Pressable onPress={() => router.push(`/perfil/${c.candidato_perfil}`)}>
                        <Text style={styles.candidatoNome}>{c.candidato?.nome ?? t('trabalho.alguem')}</Text>
                        <Text style={styles.verPerfil}>{t('trabalho.ver_perfil')}</Text>
                      </Pressable>
                      {c.mensagem ? <Text style={styles.candidatoMsg}>{c.mensagem}</Text> : null}
                      {minhaIdVerificada && trabalho.estado === 'aberto' && (
                        <Botao
                          titulo={t('trabalho.abrir_orcamento')}
                          onPress={async () => {
                            const oid = await accoes.abrirOrcamento(c.candidato_perfil);
                            if (oid) router.push(`/projeto/${oid}`);
                          }}
                          aCarregar={aProcessar}
                        />
                      )}
                    </Cartao>
                  ))}
                </>
              )}

              {trabalho.estado === 'aberto' && (
                <>
                  <Botao
                    titulo={t('trabalho.fechar')}
                    variante="secundario"
                    onPress={accoes.fechar}
                  />
                  {/* Dizer para que serve o botão evita o zelo inútil de o
                      carregar depois de escolher alguém — o anúncio trata-se
                      a si próprio a partir do aperto (058). */}
                  <Text style={styles.nota}>{t('trabalho.fechar_nota')}</Text>
                </>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Mais folga em cima (o Voltar/lápis não colam à barra de estado) e um
    // toque a mais nos lados (os alvos afastam-se da borda do ecrã).
    paddingHorizontal: Espaco.lg,
    paddingTop: Espaco.md,
    paddingBottom: Espaco.xs,
  },
  voltarTxt: { color: Honra.verde, fontSize: 16, fontWeight: '700' },
  centro: { padding: Espaco.xl, alignItems: 'center' },
  corpo: { padding: Espaco.xl, gap: Espaco.md, paddingBottom: Espaco.xxl },
  titulo: { fontSize: 28, fontWeight: '800', color: Honra.tinta },

  chipsCat: { flexDirection: 'row', flexWrap: 'wrap', gap: Espaco.sm },

  // Estado do anúncio: pílula sóbria; só "a decorrer" acende (é a única que
  // fala de algo VIVO — verde tem significado, nunca decoração).
  estadoLinha: { flexDirection: 'row', alignItems: 'center', gap: Espaco.md },
  estadoPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    backgroundColor: Honra.brancoCreme,
    paddingVertical: 5,
    paddingHorizontal: Espaco.md,
  },
  estadoPillVivo: { borderColor: Honra.verde, backgroundColor: Honra.verdeSuave },
  estadoTxt: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, color: Honra.tintaSuave },
  estadoTxtVivo: { color: Honra.verde },
  verProjeto: { color: Honra.verde, fontSize: 13, fontWeight: '700' },

  autor: { gap: 2 },
  autorRotulo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  autorNome: { fontSize: 20, fontWeight: '800', color: Honra.tinta },
  verPerfil: { color: Honra.verde, fontSize: 13, fontWeight: '700' },

  bloco: { gap: Espaco.sm },
  desc: { fontSize: 15, color: Honra.tinta, lineHeight: 21 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  linhaRotulo: { color: Honra.tintaSuave, fontSize: 13, fontWeight: '600' },
  linhaValor: { color: Honra.tinta, fontSize: 14, fontWeight: '800' },
  rotulo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  nota: { fontSize: 14, color: Honra.tintaSuave, lineHeight: 20 },
  enviada: { color: Honra.verde, fontSize: 15, fontWeight: '800' },

  candidatura: { gap: Espaco.sm },
  candidatoNome: { fontSize: 16, fontWeight: '800', color: Honra.tinta },
  candidatoMsg: { fontSize: 14, color: Honra.tinta, lineHeight: 20 },
});
