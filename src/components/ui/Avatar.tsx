import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Honra, Raio } from '@/theme/honra';
import { estiloPrestigio, type EstiloPrestigio } from '@/theme/prestigio';

/**
 * Avatar HONRA — iniciais ou imagem, com o anel dourado modulado pelo
 * prestígio (DESIGN-SYSTEM.md §3). Sem prestígio explícito, usa o nível 0
 * (anel fino e sóbrio — o mínimo, nunca zero).
 */
type Props = {
  /** Iniciais a mostrar quando não há imagem (ex.: "VG"). */
  iniciais?: string | null;
  /** URI da imagem de perfil (quando existir). */
  imagem?: string | null;
  /** Diâmetro do miolo (círculo interior). */
  tamanho?: number;
  /** Config de prestígio (de `estiloPrestigio`). Omisso → nível 0. */
  prestigio?: EstiloPrestigio;
  style?: StyleProp<ViewStyle>;
};

export function Avatar({ iniciais, imagem, tamanho = 88, prestigio, style }: Props) {
  const p = prestigio ?? estiloPrestigio(0);
  // Folga entre o anel e o miolo, proporcional ao tamanho (88 → 6).
  const folga = Math.max(4, Math.round(tamanho * 0.07));

  const miolo = imagem ? (
    <Image
      source={{ uri: imagem }}
      style={{ width: tamanho, height: tamanho, borderRadius: Raio.pill }}
    />
  ) : (
    <View style={[styles.miolo, { width: tamanho, height: tamanho }]}>
      <Text style={[styles.iniciais, { fontSize: Math.round(tamanho * 0.36) }]}>
        {iniciais ?? '··'}
      </Text>
    </View>
  );

  return (
    <View
      style={[
        styles.anel,
        { borderWidth: p.anel.largura, borderColor: p.anel.cor },
        // Com anel duplo, o segundo anel ocupa parte da folga.
        { padding: p.anelDuplo ? 2 : folga },
        style,
      ]}
    >
      {p.anelDuplo ? (
        // Segundo anel interior — fino e ténue (Referência+). Sente-se, não grita.
        <View style={[styles.anelInterior, { padding: Math.max(2, folga - 2) }]}>{miolo}</View>
      ) : (
        miolo
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  anel: { borderRadius: Raio.pill },
  anelInterior: {
    borderRadius: Raio.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Honra.douradoClaro,
  },
  miolo: {
    borderRadius: Raio.pill,
    backgroundColor: Honra.verde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iniciais: { color: Honra.creme, fontWeight: '800' },
});
