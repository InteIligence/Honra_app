/**
 * HONRA — Avisos (notificações) como projeção do ciclo da caução.
 * Um só sítio a carregar/ouvir os avisos do utilizador. O sino e o ecrã /avisos
 * bebem daqui. Ouve o Realtime do Supabase → o sino acende sem refrescar.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth';
import { useRegistarPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';

export type Aviso = {
  id: string;
  criado_em: string;
  tipo: string;
  orcamento_id: string | null;
  contrato_convite_id: string | null;
  /** Avisos que falam de um ANÚNCIO do mural (058), não de um orçamento. */
  trabalho_id: string | null;
  titulo: string;
  corpo: string | null;
  prazo: string | null;
  urgente: boolean;
  lida: boolean;
};

// Um aviso "aperta o coração" (faz pulsar o sino) se está por ler E ou é urgente
// ou tem um relógio a fechar-se (menos de 48h). Empurra para a ação, com medida.
const JANELA_URGENTE_MS = 48 * 3600_000;
export function apertaCoracao(a: Aviso, agora = Date.now()): boolean {
  if (a.lida) return false;
  if (a.urgente) return true;
  if (a.prazo) {
    const falta = new Date(a.prazo).getTime() - agora;
    return falta > 0 && falta < JANELA_URGENTE_MS;
  }
  return false;
}

type AvisosCtx = {
  avisos: Aviso[];
  naoLidas: number;
  pulsar: boolean;
  carregar: () => void;
  marcarLida: (id: string) => Promise<void>;
  marcarTodas: () => Promise<void>;
};

const Ctx = createContext<AvisosCtx>({
  avisos: [],
  naoLidas: 0,
  pulsar: false,
  carregar: () => {},
  marcarLida: async () => {},
  marcarTodas: async () => {},
});

export function AvisosProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  // Fase 2 do aviso: além do sino in-app, regista o telemóvel para receber push
  // quando a app está fechada. Guarda o caso web e nunca crasha (ver push.tsx).
  useRegistarPush();

  const carregar = useCallback(() => {
    if (!uid) {
      setAvisos([]);
      return;
    }
    supabase
      .from('notificacoes')
      .select(
        'id, criado_em, tipo, orcamento_id, contrato_convite_id, trabalho_id, titulo, corpo, prazo, urgente, lida',
      )
      .eq('perfil_id', uid)
      .order('criado_em', { ascending: false })
      .limit(60)
      .then(({ data }) => setAvisos((data as Aviso[]) ?? []));
  }, [uid]);

  // Carrega ao entrar e sempre que o utilizador muda.
  useEffect(() => {
    carregar();
  }, [carregar]);

  // Realtime: qualquer mudança nos MEUS avisos → recarrega (o sino acende só).
  useEffect(() => {
    if (!uid) return;
    const canal = supabase
      .channel(`avisos:${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notificacoes', filter: `perfil_id=eq.${uid}` },
        () => carregar(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [uid, carregar]);

  const marcarLida = useCallback(
    async (id: string) => {
      // Otimista: apaga o ponto logo; a BD confirma a seguir.
      setAvisos((xs) => xs.map((a) => (a.id === id ? { ...a, lida: true } : a)));
      await supabase.from('notificacoes').update({ lida: true }).eq('id', id);
    },
    [],
  );

  const marcarTodas = useCallback(async () => {
    if (!uid) return;
    setAvisos((xs) => xs.map((a) => ({ ...a, lida: true })));
    await supabase.from('notificacoes').update({ lida: true }).eq('perfil_id', uid).eq('lida', false);
  }, [uid]);

  const naoLidas = avisos.reduce((n, a) => (a.lida ? n : n + 1), 0);
  const pulsar = avisos.some((a) => apertaCoracao(a));

  return (
    <Ctx.Provider value={{ avisos, naoLidas, pulsar, carregar, marcarLida, marcarTodas }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAvisos = () => useContext(Ctx);
