-- ============================================================
-- HONRA — Migração 071: PESQUISAS GUARDADAS e LISTAS
-- ------------------------------------------------------------
-- A bancada da Pesquisa (maquete "Pesquisar 1a") tem três blocos por baixo dos
-- filtros: "Guardar esta pesquisa", "PESQUISAS GUARDADAS" e "AS MINHAS LISTAS".
-- Os dois primeiros são a melhor ideia da maquete: transformam a busca de um
-- ato pontual numa VIGIA — "DJ · Lisboa · disponível · 4 novos desde a última
-- vez". É isso que traz a pessoa de volta sem feed nenhum, que é a promessa da
-- casa (o Honra liga pessoas com AÇÃO, não é feed).
--
-- DUAS TABELAS, porque são duas naturezas:
--   · uma pesquisa guardada é um CRITÉRIO (vive e re-corre; o resultado muda
--     sozinho quando o mundo muda);
--   · uma lista é um CONJUNTO DE PESSOAS escolhidas à mão (não muda sem mim).
--   Misturá-las obrigaria a uma linha que às vezes tem critério e às vezes tem
--   membros — um objeto a dizer duas coisas.
--
-- O critério guarda-se em `jsonb` de propósito: os filtros da Pesquisa vão
-- mudar (a Zona é hoje uma cidade e amanhã será um raio com geo) e uma coluna
-- por filtro obrigaria a uma migração a cada mudança de ecrã. O que é estável
-- — o dono, o nome, quando foi visto — fica em colunas a sério.
--
-- `visto_em` é o que faz o "4 novos desde a última vez" ser verdade: conta-se
-- quem entrou no critério DEPOIS desta marca. Sem ele, o número seria inventado.
--
-- Privadas por natureza: ninguém vê as pesquisas nem as listas de outra pessoa.
-- Sem triggers de servidor — como as `tarefas` e as `agenda_notas`, é uma
-- tabela onde o cliente escreve livremente porque só fala de si próprio.
--
-- Aditiva/idempotente. Correr DEPOIS da 070.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) PESQUISAS GUARDADAS — o critério que fica de vigia.
-- ----------------------------------------------------------------
create table if not exists public.pesquisas_guardadas (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references public.perfis(id) on delete cascade,
  nome       text not null,
  -- Os filtros tal como estavam: segmento, categoria, zona, cortes, piso,
  -- ordenação. Forma livre porque o ecrã evolui mais depressa que o esquema.
  criterio   jsonb not null default '{}'::jsonb,
  -- A marca da última visita: é daqui que sai o "N novos desde a última vez".
  visto_em   timestamptz not null default now(),
  criado_em  timestamptz not null default now(),
  constraint pesquisas_guardadas_nome_nao_vazio check (length(btrim(nome)) > 0)
);

comment on table public.pesquisas_guardadas is
  'Pesquisas que o próprio guardou para vigiar. O critério vive em jsonb (os filtros mudam com o ecrã); visto_em alimenta o "N novos desde a última vez". Privada (RLS: só o dono).';

create index if not exists pesquisas_guardadas_dono_idx
  on public.pesquisas_guardadas (perfil_id, criado_em desc);

alter table public.pesquisas_guardadas enable row level security;

drop policy if exists "pesq_guardadas_dono_ve" on public.pesquisas_guardadas;
create policy "pesq_guardadas_dono_ve" on public.pesquisas_guardadas
  for select using (auth.uid() = perfil_id);

drop policy if exists "pesq_guardadas_dono_cria" on public.pesquisas_guardadas;
create policy "pesq_guardadas_dono_cria" on public.pesquisas_guardadas
  for insert with check (auth.uid() = perfil_id);

drop policy if exists "pesq_guardadas_dono_muda" on public.pesquisas_guardadas;
create policy "pesq_guardadas_dono_muda" on public.pesquisas_guardadas
  for update using (auth.uid() = perfil_id) with check (auth.uid() = perfil_id);

drop policy if exists "pesq_guardadas_dono_apaga" on public.pesquisas_guardadas;
create policy "pesq_guardadas_dono_apaga" on public.pesquisas_guardadas
  for delete using (auth.uid() = perfil_id);

-- ----------------------------------------------------------------
-- 2) LISTAS — pessoas escolhidas à mão, para um trabalho concreto.
-- ----------------------------------------------------------------
create table if not exists public.listas (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references public.perfis(id) on delete cascade,
  nome       text not null,
  criado_em  timestamptz not null default now(),
  constraint listas_nome_nao_vazio check (length(btrim(nome)) > 0)
);

comment on table public.listas is
  'Listas privadas de profissionais, montadas à mão pelo dono (ex.: "Festa de verão"). Curadoria, não disparo: existir numa lista não envia nada a ninguém.';

create index if not exists listas_dono_idx on public.listas (perfil_id, criado_em desc);

-- Quem está em cada lista. `unique` para a mesma pessoa não entrar duas vezes.
create table if not exists public.listas_membros (
  lista_id   uuid not null references public.listas(id) on delete cascade,
  perfil_id  uuid not null references public.perfis(id) on delete cascade,
  criado_em  timestamptz not null default now(),
  primary key (lista_id, perfil_id)
);

comment on table public.listas_membros is
  'Membros de uma lista privada. Estar aqui NÃO notifica ninguém — a pessoa listada não sabe nem tem de saber; o pedido de orçamento é que é um ato público.';

alter table public.listas enable row level security;
alter table public.listas_membros enable row level security;

drop policy if exists "listas_dono_ve" on public.listas;
create policy "listas_dono_ve" on public.listas
  for select using (auth.uid() = perfil_id);

drop policy if exists "listas_dono_cria" on public.listas;
create policy "listas_dono_cria" on public.listas
  for insert with check (auth.uid() = perfil_id);

drop policy if exists "listas_dono_muda" on public.listas;
create policy "listas_dono_muda" on public.listas
  for update using (auth.uid() = perfil_id) with check (auth.uid() = perfil_id);

drop policy if exists "listas_dono_apaga" on public.listas;
create policy "listas_dono_apaga" on public.listas
  for delete using (auth.uid() = perfil_id);

-- Os membros seguem o dono da LISTA (não o perfil listado): quem manda na
-- linha é quem fez a lista, e mais ninguém a pode ler — nem a própria pessoa
-- listada, que não deve saber que foi posta numa lista de alguém.
drop policy if exists "listas_membros_dono_ve" on public.listas_membros;
create policy "listas_membros_dono_ve" on public.listas_membros
  for select using (
    exists (select 1 from public.listas l where l.id = lista_id and l.perfil_id = auth.uid())
  );

drop policy if exists "listas_membros_dono_cria" on public.listas_membros;
create policy "listas_membros_dono_cria" on public.listas_membros
  for insert with check (
    exists (select 1 from public.listas l where l.id = lista_id and l.perfil_id = auth.uid())
  );

drop policy if exists "listas_membros_dono_apaga" on public.listas_membros;
create policy "listas_membros_dono_apaga" on public.listas_membros
  for delete using (
    exists (select 1 from public.listas l where l.id = lista_id and l.perfil_id = auth.uid())
  );
