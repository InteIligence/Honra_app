import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * CampoHora HONRA — irmão do CampoData, para a HORA do alerta.
 * Sem dependências nativas (Modal + Views): comporta-se IGUAL na web e no iOS,
 * e não herda o relógio de rodinha do sistema (que muda de cara em cada SO).
 *
 * Fala sempre em 'HH:MM' 24h ('' = sem hora). Escolhe-se em DOIS toques —
 * a hora numa grelha de 24, os minutos de 5 em 5 — porque um alarme define-se
 * de relance; não se procura o minuto 37 numa roda.
 *
 * `compacto` veste a mesma coisa de pílula, para viver ao lado de uma nota na
 * checklist. Verde quando há alerta: o alarme é AÇÃO, não enfeite.
 *
 * ── O SINO É UMA PROMESSA, E SÓ SE MOSTRA ONDE SE CUMPRE ─────────────────
 * Havia aqui um sino sempre que existisse hora. Mas ter hora e ter alarme são
 * coisas diferentes: no browser não se agenda nada, e sem permissão de
 * notificações também não. A pessoa via o sino, esperava ser avisada, e não
 * foi — e a app só a desmentia numa linha em itálico por baixo, que o símbolo
 * ganhava sempre.
 *
 * Agora o ícone segue o alarme REAL (`alarme`), não a intenção:
 *   · sino    → há despertador montado no aparelho; alguém te vai avisar
 *   · relógio → está MARCADO para aquela hora, e mais nada
 * Dois símbolos, duas promessas — nenhuma delas por cumprir.
 */

const HORAS = Array.from({ length: 24 }, (_, i) => i);
const MINUTOS = Array.from({ length: 12 }, (_, i) => i * 5);

const dd = (n: number) => String(n).padStart(2, '0');

type Props = {
  /** '' (sem hora) ou 'HH:MM'. */
  value: string;
  onChange: (hora: string) => void;
  /** Palavra do gatilho quando está vazio (ex.: "Alerta"). */
  placeholder?: string;
  /** Pílula pequena, para viver dentro de uma linha de lista. */
  compacto?: boolean;
  /** Verdadeiro quando a hora já passou — o alerta fica apontado mas não toca. */
  passado?: boolean;
  /**
   * Existe MESMO um despertador montado para esta hora? Quem chama sabe-o pelo
   * `alerta_id` que o SO devolveu — nulo significa que nada foi agendado (web,
   * permissão recusada, hora já passada). Sem isto o sino mentia.
   */
  alarme?: boolean;
  testID?: string;
};

export function CampoHora({
  value,
  onChange,
  placeholder,
  compacto = false,
  passado = false,
  alarme = true,
  testID,
}: Props) {
  const { t } = useT();
  const [aberto, setAberto] = useState(false);
  // Esboço: a escolha só sai daqui quando se carrega em "Definir" — assim
  // ninguém agenda um alarme por engano ao tocar na grelha.
  const [esboco, setEsboco] = useState('');

  const dica = placeholder ?? t('hora.alerta');

  function abrir() {
    setEsboco(value);
    setAberto(true);
  }

  const [hEsc, mEsc] = esboco ? esboco.split(':').map(Number) : [-1, -1];

  return (
    <>
      {compacto ? (
        <Pressable
          style={[styles.pilula, value && !passado && styles.pilulaViva]}
          onPress={abrir}
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={value ? t('hora.rotulo', { hora: value }) : dica}
        >
          <Feather
            name={!value ? 'bell-off' : alarme ? 'bell' : 'clock'}
            size={12}
            color={value && !passado ? Honra.verde : Honra.tintaSuave}
          />
          {value ? (
            <Text style={[styles.pilulaTxt, !passado && styles.pilulaTxtViva]}>{value}</Text>
          ) : null}
        </Pressable>
      ) : (
        <Pressable
          style={styles.gatilho}
          onPress={abrir}
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={value ? t('hora.rotulo', { hora: value }) : dica}
        >
          <Text style={[styles.gatilhoTxt, !value && styles.gatilhoVazio]}>{value || dica}</Text>
          <Feather name="bell" size={16} color={value ? Honra.verde : Honra.tintaSuave} />
        </Pressable>
      )}

      <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
        <Pressable style={styles.veu} onPress={() => setAberto(false)}>
          {/* Pressable interior "come" o toque para o véu não fechar o relógio. */}
          <Pressable style={styles.carta} onPress={() => {}}>
            <Text style={styles.titulo}>{t('hora.titulo')}</Text>

            <Text style={styles.seccao}>{t('hora.horas')}</Text>
            <View style={styles.grelha}>
              {HORAS.map((h) => {
                const escolhida = h === hEsc;
                return (
                  <Pressable
                    key={h}
                    style={[styles.celula, escolhida && styles.celulaOn]}
                    // Escolher a hora fixa logo os minutos a 00 — a maioria dos
                    // alarmes é à hora certa, e assim basta um toque.
                    onPress={() => setEsboco(`${dd(h)}:${dd(mEsc < 0 ? 0 : mEsc)}`)}
                    testID={testID ? `${testID}-h-${dd(h)}` : undefined}
                  >
                    <Text style={[styles.celulaTxt, escolhida && styles.celulaTxtOn]}>{dd(h)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.seccao}>{t('hora.minutos')}</Text>
            <View style={styles.grelha}>
              {MINUTOS.map((m) => {
                const escolhido = m === mEsc;
                return (
                  <Pressable
                    key={m}
                    style={[styles.celula, escolhido && styles.celulaOn]}
                    onPress={() => setEsboco(`${dd(hEsc < 0 ? 9 : hEsc)}:${dd(m)}`)}
                    testID={testID ? `${testID}-m-${dd(m)}` : undefined}
                  >
                    <Text style={[styles.celulaTxt, escolhido && styles.celulaTxtOn]}>{dd(m)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.rodape}>
              {value || esboco ? (
                <Pressable
                  onPress={() => {
                    onChange('');
                    setAberto(false);
                  }}
                  hitSlop={8}
                  testID={testID ? `${testID}-sem-alerta` : undefined}
                >
                  <Text style={styles.rodapeTxt}>{t('hora.sem_alerta')}</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable
                onPress={() => {
                  if (esboco) onChange(esboco);
                  setAberto(false);
                }}
                hitSlop={8}
                testID={testID ? `${testID}-definir` : undefined}
              >
                <Text style={[styles.rodapeTxt, esboco && styles.rodapeTxtVivo]}>
                  {t('hora.definir')}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // A pele do gatilho é a do Campo — para as portas todas parecerem a mesma.
  gatilho: {
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.md,
    padding: Espaco.md,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espaco.sm,
  },
  gatilhoTxt: { fontSize: 15, color: Honra.tinta },
  gatilhoVazio: { color: Honra.tintaSuave },

  // Pílula (modo compacto) — em repouso é um sino apagado, quase invisível;
  // com alerta veste o verde-suave (uma cor, uma função: isto vai tocar).
  pilula: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Raio.pill,
    paddingVertical: 3,
    paddingHorizontal: Espaco.sm,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
  },
  pilulaViva: { backgroundColor: Honra.verdeSuave, borderColor: Honra.verdeSuave },
  pilulaTxt: { fontSize: 12, fontWeight: '700', color: Honra.tintaSuave },
  pilulaTxtViva: { color: Honra.verde },

  veu: {
    flex: 1,
    backgroundColor: 'rgba(18, 33, 27, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Espaco.lg,
  },
  carta: {
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.lg,
    padding: Espaco.lg,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
  },
  titulo: { fontSize: 16, fontWeight: '700', color: Honra.tinta },
  seccao: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: Honra.tintaSuave,
    marginTop: Espaco.md,
    marginBottom: Espaco.xs,
  },
  // Grelha que se dobra sozinha: 6 por linha em qualquer largura de cartão.
  grelha: { flexDirection: 'row', flexWrap: 'wrap' },
  celula: {
    width: `${100 / 6}%`,
    paddingVertical: Espaco.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Raio.sm,
  },
  celulaOn: { backgroundColor: Honra.verde },
  celulaTxt: { fontSize: 14, color: Honra.tinta, fontWeight: '600' },
  celulaTxtOn: { color: Honra.brancoCreme, fontWeight: '800' },
  rodape: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Espaco.md,
  },
  rodapeTxt: { color: Honra.tintaSuave, fontSize: 14, fontWeight: '700', padding: Espaco.xs },
  // "Definir" acende a verde quando há mesmo uma hora para definir.
  rodapeTxtVivo: { color: Honra.verde },
});
