-- ============================================================
-- HONRA — Migração 018: PREFERÊNCIAS DE NOTIFICAÇÃO (uma linha por utilizador)
-- ------------------------------------------------------------
-- As Definições deixam cada pessoa escolher que avisos quer receber. Guardamos
-- as escolhas por-utilizador (PK = perfil_id, para o cliente fazer upsert) e
-- protegemos com RLS: cada um só lê e escreve as SUAS. Enquanto esta migração
-- não correr, a app degrada com elegância (guarda a escolha localmente no
-- dispositivo) — nunca rebenta.
--
-- Correr no SQL Editor DEPOIS da 017.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) GAVETA: uma linha de preferências por perfil.
-- ----------------------------------------------------------------
create table if not exists public.preferencias_notificacao (
  perfil_id        uuid primary key references public.perfis(id) on delete cascade,
  avisos_negocios  boolean not null default true,   -- pedidos, apertos de mão, cauções
  lembretes_prazo  boolean not null default true,   -- relógio de um negócio a fechar
  novidades        boolean not null default true,   -- melhorias e novas funcionalidades
  atualizado_em    timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- 2) RLS — cada um só vê / cria / edita as SUAS preferências.
-- ----------------------------------------------------------------
alter table public.preferencias_notificacao enable row level security;

drop policy if exists "prefs_notif_dono_ve" on public.preferencias_notificacao;
create policy "prefs_notif_dono_ve" on public.preferencias_notificacao
  for select using (auth.uid() = perfil_id);

drop policy if exists "prefs_notif_dono_cria" on public.preferencias_notificacao;
create policy "prefs_notif_dono_cria" on public.preferencias_notificacao
  for insert with check (auth.uid() = perfil_id);

drop policy if exists "prefs_notif_dono_edita" on public.preferencias_notificacao;
create policy "prefs_notif_dono_edita" on public.preferencias_notificacao
  for update using (auth.uid() = perfil_id) with check (auth.uid() = perfil_id);
