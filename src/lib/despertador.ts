/**
 * HONRA — DESPERTADOR (alertas LOCAIS da Agenda).
 *
 * Isto NÃO é push. O push (src/lib/push.tsx) é o aviso que vem do servidor e
 * exige dev build; aqui é o alarme do próprio aparelho, agendado pelo SO —
 * funciona no Expo Go e não depende de rede nem de EAS.
 *
 * Regras da casa que estão espelhadas em código:
 *  · PERMISSÃO SÓ QUANDO HÁ MOTIVO — nunca à entrada do ecrã. Quem chama esta
 *    biblioteca é o gesto "definir alerta", nunca o `useEffect` de arranque.
 *  · O ID É PARA CANCELAR — quem agenda guarda o identificador; sem ele um
 *    alerta órfão continuava a tocar depois de a nota morrer.
 *  · A WEB NÃO PROMETE — no browser não se agenda nada e devolve-se `null`,
 *    para o ecrã poder dizer a verdade em vez de fingir um despertador.
 *
 * API verificada contra o expo-notifications instalado (trigger de data =
 * `{ type: SchedulableTriggerInputTypes.DATE, date }`) — não de cor.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** No browser não há despertador fiável — a UI tem de o dizer, não esconder. */
export const DESPERTADOR_VIVO = Platform.OS !== 'web';

/** O que aconteceu ao pedido de alerta — o ecrã fala conforme o desfecho. */
export type DesfechoAlerta =
  | 'agendado'
  | 'sem_permissao'
  | 'passado' // a hora já passou: fica apontada, mas não toca
  | 'indisponivel'; // web (ou o SO recusou de todo)

export type Alerta = { desfecho: DesfechoAlerta; id: string | null };

/**
 * Pede a permissão de notificações — só se chama no momento em que a pessoa
 * define o primeiro alerta. Devolve `true` se ficou autorizado.
 */
export async function pedirPermissaoAlertas(): Promise<boolean> {
  if (!DESPERTADOR_VIVO) return false;
  try {
    const atual = await Notifications.getPermissionsAsync();
    if (atual.granted) return true;
    const pedido = await Notifications.requestPermissionsAsync();
    return pedido.granted;
  } catch {
    // Sem módulo nativo (ex.: ambiente estranho) — nunca rebentar por um alarme.
    return false;
  }
}

/**
 * Agenda o despertador para um momento exato. Devolve o identificador para se
 * poder cancelar mais tarde — `null` quando não houve nada para cancelar.
 */
export async function agendarAlerta(opcoes: {
  titulo: string;
  corpo: string;
  quando: Date;
}): Promise<Alerta> {
  if (!DESPERTADOR_VIVO) return { desfecho: 'indisponivel', id: null };
  // Uma hora já passada não se agenda: o SO dispararia o alarme de imediato, o
  // que seria um susto sem sentido. A intenção guarda-se na BD à mesma.
  if (opcoes.quando.getTime() <= Date.now()) return { desfecho: 'passado', id: null };

  const autorizado = await pedirPermissaoAlertas();
  if (!autorizado) return { desfecho: 'sem_permissao', id: null };

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: opcoes.titulo, body: opcoes.corpo, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: opcoes.quando },
    });
    return { desfecho: 'agendado', id };
  } catch {
    return { desfecho: 'indisponivel', id: null };
  }
}

/**
 * Cancela um alerta agendado. Tolerante de propósito: o id pertence ao APARELHO
 * que o agendou — noutro telemóvel (ou na web) simplesmente não existe, e isso
 * não é um erro que valha a pena mostrar a ninguém.
 */
export async function cancelarAlerta(id: string | null | undefined): Promise<void> {
  if (!id || !DESPERTADOR_VIVO) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // já disparou, já não existe, ou é de outro aparelho — nada a fazer.
  }
}
