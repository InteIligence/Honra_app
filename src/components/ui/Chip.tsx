import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Espaco, Honra, Raio, TextoAcao } from '@/theme/honra';

/**
 * Chip HONRA — categoria ou filtro. Com `onPress` é tocável (filtro);
 * sem `onPress` é informativo (categoria do perfil).
 * Ativo = verde suave + contorno verde (verde = significado: seleção).
 * `icone` (opcional) marca um chip de OUTRA natureza — ex.: Profissionais
 * (pessoas) ao lado de Serviços/Empresas (o quê): o glifo diz "gente" sem
 * o escrever, e sem quebrar a paleta (segue a cor do texto).
 */
type Props = {
  texto: string;
  ativo?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  icone?: keyof typeof Feather.glyphMap;
  /**
   * INVERSO — o chip veste o verde da casa com a palavra a creme (em vez do
   * contrário). Não é enfeite: marca um chip de outra NATUREZA, para o olho o
   * separar sem ler. Usa-se nos "Profissionais" do Pesquisar — procurar QUEM
   * não é procurar O QUÊ. Selecionado, escurece (verde-escuro): continua a
   * ser o mesmo objeto, agora premido.
   */
  inverso?: boolean;
};

export function Chip({ texto, ativo = false, onPress, style, icone, inverso }: Props) {
  const corGlifo = inverso ? Honra.creme : ativo ? Honra.verde : Honra.tinta;
  const miolo = (
    <View style={styles.miolo}>
      {icone ? <Feather name={icone} size={13} color={corGlifo} /> : null}
      <Text style={[styles.txt, ativo && styles.txtAtivo, inverso && styles.txtInverso]}>
        {texto}
      </Text>
    </View>
  );
  const caixa = [
    styles.chip,
    inverso ? (ativo ? styles.inversoAtivo : styles.inverso) : ativo ? styles.ativo : styles.inativo,
    style,
  ];

  if (onPress) {
    return (
      <Pressable style={caixa} onPress={onPress}>
        {miolo}
      </Pressable>
    );
  }
  return <View style={caixa}>{miolo}</View>;
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: Espaco.md,
    paddingVertical: Espaco.sm,
    borderRadius: Raio.pill,
    borderWidth: 1,
  },
  ativo: { backgroundColor: Honra.verdeSuave, borderColor: Honra.verde },
  inativo: { backgroundColor: Honra.brancoCreme, borderColor: Honra.cremeEscuro },
  // Inverso: verde cheio com a palavra a creme. Premido, escurece.
  inverso: { backgroundColor: Honra.verde, borderColor: Honra.verde },
  inversoAtivo: { backgroundColor: Honra.verdeEscuro, borderColor: Honra.verdeEscuro },
  miolo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  txt: { ...TextoAcao, fontSize: 14, color: Honra.tinta, fontWeight: '600' },
  txtAtivo: { color: Honra.verde },
  txtInverso: { color: Honra.creme, fontWeight: '700' },
});
