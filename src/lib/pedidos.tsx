import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/**
 * Badge dos Orçamentos: nº de pedidos de orçamento REAIS dirigidos a mim e
 * ainda por agir (estado 'pedido'). Exclui as conversas (descricao='Conversa'),
 * que vivem no badge do Chat, não aqui. Espelha o ChatProvider — reconta em
 * realtime quando um pedido entra, ou quando eu o aceito/recuso (sai de 'pedido').
 */
type PedidosCtx = { pendentes: number };
const Ctx = createContext<PedidosCtx>({ pendentes: 0 });

export function PedidosProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [pendentes, setPendentes] = useState(0);

  const recarregar = useCallback(async () => {
    if (!uid) {
      setPendentes(0);
      return;
    }
    const { count } = await supabase
      .from('orcamentos')
      .select('id', { count: 'exact', head: true })
      .eq('para_perfil', uid)
      .eq('estado', 'pedido')
      .neq('descricao', 'Conversa');
    setPendentes(count ?? 0);
  }, [uid]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // Realtime: um pedido novo dirigido a mim, ou um que muda de estado (aceito/
  // recuso → sai de 'pedido') → recontar. A RLS já me limita aos meus.
  useEffect(() => {
    if (!uid) return;
    const canal = supabase
      .channel('orcamentos-pendentes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orcamentos' },
        () => recarregar(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [uid, recarregar]);

  return <Ctx.Provider value={{ pendentes }}>{children}</Ctx.Provider>;
}

export const usePedidosPendentes = () => useContext(Ctx);
