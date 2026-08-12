-- ============================================================
-- HONRA — Migração 020: LEITURA DE CONVERSAS (mensagens não lidas)
-- ------------------------------------------------------------
-- As `mensagens` não tinham noção de "lida". Para o separador Chat mostrar o
-- número de mensagens por ler, guardamos por-utilizador o instante da última
-- leitura de cada conversa (orçamento). Não lida = mensagem da OUTRA parte mais
-- recente do que a minha última leitura dessa conversa.
--
-- Correr no SQL Editor DEPOIS da 019.
-- ============================================================

-- 1) Marca de leitura: uma linha por (utilizador, conversa).
create table if not exists public.leitura_conversa (
  perfil_id    uuid not null references public.perfis(id) on delete cascade,
  orcamento_id uuid not null references public.orcamentos(id) on delete cascade,
  lido_em      timestamptz not null default now(),
  primary key (perfil_id, orcamento_id)
);

-- 2) RLS — cada um só mexe nas SUAS marcas de leitura.
alter table public.leitura_conversa enable row level security;

drop policy if exists "leitura_dono" on public.leitura_conversa;
create policy "leitura_dono" on public.leitura_conversa
  for all using (auth.uid() = perfil_id) with check (auth.uid() = perfil_id);

-- 3) Contagem total de mensagens por ler do utilizador autenticado.
--    security definer: lê apesar do RLS, mas ESCOPADO a auth.uid() (só as minhas
--    conversas, só mensagens da outra parte mais recentes que a minha leitura).
create or replace function public.mensagens_nao_lidas()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.mensagens m
  join public.orcamentos o on o.id = m.orcamento_id
  left join public.leitura_conversa l
    on l.orcamento_id = m.orcamento_id and l.perfil_id = auth.uid()
  where (o.de_perfil = auth.uid() or o.para_perfil = auth.uid())
    and m.autor_perfil <> auth.uid()
    and m.criado_em > coalesce(l.lido_em, 'epoch'::timestamptz);
$$;

grant execute on function public.mensagens_nao_lidas() to authenticated;
