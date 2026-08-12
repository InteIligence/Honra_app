-- 040: marcador de perfis-semente (dados de demonstração do vertical Lisboa·eventos)
-- Aditiva, sem tocar em dados existentes (default false).
-- ⚠️ ANTES DO LANÇAMENTO: purgar os perfis-semente —
--    delete from auth.users where id in (select id from public.perfis where semente);
--    (o cascade em perfis.id → auth.users limpa perfis + tudo o que depende deles)

alter table public.perfis
  add column if not exists semente boolean not null default false;

comment on column public.perfis.semente is
  'true = perfil de demonstração (semente). Purgar todos (where semente) antes do lançamento público.';
