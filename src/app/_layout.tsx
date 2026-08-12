import { Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { I18nProvider, useT } from '@/i18n';
import { AuthProvider } from '@/lib/auth';
import { AvisosProvider } from '@/lib/avisos';
import { ChatProvider } from '@/lib/chat';
import { PedidosProvider } from '@/lib/pedidos';
import { Espaco, Honra, LARGURA_SECRETARIA, Raio } from '@/theme/honra';

SplashScreen.preventAutoHideAsync();

/**
 * MOLDURA (só web): a app é uma coluna centrada tipo-telemóvel sobre um fundo
 * escuro — como na maquete (o telemóvel pousado num backdrop). No telemóvel
 * não faz nada (o ecrã é mais estreito que a coluna).
 *
 * SECRETÁRIA (>= 1024px, dentro das tabs): a moldura abre-se e o hub ocupa o
 * ecrã — rail à esquerda, grelha no Início (ver (tabs)/_layout e inicio).
 *
 * ÁTRIO (>= 1024px, rotas de entrada): a porta do Honra em secretária — a marca
 * à esquerda (painel verde, wordmark + filete) e a credencial/formulário à
 * direita, em creme. Duas colunas unidas: o próprio H. Os restantes fluxos
 * FORA das tabs (avisos, editar-perfil…) foram desenhados para uma coluna:
 * esticá-los seria o telemóvel esticado, não um dashboard — esses continuam
 * pousados no backdrop até terem desenho próprio de secretária.
 */
// Rotas da entrada (sem sessão): partilham o átrio na secretária.
const ROTAS_ENTRADA = new Set([
  'login',
  'registo',
  'recuperar-palavra-passe',
  'redefinir-palavra-passe',
]);

function Moldura({ children }: { children: ReactNode }) {
  // Grupo de rota ativo ('(tabs)', 'login', …) + largura viva da janela.
  const segments = useSegments();
  const { width } = useWindowDimensions();
  const { t } = useT();
  if (Platform.OS !== 'web') return <>{children}</>;
  if (width >= LARGURA_SECRETARIA) {
    if (segments[0] === '(tabs)') {
      return <View style={styles.palco}>{children}</View>;
    }
    if (ROTAS_ENTRADA.has(segments[0] ?? '')) {
      return (
        <View style={styles.atrio}>
          <View style={styles.painelMarca}>
            <Text style={styles.wordmark}>
              Honra<Text style={styles.wordmarkPonto}>.</Text>
            </Text>
            <View style={styles.fileteMarca} />
            <Text style={styles.inscricao}>{t('login.sub').toUpperCase()}</Text>
          </View>
          <View style={styles.ladoEntrada}>
            <View style={styles.colunaEntrada}>{children}</View>
          </View>
        </View>
      );
    }
  }
  return (
    <View style={styles.backdrop}>
      <View style={styles.coluna}>{children}</View>
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <I18nProvider>
    <AuthProvider>
      <AvisosProvider>
        <ChatProvider>
        <PedidosProvider>
        <Moldura>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="registo" />
          <Stack.Screen name="recuperar-palavra-passe" />
          <Stack.Screen name="redefinir-palavra-passe" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="editar-perfil" />
          <Stack.Screen name="verificar-contacto" />
          <Stack.Screen name="verificar-profissao" />
          <Stack.Screen name="revisao-profissao" />
          <Stack.Screen name="ativar-pagamentos" />
          <Stack.Screen name="pago" />
          <Stack.Screen name="verificado" />
          <Stack.Screen name="avisos" options={{ presentation: 'modal' }} />
          <Stack.Screen
            name="honra-card"
            options={{ presentation: 'modal', headerShown: false }}
          />
          <Stack.Screen name="convidar-cliente" />
          {/* Página pública do convidado (contrato-convite) — sem login. */}
          <Stack.Screen name="c/[token]" />
        </Stack>
        </Moldura>
        </PedidosProvider>
        </ChatProvider>
      </AvisosProvider>
    </AuthProvider>
    </I18nProvider>
  );
}

const styles = StyleSheet.create({
  // O palco da secretária: bege quente de lado a lado (Shell Desktop 1a).
  palco: { flex: 1, backgroundColor: Honra.begeSecretaria },

  // O átrio: marca à esquerda (verde), credencial à direita (creme).
  atrio: { flex: 1, flexDirection: 'row' },
  painelMarca: {
    flex: 1,
    backgroundColor: Honra.verdeEscuro,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Espaco.xl,
    gap: Espaco.md,
  },
  wordmark: { fontSize: 56, fontWeight: '800', color: Honra.creme, letterSpacing: -1 },
  wordmarkPonto: { color: Honra.dourado },
  fileteMarca: { width: 36, height: 2, borderRadius: Raio.pill, backgroundColor: Honra.dourado },
  inscricao: {
    fontSize: 12,
    fontWeight: '700',
    color: Honra.douradoClaro,
    letterSpacing: 2,
    textAlign: 'center',
  },
  ladoEntrada: { flex: 1.2, backgroundColor: Honra.creme },
  colunaEntrada: { flex: 1, width: '100%', maxWidth: 460, alignSelf: 'center' },
  backdrop: { flex: 1, backgroundColor: '#0d0d0c', alignItems: 'center' },
  coluna: {
    flex: 1,
    width: '100%',
    maxWidth: 460,
    backgroundColor: Honra.creme,
    overflow: 'hidden',
    // Sombra suave — a coluna "pousa" sobre o fundo escuro (só web).
    ...Platform.select({
      web: { boxShadow: '0 0 60px rgba(0,0,0,0.5)' } as object,
      default: {},
    }),
  },
});
