-- ============================================================
-- HONRA — Migração 077: A LEITURA CONHECE AS TRÊS NATUREZAS
-- ------------------------------------------------------------
-- `leitura_conversa` (020) só conhecia orçamentos. Quando chegaram os GRUPOS
-- (068) e a CONVERSA LIVRE (075), o cliente continuou a escrever a marca de
-- leitura em `orcamento_id` — que tem chave estrangeira para `orcamentos`. A
-- inserção falhava, o erro era engolido, e essas conversas ficavam POR LER
-- para sempre. O contador de não-lidas mentia nas duas.
--
-- Passa a haver três donos possíveis, exatamente como em `mensagens` (075):
-- orçamento, grupo ou conversa livre — sempre um, nunca dois, nunca nenhum.
--
-- A CHAVE PRIMÁRIA TEM DE SAIR PRIMEIRO, e é isso que falhou na 1.ª tentativa:
-- o Postgres não deixa tornar anulável uma coluna que faz parte da chave
-- primária. E com três colunas anuláveis não pode haver chave primária de todo
-- — daí os três índices únicos parciais, um por natureza, que garantem o mesmo
-- que ela garantia: uma marca de leitura por pessoa e por conversa.
--
-- O nome da chave é descoberto, não adivinhado: se não se chamar
-- `leitura_conversa_pkey`, corre na mesma.
--
-- Correr DEPOIS da 076.
-- ============================================================

-- 1) Largar a chave primária (pelo nome REAL, seja ele qual for).
do $$
declare n text;
begin
  select conname into n
    from pg_constraint
   where conrelid = 'public.leitura_conversa'::regclass and contype = 'p';
  if n is not null then
    execute format('alter table public.leitura_conversa drop constraint %I', n);
    raise notice 'chave primaria largada: %', n;
  end if;
end $$;

-- 2) Só agora a coluna pode ser anulável.
alter table public.leitura_conversa
  alter column orcamento_id drop not null;

-- 3) Os outros dois donos.
alter table public.leitura_conversa
  add column if not exists grupo_id uuid
  references public.grupos_conversa(id) on delete cascade;

alter table public.leitura_conversa
  add column if not exists conversa_livre_id uuid
  references public.conversas_livres(id) on delete cascade;

-- 4) Exatamente UM dono por linha. Uma marca órfã, ou com dois donos, não
--    pode existir — a mesma regra que `mensagens` já tem.
alter table public.leitura_conversa drop constraint if exists leitura_um_dono;
alter table public.leitura_conversa add constraint leitura_um_dono
  check (num_nonnulls(orcamento_id, grupo_id, conversa_livre_id) = 1);

-- 5) Uma marca por pessoa e por conversa — o que a chave primária garantia.
--    Parciais porque cada linha só preenche uma das três colunas.
create unique index if not exists leitura_orc_uniq
  on public.leitura_conversa (perfil_id, orcamento_id) where orcamento_id is not null;
create unique index if not exists leitura_grupo_uniq
  on public.leitura_conversa (perfil_id, grupo_id) where grupo_id is not null;
create unique index if not exists leitura_livre_uniq
  on public.leitura_conversa (perfil_id, conversa_livre_id) where conversa_livre_id is not null;

-- NOTA para o cliente: o upsert passa a precisar de `onConflict` explícito
-- (`perfil_id,<coluna>`) — sem chave primária, o Postgres já não adivinha qual
-- é o alvo do conflito. Já está feito em src/lib/chat.tsx.
