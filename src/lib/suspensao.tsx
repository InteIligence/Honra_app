/**
 * HONRA — a minha conta está suspensa?
 *
 * Escada de suspensão (migração 048; fuga A do red-team). Uma conta suspensa
 * mantém a identidade e PODE login + ver + exportar (RGPD) — mas os gestos de
 * marketplace (pedir / aceitar / selar / apresentar / aceitar convites /
 * publicar) estão travados enquanto durar a suspensão, imposto na BD. A UI usa
 * este hook para dizer a verdade ANTES do gesto falhar, com a data em que a
 * porta reabre (mostrar, não dizer: consequência digna, não humilhante).
 *
 * A suspensão termina SOZINHA em `suspenso_ate` (não há prisão perpétua).
 */
import { useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type EstadoSuspensao = {
  suspenso: boolean;
  /** Momento em que a suspensão termina (ISO), ou null se não suspenso. */
  suspensoAte: string | null;
  /** Degrau atingido: 0 nenhum · 1 (1 mês) · 2 (6 meses) · 3 (2 anos). */
  nivel: number;
  aCarregar: boolean;
};

export function useSuspensao(): EstadoSuspensao {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [suspensoAte, setSuspensoAte] = useState<string | null>(null);
  const [nivel, setNivel] = useState(0);
  const [aCarregar, setACarregar] = useState(true);

  useEffect(() => {
    if (!uid) return;
    let vivo = true;
    setACarregar(true);
    // 065: as colunas de sanção são confidenciais — o próprio lê-as por RPC
    // (a tabela perfis já não expõe suspenso_ate/nivel_suspensao a ninguém).
    supabase
      .rpc('meu_perfil_reservado')
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo) return;
        const d = data as { suspenso_ate: string | null; nivel_suspensao: number } | null;
        setSuspensoAte(d?.suspenso_ate ?? null);
        setNivel(d?.nivel_suspensao ?? 0);
        setACarregar(false);
      });
    return () => {
      vivo = false;
    };
  }, [uid]);

  // Suspenso só enquanto a data estiver no futuro (expira sozinho).
  const suspenso = !!suspensoAte && new Date(suspensoAte).getTime() > Date.now();
  return { suspenso, suspensoAte, nivel, aCarregar };
}
