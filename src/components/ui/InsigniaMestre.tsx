import { forwardRef, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

/**
 * A INSÍGNIA DE MESTRE — a moeda cunhada.
 *
 * O topo da escada rompe com a família de propósito: os outros cinco escalões
 * são verde com dourado; este é a moeda INTEIRA. Chegar aqui vê-se de longe,
 * sem precisar de legenda — que é o que a lei do prestígio pede.
 *
 * O contraste NÃO vem de escurecer (ouro escurecido dá castanho, e provámo-lo
 * a caminho): o campo é ouro FOSCO — champanhe dessaturado — e o H é ouro
 * POLIDO e saturado. Separam-se pelo brilho, como numa moeda de verdade, onde
 * o campo perde o lustro com o manuseio e os relevos ficam a brilhar.
 *
 * ── ADAPTAÇÃO AO REACT NATIVE (deliberada) ───────────────────────────────
 * O handoff faz o relevo do H com um filtro SVG (`feSpecularLighting` +
 * `feGaussianBlur` + `feDropShadow`). O SVG do RN NÃO tem filtros — a peça
 * chegaria chapada ao telemóvel. Aqui o relevo é feito por CAMADAS, na ordem
 * em que a luz as faria:
 *     1. sombra funda deslocada (o vinco que a cunhagem deixa)
 *     2. contorno escuro fino (segura a forma quando a peça encolhe)
 *     3. preenchimento em gradiente polido (o metal)
 *     4. fio de luz no bordo superior (o brilho especular)
 *
 * ── A CERIMÓNIA É FEITA DE MOVIMENTO, NÃO DE OPACIDADE ───────────────────
 * A primeira versão trazia cada camada por `opacity` — as peças materializavam-se
 * do nada, como um diapositivo a passar. Uma moeda não aparece: é FUNDIDA e
 * CUNHADA. Aqui nada faz fade; tudo tem origem física e um gesto próprio:
 *
 *     1. o metal SOBE dentro do molde (nível a encher, de baixo para cima)
 *     2. o torno PASSA (sete anéis que se desenham, de fora para dentro)
 *     3. os dois pilares do H CRESCEM do centro
 *     4. a travessa LIGA-OS — é a ponte, e por isso vem sozinha e no momento
 *     5. as serifas ASSENTAM nas pontas
 *     6. os louros BROTAM, folha a folha, da base para o cimo
 *     7. o aro FECHA-SE à volta, como um traço que dá a volta
 *     8. a serrilha é FRESADA (o gume abre e os dentes correm)
 *     9. as pérolas são ENGASTADAS, uma a uma
 *
 * ── E DEPOIS DA SAUDAÇÃO, A PEÇA CONTINUA VIVA ───────────────────────────
 * Uma insígnia que congela no fim parece uma imagem colada. Terminada a
 * cerimónia entra o estado de repouso: a moeda respira (um flutuar de dois
 * pontos) e apanha a luz de tempos a tempos — um reflexo que a atravessa na
 * diagonal, como metal verdadeiro debaixo de uma lâmpada. É contido de
 * propósito: chama a atenção uma vez e não pede mais nada.
 *
 * Nas miniaturas (<96px) o repouso não corre — a esse tamanho o reflexo é
 * ruído invisível que só custa bateria.
 */

const OURO_ESCURO = '#6d5120';
const VINCO = '#2b1e06';
const CONTORNO = '#3d2f10';

/** As sete barras que fazem o H, em coordenadas da grelha 200×200. */
const BARRAS: { x: number; y: number; w: number; h: number }[] = [
  { x: 76, y: 68, w: 13, h: 64 },
  { x: 111, y: 68, w: 13, h: 64 },
  { x: 76, y: 94, w: 48, h: 11 },
  { x: 72, y: 68, w: 21, h: 5 },
  { x: 72, y: 127, w: 21, h: 5 },
  { x: 107, y: 68, w: 21, h: 5 },
  { x: 107, y: 127, w: 21, h: 5 },
];

/**
 * Cada barra pertence a um ATO da cunhagem: 0 = os pilares, 1 = a travessa
 * (a ponte), 2 = as serifas. A ordem não é decorativa — é o motivo do Honra
 * a ser cunhado à frente de quem vê.
 */
const ATO_DA_BARRA = [0, 0, 1, 2, 2, 2, 2];

/** Coroa de louros: 12 folhas de cada lado, em espelho. */
const LOUROS = (() => {
  const out: { x: number; y: number; rot: number; rx: number; ry: number }[] = [];
  const N = 12;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const A = -88 + (84 - -88) * t;
    const rx = 6 - 2.6 * t;
    const ry = 2.7 - 1.1 * t;
    for (const [lado, ang] of [
      ['r', A],
      ['l', 180 - A],
    ] as const) {
      const a = (ang * Math.PI) / 180;
      out.push({
        x: 100 + 47 * Math.cos(a),
        y: 100 - 47 * Math.sin(a),
        rot: -ang + (lado === 'r' ? 62 : -62),
        rx,
        ry,
      });
    }
  }
  return out;
})();

/** As 5 pérolas engastadas no aro. */
const PEROLAS = [0, 1, 2, 3, 4].map((i) => {
  const a = ((90 - i * 72) * Math.PI) / 180;
  return { x: 100 + 72 * Math.cos(a), y: 100 - 72 * Math.sin(a) };
});

/** Os anéis do torno, de fora para dentro (é essa a ordem em que passa). */
const ANEIS = [62, 54, 46, 38, 30, 22, 14];

const C = (r: number) => 2 * Math.PI * r;

/**
 * Serrilha à medida do tamanho. Abaixo de certo ponto, menos dentes e mais
 * largos — senão cada um fica com meio pixel e o aro colapsa em cinzento.
 *
 * Deixou de ser feita com 132 retângulos: é UM círculo com o tracejado a
 * fazer os dentes. Um nó em vez de cento e trinta e dois, e o gesto de
 * "fresar" (o gume a abrir enquanto os dentes correm) sai de graça.
 */
function serrilha(tamanho: number): { dente: number; passo: number } {
  const c = C(74);
  // O limiar de cima é 150 e não 200 de propósito: a peça de cerimónia
  // renderiza a 184px, e com a régua antiga caía no escalão do meio — 32
  // dentes gordos, que lêem como uma corrente e não como uma cunhagem.
  if (tamanho >= 150) return { dente: 1, passo: c / 132 };
  if (tamanho >= 72) return { dente: 2, passo: c / 44 };
  return { dente: 4.5, passo: c / 24 };
}

/**
 * O Animated injeta `collapsable={false}` no que envolve; na web o
 * react-native-svg despeja-a no DOM e o React avisa em cada frame. Mesmo
 * remédio da Insignia. E os componentes animados nascem AQUI, fora do render:
 * criá-los lá dentro fabricava um componente novo a cada frame, o SVG
 * remontava-se e a animação nunca chegava a avançar (a peça ficava presa no
 * primeiro fotograma — um aro dourado e mais nada).
 */
const semCollapsable = (Comp: any) =>
  forwardRef(({ collapsable: _ignorada, ...resto }: any, ref) => <Comp ref={ref} {...resto} />);

const ACircle = Animated.createAnimatedComponent(semCollapsable(Circle)) as any;
const ARect = Animated.createAnimatedComponent(semCollapsable(Rect)) as any;
const AEllipse = Animated.createAnimatedComponent(semCollapsable(Ellipse)) as any;

export const DURACAO_MESTRE = 9000;

/** Abaixo disto a peça é um ícone de lista: não respira nem apanha luz. */
const TAMANHO_VIVO = 96;

export function InsigniaMestre({
  tamanho = 210,
  animar = false,
  flutuar = true,
}: {
  tamanho?: number;
  animar?: boolean;
  flutuar?: boolean;
}) {
  const t = useRef(new Animated.Value(animar ? 0 : 1)).current;
  /** O repouso: um respira, outro varre. Correm depois da cerimónia. */
  const folego = useRef(new Animated.Value(0)).current;
  const luz = useRef(new Animated.Value(0)).current;

  const { dente, passo } = useMemo(() => serrilha(tamanho), [tamanho]);
  const vivo = flutuar && tamanho >= TAMANHO_VIVO;

  useEffect(() => {
    if (!animar) {
      t.setValue(1);
      return;
    }
    t.setValue(0);
    const a = Animated.timing(t, {
      toValue: 1,
      duration: DURACAO_MESTRE,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [animar, t]);

  // O REPOUSO. Só arranca quando a cerimónia acaba — a peça não respira
  // enquanto ainda está a ser cunhada.
  useEffect(() => {
    if (!vivo) return;
    const espera = animar ? DURACAO_MESTRE : 400;

    const respirar = Animated.sequence([
      Animated.delay(espera),
      Animated.loop(
        Animated.sequence([
          Animated.timing(folego, {
            toValue: 1,
            duration: 2400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(folego, {
            toValue: 0,
            duration: 2400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
    ]);

    // O reflexo passa depressa e volta a demorar — é assim que a luz apanha
    // uma peça de metal na mão de alguém. Se passasse sempre, seria um GIF.
    const relampejar = Animated.sequence([
      Animated.delay(espera + 900),
      Animated.loop(
        Animated.sequence([
          Animated.timing(luz, {
            toValue: 1,
            duration: 1300,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.delay(5200),
        ]),
      ),
    ]);

    respirar.start();
    relampejar.start();
    return () => {
      respirar.stop();
      relampejar.stop();
      folego.setValue(0);
      luz.setValue(0);
    };
  }, [animar, vivo, folego, luz]);

  /**
   * Fatia do relógio com travagem (ease-out): o gesto entra com força e
   * assenta. Uma fatia linear dá movimento de máquina; isto dá movimento de
   * matéria com peso.
   */
  const curva = (de: number, ate: number, saida: number[]) => {
    // O relógio acaba em 1 e o `inputRange` tem de ser estritamente crescente:
    // uma fase que terminasse em 1 (ou depois) partia o interpolate. As últimas
    // — as pérolas — encostam mesmo ao fim, por isso a régua trava aqui.
    const fim = Math.min(0.998, ate);
    const ini = Math.min(de, fim - 0.001);
    const d = fim - ini;
    const pontos = [0, ini, ini + d * 0.3, ini + d * 0.55, ini + d * 0.8, fim, 1];
    return t.interpolate({ inputRange: pontos, outputRange: saida, extrapolate: 'clamp' });
  };

  /** Entra com força e assenta — movimento de matéria com peso. */
  const fase = (de: number, ate: number) => curva(de, ate, [0, 0, 0.5, 0.78, 0.94, 1, 1]);

  /** Como a de cima, mas passa dos 100% e volta — o ressalto da prensa. */
  const faseImpacto = (de: number, ate: number) =>
    curva(de, ate, [0, 0, 0.72, 1.05, 1.03, 1, 1]);

  // ── A COREOGRAFIA ────────────────────────────────────────────────────────
  const metal = fase(0.04, 0.3);
  const atos = [faseImpacto(0.42, 0.54), faseImpacto(0.52, 0.63), faseImpacto(0.6, 0.69)];
  const aro = fase(0.78, 0.89);
  const gume = fase(0.82, 0.93);
  const dentes = fase(0.82, 0.96);

  /** O nível do metal a subir dentro do molde. */
  const nivelY = metal.interpolate({ inputRange: [0, 1], outputRange: [170, 30] });
  const nivelH = metal.interpolate({ inputRange: [0, 1], outputRange: [0, 140] });

  /**
   * As sete barras, cada uma a crescer a partir do seu centro. É preciso
   * interpolar as quatro medidas — o SVG do RN não tem `transform-origin`,
   * por isso a alternativa (escalar) obrigaria a props que na web saem em
   * kebab-case e enchem a consola de avisos.
   */
  const barras = useMemo(
    () =>
      BARRAS.map((b, i) => {
        const k = atos[ATO_DA_BARRA[i]];
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const de = (a: number, z: number) =>
          k.interpolate({ inputRange: [0, 1], outputRange: [a, z] });
        return {
          x: de(cx, b.x),
          y: de(cy, b.y),
          // A sombra da cunhagem cai para baixo-DIREITA: é o lado oposto à
          // lâmpada. Cair a direito para baixo dava uma peça iluminada de
          // frente, que é precisamente o que não acontece numa moeda na mão.
          xv: de(cx + 0.55, b.x + 0.55),
          yv: de(cy + 0.85, b.y + 0.85),
          w: de(0, b.w),
          h: de(0, b.h),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );

  /** Os anéis do torno: cada um desenha-se a seguir ao anterior. */
  const aneis = useMemo(
    () =>
      ANEIS.map((r, i) => {
        const de = 0.26 + i * 0.022;
        return { r, c: C(r), off: fase(de, de + 0.07) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );

  /** Os louros brotam da base para o cimo — a coroa a fechar-se por cima. */
  const louros = useMemo(
    () =>
      LOUROS.map((l, i) => {
        const de = 0.64 + (i / LOUROS.length) * 0.12;
        const k = faseImpacto(de, de + 0.05);
        return {
          ...l,
          rx: k.interpolate({ inputRange: [0, 1], outputRange: [0, l.rx] }),
          ry: k.interpolate({ inputRange: [0, 1], outputRange: [0, l.ry] }),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );

  /** As pérolas são engastadas uma a uma, a começar pela do topo. */
  const perolas = useMemo(
    () =>
      PEROLAS.map((p, i) => {
        const de = 0.9 + i * 0.018;
        const k = faseImpacto(de, de + 0.045);
        const r = (v: number) => k.interpolate({ inputRange: [0, 1], outputRange: [0, v] });
        return { ...p, fora: r(4.4), meio: r(3.5), luz: r(1.5) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );

  return (
    <Animated.View
      style={{
        width: tamanho,
        height: tamanho,
        transform: [
          { translateY: folego.interpolate({ inputRange: [0, 1], outputRange: [0, -2.5] }) },
          { scale: folego.interpolate({ inputRange: [0, 1], outputRange: [1, 1.008] }) },
        ],
      }}
    >
      <Svg width={tamanho} height={tamanho} viewBox="0 0 200 200">
        <Defs>
          <LinearGradient id="mAro" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#f7e6ac" />
            <Stop offset="0.28" stopColor="#d9b45f" />
            <Stop offset="0.55" stopColor="#a67e34" />
            <Stop offset="0.78" stopColor="#e7ce86" />
            <Stop offset="1" stopColor={OURO_ESCURO} />
          </LinearGradient>
          {/* O CAMPO: champanhe fosco. Quente (não cinza — isso dava prata) e
              claro (não escuro — isso dava castanho).
              `userSpaceOnUse` é obrigatório aqui: o metal entra num retângulo
              que CRESCE, e num gradiente ligado à caixa do objeto a luz subia
              com ele — o campo mudava de cor enquanto enchia. Preso ao espaço
              da moeda, a luz fica onde está e é o metal que passa por baixo. */}
          <LinearGradient
            id="mCampo"
            gradientUnits="userSpaceOnUse"
            x1="66"
            y1="41"
            x2="134"
            y2="159"
          >
            <Stop offset="0" stopColor="#fff6d6" />
            <Stop offset="0.16" stopColor="#f0d18a" />
            <Stop offset="0.34" stopColor="#dcb055" />
            <Stop offset="0.52" stopColor="#c9962f" />
            <Stop offset="0.7" stopColor="#dcb055" />
            <Stop offset="0.86" stopColor="#f2d896" />
            <Stop offset="1" stopColor="#ffeeb9" />
          </LinearGradient>
          {/* O H: ouro POLIDO, com o gradiente na caixa de CADA barra — como o
              handoff o desenhou, e por uma razão que só se vê em grande: preso
              ao espaço da moeda, o salto de luz corria como uma única risca
              diagonal por cima das sete barras, e o H lia-se como uma chapa
              recortada com um risco em vez de sete faces cunhadas. Por barra,
              cada face apanha a luz ao longo da sua própria dimensão maior —
              os pilares ao alto, a travessa ao comprido — que é o que um
              relevo faz debaixo de uma lâmpada.

              Durante a cunhagem a luz cresce com a barra. Não é defeito: o
              relevo está a formar-se, e a alternativa (luz fixa) é que seria
              estranha. */}
          <LinearGradient id="mPolido" x1="0.28" y1="0" x2="0.34" y2="1">
            <Stop offset="0" stopColor="#fffbe6" />
            <Stop offset="0.2" stopColor="#ffe9a3" />
            <Stop offset="0.38" stopColor="#e2a52a" />
            <Stop offset="0.52" stopColor="#a86f12" />
            <Stop offset="0.53" stopColor="#ffdf8e" />
            <Stop offset="0.74" stopColor="#e6b13a" />
            <Stop offset="1" stopColor="#ffeaa6" />
          </LinearGradient>
          {/* AS FOLHAS têm gradiente PRÓPRIO, ligado à caixa de cada uma.
              O `mPolido` está preso ao espaço da moeda (por causa do H, que
              cresce) e só cobre a faixa y 68→132; as folhas da coroa vivem
              fora dessa faixa e apanhavam apenas o stop extremo — saíam
              brancas em cima e cor de creme em baixo. Cada folha é pequena e
              não muda de sítio, por isso aqui a caixa do objeto é o correto. */}
          <LinearGradient
            id="mFolha"
            gradientUnits="userSpaceOnUse"
            x1="67"
            y1="43"
            x2="133"
            y2="157"
          >
            {/* Paleta PRÓPRIA, e mais contida do que a do H: com os extremos
                claros do metal polido, as folhas de cima saíam brancas e as de
                baixo cor de creme — a coroa deixava de ser de louro e passava a
                ser de arroz. Aqui o ouro escurece para o lado da sombra, que é
                o que a faz destacar-se contra um campo claro. */}
            <Stop offset="0" stopColor="#ffe9a4" />
            <Stop offset="0.3" stopColor="#e8b84a" />
            <Stop offset="0.55" stopColor="#c08c22" />
            <Stop offset="0.8" stopColor="#a2701a" />
            <Stop offset="1" stopColor="#845a13" />
          </LinearGradient>
          <RadialGradient
            id="mVinheta"
            gradientUnits="userSpaceOnUse"
            cx="100"
            cy="86"
            r="87"
          >
            <Stop offset="0.5" stopColor="#000" stopOpacity="0" />
            <Stop offset="1" stopColor="#000" stopOpacity="0.5" />
          </RadialGradient>
          {/* O FIO DE LUZ. Antes era um contorno de opacidade fixa a toda a
              volta de cada barra — e um bordo que brilha por baixo é o que faz
              uma peça parecer recortada e colada em vez de cunhada. Agora é um
              gradiente na CAIXA DE CADA BARRA (é o bordo que interessa, e o
              bordo cresce com ela): acende no canto que a luz apanha e apaga-se
              antes de chegar ao lado oposto. */}
          <LinearGradient id="mFio" x1="0" y1="0" x2="0.7" y2="1">
            <Stop offset="0" stopColor="#fffdf0" stopOpacity="0.9" />
            <Stop offset="0.32" stopColor="#fff6d0" stopOpacity="0.4" />
            <Stop offset="0.6" stopColor="#fff6d0" stopOpacity="0" />
            <Stop offset="1" stopColor="#fff6d0" stopOpacity="0" />
          </LinearGradient>
          {/* O reflexo do repouso. */}
          <LinearGradient id="mLuz" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#fff" stopOpacity="0" />
            <Stop offset="0.5" stopColor="#fff" stopOpacity="0.5" />
            <Stop offset="1" stopColor="#fff" stopOpacity="0" />
          </LinearGradient>
          <ClipPath id="mClip">
            <Circle cx="100" cy="100" r="68" />
          </ClipPath>
          <ClipPath id="mMoeda">
            <Circle cx="100" cy="100" r="84" />
          </ClipPath>
        </Defs>

        {/* O disco escuro por baixo — o lugar da moeda existe antes do metal. */}
        <Circle cx="100" cy="100" r="84" fill="#0f120b" />
        <Circle cx="100" cy="100" r="84" fill="none" stroke="url(#mAro)" strokeWidth={5} />

        {/* 1. O METAL SOBE. O molde enche-se de baixo para cima. */}
        <G clipPath="url(#mClip)">
          <ARect x={30} y={nivelY} width={140} height={nivelH} fill="url(#mCampo)" />
          <ARect x={30} y={nivelY} width={140} height={nivelH} fill="url(#mVinheta)" />
        </G>

        {/* 2. O TORNO PASSA. Sete anéis que se desenham, de fora para dentro. */}
        <G clipPath="url(#mClip)">
          {aneis.map((a, i) => (
            <ACircle
              key={a.r}
              cx="100"
              cy="100"
              r={a.r}
              fill="none"
              stroke={i % 2 === 1 ? '#fff3c9' : '#5e4415'}
              strokeOpacity={i % 2 === 1 ? 0.05 : 0.16}
              strokeWidth={0.5}
              strokeDasharray={`${a.c}`}
              strokeDashoffset={a.off.interpolate({
                inputRange: [0, 1],
                outputRange: [a.c, 0],
              })}
            />
          ))}
        </G>

        {/* 3-5. O H CUNHADO: pilares, ponte, serifas — cada barra a crescer do
            seu centro, em quatro camadas de relevo. */}
        <G opacity={0.5}>
          {barras.map((b, i) => (
            <ARect
              key={`v${i}`}
              x={b.xv}
              y={b.yv}
              width={b.w}
              height={b.h}
              rx={1.5}
              fill="none"
              stroke={VINCO}
              strokeWidth={2.4}
              strokeLinejoin="round"
            />
          ))}
        </G>
        <G opacity={0.5}>
          {barras.map((b, i) => (
            <ARect
              key={`c${i}`}
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={1.5}
              fill="none"
              stroke={CONTORNO}
              strokeWidth={1.1}
              strokeLinejoin="round"
            />
          ))}
        </G>
        {barras.map((b, i) => (
          <ARect
            key={`m${i}`}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={1.5}
            fill="url(#mPolido)"
          />
        ))}
        {barras.map((b, i) => (
          <ARect
            key={`l${i}`}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={1.5}
            fill="none"
            stroke="url(#mFio)"
            strokeWidth={0.7}
          />
        ))}

        {/* 6. OS LOUROS BROTAM, folha a folha. */}
        {louros.map((l, i) => (
          <G
            key={i}
            transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${l.rot.toFixed(1)})`}
          >
            <AEllipse
              cx={0}
              cy={0}
              rx={l.rx}
              ry={l.ry}
              fill="none"
              stroke={VINCO}
              strokeWidth={1.6}
              strokeOpacity={0.5}
            />
            <AEllipse
              cx={0}
              cy={0}
              rx={l.rx}
              ry={l.ry}
              fill="url(#mFolha)"
              stroke="url(#mFio)"
              strokeWidth={0.45}
            />
          </G>
        ))}

        {/* 7. O ARO FECHA-SE — três traços que dão a volta à peça. */}
        {[
          { r: 74, cor: '#0c1a0f', sw: 8, op: 0.55 },
          { r: 78, cor: OURO_ESCURO, sw: 2.5, op: 1 },
          { r: 72, cor: 'url(#mAro)', sw: 1.3, op: 0.6 },
        ].map((o) => (
          <ACircle
            key={o.r}
            cx="100"
            cy="100"
            r={o.r}
            fill="none"
            stroke={o.cor}
            strokeWidth={o.sw}
            strokeOpacity={o.op}
            strokeDasharray={`${C(o.r)}`}
            strokeDashoffset={aro.interpolate({
              inputRange: [0, 1],
              outputRange: [C(o.r), 0],
            })}
          />
        ))}

        {/* 8. A SERRILHA É FRESADA: o gume abre (a espessura cresce) enquanto
            os dentes correm à volta e assentam. Um só nó — o tracejado faz os
            dentes todos. */}
        <ACircle
          cx="100"
          cy="100"
          r={74}
          fill="none"
          stroke="#c8a34e"
          strokeOpacity={0.9}
          strokeWidth={gume.interpolate({ inputRange: [0, 1], outputRange: [0, 8] })}
          strokeDasharray={`${dente} ${passo - dente}`}
          strokeDashoffset={dentes.interpolate({
            inputRange: [0, 1],
            outputRange: [passo * 9, 0],
          })}
        />

        {/* 9. AS PÉROLAS SÃO ENGASTADAS, uma a uma. */}
        {perolas.map((p, i) => (
          <G key={i} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
            <ACircle cx={0} cy={0} r={p.fora} fill="#0f120b" />
            <ACircle cx={0} cy={0} r={p.meio} fill="url(#mAro)" />
            <ACircle cx={0} cy={0} r={p.luz} fill="#fff7db" />
          </G>
        ))}

        {/* O REPOUSO: a luz que atravessa a peça de tempos a tempos. */}
        {vivo ? (
          <G clipPath="url(#mMoeda)" transform="rotate(-18 100 100)">
            <ARect
              x={luz.interpolate({ inputRange: [0, 1], outputRange: [-96, 200] })}
              y={-60}
              width={46}
              height={320}
              fill="url(#mLuz)"
            />
          </G>
        ) : null}
      </Svg>
    </Animated.View>
  );
}
