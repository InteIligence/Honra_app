-- ============================================================
-- HONRA — Migração 002: CATEGORIAS + PERFIL_CATEGORIAS
-- As "etiquetas de ofício" — dizem o QUE cada perfil faz.
-- Correr no Supabase: painel → SQL Editor → colar tudo → Run.
-- (Aditivo: não mexe nas gavetas já existentes.)
-- ============================================================

-- ----------------------------------------------------------------
-- GAVETA: categorias  (taxonomia partilhada; lista fechada e limpa)
-- ----------------------------------------------------------------
create table if not exists public.categorias (
  id    uuid primary key default gen_random_uuid(),
  nome  text unique not null,
  slug  text unique not null
);

-- Taxonomia PT de arranque (idempotente: não duplica se correr outra vez).
insert into public.categorias (nome, slug) values
  ('Design',                    'design'),
  ('Web & Software',            'web-software'),
  ('Marketing & Redes',         'marketing-redes'),
  ('Obras & Construção',        'obras-construcao'),
  ('Contabilidade & Finanças',  'contabilidade-financas'),
  ('Fotografia & Vídeo',        'fotografia-video'),
  ('Consultoria',               'consultoria'),
  ('Reparações & Assistência',  'reparacoes-assistencia'),
  ('Limpezas',                  'limpezas'),
  ('Eventos',                   'eventos')
on conflict do nothing;

-- ----------------------------------------------------------------
-- GAVETA: perfil_categorias  (ponte muitos-para-muitos)
-- Cada perfil pode ter várias etiquetas; cada etiqueta, vários perfis.
-- ----------------------------------------------------------------
create table if not exists public.perfil_categorias (
  perfil_id     uuid not null references public.perfis(id) on delete cascade,
  categoria_id  uuid not null references public.categorias(id) on delete cascade,
  primary key (perfil_id, categoria_id)
);

-- ============================================================
-- REGRAS DE ACESSO (Row Level Security)
-- "Etiquetas são públicas de ler; só o dono põe/tira as suas."
-- ============================================================
alter table public.categorias        enable row level security;
alter table public.perfil_categorias enable row level security;

-- categorias: qualquer um lê a taxonomia
drop policy if exists "categorias_leitura_publica" on public.categorias;
create policy "categorias_leitura_publica" on public.categorias
  for select using (true);

-- perfil_categorias: qualquer um lê (aparece nos perfis públicos)
drop policy if exists "perfil_cat_leitura_publica" on public.perfil_categorias;
create policy "perfil_cat_leitura_publica" on public.perfil_categorias
  for select using (true);

-- perfil_categorias: só o dono insere as suas etiquetas
drop policy if exists "perfil_cat_dono_insere" on public.perfil_categorias;
create policy "perfil_cat_dono_insere" on public.perfil_categorias
  for insert with check (auth.uid() = perfil_id);

-- perfil_categorias: só o dono remove as suas etiquetas
drop policy if exists "perfil_cat_dono_remove" on public.perfil_categorias;
create policy "perfil_cat_dono_remove" on public.perfil_categorias
  for delete using (auth.uid() = perfil_id);
