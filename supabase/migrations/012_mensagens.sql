-- ============================================================
-- HONRA — Migração 012: CHAT POR NEGÓCIO (mensagens)
-- ------------------------------------------------------------
-- As duas partes de um orçamento precisam de falar DENTRO do negócio. Cada
-- orçamento tem a sua conversa; só as duas partes leem e escrevem. Realtime
-- ligado → a mensagem aparece do outro lado sem refrescar.
--
-- Correr no SQL Editor DEPOIS da 011.
-- ============================================================

create table if not exists public.mensagens (
  id           uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references public.orcamentos(id) on delete cascade,
  autor_perfil uuid not null references public.perfis(id) on delete cascade,
  corpo        text not null,
  criado_em    timestamptz not null default now()
);

create index if not exists mensagens_orcamento_idx
  on public.mensagens (orcamento_id, criado_em);

alter table public.mensagens enable row level security;

-- Ver a conversa: só as duas partes do orçamento.
drop policy if exists "mensagens_partes_veem" on public.mensagens;
create policy "mensagens_partes_veem" on public.mensagens
  for select using (
    exists (
      select 1 from public.orcamentos o
      where o.id = orcamento_id
        and (o.de_perfil = auth.uid() or o.para_perfil = auth.uid())
    )
  );

-- Escrever: sou eu o autor E sou uma das partes do orçamento.
drop policy if exists "mensagens_parte_escreve" on public.mensagens;
create policy "mensagens_parte_escreve" on public.mensagens
  for insert with check (
    auth.uid() = autor_perfil
    and exists (
      select 1 from public.orcamentos o
      where o.id = orcamento_id
        and (o.de_perfil = auth.uid() or o.para_perfil = auth.uid())
    )
  );

-- Realtime: a conversa acende sem refrescar.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'mensagens'
  ) then
    alter publication supabase_realtime add table public.mensagens;
  end if;
end $$;
