import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { useT } from '@/i18n';
import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * O piso de Confiança da Pesquisa.
 *
 * Abre SEMPRE em 0% — e isso é lei, não preguiça. Se a busca nascesse já a
 * esconder quem ainda não provou nada, ninguém provaria nada: o primeiro
 * negócio de uma conta nova seria impossível de conseguir. O corte é um gesto
 * de quem procura, nunca o estado inicial.
 *
 * Salta de 5 em 5 porque a Confiança só existe assim (30% de base, +5 por
 * honrado, −10 por falha). Um cursor que parasse em 87% prometia uma precisão
 * que o número não tem.
 *
 * Por baixo mostra quantas pessoas sobram ao piso escolhido — vê-se o preço do
 * corte enquanto se corta, em vez de descobrir uma lista vazia no fim.
 */
const PASSO = 5;

export function CursorConfianca({
  valor,
  onMudar,
  sobram,
}: {
  valor: number;
  onMudar: (v: number) => void;
  /** Quantos perfis sobrevivem a este piso. */
  sobram: number;
}) {
  const { t } = useT();
  const [largura, setLargura] = useState(0);
  // Refs: o PanResponder nasce UMA vez e não veria o estado fresco por fecho.
  const larguraRef = useRef(0);
  /** X absoluto onde a calha começa, na janela. Derivado no toque (ver abaixo). */
  const origemRef = useRef(0);
  const onMudarRef = useRef(onMudar);
  onMudarRef.current = onMudar;

  function medir(e: LayoutChangeEvent) {
    const l = e.nativeEvent.layout.width;
    larguraRef.current = l;
    setLargura(l);
  }

  /** Posição ABSOLUTA do dedo → percentagem encaixada no passo de 5. */
  function daPosicao(pageX: number) {
    const l = larguraRef.current;
    if (l <= 0) return 0;
    const bruto = Math.max(0, Math.min(1, (pageX - origemRef.current) / l)) * 100;
    return Math.round(bruto / PASSO) * PASSO;
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Captura: o cursor vive dentro de uma ScrollView (o painel de filtros).
      // Sem capturar, a ScrollView rouba o gesto a meio do arrasto e a bola
      // fica para trás — que era metade do bug.
      onMoveShouldSetPanResponderCapture: () => true,
      // E não devolve o gesto a ninguém enquanto o dedo estiver em baixo.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        // O truque que corrige a outra metade do bug: `locationX` é relativo ao
        // elemento e deixa de fazer sentido assim que o dedo SAI dele — era por
        // isso que um puxão rápido até ao canto do ecrã não levava a barra até
        // ao fim. Aqui derivamos, uma vez, onde a calha começa em coordenadas
        // absolutas (pageX − locationX) e a partir daí só se lê o absoluto.
        // Assim o dedo pode ir parar onde quiser: a conta continua certa.
        const { pageX, locationX } = e.nativeEvent;
        origemRef.current = pageX - locationX;
        onMudarRef.current(daPosicao(pageX));
      },
      // moveX é absoluto na janela — segue o dedo mesmo fora da calha, e o
      // clamp em daPosicao trata de o segurar entre 0 e 100.
      onPanResponderMove: (_e, gesto) => onMudarRef.current(daPosicao(gesto.moveX)),
    })
  ).current;

  const fracao = Math.max(0, Math.min(100, valor)) / 100;
  const posicao = largura * fracao;

  return (
    <View style={styles.bloco}>
      <View style={styles.topo}>
        <Text style={styles.rotulo}>{t('pesq.sec.confianca')}</Text>
        <Text style={[styles.valor, valor === 0 && styles.valorInativo]}>
          {valor === 0 ? t('pesq.conf.qualquer') : `${valor}%`}
        </Text>
      </View>

      {/* A calha. O alvo do dedo é generoso (padding vertical) sem que o traço
          engorde — a barra fina é o desenho, a área tocável é maior. */}
      {/* pointerEvents="none" nos filhos: o toque tem de aterrar SEMPRE na
          calha-alvo. Se aterrasse na bola, o `locationX` vinha relativo à bola
          e a origem saía errada logo no primeiro toque — o gesto começava
          torto e nunca mais acertava. */}
      <View style={styles.calhaAlvo} onLayout={medir} {...pan.panHandlers}>
        <View style={styles.calha} pointerEvents="none">
          <View style={[styles.enchido, { width: posicao }]} />
        </View>
        <View style={[styles.pega, { left: posicao - 8 }]} pointerEvents="none" />
      </View>

      <Text style={styles.sobram}>
        {sobram === 1 ? t('pesq.conf.sobra_um') : t('pesq.conf.sobram', { n: sobram })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bloco: { gap: Espaco.xs },
  topo: { flexDirection: 'row', alignItems: 'baseline' },
  rotulo: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: Honra.tintaSuave },
  // O número veste o verde só quando está a atuar (uma cor, uma função).
  valor: { marginLeft: 'auto', fontSize: 13, fontWeight: '800', color: Honra.verde },
  valorInativo: { color: Honra.tintaSuave, fontWeight: '700' },
  calhaAlvo: { paddingVertical: Espaco.sm, justifyContent: 'center' },
  calha: { height: 4, borderRadius: 2, backgroundColor: Honra.cremeEscuro, overflow: 'hidden' },
  enchido: { height: 4, borderRadius: 2, backgroundColor: Honra.verde },
  pega: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: Raio.pill,
    backgroundColor: Honra.brancoCreme,
    borderWidth: 1.5,
    borderColor: Honra.verde,
  },
  sobram: { fontSize: 12, color: Honra.tintaSuave },
});
