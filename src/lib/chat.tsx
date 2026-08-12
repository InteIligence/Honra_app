/**
 * HONRA — Chat por negócio. As duas partes de um orçamento falam DENTRO do
 * negócio. Realtime: a mensagem do outro lado acende sem refrescar.
 */
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

export type Mensagem = {
  id: string;
  orcamento_id: string | null;
  grupo_id?: string | null;
  autor_perfil: string;
  corpo: string;
  criado_em: string;
};

/**
 * Iniciais de um nome ("Rute Silva" → "RU") — a cara de quem fala quando não
 * há foto. Vive aqui porque a lista de conversas e o painel da conversa
 * precisam exatamente da mesma, e duas cópias acabariam a divergir.
 */
export function iniciaisDe(nome: string | null | undefined): string {
  const limpo = (nome ?? '').trim();
  if (!limpo) return '··';
  const partes = limpo.split(/\s+/);
  return (partes.length === 1 ? limpo.slice(0, 2) : partes[0][0] + partes[1][0]).toUpperCase();
}

/** As três naturezas de conversa e a coluna que as ancora na mesma tabela. */
export type TipoConversa = 'negocio' | 'grupo' | 'livre';
const COLUNA: Record<TipoConversa, string> = {
  negocio: 'orcamento_id',
  grupo: 'grupo_id',
  livre: 'conversa_livre_id',
};

/**
 * Mensagens de UMA conversa — de um negócio (orcamento_id), de um grupo de
 * equipa (grupo_id, 068) ou LIVRE, fora de qualquer negócio (075). A mesma
 * tabela e o mesmo realtime; muda só a coluna que a ancora.
 */
export function useMensagens(id: string | undefined, tipo: TipoConversa = 'negocio') {
  const { session } = useAuth();
  const uid = session?.user.id;
  const coluna = COLUNA[tipo];
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [aEnviar, setAEnviar] = useState(false);

  const carregar = useCallback(() => {
    if (!id) return;
    supabase
      .from('mensagens')
      .select('id, orcamento_id, grupo_id, autor_perfil, corpo, criado_em')
      .eq(coluna, id)
      .order('criado_em', { ascending: true })
      .then(({ data }) => {
        setMensagens((data as Mensagem[]) ?? []);
        setACarregar(false);
      });
  }, [id, coluna]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Realtime: novas mensagens desta conversa entram sozinhas (sem duplicar).
  useEffect(() => {
    if (!id) return;
    const canal = supabase
      .channel(`conversa:${tipo}:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `${coluna}=eq.${id}` },
        (payload) => {
          const nova = payload.new as Mensagem;
          setMensagens((xs) => (xs.some((m) => m.id === nova.id) ? xs : [...xs, nova]));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [id, coluna, tipo]);

  async function enviar(corpo: string): Promise<boolean> {
    if (!id || !uid || !corpo.trim()) return false;
    setAEnviar(true);
    const { error } = await supabase
      .from('mensagens')
      .insert({ [coluna]: id, autor_perfil: uid, corpo: corpo.trim() });
    setAEnviar(false);
    return !error; // o realtime acrescenta a mensagem à lista
  }

  return { mensagens, aCarregar, aEnviar, uid, enviar };
}

/**
 * Mensagens por ler (todas as minhas conversas) — alimenta o badge do separador
 * Chat. Fonte da verdade: a função `mensagens_nao_lidas()` (conta as da outra
 * parte mais recentes que a minha última leitura). Recontamos em realtime a cada
 * mensagem nova, e quando marco uma conversa como lida.
 */
type ChatCtx = { naoLidas: number; marcarLido: (id: string, tipo?: TipoConversa) => void };
const Ctx = createContext<ChatCtx>({ naoLidas: 0, marcarLido: () => {} });

export function ChatProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [naoLidas, setNaoLidas] = useState(0);

  const recarregar = useCallback(async () => {
    if (!uid) {
      setNaoLidas(0);
      return;
    }
    const { data } = await supabase.rpc('mensagens_nao_lidas');
    setNaoLidas(typeof data === 'number' ? data : 0);
  }, [uid]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // Realtime: qualquer mensagem nova numa conversa minha (a RLS já filtra) → recontar.
  useEffect(() => {
    if (!uid) return;
    const canal = supabase
      .channel('chat-nao-lidas')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensagens' },
        () => recarregar(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [uid, recarregar]);

  /**
   * Marca uma conversa como lida — de QUALQUER das três naturezas.
   *
   * Escrevia sempre em `orcamento_id`, que tem chave estrangeira para
   * `orcamentos`: nos grupos (068) e nas conversas livres (075) a inserção
   * falhava e o erro era engolido. Resultado: essas conversas nunca ficavam
   * lidas e o contador de por-ler mentia para sempre.
   *
   * O `onConflict` tem de ser explícito desde a 077: a chave primária deu
   * lugar a três índices únicos parciais (um por dono), porque com três
   * colunas anuláveis não pode haver chave primária.
   */
  const marcarLido = useCallback(
    (id: string, tipo: TipoConversa = 'negocio') => {
      if (!uid || !id) return;
      const coluna = COLUNA[tipo];
      supabase
        .from('leitura_conversa')
        .upsert(
          { perfil_id: uid, [coluna]: id, lido_em: new Date().toISOString() },
          { onConflict: `perfil_id,${coluna}` }
        )
        .then(() => recarregar());
    },
    [uid, recarregar],
  );

  return <Ctx.Provider value={{ naoLidas, marcarLido }}>{children}</Ctx.Provider>;
}

export const useChatNaoLidas = () => useContext(Ctx);
