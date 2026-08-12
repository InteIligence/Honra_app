import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * CampoData HONRA — campo de data com calendário próprio.
 * Sem dependências nativas (Modal + Views): comporta-se IGUAL na web e no iOS.
 * Fala sempre em 'AAAA-MM-DD' ('' = sem data); mostra "20/07/2026" a quem lê
 * (dia/mês/ano). Verde = o dia escolhido; hoje leva contorno neutro.
 * Meses e dias da semana falam o idioma ativo (semana começa à segunda).
 */

const iso = (ano: number, mes: number, dia: number) =>
  `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

/** Data de hoje em 'AAAA-MM-DD' (fuso LOCAL — toISOString daria o dia UTC). */
export function hojeISO(): string {
  const h = new Date();
  return iso(h.getFullYear(), h.getMonth(), h.getDate());
}

/** 'AAAA-MM-DD' → '20/07/2026' (formato PT: dia/mês/ano). */
export function formatarData(valor: string): string {
  const [a, m, d] = valor.split('-');
  if (!a || !m || !d) return valor;
  return `${d}/${m}/${a}`;
}

type Props = {
  /** '' (sem data) ou 'AAAA-MM-DD'. */
  value: string;
  onChange: (data: string) => void;
  placeholder?: string;
  /** 'AAAA-MM-DD' — dias anteriores ficam desativados. */
  minimo?: string;
  testID?: string;
};

export function CampoData({ value, onChange, placeholder, minimo, testID }: Props) {
  const { t } = useT();
  const [aberto, setAberto] = useState(false);
  const [visivel, setVisivel] = useState({ ano: 0, mes: 0 });

  const meses = t('data.meses').split(',');
  const diasSemana = t('data.dias_semana').split(',');
  const dica = placeholder ?? t('data.escolher');

  function abrir() {
    // Mês visível ao abrir: o da data escolhida, senão o do mínimo, senão o de hoje.
    const [a, m] = (value || minimo || hojeISO()).split('-').map(Number);
    setVisivel({ ano: a, mes: m - 1 });
    setAberto(true);
  }

  const rodarMes = (passo: -1 | 1) =>
    setVisivel(({ ano, mes }) => {
      const total = mes + passo;
      return { ano: ano + Math.floor(total / 12), mes: ((total % 12) + 12) % 12 };
    });

  const { ano, mes } = visivel;
  const hoje = hojeISO();
  // Grelha do mês: células vazias até à coluna da segunda-feira, depois os dias.
  const primeiraColuna = (new Date(ano, mes, 1).getDay() + 6) % 7;
  const totalDias = new Date(ano, mes + 1, 0).getDate();
  const celulas: (number | null)[] = [
    ...Array.from({ length: primeiraColuna }, () => null),
    ...Array.from({ length: totalDias }, (_, i) => i + 1),
  ];
  while (celulas.length % 7 !== 0) celulas.push(null);
  const semanas: (number | null)[][] = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));

  return (
    <>
      <Pressable
        style={styles.gatilho}
        onPress={abrir}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={value ? t('data.rotulo', { data: formatarData(value) }) : dica}
      >
        <Text style={[styles.gatilhoTxt, !value && styles.gatilhoVazio]}>
          {value ? formatarData(value) : dica}
        </Text>
        <Feather name="calendar" size={16} color={Honra.tintaSuave} />
      </Pressable>

      <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
        <Pressable style={styles.veu} onPress={() => setAberto(false)}>
          {/* Pressable interior "come" o toque para o véu não fechar o calendário. */}
          <Pressable style={styles.carta} onPress={() => {}}>
            <View style={styles.cabecalho}>
              <Pressable
                style={styles.seta}
                onPress={() => rodarMes(-1)}
                hitSlop={8}
                testID={testID ? `${testID}-mes-anterior` : undefined}
              >
                <Feather name="chevron-left" size={22} color={Honra.verde} />
              </Pressable>
              <Text style={styles.mesTitulo}>
                {meses[mes]} {ano}
              </Text>
              <Pressable
                style={styles.seta}
                onPress={() => rodarMes(1)}
                hitSlop={8}
                testID={testID ? `${testID}-mes-seguinte` : undefined}
              >
                <Feather name="chevron-right" size={22} color={Honra.verde} />
              </Pressable>
            </View>

            <View style={styles.linha}>
              {diasSemana.map((d, i) => (
                <Text key={i} style={styles.diaSemana}>
                  {d}
                </Text>
              ))}
            </View>

            {semanas.map((semana, s) => (
              <View key={s} style={styles.linha}>
                {semana.map((dia, i) => {
                  if (!dia) return <View key={i} style={styles.celula} />;
                  const diaISO = iso(ano, mes, dia);
                  const desativado = !!minimo && diaISO < minimo;
                  const escolhido = diaISO === value;
                  return (
                    <Pressable
                      key={i}
                      style={[
                        styles.celula,
                        diaISO === hoje && styles.celulaHoje,
                        escolhido && styles.celulaEscolhida,
                      ]}
                      disabled={desativado}
                      onPress={() => {
                        onChange(diaISO);
                        setAberto(false);
                      }}
                      testID={testID ? `${testID}-dia-${diaISO}` : undefined}
                    >
                      <Text
                        style={[
                          styles.diaTxt,
                          desativado && styles.diaApagado,
                          escolhido && styles.diaEscolhido,
                        ]}
                      >
                        {dia}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <View style={styles.rodape}>
              {value ? (
                <Pressable
                  onPress={() => {
                    onChange('');
                    setAberto(false);
                  }}
                  hitSlop={8}
                  testID={testID ? `${testID}-limpar` : undefined}
                >
                  <Text style={styles.rodapeTxt}>{t('data.limpar')}</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable onPress={() => setAberto(false)} hitSlop={8}>
                <Text style={styles.rodapeTxt}>{t('data.fechar')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // A pele do gatilho é a do Campo — para as duas portas parecerem a mesma.
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
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Espaco.md,
  },
  seta: { padding: Espaco.xs },
  mesTitulo: { fontSize: 16, fontWeight: '700', color: Honra.tinta },
  linha: { flexDirection: 'row' },
  diaSemana: {
    flex: 1,
    textAlign: 'center',
    color: Honra.tintaSuave,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: Espaco.xs,
  },
  celula: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Raio.sm,
    margin: 1,
  },
  celulaHoje: { borderWidth: 1, borderColor: Honra.tintaSuave },
  celulaEscolhida: { backgroundColor: Honra.verde },
  diaTxt: { fontSize: 14, color: Honra.tinta },
  diaApagado: { color: Honra.pendente },
  diaEscolhido: { color: Honra.brancoCreme, fontWeight: '700' },
  rodape: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Espaco.md,
  },
  rodapeTxt: { color: Honra.tintaSuave, fontSize: 14, fontWeight: '700', padding: Espaco.xs },
});
