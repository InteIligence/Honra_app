-- ============================================================
-- HONRA — Migração 031: AGENDA (tarefas do próprio utilizador)
-- ------------------------------------------------------------
-- A Agenda tem duas camadas: os COMPROMISSOS (derivados das tabelas reais —
-- contratos_convite e orcamentos — nunca duplicados aqui) e AS MINHAS TAREFAS:
-- apontamentos/lembretes que o utilizador cria para si. Esta migração cria só
-- a segunda camada — a primeira é uma leitura, não uma tabela.
--
-- Princípios:
--   • título obrigatório (uma tarefa sem nome não é palavra dada);
--   • data OPCIONAL (`quando`) — nem tudo tem dia marcado;
--   • pisco feito/por-fazer com carimbo (`feita_em`) — o gesto central;
--   • privado por natureza: o dono faz tudo nas SUAS tarefas, ninguém vê nada
--     das dos outros. Sem triggers de servidor — é a única tabela em que o
--     cliente escreve livremente, porque só fala de si próprio.
--
-- Aditiva/idempotente. Correr DEPOIS da 030.
-- ============================================================

create table if not exists public.tarefas (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references public.perfis(id) on delete cascade,
  titulo     text not null,
  nota       text,
  quando     date,                                  -- opcional: o dia marcado
  feita      boolean not null default false,
  feita_em   timestamptz,                           -- carimbo do pisco
  criado_em  timestamptz not null default now(),
  -- Uma tarefa sem título (ou só espaços) não entra.
  constraint tarefas_titulo_nao_vazio check (length(btrim(titulo)) > 0)
);

-- A leitura típica: as MINHAS, por-fazer primeiro, ordenadas pelo dia.
create index if not exists tarefas_perfil_idx
  on public.tarefas (perfil_id, feita, quando, criado_em desc);

-- ----------------------------------------------------------------
-- RLS — o dono faz tudo nas suas; mais ninguém vê nada.
-- ----------------------------------------------------------------
alter table public.tarefas enable row level security;

drop policy if exists "tarefas_dono_ve" on public.tarefas;
create policy "tarefas_dono_ve" on public.tarefas
  for select using (auth.uid() = perfil_id);

drop policy if exists "tarefas_dono_cria" on public.tarefas;
create policy "tarefas_dono_cria" on public.tarefas
  for insert with check (auth.uid() = perfil_id);

drop policy if exists "tarefas_dono_muda" on public.tarefas;
create policy "tarefas_dono_muda" on public.tarefas
  for update using (auth.uid() = perfil_id) with check (auth.uid() = perfil_id);

drop policy if exists "tarefas_dono_apaga" on public.tarefas;
create policy "tarefas_dono_apaga" on public.tarefas
  for delete using (auth.uid() = perfil_id);
