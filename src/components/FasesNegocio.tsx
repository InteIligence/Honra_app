/**
 * FASES DO NEGÓCIO — a barra de 5 segmentos do handoff "Dashboard 3a".
 *
 * PORQUÊ CINCO: não é um número bonito do desenho — são as cinco fases REAIS
 * de um aperto de mão no Honra, tal como vivem na coluna `estado` da tabela
 * `orcamentos`: aceite → selado → honrado → entregue → concluído. A barra é
 * uma leitura da base de dados, nunca uma ilustração de progresso.
 *
 * A LEI DAS CORES aqui:
 *   verde   = fase já cumprida (significado: aquilo já aconteceu);
 *   dourado = a fase onde o negócio está AGORA — é onde a palavra dada está
 *             a ser posta à prova, e o dourado é exatamente isso, prestígio
 *             em jogo, nunca enfeite;
 *   ténue   = caminho por andar.
 *
 * Um estado fora da escada (recusado, cancelado, expirado…) devolve 0 e a
 * barra fica toda apagada: mentir com um segmento verde seria pior que calar.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Honra, Raio } from '@/theme/honra';

/** A escada real do aperto de mão, pela ordem em que se sobe. */
// TRÊS fases, não cinco. `entregue` e `concluido` eram a cauda de quando havia
// botões manuais para lá chegar — hoje NADA no servidor escreve esses estados
// (confirmado por varredura, 01/08) e a máquina termina em `honrado`. Uma barra
// de cinco segmentos deixava um negócio FECHADO a jurar que ia a meio.
//
// O dinheiro corre noutra coluna (`pagamento_estado`, 065) e é trabalho da
// casa, não das pessoas: por isso não entra nesta barra, que conta o percurso
// do TRABALHO.
export const FASES_NEGOCIO = ['aceite', 'selado', 'honrado'] as const;

export const TOTAL_FASES = FASES_NEGOCIO.length;

/** Fase de um estado: 1..5 na escada, 0 fora dela (nada a mostrar). */
export function faseDe(estado: string): number {
  const i = (FASES_NEGOCIO as readonly string[]).indexOf(estado);
  return i < 0 ? 0 : i + 1;
}

export function FasesNegocio({ estado, style }: { estado: string; style?: StyleProp<ViewStyle> }) {
  const fase = faseDe(estado);
  return (
    <View style={[styles.barra, style]}>
      {FASES_NEGOCIO.map((f, i) => {
        const n = i + 1;
        return (
          <View
            key={f}
            style={[
              styles.seg,
              n < fase && styles.segFeito,
              n === fase && styles.segAgora,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  barra: { flexDirection: 'row', gap: 5 },
  // Por andar: o fio ténue do bege — presente, mas sem voz.
  seg: {
    flex: 1,
    height: 5,
    borderRadius: Raio.pill,
    backgroundColor: Honra.cremeEscuro,
  },
  segFeito: { backgroundColor: Honra.verde },
  segAgora: { backgroundColor: Honra.dourado },
});
