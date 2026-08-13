import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { apertaCoracao, useAvisos, type Aviso } from '@/lib/avisos';
import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * O PAINEL DE AVISOS — a lista curta que cai do sino, em ecrã largo.
 *
 * ── PORQUE EXISTE ────────────────────────────────────────────────────────
 * No browser, tocar no sino levava ao MESMO ecrã inteiro do telemóvel: uma
 * página completa, com cabeçalho e "voltar", para ler três linhas. Num
 * computador isso é desproporcionado — perde-se o sítio onde se estava para
 * espreitar uma coisa curta, e volta-se a carregar tudo de novo para regressar.
 *
 * Espreitar avisos é um GESTO DE PASSAGEM: quero saber se há algo e voltar ao
 * que estava a fazer. A forma certa disso num ecrã grande é um painel que abre
 * por cima, se lê num relance e fecha ao clicar fora.
 *
 * No TELEMÓVEL o ecrã inteiro continua certo — lá não há "por cima", e a
 * página é o próprio sítio. Por isso este painel só existe em largura de
 * secretária; não é uma versão melhor, é a versão daquele tamanho.
 *
 * ── O QUE FICA DE FORA, DE PROPÓSITO ─────────────────────────────────────
 * As respostas de CONSENTIMENTO (deixar o nome aparecer num trabalho) não
 * vivem aqui. Consentir é uma decisão, não um relance — e uma decisão dessas
 * pede o espaço e a calma do ecrã inteiro. O painel mostra-as e leva lá.
 */

/** Quantos cabem antes de isto deixar de ser um relance e passar a ser uma lista. */
const QUANTOS = 6;

export function PainelAvisos({ visivel, aoFechar }: { visivel: boolean; aoFechar: () => void }) {
  const { t } = useT();
  const { avisos, marcarLida, marcarTodas } = useAvisos();
  // O relógio lê-se no MOMENTO EM QUE O PAINEL ABRE, pelo `onShow` do Modal.
  // Não no corpo do componente (`Date.now()` aí é função impura, e dois
  // renders seguidos davam dois "agoras" — o que aperta o coração num deixava
  // de apertar no outro), nem num efeito (pôr estado dentro de um efeito faz
  // cascata de renders). O `onShow` é um EVENTO: acontece uma vez, quando há
  // mesmo uma razão para ler as horas.
  const [agora, setAgora] = useState(() => Date.now());
  const mostrados = avisos.slice(0, QUANTOS);
  const naoLidas = avisos.filter((a) => !a.lida).length;

  function abrir(a: Aviso) {
    if (!a.lida) marcarLida(a.id);
    aoFechar();
    // A rota do aviso é a mesma que o ecrã inteiro usa: um aviso leva ao sítio
    // onde a coisa aconteceu, nunca a uma cópia dela.
    router.push((a.orcamento_id ? `/projeto/${a.orcamento_id}` : '/avisos') as never);
  }

  return (
    <Modal
      visible={visivel}
      transparent
      animationType="fade"
      onShow={() => setAgora(Date.now())}
      onRequestClose={aoFechar}
    >
      {/* O véu fecha ao toque — num painel de passagem, sair tem de ser mais
          fácil do que entrar. */}
      <Pressable style={styles.veu} onPress={aoFechar}>
        <Pressable style={styles.painel} onPress={() => {}}>
          <View style={styles.cabeca}>
            <Text style={styles.titulo}>{t('avisos.titulo')}</Text>
            {naoLidas > 0 ? (
              <Pressable onPress={marcarTodas} hitSlop={8}>
                <Text style={styles.marcar}>{t('avisos.marcar_todas')}</Text>
              </Pressable>
            ) : null}
          </View>

          {mostrados.length === 0 ? (
            <Text style={styles.vazio}>{t('avisos.vazio')}</Text>
          ) : (
            <ScrollView style={styles.lista} showsVerticalScrollIndicator={false}>
              {mostrados.map((a) => {
                const bate = apertaCoracao(a, agora);
                return (
                  <Pressable key={a.id} onPress={() => abrir(a)} style={styles.linha}>
                    {/* O ponto só existe por ler. Dourado quando o relógio
                        aperta — pressão digna, nunca alarme vermelho. */}
                    <View
                      style={[
                        styles.ponto,
                        a.lida && styles.pontoLido,
                        bate && styles.pontoUrgente,
                      ]}
                    />
                    <View style={styles.textos}>
                      <Text
                        style={[styles.tit, a.lida && styles.titLido]}
                        numberOfLines={1}
                      >
                        {a.titulo}
                      </Text>
                      {a.corpo ? (
                        <Text style={styles.corpo} numberOfLines={1}>
                          {a.corpo}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* A porta para o ecrã inteiro. Aparece SEMPRE que houver avisos —
              não só quando são muitos — porque é lá que se responde a
              consentimentos e se vê o histórico. */}
          {avisos.length > 0 ? (
            <Pressable
              style={styles.rodape}
              onPress={() => {
                aoFechar();
                router.push('/avisos');
              }}
            >
              <Text style={styles.rodapeTxt}>
                {avisos.length > QUANTOS
                  ? t('avisos.ver_todos_n', { n: avisos.length })
                  : t('avisos.ver_todos')}
              </Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Ancorado ao canto superior direito, que é de onde o sino o chama.
  veu: { flex: 1, alignItems: 'flex-end', paddingTop: 64, paddingRight: Espaco.lg },
  painel: {
    width: 340,
    maxHeight: 420,
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.lg,
    borderWidth: 1,
    borderColor: Honra.pendente,
    paddingVertical: Espaco.sm,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  cabeca: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Espaco.md,
    paddingBottom: Espaco.sm,
  },
  titulo: { fontSize: 15, fontWeight: '800', color: Honra.tinta },
  marcar: { fontSize: 12.5, fontWeight: '700', color: Honra.verde },
  vazio: { paddingHorizontal: Espaco.md, paddingVertical: Espaco.md, color: Honra.tintaSuave, fontSize: 13.5 },
  lista: { maxHeight: 300 },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.sm,
    paddingHorizontal: Espaco.md,
    paddingVertical: Espaco.sm,
  },
  ponto: { width: 7, height: 7, borderRadius: 4, backgroundColor: Honra.verde },
  pontoLido: { backgroundColor: 'transparent' },
  pontoUrgente: { backgroundColor: Honra.dourado },
  textos: { flex: 1, minWidth: 0 },
  tit: { fontSize: 13.5, fontWeight: '700', color: Honra.tinta },
  titLido: { fontWeight: '600', color: Honra.tintaSuave },
  corpo: { fontSize: 12.5, color: Honra.tintaSuave, marginTop: 1 },
  rodape: {
    borderTopWidth: 1,
    borderTopColor: Honra.pendente,
    paddingTop: Espaco.sm,
    paddingHorizontal: Espaco.md,
    marginTop: 2,
  },
  rodapeTxt: { fontSize: 13, fontWeight: '700', color: Honra.verde },
});
