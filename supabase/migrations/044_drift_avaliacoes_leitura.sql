-- ============================================================
-- HONRA — Migração 044: DRIFT — repor visibilidade das avaliações (015)
-- ------------------------------------------------------------
-- Diff sistemático repo↔BD viva (18/07, no seguimento da 043) revelou que a
-- policy `avaliacoes_leitura_publica` na BD REAL ainda estava na versão da
-- 003 — `using (true)` — em vez da versão endurecida pela 015:
--   `using (revelado_em is not null or auth.uid() = de_perfil)`.
--
-- Mesma família de falha do `recalc_indice` (que a 043 §6 repôs): a 015
-- aplicou-se só parcialmente à BD viva. As restantes partes da 015
-- (coluna `revelado_em`, trigger `after_avaliacao_insere`, função
-- `revelar_avaliacoes`, `recalc_indice`) já batem certo; faltava esta policy.
--
-- Impacto: com `true`, uma avaliação por revelar (revelado_em IS NULL) ficava
-- publicamente visível antes de tempo. Hoje é baixo risco — desde a 037 o
-- trigger `avaliacao_revela_ja` carimba `revelado_em := now()` no insert, e à
-- data desta migração há 0 avaliações por revelar — mas a régua é: repor o
-- estado canónico do repo. Estritamente mais apertado, não parte nada.
--
-- O diff completo (policies, triggers, funções, constraints, colunas, storage)
-- não achou mais nenhum drift: verif_dono_tudo/notificar_mensagem ausentes,
-- orc_pede/avaliacoes_insere_com_prova/guardas/selos todos na versão da 043.
-- ============================================================

drop policy if exists "avaliacoes_leitura_publica" on public.avaliacoes;
create policy "avaliacoes_leitura_publica" on public.avaliacoes
  for select using (revelado_em is not null or auth.uid() = de_perfil);
