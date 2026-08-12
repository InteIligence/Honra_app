-- ============================================================
-- HONRA — Migração 024: TRUST & SAFETY (denunciar + bloquear)
-- ------------------------------------------------------------
-- Não se lança conteúdo de utilizadores sem isto. Duas peças:
--  • DENÚNCIA: sinalizar um perfil para moderação (o denunciante cria; a revisão
--    é do servidor/admin — o cliente não lê as denúncias).
--  • BLOQUEIO: cada um gere os SEUS bloqueios. E um bloqueio (em qualquer direção)
--    IMPEDE nova interação — orçamento ou mensagem — entre as duas partes (guardas
--    server-side, à prova de cliente).
--
-- Correr DEPOIS da 023.
-- ============================================================

-- 1) DENÚNCIAS
create table if not exists public.denuncias (
  id           uuid primary key default gen_random_uuid(),
  denunciante  uuid not null references public.perfis(id) on delete cascade,
  denunciado   uuid not null references public.perfis(id) on delete cascade,
  motivo       text not null,
  detalhe      text,
  estado       text not null default 'pendente' check (estado in ('pendente','revista','resolvida')),
  criado_em    timestamptz not null default now(),
  check (denunciante <> denunciado)
);
alter table public.denuncias enable row level security;
drop policy if exists "denuncia_cria" on public.denuncias;
create policy "denuncia_cria" on public.denuncias
  for insert with check (auth.uid() = denunciante);
-- Sem policy de select p/ o cliente: a moderação lê-se com service_role.

-- 2) BLOQUEIOS
create table if not exists public.bloqueios (
  bloqueador  uuid not null references public.perfis(id) on delete cascade,
  bloqueado   uuid not null references public.perfis(id) on delete cascade,
  criado_em   timestamptz not null default now(),
  primary key (bloqueador, bloqueado),
  check (bloqueador <> bloqueado)
);
alter table public.bloqueios enable row level security;
drop policy if exists "bloqueio_dono" on public.bloqueios;
create policy "bloqueio_dono" on public.bloqueios
  for all using (auth.uid() = bloqueador) with check (auth.uid() = bloqueador);

-- 3) GUARDA — bloqueio (qualquer direção) impede NOVO orçamento entre as partes.
create or replace function public.guarda_bloqueio_orcamento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.bloqueios b
    where (b.bloqueador = new.de_perfil  and b.bloqueado = new.para_perfil)
       or (b.bloqueador = new.para_perfil and b.bloqueado = new.de_perfil)
  ) then
    raise exception 'Há um bloqueio entre as partes.';
  end if;
  return new;
end; $$;
drop trigger if exists antes_orcamento_bloqueio on public.orcamentos;
create trigger antes_orcamento_bloqueio before insert on public.orcamentos
  for each row execute function public.guarda_bloqueio_orcamento();

-- 4) GUARDA — bloqueio impede NOVA mensagem entre as partes do orçamento.
create or replace function public.guarda_bloqueio_mensagem()
returns trigger language plpgsql security definer set search_path = public as $$
declare de uuid; para uuid;
begin
  select o.de_perfil, o.para_perfil into de, para
    from public.orcamentos o where o.id = new.orcamento_id;
  if exists (
    select 1 from public.bloqueios b
    where (b.bloqueador = de   and b.bloqueado = para)
       or (b.bloqueador = para and b.bloqueado = de)
  ) then
    raise exception 'Há um bloqueio entre as partes.';
  end if;
  return new;
end; $$;
drop trigger if exists antes_mensagem_bloqueio on public.mensagens;
create trigger antes_mensagem_bloqueio before insert on public.mensagens
  for each row execute function public.guarda_bloqueio_mensagem();
