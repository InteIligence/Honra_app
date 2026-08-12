import { forwardRef, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { RESPIRA_A_PARTIR_DE } from '../../theme/prestigio';
import { InsigniaMestre } from './InsigniaMestre';
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
 * INSÍGNIA HONRA — as 5 insígnias do percurso, construídas em cena.
 * Porte do design "Animações de insígnias por valor" (Claude Design, Vítor):
 * mesma geometria (viewBox 200×200), mesmas cores/gradientes, mesma
 * coreografia e os mesmos tempos. Quanto mais alto o escalão, mais longo e
 * elaborado o ritual — Verificado ~2s, Mestre ~7,5s.
 *
 * ADAPTAÇÃO AO NATIVO (deliberada, não preguiça): o SVG do RN não tem filtros
 * (emboss/glow) nem `transform-box:fill-box`. Em vez de transformar grupos,
 * animamos a GEOMETRIA — a barra do H cresce do centro por `x`+`width`, os
 * braços disparam por `y`+`height`, as folhas do louro nascem por `rx`/`ry`,
 * os anéis desenham-se por `strokeDashoffset`. Resultado igual, sem depender
 * de origens de transformação. O emboss dá lugar ao halo dourado (que o
 * desenho já previa) — a luz vem do gradiente, não de um filtro.
 *
 * Um só relógio (`t`, linear em ms) conduz tudo: cada propriedade é uma
 * interpolação com os MESMOS keyframes/percentagens do CSS de origem.
 */

/**
 * O Animated clássico injeta `collapsable={false}` (prop de Views nativas) no
 * componente que envolve; na web o react-native-svg despeja-a no DOM
 * (`<circle collapsable="false">`) e o React avisa em cada frame. Este
 * invólucro retira-a antes de chegar ao SVG — não faz falta a nenhuma
 * plataforma — mantendo o ref no componente de base (setNativeProps intacto).
 */
const semCollapsable = (Comp: any) =>
  forwardRef(({ collapsable: _ignorada, ...resto }: any, ref) => (
    <Comp ref={ref} {...resto} />
  ));

const ACircle = Animated.createAnimatedComponent(semCollapsable(Circle)) as any;
const ARect = Animated.createAnimatedComponent(semCollapsable(Rect)) as any;
const AEllipse = Animated.createAnimatedComponent(semCollapsable(Ellipse)) as any;

/** O "H" não é texto: são 7 rectângulos, para cada segmento animar sozinho. */
const H_BRACO_E = { x: 76, y: 68, w: 13, h: 64 };
const H_BRACO_D = { x: 111, y: 68, w: 13, h: 64 };
const H_BARRA = { x: 76, y: 94, w: 48, h: 11 };
const H_SERIFAS = [
  { x: 72, y: 68, w: 21, h: 5 },
  { x: 72, y: 127, w: 21, h: 5 },
  { x: 107, y: 68, w: 21, h: 5 },
  { x: 107, y: 127, w: 21, h: 5 },
];

/**
 * Duração total do ritual de cada escalão (ms) — sobe com o valor.
 * REGRA: tem de ser MAIOR que o fim da última animação do escalão, senão o
 * relógio pára a meio e a última coisa em cena congela (bug do Provado, 20/07:
 * o varrimento final terminava aos 4700ms com o relógio a parar aos 4300 —
 * ficava a lâmina de luz encravada a meio do disco). Fins reais por escalão:
 * 1900 · 4700 (varrimento) · 5400 (varrimento) · 6300 (pulso) · 8300 (varrimento).
 */
// O Mestre e' o mais longo: e' o unico que se forja de raiz, com moeda,
// coroa, aro e serrilha. Ver InsigniaMestre.
export const DURACAO = [2200, 4900, 5600, 6600, 8500, 9000];

type Keyframe = [pct: number, valor: number];

/** Uma folha de louro já colocada na coroa. */
type Folha = { x: number; y: number; rot: number; rx: number; ry: number; atraso: number };

/**
 * Coroa de louros — porte fiel do `wreath()` do design: coloca `count` pares
 * de folhas simétricos ao longo de um arco, encolhendo para o topo, cada uma
 * com o seu atraso.
 */
function coroa(cfg: {
  count: number;
  from: number;
  to: number;
  baseDelay: number;
  stagger: number;
  tilt: number;
  r: number;
  rx0: number;
  ry0: number;
}): Folha[] {
  const out: Folha[] = [];
  for (let i = 0; i < cfg.count; i++) {
    const p = cfg.count === 1 ? 0 : i / (cfg.count - 1);
    const A = cfg.from + (cfg.to - cfg.from) * p;
    const atraso = (cfg.baseDelay + i * cfg.stagger) * 1000;
    const rx = cfg.rx0 - 2.6 * p;
    const ry = cfg.ry0 - 1.1 * p;
    for (const [lado, ang] of [
      ['r', A],
      ['l', 180 - A],
    ] as const) {
      const a = (ang * Math.PI) / 180;
      out.push({
        x: 100 + cfg.r * Math.cos(a),
        y: 100 - cfg.r * Math.sin(a),
        rot: -ang + (lado === 'r' ? cfg.tilt : -cfg.tilt),
        rx,
        ry,
        atraso,
      });
    }
  }
  return out;
}

/** Traço pontilhado simétrico e sem costura: 25 pontos ao longo do perímetro. */
function pontilhado(r: number) {
  const c = 2 * Math.PI * r;
  return `${c * 0.014} ${c * 0.026}`;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

type PropsInsignia = {
  /** Peça de ARTE (não escalão): 0 Verificado · 1 Provado · 2 Recomendado ·
   *  3 Reconhecido · 4 Referenciado · 5 Mestre. Ver `nivelDesenho()`. */
  nivel: 0 | 1 | 2 | 3 | 4 | 5;
  tamanho?: number;
  /** true = constrói-se em cena; false = já forjada (estado de repouso). */
  animar?: boolean;
  flutuar?: boolean;
  /** true = medalhão 3D: inclina com o gesto (dedo/rato) e volta ao centro. */
  interativo?: boolean;
  style?: StyleProp<ViewStyle>;
};

function InsigniaBase({
  nivel,
  tamanho = 184,
  animar = false,
  flutuar = true,
  interativo = false,
  style,
}: PropsInsignia) {
  const dur = DURACAO[nivel];
  const t = useRef(new Animated.Value(animar ? 0 : dur + 1)).current;
  const bob = useRef(new Animated.Value(0)).current;

  // Inclinação 3D (graus): rotY = arrasto horizontal, rotX = vertical.
  const rotX = useRef(new Animated.Value(0)).current;
  const rotY = useRef(new Animated.Value(0)).current;
  const interRef = useRef(interativo);
  interRef.current = interativo;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => interRef.current,
      // Só reivindica arrasto horizontal-dominante: deixa o scroll vertical
      // passar (o selo pode viver dentro de uma lista).
      onMoveShouldSetPanResponder: (_e, g) =>
        interRef.current && Math.abs(g.dx) >= Math.abs(g.dy) && Math.abs(g.dx) > 2,
      onPanResponderMove: (_e, g) => {
        // Alcance contido: um tilt nobre que apanha a luz, nunca de perfil.
        rotY.setValue(clamp(g.dx * 0.28, -26, 26));
        rotX.setValue(clamp(-g.dy * 0.28, -16, 16));
      },
      onPanResponderRelease: () => {
        // Volta ao repouso com elasticidade — o medalhão "assenta" na mão.
        Animated.spring(rotY, { toValue: 0, friction: 5, tension: 40, useNativeDriver: false }).start();
        Animated.spring(rotX, { toValue: 0, friction: 5, tension: 40, useNativeDriver: false }).start();
      },
    })
  ).current;

  useEffect(() => {
    if (!animar) {
      t.setValue(dur + 1);
      return;
    }
    t.setValue(0);
    const anim = Animated.timing(t, {
      toValue: dur,
      duration: dur,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [animar, dur, t]);

  // O RESPIRAR É DO TERÇO DE CIMA. Até ao Recomendado a peça fica parada; do
  // Reconhecido para cima flutua. A lei vive no `prestigio.ts` porque é uma
  // regra de escalão, não uma opção deste componente — quem mexer na escada
  // encontra-a onde a foi procurar.
  const respira = flutuar && nivel >= RESPIRA_A_PARTIR_DE;

  useEffect(() => {
    // Sem flutuação quando é interativo (o gesto é que dá o movimento).
    if (!respira || interativo) return;
    const laco = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );
    laco.start();
    return () => laco.stop();
  }, [respira, interativo, bob]);

  /** Um keyframe do CSS de origem, traduzido em interpolação sobre o relógio. */
  const kf = useMemo(
    () => (inicio: number, duracao: number, stops: Keyframe[]) =>
      t.interpolate({
        inputRange: stops.map(([p]) => inicio + (duracao * p) / 100),
        outputRange: stops.map(([, v]) => v),
        extrapolate: 'clamp',
      }),
    [t]
  );

  /** `draw` — o anel a desenhar-se (dashoffset do perímetro até zero). */
  const desenhar = (r: number, inicio: number, duracao: number) => {
    const c = 2 * Math.PI * r;
    return {
      strokeDasharray: `${c}`,
      strokeDashoffset: kf(inicio, duracao, [
        [0, c],
        [100, 0],
      ]),
    };
  };

  /** `discIn` — o disco a nascer do centro (animando o raio, não a escala). */
  const disco = (r: number, inicio: number, duracao: number) => ({
    r: kf(inicio, duracao, [
      [0, r * 0.55],
      [70, r * 1.05],
      [100, r],
    ]),
    opacity: kf(inicio, duracao, [
      [0, 0],
      [55, 1],
      [100, 1],
    ]),
  });

  /** `popSeg`/`serifBloom` — o segmento a crescer a partir do seu centro. */
  const brotar = (
    b: { x: number; y: number; w: number; h: number },
    inicio: number,
    duracao: number,
    escalas: Keyframe[]
  ) => {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    return {
      x: kf(inicio, duracao, escalas.map(([p, s]) => [p, cx - (b.w * s) / 2] as Keyframe)),
      y: kf(inicio, duracao, escalas.map(([p, s]) => [p, cy - (b.h * s) / 2] as Keyframe)),
      width: kf(
        inicio,
        duracao,
        escalas.map(([p, s]) => [p, Math.max(0.01, b.w * s)] as Keyframe)
      ),
      height: kf(
        inicio,
        duracao,
        escalas.map(([p, s]) => [p, Math.max(0.01, b.h * s)] as Keyframe)
      ),
      opacity: kf(inicio, duracao, [
        [0, 0],
        [18, 1],
        [100, 1],
      ]),
    };
  };

  const POP: Keyframe[] = [
    [0, 0],
    [70, 1.2],
    [100, 1],
  ];
  const BLOOM: Keyframe[] = [
    [0, 0.2],
    [60, 1.18],
    [100, 1],
  ];

  /** `shineSweep` — a lâmina de luz a varrer o disco (recortada nele). */
  const varrimento = (rDisco: number, inicio: number, duracao: number) => (
    <G clipPath="url(#recorteDisco)">
      <ARect
        x={kf(inicio, duracao, [
          [0, -40],
          [100, 190],
        ])}
        y={4}
        width={30}
        height={192}
        fill="url(#brilho)"
        // Em SVG o skewX é SEM UNIDADE. Com "deg" o browser descarta a
        // transformação inteira (e a consola diz `Expected ')'`), por isso
        // o varrimento de brilho passava a direito em vez de inclinado.
        transform="skewX(-14)"
        opacity={kf(inicio, duracao, [
          [0, 0],
          [12, 0.9],
          [55, 0.9],
          [100, 0],
        ])}
      />
      <Circle cx="100" cy="100" r={rDisco} fill="none" />
    </G>
  );

  /** Faísca de 4 pontas. */
  const faisca = (cx: number, cy: number, raio: number, inicio: number, duracao: number) => (
    <AEllipse
      cx={cx}
      cy={cy}
      rx={kf(inicio, duracao, [
        [0, 0],
        [45, raio],
        [100, raio * 0.3],
      ])}
      ry={kf(inicio, duracao, [
        [0, 0],
        [45, raio],
        [100, raio * 0.3],
      ])}
      fill="#f7e6ac"
      opacity={kf(inicio, duracao, [
        [0, 0],
        [45, 1],
        [100, 0],
      ])}
    />
  );

  const folhas = useMemo(() => {
    if (nivel === 2)
      return coroa({
        count: 8,
        from: -78,
        to: 60,
        baseDelay: 2.4,
        stagger: 0.13,
        tilt: 58,
        r: 55,
        rx0: 6.6,
        ry0: 2.9,
      });
    if (nivel === 3)
      return coroa({
        count: 10,
        from: -86,
        to: 80,
        baseDelay: 2.0,
        stagger: 0.14,
        tilt: 60,
        r: 51,
        rx0: 6.3,
        ry0: 2.8,
      });
    if (nivel === 4)
      return coroa({
        count: 12,
        from: -88,
        to: 84,
        baseDelay: 2.6,
        stagger: 0.12,
        tilt: 62,
        r: 47,
        rx0: 6,
        ry0: 2.7,
      });
    return [];
  }, [nivel]);

  const louro = folhas.map((f, i) => (
    <AEllipse
      key={`f${i}`}
      cx={0}
      cy={0}
      rx={kf(f.atraso, 500, [
        [0, 0],
        [70, f.rx * 1.18],
        [100, f.rx],
      ])}
      ry={kf(f.atraso, 500, [
        [0, 0],
        [70, f.ry * 1.18],
        [100, f.ry],
      ])}
      fill="url(#ouro)"
      transform={`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) rotate(${f.rot.toFixed(1)})`}
    />
  ));

  // Raio do disco de cada escalão (para o recorte do varrimento).
  const R_DISCO = [73, 72, 72, 70, 66][nivel];

  const defs = (
    <Defs>
      <LinearGradient id="ouro" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#f7e6ac" />
        <Stop offset="0.28" stopColor="#d9b45f" />
        <Stop offset="0.55" stopColor="#a67e34" />
        <Stop offset="0.78" stopColor="#e7ce86" />
        <Stop offset="1" stopColor="#6d5120" />
      </LinearGradient>
      <LinearGradient id="prata" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#ffffff" />
        <Stop offset="0.32" stopColor="#dfe4e9" />
        <Stop offset="0.6" stopColor="#9aa4ad" />
        <Stop offset="0.8" stopColor="#e8edf1" />
        <Stop offset="1" stopColor="#7e8791" />
      </LinearGradient>
      <LinearGradient id="brilho" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#fff7db" stopOpacity="0" />
        <Stop offset="0.5" stopColor="#fff7db" stopOpacity="0.8" />
        <Stop offset="1" stopColor="#fff7db" stopOpacity="0" />
      </LinearGradient>
      <RadialGradient id="sombraDisco" cx="0.5" cy="0.4" r="0.64">
        <Stop offset="0.5" stopColor="#000000" stopOpacity="0" />
        <Stop offset="1" stopColor="#000000" stopOpacity="0.5" />
      </RadialGradient>
      <RadialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
        <Stop offset="0" stopColor="#f2d98f" stopOpacity="0.5" />
        <Stop offset="1" stopColor="#f2d98f" stopOpacity="0" />
      </RadialGradient>
      <ClipPath id="recorteDisco">
        <Circle cx="100" cy="100" r={R_DISCO} />
      </ClipPath>
      <ClipPath id="recorteH">
        {[H_BRACO_E, H_BRACO_D, H_BARRA, ...H_SERIFAS].map((s, i) => (
          <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} />
        ))}
      </ClipPath>
    </Defs>
  );

  /** O H de cada escalão — o material e a coreografia mudam com o valor. */
  function glifoH() {
    const ouro = 'url(#ouro)';
    switch (nivel) {
      // ── 1 Verificado: prata, aparece inteiro (hPop, no invólucro). ──
      case 0:
        return (
          <G>
            {[H_BRACO_E, H_BRACO_D, H_BARRA, ...H_SERIFAS].map((s, i) => (
              <Rect
                key={i}
                x={s.x}
                y={s.y}
                width={s.w}
                height={s.h}
                rx={1.5}
                fill="url(#prata)"
              />
            ))}
          </G>
        );
      // ── 2 Provado: ouro, abre do centro (splitOut, no invólucro). ──
      case 1:
        return (
          <G>
            {[H_BRACO_E, H_BRACO_D, H_BARRA, ...H_SERIFAS].map((s, i) => (
              <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={1.5} fill={ouro} />
            ))}
          </G>
        );
      // ── 3 Reconhecido: braços sobem do chão, barra corre, serifas pipocam. ──
      case 2:
        return (
          <G>
            {[
              { b: H_BRACO_E, atraso: 1200 },
              { b: H_BRACO_D, atraso: 1350 },
            ].map(({ b, atraso }, i) => (
              <ARect
                key={`b${i}`}
                x={b.x}
                y={kf(atraso, 500, [
                  [0, b.y + b.h],
                  [100, b.y],
                ])}
                width={b.w}
                height={kf(atraso, 500, [
                  [0, 0.01],
                  [100, b.h],
                ])}
                rx={1.5}
                fill={ouro}
                opacity={kf(atraso, 500, [
                  [0, 0],
                  [12, 1],
                  [100, 1],
                ])}
              />
            ))}
            <ARect
              x={H_BARRA.x}
              y={H_BARRA.y}
              width={kf(1700, 450, [
                [0, 0.01],
                [100, H_BARRA.w],
              ])}
              height={H_BARRA.h}
              rx={1.5}
              fill={ouro}
              opacity={kf(1700, 450, [
                [0, 0],
                [12, 1],
                [100, 1],
              ])}
            />
            {H_SERIFAS.map((s, i) => (
              <ARect key={`s${i}`} rx={1.5} fill={ouro} {...brotar(s, 1900 + i * 70, 350, POP)} />
            ))}
          </G>
        );
      // ── 4 Referência: braços deslizam dos lados, barra cai, serifas pipocam. ──
      case 3:
        return (
          <G>
            <ARect
              x={kf(3700, 550, [
                [0, H_BRACO_E.x - 24],
                [100, H_BRACO_E.x],
              ])}
              y={H_BRACO_E.y}
              width={H_BRACO_E.w}
              height={H_BRACO_E.h}
              rx={1.5}
              fill={ouro}
              opacity={kf(3700, 550, [
                [0, 0],
                [30, 1],
                [100, 1],
              ])}
            />
            <ARect
              x={kf(3700, 550, [
                [0, H_BRACO_D.x + 24],
                [100, H_BRACO_D.x],
              ])}
              y={H_BRACO_D.y}
              width={H_BRACO_D.w}
              height={H_BRACO_D.h}
              rx={1.5}
              fill={ouro}
              opacity={kf(3700, 550, [
                [0, 0],
                [30, 1],
                [100, 1],
              ])}
            />
            <ARect
              x={H_BARRA.x}
              y={kf(4150, 500, [
                [0, H_BARRA.y - 20],
                [70, H_BARRA.y + 2],
                [100, H_BARRA.y],
              ])}
              width={H_BARRA.w}
              height={H_BARRA.h}
              rx={1.5}
              fill={ouro}
              opacity={kf(4150, 500, [
                [0, 0],
                [25, 1],
                [100, 1],
              ])}
            />
            {H_SERIFAS.map((s, i) => (
              <ARect key={`s${i}`} rx={1.5} fill={ouro} {...brotar(s, 4450 + i * 50, 350, POP)} />
            ))}
          </G>
        );
      // ── 5 Mestre: a barra cresce do CENTRO; os braços disparam para cima e
      //    para baixo do seu meio; as serifas florescem nas 4 pontas. ──
      default: {
        const barra = {
          x: kf(4700, 550, [
            [0, 100],
            [82, 100 - (H_BARRA.w * 1.05) / 2],
            [100, H_BARRA.x],
          ]),
          width: kf(4700, 550, [
            [0, 0.01],
            [82, H_BARRA.w * 1.05],
            [100, H_BARRA.w],
          ]),
          opacity: kf(4700, 550, [
            [0, 0],
            [14, 1],
            [100, 1],
          ]),
        };
        const braco = (b: typeof H_BRACO_E) => ({
          y: kf(5200, 580, [
            [0, 100],
            [80, 100 - (b.h * 1.06) / 2],
            [100, b.y],
          ]),
          height: kf(5200, 580, [
            [0, 0.01],
            [80, b.h * 1.06],
            [100, b.h],
          ]),
          opacity: kf(5200, 580, [
            [0, 0],
            [14, 1],
            [100, 1],
          ]),
        });
        return (
          <G>
            {/* O halo dourado por trás do H (a luz que o emboss dava). */}
            <AEllipse
              cx={100}
              cy={100}
              rx={42}
              ry={48}
              fill="url(#halo)"
              opacity={kf(5200, 1600, [
                [0, 0],
                [45, 0.6],
                [100, 0.28],
              ])}
            />
            <ARect {...barra} y={H_BARRA.y} height={H_BARRA.h} rx={1.5} fill={ouro} />
            <ARect
              {...braco(H_BRACO_E)}
              x={H_BRACO_E.x}
              width={H_BRACO_E.w}
              rx={1.5}
              fill={ouro}
            />
            <ARect
              {...braco(H_BRACO_D)}
              x={H_BRACO_D.x}
              width={H_BRACO_D.w}
              rx={1.5}
              fill={ouro}
            />
            {H_SERIFAS.map((s, i) => (
              <ARect
                key={`s${i}`}
                rx={1.5}
                fill={ouro}
                {...brotar(s, 5720 + (i > 1 ? 80 : 0), 420, BLOOM)}
              />
            ))}
            {/* hGlint — o realce quente a varrer, recortado no próprio H. */}
            <G clipPath="url(#recorteH)">
              <ARect
                x={kf(6200, 1200, [
                  [0, 16],
                  [100, 132],
                ])}
                y={60}
                width={16}
                height={86}
                fill="url(#brilho)"
                transform="skewX(-16)"
                opacity={kf(6200, 1200, [
                  [0, 0],
                  [22, 0.95],
                  [70, 0.95],
                  [100, 0],
                ])}
              />
            </G>
          </G>
        );
      }
    }
  }

  /** O palco de cada escalão: anéis, discos, bisel, louros. */
  function palco() {
    switch (nivel) {
      case 0:
        return (
          <G>
            <ACircle
              cx="100"
              cy="100"
              r={80}
              fill="none"
              stroke="#3fa878"
              strokeWidth={6.5}
              strokeLinecap="round"
              {...desenhar(80, 120, 850)}
            />
            <ACircle cx="100" cy="100" fill="#175540" {...disco(73, 40, 700)} />
            <ACircle
              cx="100"
              cy="100"
              r={73}
              fill="url(#sombraDisco)"
              opacity={kf(500, 600, [
                [0, 0],
                [100, 1],
              ])}
            />
            <Circle
              cx="100"
              cy="100"
              r={67}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.09}
              strokeWidth={1.4}
            />
          </G>
        );
      case 1:
        return (
          <G>
            <ACircle cx="100" cy="100" fill="#0c2c1f" {...disco(82, 100, 800)} />
            <ACircle cx="100" cy="100" fill="#10402c" {...disco(72, 200, 700)} />
            <ACircle
              cx="100"
              cy="100"
              r={72}
              fill="url(#sombraDisco)"
              opacity={kf(1200, 700, [
                [0, 0],
                [100, 1],
              ])}
            />
            <ACircle
              cx="100"
              cy="100"
              r={72}
              fill="none"
              stroke="url(#ouro)"
              strokeWidth={1.5}
              strokeOpacity={0.6}
              {...desenhar(72, 1000, 1100)}
            />
            {/* O aro de ouro fecha-se POR ÚLTIMO — é ele que sela a insígnia. */}
            <ACircle
              cx="100"
              cy="100"
              r={80}
              fill="none"
              stroke="url(#ouro)"
              strokeWidth={7}
              strokeLinecap="round"
              {...desenhar(80, 1700, 1400)}
            />
          </G>
        );
      case 2:
        return (
          <G>
            <ACircle cx="100" cy="100" fill="#0c2c1f" {...disco(82, 100, 800)} />
            <ACircle
              cx="100"
              cy="100"
              r={80}
              fill="none"
              stroke="url(#ouro)"
              strokeWidth={6.5}
              strokeLinecap="round"
              {...desenhar(80, 300, 1400)}
            />
            <ACircle cx="100" cy="100" fill="#10402c" {...disco(72, 200, 700)} />
            <ACircle
              cx="100"
              cy="100"
              r={72}
              fill="url(#sombraDisco)"
              opacity={kf(1200, 700, [
                [0, 0],
                [100, 1],
              ])}
            />
            <ACircle
              cx="100"
              cy="100"
              r={72}
              fill="none"
              stroke="url(#ouro)"
              strokeWidth={1.4}
              strokeOpacity={0.5}
              {...desenhar(72, 1000, 1100)}
            />
            {louro}
          </G>
        );
      case 3:
        return (
          <G>
            <ACircle cx="100" cy="100" fill="#0b271b" {...disco(83, 100, 800)} />
            <ACircle
              cx="100"
              cy="100"
              r={81}
              fill="none"
              stroke="url(#ouro)"
              strokeWidth={7}
              strokeLinecap="round"
              {...desenhar(81, 300, 1500)}
            />
            <ACircle cx="100" cy="100" fill="#0e3826" {...disco(70, 200, 700)} />
            <ACircle
              cx="100"
              cy="100"
              r={70}
              fill="url(#sombraDisco)"
              opacity={kf(1300, 700, [
                [0, 0],
                [100, 1],
              ])}
            />
            {louro}
          </G>
        );
      default:
        return (
          <G>
            <ACircle cx="100" cy="100" fill="#0f120b" {...disco(84, 100, 800)} />
            <ACircle
              cx="100"
              cy="100"
              r={82}
              fill="none"
              stroke="url(#ouro)"
              strokeWidth={4}
              strokeLinecap="round"
              {...desenhar(82, 300, 1600)}
            />
            <ACircle
              cx="100"
              cy="100"
              r={76}
              fill="none"
              stroke="#6d5120"
              strokeWidth={2.5}
              {...desenhar(76, 600, 1600)}
            />
            <ACircle
              cx="100"
              cy="100"
              r={74}
              fill="none"
              stroke="url(#ouro)"
              strokeWidth={1.4}
              strokeOpacity={0.55}
              {...desenhar(74, 800, 2000)}
            />
            <ACircle cx="100" cy="100" fill="#14401f" {...disco(66, 400, 700)} />
            <ACircle
              cx="100"
              cy="100"
              r={66}
              fill="url(#sombraDisco)"
              opacity={kf(1400, 700, [
                [0, 0],
                [100, 1],
              ])}
            />
            {louro}
            {/* Os 5 marcos do percurso, a acender um a um. */}
            {[0, 1, 2, 3, 4].map((i) => {
              const ang = ((90 - i * 72) * Math.PI) / 180;
              const cx = 100 + 74 * Math.cos(ang);
              const cy = 100 - 74 * Math.sin(ang);
              const atraso = 1000 + i * 340;
              const raio = (base: number) =>
                kf(atraso, 600, [
                  [0, 0],
                  [60, base * 1.5],
                  [100, base],
                ]);
              return (
                <G key={`n${i}`}>
                  <ACircle cx={cx} cy={cy} r={raio(4.2)} fill="#0f120b" />
                  <ACircle cx={cx} cy={cy} r={raio(3.4)} fill="url(#ouro)" />
                  <ACircle cx={cx} cy={cy} r={raio(1.5)} fill="#fff7db" />
                </G>
              );
            })}
          </G>
        );
    }
  }

  /** Os remates: faíscas, pulso de brilho, onda de choque. */
  function remates() {
    switch (nivel) {
      case 1:
        return (
          <G>
            {faisca(100, 22, 7, 3100, 1000)}
            <ACircle
              cx="100"
              cy="100"
              r={80}
              fill="none"
              stroke="#f7e6ac"
              strokeWidth={2.5}
              opacity={kf(3400, 1200, [
                [0, 0],
                [45, 0.65],
                [100, 0],
              ])}
            />
          </G>
        );
      case 2:
        return faisca(100, 20, 7, 4000, 1000);
      case 3:
        return (
          <G>
            <ACircle
              cx="100"
              cy="100"
              r={80}
              fill="none"
              stroke="#f7e6ac"
              strokeWidth={3}
              opacity={kf(5000, 1300, [
                [0, 0],
                [45, 0.65],
                [100, 0],
              ])}
            />
            {faisca(66, 40, 6, 4600, 900)}
            {faisca(134, 60, 5, 4900, 900)}
          </G>
        );
      case 4:
        return (
          <G>
            <ACircle
              cx="100"
              cy="100"
              fill="none"
              stroke="#f7e6ac"
              strokeWidth={2.5}
              r={kf(5900, 1000, [
                [0, 12],
                [100, 80],
              ])}
              opacity={kf(5900, 1000, [
                [0, 0],
                [18, 0.85],
                [100, 0],
              ])}
            />
            <ACircle
              cx="100"
              cy="100"
              r={82}
              fill="none"
              stroke="#f7e6ac"
              strokeWidth={2.5}
              opacity={kf(5950, 1400, [
                [0, 0],
                [45, 0.65],
                [100, 0],
              ])}
            />
          </G>
        );
      default:
        return null;
    }
  }

  // Invólucros: só o que precisa mesmo de transformação de grupo.
  const bobY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });

  // O H dos escalões 1 e 2 entra como um todo (hPop / splitOut).
  const hEnvolto = nivel === 0 || nivel === 1;
  const hEstilo =
    nivel === 0
      ? {
          opacity: kf(550, 600, [
            [0, 0],
            [70, 1],
            [100, 1],
          ]),
          transform: [
            {
              scale: kf(550, 600, [
                [0, 0.6],
                [70, 1.09],
                [100, 1],
              ]),
            },
          ],
        }
      : {
          opacity: kf(600, 1200, [
            [0, 0],
            [12, 1],
            [100, 1],
          ]),
          transform: [
            {
              scaleX: kf(600, 1200, [
                [0, 0],
                [100, 1],
              ]),
            },
          ],
        };

  // O bisel pontilhado: entra a rodar (dialIn/spinIn) e depois gira devagar.
  const biselCfg =
    nivel === 3
      ? { r: 63, sw: 1.8, op: 0.85, inicio: 700, dur: 1300, giro: -300 }
      : nivel === 4
        ? { r: 59, sw: 1.6, op: 0.8, inicio: 1000, dur: 1100, giro: -140 }
        : null;

  const conteudo = (
    <Animated.View
      style={[
        { width: tamanho, height: tamanho },
        !interativo && style,
        { transform: [{ translateY: bobY }] },
      ]}
      pointerEvents="none"
    >
      {/* Palco + H + remates: uma só camada, tudo por propriedades SVG. */}
      <Svg width={tamanho} height={tamanho} viewBox="0 0 200 200">
        {defs}
        {palco()}
        {!hEnvolto && glifoH()}
        {remates()}
        {varrimento(
          R_DISCO,
          [800, 3200, 3900, 4400, 6600][nivel],
          [1100, 1500, 1500, 1600, 1700][nivel]
        )}
      </Svg>

      {/* Bisel pontilhado (Referência/Mestre) — precisa de rotação de grupo. */}
      {biselCfg && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: kf(biselCfg.inicio, biselCfg.dur, [
                [0, 0],
                [70, 1],
                [100, 1],
              ]),
              transform: [
                {
                  rotate: kf(biselCfg.inicio, biselCfg.dur, [
                    [0, biselCfg.giro],
                    [100, 0],
                  ]).interpolate({
                    inputRange: [-360, 360],
                    outputRange: ['-360deg', '360deg'],
                  }),
                },
                {
                  scale: kf(biselCfg.inicio, biselCfg.dur, [
                    [0, nivel === 3 ? 0.5 : 0.6],
                    [100, 1],
                  ]),
                },
              ],
            },
          ]}
        >
          <Svg width={tamanho} height={tamanho} viewBox="0 0 200 200">
            {defs}
            <Circle
              cx="100"
              cy="100"
              r={biselCfg.r}
              fill="none"
              stroke="url(#ouro)"
              strokeWidth={biselCfg.sw}
              strokeOpacity={biselCfg.op}
              strokeDasharray={pontilhado(biselCfg.r)}
            />
          </Svg>
        </Animated.View>
      )}

      {/* O H inteiro (Verificado/Provado) — entra como um só gesto. */}
      {hEnvolto && (
        <Animated.View style={[StyleSheet.absoluteFill, hEstilo]}>
          <Svg width={tamanho} height={tamanho} viewBox="0 0 200 200">
            {defs}
            {glifoH()}
          </Svg>
        </Animated.View>
      )}

      {/* Mestre: o sol de 24 raios por trás da medalha. */}
      {nivel === 4 && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: kf(5750, 1200, [
                [0, 0],
                [40, 0.72],
                [100, 0],
              ]),
              transform: [
                {
                  scale: kf(5750, 1200, [
                    [0, 0.55],
                    [100, 1.14],
                  ]),
                },
              ],
            },
          ]}
        >
          <Svg width={tamanho} height={tamanho} viewBox="0 0 200 200">
            {defs}
            {Array.from({ length: 24 }, (_, i) => (
              <Rect
                key={`r${i}`}
                x={66}
                y={-0.8}
                width={30}
                height={1.6}
                rx={0.8}
                fill="url(#ouro)"
                transform={`translate(100 100) rotate(${i * 15})`}
              />
            ))}
          </Svg>
        </Animated.View>
      )}
    </Animated.View>
  );

  if (!interativo) return conteudo;

  // ── MODO 3D: o medalhão inclina-se com o gesto e a luz desliza. ──
  const grausX = rotX.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] });
  const grausY = rotY.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] });
  // O realce especular move-se em contra-sentido da inclinação (a luz está
  // fixa no espaço; é a face que gira por baixo dela).
  const luzX = rotY.interpolate({ inputRange: [-26, 26], outputRange: [26, -26] });
  const luzY = rotX.interpolate({ inputRange: [-16, 16], outputRange: [-20, 20] });

  return (
    <Animated.View
      {...pan.panHandlers}
      style={[
        { width: tamanho, height: tamanho },
        style,
        {
          transform: [
            { perspective: 900 },
            { rotateX: grausX },
            { rotateY: grausY },
          ],
        },
      ]}
    >
      {conteudo}
      {/* Realce especular — vive dentro do disco (recorte circular). */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ translateX: luzX }, { translateY: luzY }] }]}
        pointerEvents="none"
      >
        <Svg width={tamanho} height={tamanho} viewBox="0 0 200 200">
          <Defs>
            <RadialGradient id="specular" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#ffffff" stopOpacity="0.32" />
              <Stop offset="0.6" stopColor="#ffffff" stopOpacity="0.08" />
              <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </RadialGradient>
            <ClipPath id="discoLuz">
              <Circle cx="100" cy="100" r={R_DISCO} />
            </ClipPath>
          </Defs>
          <G clipPath="url(#discoLuz)">
            <Ellipse cx="100" cy="72" rx="76" ry="60" fill="url(#specular)" />
          </G>
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * A porta de entrada das insígnias. Decide QUAL peça desenhar e delega.
 *
 * O MESTRE tem peça própria (handoff "Mestre — champanhe"): é outra família
 * visual — moeda cunhada em vez de disco verde — com coreografia e serrilha
 * próprias. Vive em ficheiro à parte para não engrossar este, que já carrega
 * as cinco primeiras.
 *
 * É um invólucro SEM hooks de propósito: assim pode escolher antes de montar
 * seja o que for, sem quebrar a regra dos hooks.
 */
export function Insignia(props: PropsInsignia) {
  if (props.nivel === 5) {
    return (
      <View style={props.style}>
        <InsigniaMestre
          tamanho={props.tamanho ?? 184}
          animar={props.animar}
          flutuar={props.flutuar ?? true}
        />
      </View>
    );
  }
  return <InsigniaBase {...props} />;
}
