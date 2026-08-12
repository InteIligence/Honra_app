-- ============================================================
-- HONRA — Migração 011: MURAL DE TRABALHOS + CANDIDATURAS
-- ------------------------------------------------------------
-- O "Trabalho" do separador Pesquisar: publica-se uma oportunidade (ex.: uma
-- empresa precisa de um designer), os profissionais VEEM e CANDIDATAM-SE, e
-- quem publicou vê as candidaturas e escolhe. Depois de escolher, o caminho
-- natural é abrir um orçamento (entra na mecânica da caução que já existe).
--
-- Decisão (v1): QUALQUER perfil autenticado pode publicar um trabalho (um
-- "preciso de..."), e qualquer perfil (menos o autor) pode candidatar-se.
--
-- Correr no SQL Editor DEPOIS da 010.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) GAVETA: trabalhos — as oportunidades do mural.
-- ----------------------------------------------------------------
create table if not exists public.trabalhos (
  id           uuid primary key default gen_random_uuid(),
  autor_perfil uuid not null references public.perfis(id) on delete cascade,
  titulo       text not null,
  descricao    text,
  categoria_id uuid references public.categorias(id) on delete set null,
  estado       text not null default 'aberto' check (estado in ('aberto', 'fechado')),
  criado_em    timestamptz not null default now()
);

create index if not exists trabalhos_estado_idx on public.trabalhos (estado, criado_em desc);
create index if not exists trabalhos_autor_idx on public.trabalhos (autor_perfil);

alter table public.trabalhos enable row level security;

-- Leitura pública (o mural é para ser visto).
drop policy if exists "trabalhos_leitura_publica" on public.trabalhos;
create policy "trabalhos_leitura_publica" on public.trabalhos
  for select using (true);

-- Só o autor publica/edita/fecha/apaga o seu.
drop policy if exists "trabalhos_autor_insere" on public.trabalhos;
create policy "trabalhos_autor_insere" on public.trabalhos
  for insert with check (auth.uid() = autor_perfil);

drop policy if exists "trabalhos_autor_edita" on public.trabalhos;
create policy "trabalhos_autor_edita" on public.trabalhos
  for update using (auth.uid() = autor_perfil) with check (auth.uid() = autor_perfil);

drop policy if exists "trabalhos_autor_apaga" on public.trabalhos;
create policy "trabalhos_autor_apaga" on public.trabalhos
  for delete using (auth.uid() = autor_perfil);

-- ----------------------------------------------------------------
-- 2) GAVETA: candidaturas — quem se apresenta a um trabalho.
--    Uma candidatura por par (trabalho, candidato).
-- ----------------------------------------------------------------
create table if not exists public.candidaturas (
  id               uuid primary key default gen_random_uuid(),
  trabalho_id      uuid not null references public.trabalhos(id) on delete cascade,
  candidato_perfil uuid not null references public.perfis(id) on delete cascade,
  mensagem         text,
  criado_em        timestamptz not null default now(),
  unique (trabalho_id, candidato_perfil)
);

create index if not exists candidaturas_trabalho_idx on public.candidaturas (trabalho_id);
create index if not exists candidaturas_candidato_idx on public.candidaturas (candidato_perfil);

alter table public.candidaturas enable row level security;

-- Veem a candidatura: o candidato (a sua) E o autor do trabalho (as do seu trabalho).
drop policy if exists "candidaturas_veem" on public.candidaturas;
create policy "candidaturas_veem" on public.candidaturas
  for select using (
    auth.uid() = candidato_perfil
    or auth.uid() = (select t.autor_perfil from public.trabalhos t where t.id = trabalho_id)
  );

-- Candidatar-se: sou eu o candidato, o trabalho está ABERTO e NÃO é meu.
drop policy if exists "candidaturas_candidato_insere" on public.candidaturas;
create policy "candidaturas_candidato_insere" on public.candidaturas
  for insert with check (
    auth.uid() = candidato_perfil
    and exists (
      select 1 from public.trabalhos t
      where t.id = trabalho_id
        and t.estado = 'aberto'
        and t.autor_perfil <> auth.uid()
    )
  );

-- Retirar a candidatura (só a minha).
drop policy if exists "candidaturas_candidato_apaga" on public.candidaturas;
create policy "candidaturas_candidato_apaga" on public.candidaturas
  for delete using (auth.uid() = candidato_perfil);
