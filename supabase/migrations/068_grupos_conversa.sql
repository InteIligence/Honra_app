-- ============================================================
-- HONRA — Migração 068: GRUPOS DE CONVERSA (equipas a falar do trabalho)
-- ------------------------------------------------------------
-- Pedido do Vítor (28/07): "o líder criar um grupo de conversa sobre o
-- trabalho com os elementos da equipa" — browser E telemóvel.
--
-- Desenho mínimo e honesto:
--   · `grupos_conversa` — nome + criador (o líder) + trabalho opcional (o
--     grupo pode nascer amarrado a um anúncio, ou livre).
--   · `grupo_membros` — quem está dentro. O líder entra automaticamente.
--   · `mensagens` ganha `grupo_id` (XOR com orcamento_id): a MESMA tabela, o
--     MESMO realtime, as MESMAS mecânicas da conversa 1-para-1.
--   · RLS: membros leem/escrevem; só o líder gere membros e o grupo.
--
-- Correr DEPOIS da 067.
-- ============================================================

-- 1) O grupo.
create table if not exists public.grupos_conversa (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (char_length(nome) between 1 and 80),
  criador_perfil uuid not null references public.perfis(id) on delete cascade,
  trabalho_id    uuid references public.trabalhos(id) on delete set null,
  criado_em      timestamptz not null default now()
);

comment on table public.grupos_conversa is
  'Grupo de conversa de equipa (068). O criador é o líder; trabalho_id amarra o grupo a um anúncio (opcional).';

-- 2) Os membros (o líder é membro por trigger, nunca por fé no cliente).
create table if not exists public.grupo_membros (
  grupo_id     uuid not null references public.grupos_conversa(id) on delete cascade,
  perfil_id    uuid not null references public.perfis(id) on delete cascade,
  adicionado_em timestamptz not null default now(),
  primary key (grupo_id, perfil_id)
);

create or replace function public.grupo_poe_lider()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.grupo_membros (grupo_id, perfil_id)
  values (new.id, new.criador_perfil)
  on conflict do nothing;
  return null;
end; $$;

drop trigger if exists after_grupo_poe_lider on public.grupos_conversa;
create trigger after_grupo_poe_lider
  after insert on public.grupos_conversa
  for each row execute function public.grupo_poe_lider();

-- 3) RLS.
alter table public.grupos_conversa enable row level security;
alter table public.grupo_membros enable row level security;

-- Ver o grupo: membros. (A função evita recursão de policies.)
create or replace function public.sou_membro_do_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.grupo_membros
     where grupo_id = p_grupo and perfil_id = auth.uid()
  );
$$;

drop policy if exists "grupos_membros_veem" on public.grupos_conversa;
create policy "grupos_membros_veem" on public.grupos_conversa
  for select using (public.sou_membro_do_grupo(id));

-- Criar: qualquer pessoa com identidade verificada (a régua dos gestos, 043) e
-- em nome próprio.
drop policy if exists "grupos_verificado_cria" on public.grupos_conversa;
create policy "grupos_verificado_cria" on public.grupos_conversa
  for insert with check (
    auth.uid() = criador_perfil
    and public.identidade_verificada(auth.uid())
  );

-- Gerir/apagar o grupo: só o líder.
drop policy if exists "grupos_lider_edita" on public.grupos_conversa;
create policy "grupos_lider_edita" on public.grupos_conversa
  for update using (auth.uid() = criador_perfil);
drop policy if exists "grupos_lider_apaga" on public.grupos_conversa;
create policy "grupos_lider_apaga" on public.grupos_conversa
  for delete using (auth.uid() = criador_perfil);

-- Membros: os membros veem a lista; o LÍDER adiciona/remove; cada um pode
-- sair pelo próprio pé (delete da sua linha).
drop policy if exists "membros_membros_veem" on public.grupo_membros;
create policy "membros_membros_veem" on public.grupo_membros
  for select using (public.sou_membro_do_grupo(grupo_id));

drop policy if exists "membros_lider_adiciona" on public.grupo_membros;
create policy "membros_lider_adiciona" on public.grupo_membros
  for insert with check (
    exists (
      select 1 from public.grupos_conversa g
       where g.id = grupo_id and g.criador_perfil = auth.uid()
    )
  );

drop policy if exists "membros_saem_ou_lider_tira" on public.grupo_membros;
create policy "membros_saem_ou_lider_tira" on public.grupo_membros
  for delete using (
    perfil_id = auth.uid()
    or exists (
      select 1 from public.grupos_conversa g
       where g.id = grupo_id and g.criador_perfil = auth.uid()
    )
  );

-- 4) `mensagens` aprende grupos: orcamento OU grupo, nunca os dois/nenhum.
alter table public.mensagens
  alter column orcamento_id drop not null;
alter table public.mensagens
  add column if not exists grupo_id uuid references public.grupos_conversa(id) on delete cascade;

alter table public.mensagens drop constraint if exists mensagens_um_dono;
alter table public.mensagens add constraint mensagens_um_dono
  check (num_nonnulls(orcamento_id, grupo_id) = 1);

create index if not exists mensagens_grupo_idx
  on public.mensagens (grupo_id, criado_em);

-- As policies de mensagens, alargadas: partes do orçamento OU membros do grupo.
drop policy if exists "mensagens_partes_veem" on public.mensagens;
create policy "mensagens_partes_veem" on public.mensagens
  for select using (
    (orcamento_id is not null and exists (
      select 1 from public.orcamentos o
      where o.id = orcamento_id
        and (o.de_perfil = auth.uid() or o.para_perfil = auth.uid())
    ))
    or (grupo_id is not null and public.sou_membro_do_grupo(grupo_id))
  );

drop policy if exists "mensagens_parte_escreve" on public.mensagens;
create policy "mensagens_parte_escreve" on public.mensagens
  for insert with check (
    auth.uid() = autor_perfil
    and (
      (orcamento_id is not null and exists (
        select 1 from public.orcamentos o
        where o.id = orcamento_id
          and (o.de_perfil = auth.uid() or o.para_perfil = auth.uid())
      ))
      or (grupo_id is not null and public.sou_membro_do_grupo(grupo_id))
    )
  );
