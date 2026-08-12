import { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

/**
 * O "Porteiro": guarda a sessão do utilizador e diz à app quem está autenticado.
 * A pulseira de festival — provas quem és uma vez, e a app reconhece-te sempre.
 */
type AuthCtx = {
  session: Session | null;
  loading: boolean;
  sair: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({ session: null, loading: true, sair: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const sair = async () => {
    await supabase.auth.signOut();
  };

  return <Ctx.Provider value={{ session, loading, sair }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
