-- ============================================================
-- HONRA — Migração 030: CÉDULA em DUAS FACES (frente + verso)
-- ------------------------------------------------------------
-- Até aqui um pedido de cédula (via B do selo "Profissão", migração 029) tinha
-- UMA só prova: a coluna `ficheiro_path` em `pedidos_profissao`. O Honra passa a
-- exigir as DUAS faces do documento (frente e verso) — mais fiel à realidade de
-- uma cédula física e mais difícil de forjar.
--
-- NOMENCLATURA (decisão deliberada, para não partir a função nem os dados já
-- gravados): NÃO renomeamos a coluna existente. `ficheiro_path` PASSA a ser, por
-- semântica, a FRENTE da cédula; acrescentamos `ficheiro_verso` para o VERSO.
-- (Renomear `ficheiro_path`→`ficheiro_frente` seria DDL arriscado e obrigaria a
-- reescrever tudo em simultâneo; manter o nome antigo como "frente" é aditivo,
-- idempotente e não parte nada já gravado.)
--
-- O verso é NULLABLE de propósito: pedidos antigos (pré-030) não o têm, e não
-- vamos inventar uma prova que não existe. A obrigatoriedade das DUAS faces é
-- imposta a partir daqui na Edge `profissao-submeter` (todos os pedidos NOVOS
-- trazem frente + verso); os antigos ficam como estão, honestos sobre o que têm.
--
-- Correr no SQL Editor DEPOIS da 029. Só DDL ADITIVO; nada destrutivo.
-- ============================================================

alter table public.pedidos_profissao
  add column if not exists ficheiro_verso text;   -- caminho no bucket privado 'cedulas' (VERSO da cédula)

comment on column public.pedidos_profissao.ficheiro_path is
  'FRENTE da cédula — caminho no bucket privado ''cedulas''. (Nome mantido da 029 por segurança; semanticamente é a frente.)';
comment on column public.pedidos_profissao.ficheiro_verso is
  'VERSO da cédula — caminho no bucket privado ''cedulas''. Nullable: pedidos anteriores à 030 não o têm.';
