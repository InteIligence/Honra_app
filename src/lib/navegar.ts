import { router } from 'expo-router';

/**
 * Voltar com rede de segurança (063 · #9 UX). Na web, um ecrã aberto por link
 * direto / refresh (modais, honra-card, avisos, redefinir…) não tem histórico:
 * `router.back()` não leva a lado nenhum. Aqui, sem histórico, cai no Início.
 */
export function voltar() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/inicio');
}
