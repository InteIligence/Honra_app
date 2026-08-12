import { forwardRef, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { Honra } from '@/theme/honra';

/**
 * O Animated clássico injeta `collapsable={false}` (prop de Views nativas) no
 * componente que envolve; na web o react-native-svg despeja-a no DOM
 * (`<circle collapsable="false">`) e o React avisa em CADA frame. Este
 * invólucro tira-a antes de chegar ao SVG.
 *
 * É o mesmo remédio que a Insignia já tinha escrito para si — o problema é da
 * combinação Animated + SVG na web, não deste componente.
 */
const semCollapsable = (Comp: any) =>
  forwardRef(({ collapsable: _ignorada, ...resto }: any, ref) => <Comp ref={ref} {...resto} />);

const CirculoAnim = Animated.createAnimatedComponent(semCollapsable(Circle)) as any;

/**
 * A ANTECÂMARA DO SELO — os quatro arcos que se fecham.
 *
 * Cada arco é uma das quatro provas (identidade, profissão, contacto,
 * portefólio). Acendem uma a uma, por ordem; quando a quarta acende, as
 * junções fecham-se e os quatro arcos tornam-se UM anel. Só então nasce a
 * insígnia.
 *
 * Porquê assim, e porque é que a ordem importa: um selo que aparecesse feito
 * dizia "tens isto". Um selo que se FECHA à frente dos olhos diz "faltava-te
 * uma coisa e já não falta" — e é isso que faz o momento valer. O anel só é
 * anel quando as quatro partes se tocam; enquanto houver uma falha, vê-se a
 * falha. A credencial do Honra não é uma etiqueta, é uma coisa que se fechou.
 *
 * Sem festa: nada de confetti nem de fanfarra. A lei do prestígio manda que a
 * diferença se SINTA — o peso vem da inércia do movimento, não do volume.
 *
 * O gap NUNCA chega a zero absoluto (fica em 0.6°): um anel perfeitamente
 * contínuo perde a memória de ter sido quatro. Fica a cicatriz, de propósito.
 */
const R = 46;
const C = 2 * Math.PI * R;
/** Cada prova ocupa um quarto. O vão entre elas é o que se fecha no fim. */
const QUARTO = C / 4;
const VAO_ABERTO = QUARTO * 0.14;
const VAO_FECHADO = QUARTO * 0.007;

const POR_ARCO = 420; // desenho de cada prova
const FECHO = 620; // as junções a encostar
export const DURACAO_SELO = POR_ARCO * 4 + FECHO;

export function CerimoniaSelo({
  /** Quantas provas já estão acesas (0–4). Com 4, corre a cerimónia toda. */
  provas = 4,
  tamanho = 132,
  /** Chamado quando o anel fecha — é o gatilho para a insígnia entrar. */
  aoFechar,
}: {
  provas?: number;
  tamanho?: number;
  aoFechar?: () => void;
}) {
  // Um valor por arco (0 = por desenhar, 1 = desenhado) e um para o fecho.
  const arcos = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  const fecho = useRef(new Animated.Value(0)).current;
  const aoFecharRef = useRef(aoFechar);
  aoFecharRef.current = aoFechar;

  useEffect(() => {
    const seq = Animated.sequence([
      // As provas acendem POR ORDEM, nunca ao mesmo tempo: quatro coisas a
      // acontecer juntas leem-se como uma só, e cada prova custou por si.
      Animated.stagger(
        POR_ARCO * 0.62,
        arcos.slice(0, provas).map((v) =>
          Animated.timing(v, {
            toValue: 1,
            duration: POR_ARCO,
            // Trava no fim em vez de parar a direito — dá massa ao traço.
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          })
        )
      ),
      // O fecho é mais lento do que o desenho, e é de propósito: é o momento
      // que interessa. Pressa aqui deitava fora a cerimónia toda.
      Animated.timing(fecho, {
        toValue: provas >= 4 ? 1 : 0,
        duration: FECHO,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
    ]);
    seq.start(({ finished }) => {
      if (finished && provas >= 4) aoFecharRef.current?.();
    });
    return () => seq.stop(); // sem cleanup, sair a meio deixava o timer solto
  }, [arcos, fecho, provas]);

  const vao = fecho.interpolate({ inputRange: [0, 1], outputRange: [VAO_ABERTO, VAO_FECHADO] });

  return (
    <View style={[styles.caixa, { width: tamanho, height: tamanho }]}>
      <Svg width={tamanho} height={tamanho} viewBox="0 0 120 120">
        {/* O sulco por baixo: o lugar do anel existe antes de estar cheio —
            vê-se o que falta, que é meio caminho para o querer. */}
        <Circle cx={60} cy={60} r={R} stroke={Honra.verdeMaisEscuro} strokeWidth={5} fill="none" />
        {/* A rotação vai no atributo SVG PURO — `transform="rotate(a cx cy)"` —
            e não nas props `rotation`/`origin`/`originX` do react-native-svg.
            Na web essas props acabam todas em `transform-origin` (kebab-case),
            que o React DOM recusa: quatro arcos = quatro erros de consola por
            cada render. É a forma que a Insignia já usa e nunca deu problema. */}
        {arcos.map((v, i) => (
          <G key={i} transform={`rotate(${-90 + i * 90} 60 60)`}>
            <CirculoAnim
              cx={60}
              cy={60}
              r={R}
              stroke={Honra.dourado}
              strokeWidth={5}
              strokeLinecap="round"
              fill="none"
              // O traço deste arco encolhe com o vão: quando o vão fecha, os
              // quatro tocam-se e passam a ler-se como um anel só.
              strokeDasharray={
                Animated.subtract(new Animated.Value(QUARTO), vao) as unknown as number
              }
              // Desenha-se do início ao fim (offset a ir do comprimento a 0).
              strokeDashoffset={
                v.interpolate({ inputRange: [0, 1], outputRange: [QUARTO, 0] }) as unknown as number
              }
            />
          </G>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: { alignItems: 'center', justifyContent: 'center' },
});
