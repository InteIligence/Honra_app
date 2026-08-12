-- ============================================================
-- HONRA — Esquema da base de dados (as "gavetas" da Memória)
-- Correr no Supabase: painel → SQL Editor → colar tudo → Run.
-- Desenhado para a Fatia 1 (Conta + Perfil) e já preparado para
-- a Fatia 2 (Verificação) e Fatia 3 (Orçamento + 2€).
-- ============================================================

-- ----------------------------------------------------------------
-- GAVETA: perfis  (pessoa | empresa | equipa — o mesmo "shell")
-- Cada perfil aponta para o utilizador autenticado (auth.users).
-- ----------------------------------------------------------------
create table if not exists public.perfis (
  id                uuid primary key references auth.users(id) on delete cascade,
  criado_em         timestamptz not null default now(),
  nome              text,
  handle            text unique,
  avatar            text,                      -- iniciais ou url
  papel             text,                      -- "Vendas & Apoio ao Cliente"
  cidade            text,
  tipo              text not null default 'pessoa'
                      check (tipo in ('pessoa','empresa','equipa')),
  disponibilidade   text not null default 'disponivel'
                      check (disponibilidade in ('disponivel','a_partir_de','ocupado')),
  indice_confianca  numeric not null default 0,
  nif               text                       -- só empresa
);

-- ----------------------------------------------------------------
-- GAVETA: verificacoes  (as abas do selo — enche-se aba a aba)
-- Verificação VIVA: tem estado + quando reconfirmar.
-- ----------------------------------------------------------------
create table if not exists public.verificacoes (
  id            uuid primary key default gen_random_uuid(),
  perfil_id     uuid not null references public.perfis(id) on delete cascade,
  aba           text not null
                  check (aba in ('identidade','profissao','contacto','portefolio','nif','cmd')),
  estado        text not null default 'pendente'
                  check (estado in ('pendente','verificado','expirado')),
  verificado_em timestamptz,
  reconfirma_em timestamptz,
  unique (perfil_id, aba)
);

-- ----------------------------------------------------------------
-- GAVETA: orcamentos  (liga duas pessoas reais; alimenta reputação)
-- valor_taxa = a caução anti-fantasma (2€, decidido 2026-07-06).
-- ----------------------------------------------------------------
create table if not exists public.orcamentos (
  id            uuid primary key default gen_random_uuid(),
  criado_em     timestamptz not null default now(),
  de_perfil     uuid not null references public.perfis(id) on delete cascade,
  para_perfil   uuid not null references public.perfis(id) on delete cascade,
  descricao     text,
  estado        text not null default 'pedido'
                  check (estado in ('pedido','aceite','em_curso','concluido','confirmado_ambos','recusado')),
  valor_taxa    numeric not null default 2   -- caução (€), devolvível no aperto de mão
);

-- ============================================================
-- REGRAS DE ACESSO (Row Level Security) — segurança de origem.
-- "Só o dono edita o seu; perfis são públicos de ler."
-- ============================================================
alter table public.perfis        enable row level security;
alter table public.verificacoes  enable row level security;
alter table public.orcamentos    enable row level security;

-- perfis: qualquer um vê (perfil público); só o dono cria/edita o seu
drop policy if exists "perfis_leitura_publica" on public.perfis;
create policy "perfis_leitura_publica" on public.perfis
  for select using (true);

drop policy if exists "perfis_dono_insere" on public.perfis;
create policy "perfis_dono_insere" on public.perfis
  for insert with check (auth.uid() = id);

drop policy if exists "perfis_dono_edita" on public.perfis;
create policy "perfis_dono_edita" on public.perfis
  for update using (auth.uid() = id);

-- verificacoes: o dono vê e gere as suas abas
drop policy if exists "verif_dono_tudo" on public.verificacoes;
create policy "verif_dono_tudo" on public.verificacoes
  for all using (auth.uid() = perfil_id) with check (auth.uid() = perfil_id);

-- as abas verdes são visíveis a todos (o selo é público)
drop policy if exists "verif_leitura_publica" on public.verificacoes;
create policy "verif_leitura_publica" on public.verificacoes
  for select using (true);

-- orcamentos: só as duas partes envolvidas veem/gerem
drop policy if exists "orc_partes_veem" on public.orcamentos;
create policy "orc_partes_veem" on public.orcamentos
  for select using (auth.uid() = de_perfil or auth.uid() = para_perfil);

drop policy if exists "orc_pede" on public.orcamentos;
create policy "orc_pede" on public.orcamentos
  for insert with check (auth.uid() = de_perfil);

drop policy if exists "orc_partes_atualizam" on public.orcamentos;
create policy "orc_partes_atualizam" on public.orcamentos
  for update using (auth.uid() = de_perfil or auth.uid() = para_perfil);

-- ============================================================
-- AUTOMAÇÃO: quando nasce um utilizador, nasce o seu perfil
-- + as 4 abas do selo (pendentes). É o "Porteiro" a preparar a ficha.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.perfis (id, nome, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    upper(substr(coalesce(new.raw_user_meta_data->>'nome', new.email), 1, 2))
  );

  insert into public.verificacoes (perfil_id, aba)
  values (new.id, 'identidade'),
         (new.id, 'profissao'),
         (new.id, 'contacto'),
         (new.id, 'portefolio');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
