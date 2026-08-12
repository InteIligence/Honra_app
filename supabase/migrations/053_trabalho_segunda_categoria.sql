-- ============================================================
-- HONRA — Migração 053: SEGUNDA CATEGORIA no trabalho (máx 2)
-- ------------------------------------------------------------
-- Decisão Vítor 20/07: um trabalho pode ter ATÉ 2 categorias, para acompanhar
-- a complexidade real ("filmar casamento + fotografia"). A 1ª (categoria_id)
-- é a principal; a 2ª é opcional. Teto de 2 é deliberado — foco, não spam de
-- etiquetas. ADITIVA e idempotente. RLS/guardas dos trabalhos intactas
-- (a coluna vive na mesma linha; as policies de autor cobrem-na).
-- ============================================================

alter table public.trabalhos
  add column if not exists categoria2_id uuid references public.categorias(id);

-- A 2ª só existe se houver 1ª, e nunca repete a 1ª.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'trabalhos_categoria2_distinta'
  ) then
    alter table public.trabalhos
      add constraint trabalhos_categoria2_distinta
      check (
        categoria2_id is null
        or (categoria_id is not null and categoria2_id <> categoria_id)
      );
  end if;
end $$;

comment on column public.trabalhos.categoria2_id is
  'Segunda categoria OPCIONAL do trabalho (teto de 2, decisão 20/07). categoria_id é a principal.';
