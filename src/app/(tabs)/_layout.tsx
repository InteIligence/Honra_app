import { Feather } from '@expo/vector-icons';
import { Redirect, router, Tabs, usePathname, type Href } from 'expo-router';
import { useMemo, useRef } from 'react';
import { PanResponder, useWindowDimensions, View } from 'react-native';

import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useChatNaoLidas } from '@/lib/chat';
import { usePedidosPendentes } from '@/lib/pedidos';
import { RailSecretaria } from '@/components/RailSecretaria';
import { Espaco, Honra, LARGURA_SECRETARIA } from '@/theme/honra';

// A ordem real dos 5 separadores — o swipe navega entre vizinhos.
const ORDEM_TABS = ['/inicio', '/pesquisar', '/orcamentos', '/chat', '/perfil'];

/**
 * SECRETÁRIA (>= 1024px): as tabs deixam o fundo do ecrã e tornam-se um RAIL
 * à esquerda — é isto que faz "dashboard de PC" e não "telemóvel esticado".
 * Os ecrãs pensados para o telemóvel (todos menos o Início, que tem grelha
 * própria) ganham uma coluna de leitura centrada — página de secretária,
 * como qualquer ferramenta de trabalho a sério.
 */
// Rail de secretária (Shell Desktop 1a): cartão verde flutuante à esquerda,
// desenhado no componente RailSecretaria. Aqui só reservamos a sua largura.
const LARGURA_RAIL = 96;
const COLUNA_LEITURA = 720;

export default function TabsLayout() {
  const { session, loading } = useAuth();
  const { t } = useT();
  const { naoLidas } = useChatNaoLidas();
  const { pendentes } = usePedidosPendentes();
  const { width } = useWindowDimensions();
  const largo = width >= LARGURA_SECRETARIA;

  // SWIPE entre separadores: arrastar o dedo na horizontal em área "vazia"
  // muda para o separador do lado. Só nos 5 ecrãs raiz (nunca nos detalhes) e
  // só em ecrã de telemóvel — na secretária o arrasto é do rato (seleção de
  // texto), não um gesto de navegação.
  // Conservador de propósito: os filhos (listas verticais, filas de chips
  // horizontais) reclamam primeiro os seus gestos; só o que sobra chega cá.
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const largoRef = useRef(largo);
  largoRef.current = largo;
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          !largoRef.current &&
          ORDEM_TABS.includes(pathRef.current) &&
          Math.abs(g.dx) > 24 &&
          Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderRelease: (_e, g) => {
          const i = ORDEM_TABS.indexOf(pathRef.current);
          if (i < 0 || Math.abs(g.dx) < 60) return;
          const destino = g.dx < 0 ? ORDEM_TABS[i + 1] : ORDEM_TABS[i - 1];
          if (destino) router.navigate(destino as Href);
        },
      }),
    []
  );

  // GOTEIRAS da coluna de leitura: o ecrã fica creme de lado a lado e é o
  // conteúdo que se centra (~720px) — o fundo nunca mostra costuras.
  //
  // A coluna de leitura serve ecrãs que se LEEM (um perfil, uma conversa, as
  // definições): linhas de texto largas demais cansam a vista, e por isso o
  // limite é uma virtude ali.
  //
  // Mas há ecrãs que se TRABALHAM — um calendário mensal, o painel do percurso.
  // Esses pedem mesa, não coluna. Ficavam presos numa contradição: perguntavam
  // à JANELA se eram largos (>=1024), desenhavam duas ou três colunas, e depois
  // eram espremidos num corpo de 720. O sintoma foi o cartão da rede a partir
  // nomes letra a letra.
  //
  // Daí a separação: `cenaColuna` para quem lê, `cenaMesa` para quem trabalha.
  const goteira = Math.max(Espaco.lg, (width - LARGURA_RAIL - COLUNA_LEITURA) / 2);
  const cenaColuna = largo
    ? { backgroundColor: Honra.begeSecretaria, paddingLeft: goteira, paddingRight: goteira }
    : undefined;
  // Mesa de trabalho: fundo da Secretária e a largura toda. Quem se centra e se
  // limita é o próprio ecrã, que sabe do que precisa — não o shell por ele.
  const cenaMesa = largo ? { backgroundColor: Honra.begeSecretaria } : undefined;

  if (loading) return null;
  if (!session) return <Redirect href="/login" />;

  return (
    <View
      style={[
        { flex: 1 },
        largo && { flexDirection: 'row', backgroundColor: Honra.begeSecretaria },
      ]}
      {...swipe.panHandlers}
    >
    {/* SECRETÁRIA: o rail flutuante (Shell Desktop 1a) vive AO LADO do conteúdo;
        a barra nativa esconde-se. No telemóvel, a barra de baixo de sempre. */}
    {largo && <RailSecretaria />}
    <View style={largo ? { flex: 1, minWidth: 0 } : { flex: 1 }}>
    <Tabs
      backBehavior="history"
      tabBar={largo ? () => null : undefined}
      screenOptions={{
        headerShown: false,
        // Barra de telemóvel (a secretária usa o RailSecretaria): só símbolos.
        tabBarShowLabel: false,
        tabBarActiveTintColor: Honra.verde,
        tabBarInactiveTintColor: Honra.tintaSuave,
        tabBarStyle: {
          backgroundColor: Honra.brancoCreme,
          borderTopColor: Honra.cremeEscuro,
          height: 60,
          paddingTop: 8,
        },
        // O pano atrás das cenas: bege da secretária (Shell Desktop 1a).
        sceneStyle: largo ? { backgroundColor: Honra.begeSecretaria } : undefined,
      }}
    >
      <Tabs.Screen
        name="inicio"
        options={{
          title: t('tabs.inicio'),
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="pesquisar"
        options={{
          title: t('tabs.pesquisar'),
          tabBarIcon: ({ color, size }) => <Feather name="search" size={size} color={color} />,
          // Sem coluna de leitura: a Pesquisa tem grelha própria de largura total.
        }}
      />
      <Tabs.Screen
        name="orcamentos"
        options={{
          title: t('tabs.orcamentos'),
          tabBarBadge: pendentes > 0 ? (pendentes > 99 ? '99+' : pendentes) : undefined,
          tabBarBadgeStyle: { backgroundColor: Honra.verde, color: Honra.creme, fontSize: 11 },
          tabBarIcon: ({ color, size }) => <Feather name="briefcase" size={size} color={color} />,
          // Sem coluna de leitura: o Orçamentos tem quadro próprio de largura total.
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('tabs.chat'),
          // Número de mensagens por ler (só aparece quando há).
          tabBarBadge: naoLidas > 0 ? (naoLidas > 99 ? '99+' : naoLidas) : undefined,
          tabBarBadgeStyle: { backgroundColor: Honra.verde, color: Honra.creme, fontSize: 11 },
          // Espelhado: o bico do balão sai à DIREITA — o lado de quem fala.
          tabBarIcon: ({ color, size }) => (
            <Feather
              name="message-square"
              size={size}
              color={color}
              style={{ transform: [{ scaleX: -1 }] }}
            />
          ),
          // MESA, não coluna de leitura: desde a maquete "Conversas 4a" o
          // separador tem DUAS colunas (lista + conversa) na mesma vista, e
          // espremê-las em 720px partia a lista ao meio. Quem se centra e se
          // limita lá dentro é o fio da conversa, que sabe que se lê.
          sceneStyle: cenaMesa,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: t('tabs.perfil'),
          tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
          // Sem coluna de leitura: o Perfil tem painel próprio de largura total.
        }}
      />
      {/* Ecrãs de detalhe: vivem dentro dos separadores (a barra fica sempre
          visível) mas não têm botão próprio — chega-se lá por navegação. Na
          secretária herdam a mesma coluna de leitura. */}
      <Tabs.Screen name="convites" options={{ href: null, sceneStyle: cenaColuna }} />
      {/* MESA: o calendário do mês e a rede são painéis de trabalho — a grelha
          e os cartões precisam da largura toda para não partirem nomes. */}
      <Tabs.Screen name="agenda" options={{ href: null, sceneStyle: cenaMesa }} />
      <Tabs.Screen name="rede" options={{ href: null, sceneStyle: cenaMesa }} />
      <Tabs.Screen name="projeto/[id]" options={{ href: null, sceneStyle: cenaColuna }} />
      <Tabs.Screen name="perfil/[id]" options={{ href: null, sceneStyle: cenaColuna }} />
      <Tabs.Screen name="trabalho/[id]" options={{ href: null, sceneStyle: cenaColuna }} />
      <Tabs.Screen name="conversa/[id]" options={{ href: null, sceneStyle: cenaColuna }} />
      <Tabs.Screen name="criar-grupo" options={{ href: null, sceneStyle: cenaColuna }} />
      <Tabs.Screen name="publicar-trabalho" options={{ href: null, sceneStyle: cenaColuna }} />
      <Tabs.Screen name="definicoes" options={{ href: null, sceneStyle: cenaColuna }} />
      <Tabs.Screen name="insignias" options={{ href: null, sceneStyle: cenaColuna }} />
      {/* MESA: o percurso é "o quarto" — a vitrine da credencial ao lado da
          jornada só respira com a mesa inteira. */}
      <Tabs.Screen name="percurso" options={{ href: null, sceneStyle: cenaMesa }} />
    </Tabs>
    </View>
    </View>
  );
}
