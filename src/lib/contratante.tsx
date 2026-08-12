/**
 * HONRA — a camada de CONTRATANTE (o outro lado do aperto de mão).
 * Contrato partilhado: o Início da empresa, o perfil (próprio e público) e a
 * Rede de Confiança bebem daqui, para contarem a MESMA história com os MESMOS
 * números — todos derivados de dados reais, nunca inventados.
 *
 * Papéis no orçamento (lib/projeto.tsx): de_perfil = cliente/A (quem contrata),
 * para_perfil = profissional/B (quem faz). "Como contratante" = o lado de_perfil.
 */
import { useCallback, useState } from 'react';

import { useT } from '@/i18n';
import { supabase } from '@/lib/supabase';

/** A família "honrada" do ciclo — inclui os estados legados do arranque
 *  (a mesma régua do backfill das migrações 016/033). */
export const ESTADOS_HONRADOS = [
  'honrado',
  'entregue',
  'concluido',
  'confirmado_ambos',
  'devolvido',
] as const;

// ---- STATS públicas de contratante (RPC stats_contratante, migração 041) ----

export type StatsContratante = {
  /** Negócios honrados como cliente (de_perfil). */
  honrados: number;
  /** Apertos de mão dados como cliente — o denominador do rácio. */
  apertos: number;
  /** Trabalhos publicados no mural (todos os estados). */
  trabalhos: number;
};

/**
 * Os números públicos do lado contratante de QUALQUER perfil (agregados,
 * zero linhas — os orçamentos continuam fechados por RLS às duas partes).
 * Tolerante: se a função ainda não existir na BD, devolve null e o ecrã
 * simplesmente não mostra o bloco (nunca inventa).
 */
export async function statsContratante(perfilId: string): Promise<StatsContratante | null> {
  const { data, error } = await supabase.rpc('stats_contratante', { p_perfil: perfilId });
  if (error || !data) return null;
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha) return null;
  return {
    honrados: Number(linha.honrados ?? 0),
    apertos: Number(linha.apertos ?? 0),
    trabalhos: Number(linha.trabalhos_publicados ?? 0),
  };
}

// ---- A REDE DE CONFIANÇA (os profissionais com quem já se honrou) -----------

export type MembroRede = {
  id: string;
  nome: string | null;
  papel: string | null;
  avatar: string | null;
  avatar_url: string | null;
  /** "Honraram N juntos" — nº de negócios honrados com este profissional. */
  vezes: number;
  /** Data (ISO) do negócio mais recente juntos (selado_em, ou criado_em no legado). */
  ultimoEm: string | null;
};

/**
 * A rede de confiança do PRÓPRIO (a RLS só devolve os seus orçamentos):
 * os profissionais (para_perfil) com quem já honrou negócios como cliente,
 * agrupados, com contagem e data do último. Ordenada do mais recente.
 */
export function useRede(uid: string | undefined) {
  const { t } = useT();
  const [membros, setMembros] = useState<MembroRede[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    if (!uid) return;
    setACarregar(true);
    setErro(null);
    supabase
      .from('orcamentos')
      .select(
        'para_perfil, criado_em, selado_em, para:perfis!para_perfil(nome, papel, avatar, avatar_url)',
      )
      .eq('de_perfil', uid)
      .in('estado', [...ESTADOS_HONRADOS])
      .then(({ data, error }) => {
        if (error) {
          setErro(t('rede.erro'));
          setACarregar(false);
          return;
        }
        // Agrupa por profissional: conta os honrados juntos e guarda o último.
        const porId = new Map<string, MembroRede>();
        for (const o of (data as any[]) ?? []) {
          const quando = (o.selado_em ?? o.criado_em ?? null) as string | null;
          const atual = porId.get(o.para_perfil);
          if (atual) {
            atual.vezes += 1;
            if (quando && (!atual.ultimoEm || quando > atual.ultimoEm)) atual.ultimoEm = quando;
          } else {
            porId.set(o.para_perfil, {
              id: o.para_perfil,
              nome: o.para?.nome ?? null,
              papel: o.para?.papel ?? null,
              avatar: o.para?.avatar ?? null,
              avatar_url: o.para?.avatar_url ?? null,
              vezes: 1,
              ultimoEm: quando,
            });
          }
        }
        setMembros(
          [...porId.values()].sort((a, b) => ((a.ultimoEm ?? '') > (b.ultimoEm ?? '') ? -1 : 1)),
        );
        setACarregar(false);
      });
  }, [uid, t]);

  return { membros, aCarregar, erro, carregar };
}
