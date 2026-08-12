-- ============================================================
-- HONRA — Migração 036: FOTO DE PERFIL (avatar em imagem)
-- ------------------------------------------------------------
-- Até aqui `perfis.avatar` guardava só as INICIAIS (2 letras) e o perfil nunca
-- mostrava uma foto. O componente Avatar já sabe desenhar `imagem`, faltava
-- ONDE guardar a foto e um bucket que a sirva.
--
-- Decisão (aditiva, não-destrutiva): NÃO se reaproveita `perfis.avatar` (que
-- continua a ser o fallback de iniciais em toda a app). Cria-se uma coluna nova
-- `avatar_url` com o CAMINHO da foto no bucket público 'avatares'. A foto é uma
-- montra pública (aparece no perfil a qualquer visitante) → bucket público,
-- leitura aberta; só o dono carrega/troca/apaga na SUA pasta ({uid}/...).
--
-- Correr no SQL Editor DEPOIS da 035.
-- ============================================================

-- 1) COLUNA: caminho da foto de perfil no bucket 'avatares' (null = sem foto).
alter table public.perfis
  add column if not exists avatar_url text;

-- 2) STORAGE — bucket público 'avatares'.
insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', true)
on conflict (id) do nothing;

-- 3) POLÍTICAS — o dono carrega/atualiza/apaga na SUA pasta; leitura pública é
--    servida pelo URL público do bucket (sem policy de select).
drop policy if exists "avatares_carrega_dono" on storage.objects;
create policy "avatares_carrega_dono" on storage.objects
  for insert with check (
    bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatares_atualiza_dono" on storage.objects;
create policy "avatares_atualiza_dono" on storage.objects
  for update using (
    bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatares_apaga_dono" on storage.objects;
create policy "avatares_apaga_dono" on storage.objects
  for delete using (
    bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text
  );
