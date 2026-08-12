-- ============================================================
-- HONRA — Migração 019: PEDIDOS DE CONTA (RGPD: exportar / eliminar)
-- ------------------------------------------------------------
-- O RGPD dá a cada pessoa o direito de LEVAR os seus dados (portabilidade) e de
-- ser ESQUECIDA (eliminação). Em vez de fingir que já está feito, registamos um
-- pedido REAL — 'pendente' — que o lado do servidor processa e honra. Um pedido
-- é do dono: ele cria e vê os seus; o processamento (mudar de estado) é do
-- sistema (service_role, que ignora o RLS), nunca do cliente.
--
-- Enquanto esta migração não correr, a app degrada com HONESTIDADE ("vamos
-- processar o teu pedido — em breve"), sem nunca simular que já foi feito.
--
-- Correr no SQL Editor DEPOIS da 018.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) GAVETA: um pedido de conta (exportar ou eliminar).
-- ----------------------------------------------------------------
create table if not exists public.pedidos_conta (
  id            uuid primary key default gen_random_uuid(),
  criado_em     timestamptz not null default now(),
  perfil_id     uuid not null references public.perfis(id) on delete cascade,
  tipo          text not null check (tipo in ('exportar', 'eliminar')),
  estado        text not null default 'pendente'
                  check (estado in ('pendente', 'a_processar', 'concluido', 'cancelado')),
  atualizado_em timestamptz not null default now()
);

create index if not exists pedidos_conta_perfil_idx
  on public.pedidos_conta (perfil_id, criado_em desc);

-- Um pedido EM ABERTO de cada tipo por pessoa (evita duplicados a acumular).
create unique index if not exists pedidos_conta_um_aberto_idx
  on public.pedidos_conta (perfil_id, tipo)
  where estado in ('pendente', 'a_processar');

-- ----------------------------------------------------------------
-- 2) RLS — o dono cria e vê os SEUS pedidos. Processar (mudar de estado) é do
--    servidor (service_role ignora o RLS); o cliente não fecha os seus pedidos.
-- ----------------------------------------------------------------
alter table public.pedidos_conta enable row level security;

drop policy if exists "pedidos_conta_dono_ve" on public.pedidos_conta;
create policy "pedidos_conta_dono_ve" on public.pedidos_conta
  for select using (auth.uid() = perfil_id);

drop policy if exists "pedidos_conta_dono_cria" on public.pedidos_conta;
create policy "pedidos_conta_dono_cria" on public.pedidos_conta
  for insert with check (auth.uid() = perfil_id and estado = 'pendente');
