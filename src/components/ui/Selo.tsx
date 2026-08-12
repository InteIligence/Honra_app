import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useT, type ChaveI18n, type TFn } from '@/i18n';
import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * Selo HONRA — as 4 abas de verificação.
 * O cadeado 🔒 (por verificar) e o ✓ verde (verificado) dizem tudo — sem
 * legenda "por verificar", para as pílulas ficarem todas da mesma altura.
 * O verde tem significado: só acende quando a aba está verificada.
 *
 * Profissão mostra a PROVENIÊNCIA quando acesa ("· pelo trabalho" / "· por
 * cédula") — mostrar, não dizer.
 *
 * REGRA ÚNICA "picotado = tocável": no perfil do DONO (quando é passado
 * `aoTocarBloqueada`), TODAS as pílulas trancadas levam o contorno dourado
 * tracejado e abrem a ação que as acende. Sem handler (perfil público,
 * honra-card), ficam lisas e mudas — não é o dono.
 *
 * E a pílula ACESA não morre. Uma aba que se acende continua a ter uma sala
 * por trás (o portefólio gere-se para sempre) — se a pílula ficasse muda, o
 * selo fechava a porta a quem a conquistou (foi o que aconteceu ao Vítor,
 * 25/07: com o portefólio comprovado, deixou de haver caminho para lá). Por
 * isso: `abasAcesasTocaveis` diz QUAIS as acesas que têm sala, e essas levam
 * um chevron discreto — picotado = "por acender", chevron = "há sala".
 */
export const ABAS_SELO = ['identidade', 'profissao', 'contacto', 'portefolio'] as const;

const ROTULO: Record<string, ChaveI18n> = {
  identidade: 'selo.identidade',
  profissao: 'selo.profissao',
  contacto: 'selo.contacto',
  portefolio: 'selo.portefolio',
};

// Voz de acessibilidade de cada pílula trancada tocável.
const ACAO_BLOQUEADA: Record<string, ChaveI18n> = {
  identidade: 'selo.acao.identidade',
  profissao: 'selo.acao.profissao',
  contacto: 'selo.acao.contacto',
  portefolio: 'selo.acao.portefolio',
};

type Linha = { aba: string; estado: string; origem?: string | null };

type Props = {
  /** Linhas da tabela `verificacoes` deste perfil ({ aba, estado, origem }). */
  verificacoes: Linha[];
  /** Se dado (perfil do dono), TODAS as pílulas trancadas ficam tocáveis
   *  (picotado dourado) e chamam este handler com a aba tocada. */
  aoTocarBloqueada?: (aba: string) => void;
  /** Abas ACESAS que têm sala por trás (ex.: 'portefolio' — gere-se sempre).
   *  Só estas ficam tocáveis quando verdes, com um chevron discreto. O saber
   *  de que porta abre é de quem chama, não do selo. */
  abasAcesasTocaveis?: readonly string[];
  aoTocarAcesa?: (aba: string) => void;
  style?: StyleProp<ViewStyle>;
};

// Texto da pílula Profissão: acesa mostra a proveniência à vista.
function rotuloProfissao(t: TFn, verde: boolean, origem?: string | null): string {
  if (!verde) return t(ROTULO.profissao);
  if (origem === 'cedula') return t('selo.profissao_cedula');
  if (origem === 'trabalho') return t('selo.profissao_trabalho');
  return t(ROTULO.profissao);
}

export function Selo({
  verificacoes,
  aoTocarBloqueada,
  abasAcesasTocaveis,
  aoTocarAcesa,
  style,
}: Props) {
  const { t } = useT();
  return (
    <View style={[styles.abas, style]}>
      {ABAS_SELO.map((aba) => {
        const linha = verificacoes.find((v) => v.aba === aba);
        const verde = linha?.estado === 'verificado';
        const texto =
          aba === 'profissao'
            ? rotuloProfissao(t, verde, linha?.origem)
            : t(ROTULO[aba]);
        const acesaComPorta = verde && !!aoTocarAcesa && !!abasAcesasTocaveis?.includes(aba);

        const conteudo = (
          <Text style={[styles.abaTxt, verde && styles.abaTxtVerde]}>
            {verde ? '✓ ' : '🔒 '}
            {texto}
            {acesaComPorta ? <Text style={styles.chevron}>{'  ›'}</Text> : null}
          </Text>
        );

        // Acesa com sala por trás: abre-a. Sem picotado — o picotado diz
        // "falta acender", e esta já acendeu; o chevron diz "entra".
        if (acesaComPorta) {
          return (
            <Pressable
              key={aba}
              onPress={() => aoTocarAcesa!(aba)}
              style={[styles.aba, styles.abaVerde]}
              accessibilityRole="button"
              accessibilityLabel={`${texto} — ${t('selo.abrir')}`}
            >
              {conteudo}
            </Pressable>
          );
        }

        // Picotado = tocável: qualquer pílula trancada, no perfil do dono,
        // leva à ação que a acende.
        if (!verde && aoTocarBloqueada) {
          return (
            <Pressable
              key={aba}
              onPress={() => aoTocarBloqueada(aba)}
              style={[styles.aba, styles.abaPend, styles.abaTocavel]}
              accessibilityRole="button"
              accessibilityLabel={t(ACAO_BLOQUEADA[aba] ?? ROTULO[aba])}
            >
              {conteudo}
            </Pressable>
          );
        }

        return (
          <View key={aba} style={[styles.aba, verde ? styles.abaVerde : styles.abaPend]}>
            {conteudo}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  abas: { flexDirection: 'row', flexWrap: 'wrap', gap: Espaco.sm },
  aba: {
    paddingHorizontal: Espaco.md,
    paddingVertical: Espaco.sm,
    borderRadius: Raio.pill,
    borderWidth: 1,
  },
  abaVerde: { backgroundColor: Honra.verdeSuave, borderColor: Honra.verde },
  abaPend: { backgroundColor: Honra.brancoCreme, borderColor: Honra.cremeEscuro },
  abaTocavel: { borderStyle: 'dashed', borderColor: Honra.dourado },
  abaTxt: { fontSize: 14, color: Honra.tintaSuave, fontWeight: '600' },
  abaTxtVerde: { color: Honra.verde },
  // Chevron da pílula acesa: mesma cor, meia-voz — convida sem gritar.
  chevron: { fontWeight: '700', opacity: 0.55 },
});
