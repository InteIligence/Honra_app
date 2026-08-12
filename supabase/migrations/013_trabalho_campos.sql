-- ============================================================
-- HONRA — Migração 013: campos extra do TRABALHO
-- ------------------------------------------------------------
-- Complementa a publicação de um trabalho com um orçamento estimado e datas
-- (todos opcionais — quem publica preenche o que quiser).
--
-- Correr no SQL Editor DEPOIS da 012.
-- ============================================================

alter table public.trabalhos
  add column if not exists orcamento_valor numeric,   -- € estimado (opcional)
  add column if not exists data_inicio     date,      -- início previsto (opcional)
  add column if not exists prazo           date;      -- prazo / entrega (opcional)
