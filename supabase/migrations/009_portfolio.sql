-- ============================================================
-- HONRA — Migração 009: PORTEFÓLIO (a montra de trabalho no perfil)
-- ------------------------------------------------------------
-- O perfil já mostra QUEM és (credencial, selo, confiança). Falta MOSTRAR o
-- TRABALHO — é o "mostrar, não dizer" aplicado à decisão de contratar. O
-- portefólio é uma MONTRA PÚBLICA: qualquer um que veja o perfil vê as fotos.
-- Por isso o bucket é público (leitura aberta); só o dono carrega/apaga as suas.
--
-- Correr no SQL Editor DEPOIS da 008.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) GAVETA: portfolio_itens — cada foto de trabalho de um perfil.
-- ----------------------------------------------------------------
create table if not exists public.portfolio_itens (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references public.perfis(id) on delete cascade,
  ficheiro   text not null,          -- caminho no bucket 'portfolio'
  criado_em  timestamptz not null default now()
);

create index if not exists portfolio_itens_perfil_idx
  on public.portfolio_itens (perfil_id, criado_em desc);

-- ----------------------------------------------------------------
-- 2) RLS — leitura PÚBLICA (é uma montra); só o dono acrescenta/remove.
-- ----------------------------------------------------------------
alter table public.portfolio_itens enable row level security;

drop policy if exists "portfolio_itens_publico" on public.portfolio_itens;
create policy "portfolio_itens_publico" on public.portfolio_itens
  for select using (true);

drop policy if exists "portfolio_itens_dono_insere" on public.portfolio_itens;
create policy "portfolio_itens_dono_insere" on public.portfolio_itens
  for insert with check (auth.uid() = perfil_id);

drop policy if exists "portfolio_itens_dono_apaga" on public.portfolio_itens;
create policy "portfolio_itens_dono_apaga" on public.portfolio_itens
  for delete using (auth.uid() = perfil_id);

-- ----------------------------------------------------------------
-- 3) STORAGE — bucket público 'portfolio'. Leitura aberta (montra); só o dono
--    carrega/apaga na SUA pasta ({perfil_id}/...). Leitura pública é servida
--    pelo URL público do bucket, sem policy de select.
-- ----------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('portfolio', 'portfolio', true)
on conflict (id) do nothing;

drop policy if exists "portfolio_carrega_dono" on storage.objects;
create policy "portfolio_carrega_dono" on storage.objects
  for insert with check (
    bucket_id = 'portfolio' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "portfolio_apaga_dono" on storage.objects;
create policy "portfolio_apaga_dono" on storage.objects
  for delete using (
    bucket_id = 'portfolio' and (storage.foldername(name))[1] = auth.uid()::text
  );
