/**
 * HONRA — Push (fase 2 dos avisos): registar o "endereço" do telemóvel.
 * O sino (fase 1) acende DENTRO da app. Isto trata da camada que chega a quem
 * NÃO tem a app aberta: pede permissão, obtém o Expo push token e guarda-o em
 * `push_tokens`. A partir daí, o trigger na BD + a Edge Function `enviar-push`
 * entregam cada aviso ao telemóvel.
 *
 * Regras de sobrevivência (nunca crashar a app):
 *  - Web: Expo Push é nativo → não faz nada (sem permissões no browser).
 *  - Sem projectId EAS: `getExpoPushTokenAsync` falha → log e sai gracioso.
 *  - Tudo envolto em try/catch: um erro no registo nunca deve rebentar o arranque.
 */
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// Como a app trata um push recebido com ela em primeiro plano: mostra o alerta
// (o sino/realtime já trata do estado interno). Definido uma vez, no módulo.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Descobre o projectId do EAS (necessário para tokens reais). Sem ele, a Expo
// não emite token — saímos graciosamente e deixamos nota no log.
function lerProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    // fallback para builds nativos onde a config vem por outro campo
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

async function registarTokenPush(uid: string): Promise<void> {
  // Web não tem Expo Push nativo — não pede permissões nem obtém token.
  if (Platform.OS === 'web') return;

  try {
    // 1) Permissão (só pede se ainda não decidido).
    const { status: atual } = await Notifications.getPermissionsAsync();
    let status = atual;
    if (status !== 'granted') {
      const pedido = await Notifications.requestPermissionsAsync();
      status = pedido.status;
    }
    if (status !== 'granted') {
      console.warn('[Honra] Sem permissão de notificações — não registo push token.');
      return;
    }

    // 2) Obter o Expo push token (precisa do projectId EAS).
    const projectId = lerProjectId();
    if (!projectId) {
      console.warn(
        '[Honra] Falta o EAS projectId (extra.eas.projectId no app.json) — sem push token real.',
      );
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    // 3) Guardar/atualizar o token para este perfil. Upsert por token (único):
    //    se o mesmo aparelho reaparecer, garante que aponta para o perfil certo.
    await supabase
      .from('push_tokens')
      .upsert(
        { perfil_id: uid, token, plataforma: Platform.OS },
        { onConflict: 'token' },
      );
  } catch (e) {
    // getExpoPushTokenAsync e afins podem falhar (sem projectId, sem device,
    // rede em baixo). Nunca deve crashar a app — só regista.
    console.warn('[Honra] Falha ao registar push token:', e);
  }
}

/**
 * Liga o registo do push ao ciclo de vida da sessão. Chama-se de dentro de um
 * provider que já tenha a sessão (ex.: AvisosProvider) ou da raiz.
 */
export function useRegistarPush(): void {
  const { session } = useAuth();
  const uid = session?.user.id;

  useEffect(() => {
    if (!uid) return;
    void registarTokenPush(uid);
  }, [uid]);
}
