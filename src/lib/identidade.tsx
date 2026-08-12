/**
 * HONRA — a minha identidade está verificada?
 *
 * Pergunta pequena, usada nos ecrãs que CRIAM reputação (pedir orçamento,
 * avaliar, abrir orçamento a um candidato): desde a migração 043 (fuga C do
 * red-team), estes gestos exigem identidade verificada — imposto na BD.
 * A UI usa este hook para dizer a verdade ANTES do gesto falhar, apontando
 * para a verificação (mostrar, não dizer: mensagem honesta + caminho).
 */
import { useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export function useIdentidadeVerificada() {
  const { session } = useAuth();
  const uid = session?.user.id;
  // Começa otimista a `true` para não piscar o aviso enquanto carrega;
  // `aCarregar` deixa os ecrãs esperar quando precisarem de certeza.
  const [verificada, setVerificada] = useState(true);
  const [aCarregar, setACarregar] = useState(true);

  useEffect(() => {
    if (!uid) return;
    let vivo = true;
    setACarregar(true);
    supabase
      .from('verificacoes')
      .select('estado')
      .eq('perfil_id', uid)
      .eq('aba', 'identidade')
      .eq('estado', 'verificado')
      .then(({ data }) => {
        if (!vivo) return;
        setVerificada((((data as unknown[]) ?? []).length) > 0);
        setACarregar(false);
      });
    return () => {
      vivo = false;
    };
  }, [uid]);

  return { verificada, aCarregar };
}
