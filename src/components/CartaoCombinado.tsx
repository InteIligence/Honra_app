import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { podesFazer, chaveEstado, type Combinado } from '@/lib/combinado';
import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * O CARTÃO DO COMBINADO — o encontro marcado, dentro da conversa onde nasceu.
 *
 * Vive AQUI e não numa lista à parte por uma razão simples: um combinado é uma
 * coisa que se disse a alguém. Tirá-lo da conversa e pô-lo numa agenda seria
 * transformar uma palavra dada num item de lista — e o Honra é sobre a palavra
 * dada. Quem quiser vê-los todos tem a Agenda; quem estiver a falar com a
 * pessoa vê-o onde combinou.
 *
 * ── O QUE ESTE CARTÃO NÃO FAZ ────────────────────────────────────────────
 * Não decide nada. Os botões que mostra vêm do `podesFazer`, que é a leitura
 * das regras do servidor (081) — e mesmo esses são só cortesia: se a app se
 * enganar, o servidor recusa. Preferimos não oferecer um botão a oferecer um
 * botão que falha.
 *
 * ── E NÃO COTA A MECÂNICA ────────────────────────────────────────────────
 * Em lado nenhum se lê "+2" ou "−2". A lei da casa (Vítor, 20/07) é que a
 * mecânica não se escreve na UI: mostrar a tabela de preços da palavra é cotá-la,
 * e cotar a palavra distorce o propósito. O cartão diz o que aconteceu e o que
 * se pode fazer; a Confiança mexe, e as pessoas descobrem a viver.
 *
 * A única exceção é o diálogo de MARCAR, onde o preço se diz à frente — porque
 * aí ainda se está a decidir, e uma consequência que só se descobre depois não
 * é regra, é armadilha.
 */
export function CartaoCombinado({
  combinado,
  uid,
  aAgir,
  erro,
  onResponder,
  onConfirmar,
  onDeclararFalha,
  onContestar,
}: {
  combinado: Combinado;
  uid: string;
  aAgir: boolean;
  erro: string | null;
  onResponder: (aceita: boolean) => void;
  onConfirmar: () => void;
  onDeclararFalha: () => void;
  onContestar: () => void;
}) {
  const { t, idioma } = useT();
  const loc = idioma === 'pt' ? 'pt-PT' : 'en-GB';
  const podes = podesFazer(combinado, uid);
  const quando = new Date(combinado.quando);

  // Fechado = já contou a sua história. O cartão fica, mas em voz baixa: o
  // histórico não se apaga só porque acabou.
  const fechado = !['proposto', 'aceite'].includes(combinado.estado);
  const correuMal = ['falhado', 'disputado'].includes(combinado.estado);

  return (
    <View style={[styles.cartao, fechado && styles.cartaoFechado, correuMal && styles.cartaoMau]}>
      <View style={styles.topo}>
        <Feather
          name={combinado.estado === 'cumprido' ? 'check-circle' : 'calendar'}
          size={14}
          color={correuMal ? Honra.erro : fechado ? Honra.tintaSuave : Honra.dourado}
        />
        <Text style={styles.quando}>
          {quando.toLocaleDateString(loc, { day: 'numeric', month: 'long' })}
          {' · '}
          {quando.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>

      {combinado.onde ? <Text style={styles.onde}>{combinado.onde}</Text> : null}

      <Text style={[styles.estado, correuMal && styles.estadoMau]}>
        {t(chaveEstado(combinado, uid) as Parameters<typeof t>[0])}
      </Text>

      {erro ? <Text style={styles.erro}>{erro}</Text> : null}

      {/* Os gestos. Nunca aparecem dois que se contradigam: o `podesFazer`
          garante-o, porque lê as mesmas condições que o servidor aplica. */}
      {podes.responder ? (
        <View style={styles.acoes}>
          <Botao txt={t('comb.recusar')} sec onPress={() => onResponder(false)} off={aAgir} />
          <Botao txt={t('comb.aceitar')} onPress={() => onResponder(true)} off={aAgir} />
        </View>
      ) : null}

      {podes.confirmar ? (
        <View style={styles.acoes}>
          <Botao txt={t('comb.confirmar')} onPress={onConfirmar} off={aAgir} />
        </View>
      ) : null}

      {podes.declararFalha ? (
        <View style={styles.acoes}>
          {/* Discreto de propósito: acusar alguém não pode ser o gesto mais
              fácil do ecrã. Fica ao lado, em texto, não num botão cheio. */}
          <Pressable onPress={onDeclararFalha} disabled={aAgir} hitSlop={8}>
            <Text style={styles.faltou}>{t('comb.nao_apareceu')}</Text>
          </Pressable>
        </View>
      ) : null}

      {podes.contestar ? (
        <View style={styles.acoes}>
          <Botao txt={t('comb.contestar')} onPress={onContestar} off={aAgir} />
        </View>
      ) : null}
    </View>
  );
}

function Botao({
  txt,
  onPress,
  sec,
  off,
}: {
  txt: string;
  onPress: () => void;
  sec?: boolean;
  off?: boolean;
}) {
  return (
    <Pressable
      style={[styles.btn, sec && styles.btnSec, off && styles.btnOff]}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
    >
      <Text style={[styles.btnTxt, sec && styles.btnSecTxt]}>{txt}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cartao: {
    borderWidth: 1,
    borderColor: Honra.dourado,
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.md,
    padding: Espaco.md,
    marginHorizontal: Espaco.sm,
    marginBottom: Espaco.sm,
    gap: 4,
  },
  // Fechado: o aro dourado sai. O ouro é do que ainda está em jogo.
  cartaoFechado: { borderColor: Honra.pendente, backgroundColor: 'transparent' },
  cartaoMau: { borderColor: Honra.erro },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  quando: { fontSize: 14, fontWeight: '700', color: Honra.tinta },
  onde: { fontSize: 13, color: Honra.tintaSuave },
  estado: { fontSize: 12.5, color: Honra.tintaSuave, marginTop: 2 },
  estadoMau: { color: Honra.erro },
  erro: { fontSize: 12.5, color: Honra.erro, marginTop: Espaco.xs, lineHeight: 18 },
  acoes: { flexDirection: 'row', gap: Espaco.sm, marginTop: Espaco.sm, alignItems: 'center' },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: Espaco.md,
    borderRadius: Raio.sm,
    backgroundColor: Honra.verde,
  },
  btnSec: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Honra.pendente },
  btnOff: { opacity: 0.5 },
  btnTxt: { fontSize: 13, fontWeight: '700', color: Honra.brancoCreme },
  btnSecTxt: { color: Honra.tintaSuave },
  faltou: { fontSize: 12.5, color: Honra.tintaSuave, textDecorationLine: 'underline' },
});
