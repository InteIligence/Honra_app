/**
 * PILHA DE AVATARES — as caras sobrepostas do handoff "Dashboard 3a".
 *
 * O Honra liga PESSOAS: um negócio ou uma rede lê-se primeiro pela cara de
 * quem lá está, e só depois pelo texto. A pilha é isso — gente, em pouco
 * espaço, sem virar lista.
 *
 * REGRA DE VERDADE: só entram pessoas que existem mesmo. Quem chama passa as
 * iniciais reais; sem ninguém, o componente não desenha nada (nunca círculos
 * de enchimento). O "+N" só aparece quando há mesmo mais gente do que cabe.
 *
 * O aro é da cor do fundo onde a pilha assenta (recorte), não é decoração
 * dourada: o dourado é prestígio e não se gasta a separar círculos.
 */
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Honra, Raio } from '@/theme/honra';

type Props = {
  /** Iniciais já prontas, uma por pessoa (ex.: ['RU', 'MI']). */
  iniciais: string[];
  /** Quantas cabem antes de virar "+N". */
  maximo?: number;
  /** Diâmetro de cada círculo. */
  tamanho?: number;
  /** Cor do aro de recorte — a do fundo onde a pilha vive. */
  aro?: string;
  style?: StyleProp<ViewStyle>;
};

// Os três verdes da casa, para que caras diferentes não sejam o mesmo bloco.
const VERDES = [Honra.verdeEscuro, Honra.verde, Honra.verdeMaisEscuro];

export function PilhaAvatares({
  iniciais,
  maximo = 3,
  tamanho = 24,
  aro = Honra.brancoCreme,
  style,
}: Props) {
  if (iniciais.length === 0) return null;
  const visiveis = iniciais.slice(0, maximo);
  const resto = iniciais.length - visiveis.length;
  const sobrepor = -Math.round(tamanho * 0.25);
  return (
    <View style={[styles.pilha, style]}>
      {visiveis.map((ini, i) => (
        <View
          key={`${ini}-${i}`}
          style={[
            styles.circulo,
            {
              width: tamanho,
              height: tamanho,
              backgroundColor: VERDES[i % VERDES.length],
              borderColor: aro,
              marginLeft: i === 0 ? 0 : sobrepor,
            },
          ]}
        >
          <Text style={[styles.txt, { fontSize: Math.round(tamanho * 0.4) }]} numberOfLines={1}>
            {ini}
          </Text>
        </View>
      ))}
      {resto > 0 && (
        <View
          style={[
            styles.circulo,
            styles.circuloResto,
            {
              width: tamanho,
              height: tamanho,
              borderColor: aro,
              marginLeft: sobrepor,
            },
          ]}
        >
          <Text style={[styles.txtResto, { fontSize: Math.round(tamanho * 0.36) }]}>+{resto}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pilha: { flexDirection: 'row', alignItems: 'center' },
  circulo: {
    borderRadius: Raio.pill,
    borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circuloResto: { backgroundColor: Honra.cremeEscuro },
  txt: { color: Honra.douradoClaro, fontWeight: '800' },
  txtResto: { color: Honra.tintaSuave, fontWeight: '800' },
});
