/**
 * RAIL DA SECRETÁRIA (handoff Shell Desktop 1a) — cartão verde flutuante à
 * esquerda: selo "H" no topo, filete dourado, os 5 separadores, e o avatar do
 * dono no fundo. Ativo = quadrado creme arredondado com o ícone verde-escuro;
 * inativo = sálvia. Vive AO LADO do conteúdo (não é a barra nativa), por isso
 * navega pelo router e lê o separador atual pelo pathname.
 *
 * (Sem lib de gradiente — o verde do cartão é sólido, fiel à pele da casa.)
 */
import { Feather } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useChatNaoLidas } from '@/lib/chat';
import { usePedidosPendentes } from '@/lib/pedidos';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, Raio } from '@/theme/honra';

const LARGURA_RAIL = 96;

// O perfil ancora o TOPO (avatar); o H é o botão de CASA (a marca = o lar).
// Por isso o antigo ícone de perfil (user) sai do meio — deixou de ser preciso.
type Item = {
  nome: string;
  rota: string;
  icone: keyof typeof Feather.glyphMap;
  selo?: boolean;
  /** Espelha o ícone na horizontal (ver o balão do chat). */
  espelhado?: boolean;
};
const ITENS: Item[] = [
  { nome: 'inicio', rota: '/inicio', icone: 'home', selo: true },
  { nome: 'pesquisar', rota: '/pesquisar', icone: 'search' },
  { nome: 'orcamentos', rota: '/orcamentos', icone: 'briefcase' },
  // Balão de cantos VIVOS, nunca a bolha redonda: a bolha é a linguagem da
  // banda desenhada e das redes sociais ("bla bla"), e aqui não se faz conversa
  // fiada — troca-se palavra que compromete. O canto vivo lê-se como
  // correspondência sem cair no envelope, que diria "email" (fila, spam, coisa
  // a despachar) e ainda se confundiria com a maleta aqui em cima.
  // Espelhado: o bico do balão sai do canto inferior DIREITO, não do esquerdo.
  // O bico à direita é o lado de quem FALA (a fala sai de nós para fora); à
  // esquerda lê-se como mensagem recebida, à espera. O Honra é de quem age.
  { nome: 'chat', rota: '/chat', icone: 'message-square', espelhado: true },
];

// O selo "H" como glifo de CASA: anel dourado + a ponte. A cor da ponte
// acompanha o estado (verde-escuro sobre o quadrado creme quando ativo).
function SeloHNav({ ativo }: { ativo: boolean }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 40 40" fill="none">
      <Circle cx={20} cy={20} r={17.5} stroke={Honra.dourado} strokeWidth={2} />
      <Path
        d="M15 13.5V26.5M25 13.5V26.5M15 20h10"
        stroke={ativo ? Honra.creme : Honra.salvia}
        strokeWidth={2.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * A engrenagem das Definições, desenhada à mão.
 *
 * A do Feather ('settings') é uma silhueta rendilhada: a 22px, e ainda por
 * cima em sálvia sobre verde-escuro, os doze recortes do contorno colapsam
 * numa mancha e o ícone perde-se — foi o que o Vítor viu.
 *
 * Aqui a forma é reduzida ao essencial que o olho reconhece como engrenagem:
 * um anel, seis dentes retos e um miolo. Menos informação, mais legível — e a
 * mesma família do selo "H" (traço redondo, geometria limpa) em vez de um
 * corpo estranho no meio do rail.
 */
const DENTES = [0, 60, 120, 180, 240, 300].map((g) => {
  const r = (g * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  // Do bordo do anel (7.4) para fora (9.6), a partir do centro 12,12.
  return `M${12 + 7.4 * c} ${12 + 7.4 * s}L${12 + 9.6 * c} ${12 + 9.6 * s}`;
}).join('');

function EngrenagemNav({ ativo }: { ativo: boolean }) {
  const cor = ativo ? Honra.creme : Honra.salvia;
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={6.4} stroke={cor} strokeWidth={1.9} />
      <Path d={DENTES} stroke={cor} strokeWidth={1.9} strokeLinecap="round" />
      <Circle cx={12} cy={12} r={2.3} stroke={cor} strokeWidth={1.9} />
    </Svg>
  );
}

export function RailSecretaria() {
  const pathname = usePathname();
  const { t } = useT();
  const { session } = useAuth();
  const { naoLidas } = useChatNaoLidas();
  const { pendentes } = usePedidosPendentes();
  const [iniciais, setIniciais] = useState('');

  // Iniciais do dono para o avatar (a montra basta — nome/avatar).
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;
    let vivo = true;
    supabase
      .from('perfis')
      .select('nome, avatar')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo) return;
        const d = data as { nome?: string | null; avatar?: string | null } | null;
        const base =
          d?.avatar?.trim() ||
          (d?.nome ?? session?.user.email ?? '')
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join('');
        setIniciais(base.toUpperCase());
      });
    return () => {
      vivo = false;
    };
  }, [session]);

  // Separador ativo: o 1.º segmento do caminho (/inicio → 'inicio'). Nos ecrãs
  // de detalhe (/conversa/…) nenhum acende — como na barra nativa.
  const ativa = pathname.split('/').filter(Boolean)[0] ?? 'inicio';

  const naPerfil = ativa === 'perfil';

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        {/* TOPO: o MEU perfil (a identidade ancora o rail). Leva ao perfil e
            acende quando lá estou. */}
        <Pressable
          onPress={() => router.navigate('/perfil')}
          style={[styles.avatarTopo, naPerfil && styles.avatarTopoAtivo]}
          accessibilityRole="button"
          accessibilityState={{ selected: naPerfil }}
          accessibilityLabel="O teu perfil"
        >
          <Text style={styles.avatarTxt}>{iniciais || '·'}</Text>
        </Pressable>
        <View style={styles.filete} />

        {/* Os separadores — o primeiro é a CASA, com o selo "H". */}
        <View style={styles.itens}>
          {ITENS.map((it) => {
            const ativo = it.nome === ativa;
            const badge =
              (it.nome === 'chat' && naoLidas > 0) || (it.nome === 'orcamentos' && pendentes > 0);
            return (
              <Pressable
                key={it.nome}
                onPress={() => router.navigate(it.rota as never)}
                style={[styles.item, ativo && styles.itemAtivo]}
                accessibilityRole="button"
                accessibilityState={{ selected: ativo }}
              >
                {it.selo ? (
                  <SeloHNav ativo={ativo} />
                ) : (
                  <Feather
                    name={it.icone}
                    size={23}
                    color={ativo ? Honra.creme : Honra.salvia}
                    style={it.espelhado ? styles.espelhado : undefined}
                  />
                )}
                {badge && !ativo ? <View style={styles.dot} /> : null}
              </Pressable>
            );
          })}
        </View>

        {/* Definições — no FUNDO do rail (Perfil 1c). */}
        <Pressable
          onPress={() => router.navigate('/definicoes')}
          style={[styles.item, styles.itemFundo, ativa === 'definicoes' && styles.itemAtivo]}
          accessibilityRole="button"
          accessibilityState={{ selected: ativa === 'definicoes' }}
          accessibilityLabel={t('defs.titulo')}
        >
          <EngrenagemNav ativo={ativa === 'definicoes'} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: LARGURA_RAIL, paddingVertical: 16, paddingLeft: 16 },
  card: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
    borderRadius: 26,
    backgroundColor: Honra.verdeEscuro,
    ...Platform.select({
      web: { boxShadow: '0 18px 40px rgba(11,42,30,.28)' } as object,
      default: {
        shadowColor: '#0B2A1E',
        shadowOpacity: 0.28,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 12 },
        elevation: 8,
      },
    }),
  },
  // O avatar do dono, no TOPO — a identidade ancora o rail.
  avatarTopo: {
    width: 44,
    height: 44,
    borderRadius: Raio.pill,
    backgroundColor: Honra.verde,
    borderWidth: 1.6,
    borderColor: Honra.dourado,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Ativo (estou no meu perfil): anel creme em vez do dourado.
  avatarTopoAtivo: { borderColor: Honra.creme, borderWidth: 2 },
  filete: {
    width: 26,
    height: 1,
    backgroundColor: 'rgba(197,164,95,.4)',
    marginVertical: 21,
  },
  itens: { alignItems: 'center', gap: 12 },
  item: {
    width: 52,
    height: 52,
    borderRadius: Raio.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Selecionado = anel branco fino (simples e elegante), sem preenchimento.
  itemAtivo: { borderWidth: 1.5, borderColor: Honra.creme },
  itemFundo: { marginTop: 'auto' },
  // Vira o ícone ao contrário na horizontal — o bico do balão passa para o
  // lado direito. Um espelho, não um ícone diferente: a espessura do traço e o
  // alinhamento óptico ficam exatamente os mesmos.
  espelhado: { transform: [{ scaleX: -1 }] },
  dot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Honra.dourado,
  },
  avatarTxt: { color: Honra.douradoClaro, fontSize: 13.5, fontWeight: '800' },
});
