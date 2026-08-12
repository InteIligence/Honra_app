import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { CerimoniaSelo } from '@/components/CerimoniaSelo';
import { Insignia } from '@/components/ui';
import { DURACAO } from '@/components/ui/Insignia';
import { nomeEscalao, useT } from '@/i18n';
import { Espaco, Honra, Raio } from '@/theme/honra';
import { ESCALOES, type NivelPrestigio, nivelDesenho } from '@/theme/prestigio';

/**
 * CERIMÓNIA DE SUBIDA — o momento em que o escalão sobe. A insígnia
 * constrói-se em cena (ver `Insignia`), e só quando está forjada é que o
 * nome se levanta. A lei do prestígio manda: a diferença SENTE-SE, não
 * grita — sem confetti, sem fanfarra. A dignidade é a celebração.
 */
export function CerimoniaRank({
  nivel,
  visivel,
  onFechar,
}: {
  nivel: NivelPrestigio;
  visivel: boolean;
  onFechar: () => void;
}) {
  const { t } = useT();
  const [forjada, setForjada] = useState(false);
  // A ANTECÂMARA: os quatro arcos fecham-se ANTES de a insígnia nascer. É a
  // diferença entre "tens isto" e "faltava-te uma coisa e já não falta" — o
  // selo vê-se a fechar, e é o fecho que faz o momento valer.
  const [selado, setSelado] = useState(false);
  const texto = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visivel) return;
    setForjada(false);
    setSelado(false);
    texto.setValue(0);
  }, [visivel, nivel, texto]);

  // A insígnia só começa a forjar-se depois de o anel fechar — as duas peças
  // NUNCA correm ao mesmo tempo: duas coisas juntas leem-se como uma só.
  useEffect(() => {
    if (!selado) return;
    // A duração é da PEÇA que está em cena, não do escalão: com seis degraus e
    // cinco peças, `DURACAO[5]` era vazio e a conta dava NaN — o temporizador
    // disparava de imediato e o Mestre via a insígnia já feita, sem forja.
    const relogio = setTimeout(() => setForjada(true), DURACAO[nivelDesenho(nivel)] - 400);
    return () => clearTimeout(relogio);
  }, [selado, nivel]);

  useEffect(() => {
    if (!forjada) return;
    Animated.timing(texto, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [forjada, texto]);

  if (!visivel) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onFechar}>
      {/* O véu NÃO se fecha ao toque: um ritual de segundos não se despacha
          por acidente. Sai-se pelo botão, quando a insígnia está forjada. */}
      <View style={styles.veu}>
        <Text style={styles.acima}>{t('cerim.acima')}</Text>

        {/* Primeiro o anel fecha; só depois a insígnia se forja no lugar dele.
            Ocupam a mesma caixa para a troca não empurrar nada no ecrã. */}
        <View style={styles.palco}>
          {/* As auréolas vivem AQUI, não no véu. Centradas no ecrã ficavam
              deslocadas da peça (que está no fluxo, com o título por cima) e a
              luz parecia vir de trás do ecrã em vez de vir de trás da moeda. */}
          <View style={styles.halo} pointerEvents="none" />
          <View style={styles.haloInterior} pointerEvents="none" />
          {selado ? (
            <Insignia nivel={nivelDesenho(nivel)} animar tamanho={210} />
          ) : (
            <CerimoniaSelo tamanho={210} aoFechar={() => setSelado(true)} />
          )}
        </View>

        <Animated.View
          style={{
            opacity: texto,
            transform: [
              { translateY: texto.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
            ],
          }}
        >
          <Text style={styles.escalao}>{nomeEscalao(t, ESCALOES[nivel])}</Text>
          <Text style={styles.linha}>{t('cerim.linha')}</Text>
          <View style={styles.botaoCaixa}>
            <Pressable style={styles.botao} onPress={onFechar} hitSlop={8}>
              <Text style={styles.botaoTxt}>{t('cerim.continuar')}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // O palco é VERDE PROFUNDO, não preto. O preto era um vazio de tecnologia;
  // este é o verde da casa levado ao fundo, e é sobre ele que o ouro canta —
  // a mesma pele do Honra Card, não um ecrã de sistema.
  veu: {
    flex: 1,
    backgroundColor: '#07160F',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Espaco.xl,
  },
  // As auréolas: medidas a partir da PEÇA (210), não do ecrã. A de fora abre
  // o espaço; a de dentro encosta-se à moeda e é ela que a levanta do fundo.
  halo: {
    position: 'absolute',
    width: 460,
    height: 460,
    borderRadius: 230,
    backgroundColor: Honra.verde,
    opacity: 0.11,
  },
  haloInterior: {
    position: 'absolute',
    width: 270,
    height: 270,
    borderRadius: 135,
    backgroundColor: Honra.verde,
    opacity: 0.16,
  },
  acima: {
    color: Honra.douradoClaro,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 5,
    opacity: 0.75,
    marginBottom: Espaco.xl,
  },
  // Caixa fixa: o anel e a insígnia partilham o mesmo palco, para a passagem
  // de um ao outro não empurrar o texto que está por baixo.
  palco: {
    width: 210,
    height: 210,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Espaco.lg,
    // overflow visível: as auréolas são maiores que o palco de propósito.
    overflow: 'visible',
  },
  // GRANDE. Este é o momento em que a pessoa chega a algum lado — o nome do
  // escalão tem de ocupar o ecrã como um título de capítulo, não como uma
  // legenda. Era isto que fazia a cerimónia parecer um aviso de sistema.
  escalao: {
    color: Honra.creme,
    fontSize: 52,
    lineHeight: 56,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -1.4,
  },
  linha: {
    color: Honra.douradoClaro,
    fontSize: 15,
    textAlign: 'center',
    marginTop: Espaco.md,
    opacity: 0.85,
    lineHeight: 22,
    maxWidth: 420,
  },
  // O botão deixa de ser um contorno tímido e passa a ser uma peça sólida em
  // creme: o gesto de sair de um ritual é digno, não é um "fechar".
  botaoCaixa: { alignItems: 'center', marginTop: Espaco.xxl },
  botao: {
    borderRadius: Raio.pill,
    backgroundColor: Honra.creme,
    paddingVertical: Espaco.md,
    paddingHorizontal: Espaco.xxl,
  },
  botaoTxt: {
    color: Honra.verdeMaisEscuro,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
