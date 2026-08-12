-- ============================================================
-- HONRA — Migração 069: NOTAS DO DIA (a agenda com calendário)
-- ------------------------------------------------------------
-- Pedido do Vítor (31/07): a Agenda ganha calendário e um fluxo simples —
--   dia → nota → hora do alerta (despertador) → confirmar (e, à parte, apagar).
--
-- Porquê uma tabela NOVA e não uma coluna nas `tarefas` (031):
--   · a tarefa é um apontamento SOLTO — pode não ter dia nenhum;
--   · a nota do dia nasce SEMPRE agarrada a um dia (é a folha do calendário)
--     e é a única que carrega despertador. Misturar as duas obrigava a
--     `quando` opcional + alerta opcional — um objeto que diz duas coisas.
--   O ecrã mostra as duas no mesmo dia (o dia tem de ser honesto), mas cada
--   uma guarda-se onde faz sentido.
--
-- O DESPERTADOR é LOCAL, do aparelho (expo-notifications, `scheduleNotificationAsync`):
--   · `alerta_em`  — o momento absoluto (a INTENÇÃO, que sobrevive ao aparelho);
--   · `alerta_id`  — o identificador que o SO devolveu ao agendar, guardado só
--                    para se poder CANCELAR quando a nota é apagada ou a hora
--                    muda. Um alerta órfão a tocar depois da nota apagada é um
--                    bug grave — por isso o id vive na linha, não na memória.
--   O id é do APARELHO que agendou: noutro telemóvel (ou na web) não existe.
--   Por isso é `text` e nunca se assume que está lá — é uma pista, não uma lei.
--
-- Privada por natureza: o dono faz tudo nas SUAS notas, ninguém vê as dos
-- outros. Sem triggers de servidor — como as `tarefas`, é uma tabela em que o
-- cliente escreve livremente porque só fala de si próprio.
--
-- Aditiva/idempotente. Correr DEPOIS da 068. NÃO é aplicada por nenhum agente:
-- o Vítor cola-a no SQL Editor do Supabase.
-- ============================================================

create table if not exists public.agenda_notas (
  id            uuid primary key default gen_random_uuid(),
  perfil_id     uuid not null references public.perfis(id) on delete cascade,
  dia           date not null,                       -- a folha do calendário
  texto         text not null,
  alerta_em     timestamptz,                         -- hora do despertador (nulo = sem alerta)
  alerta_id     text,                                -- id da notificação LOCAL, para cancelar
  confirmada    boolean not null default false,      -- o pisco da checklist
  confirmada_em timestamptz,                         -- carimbo do pisco
  criado_em     timestamptz not null default now(),
  -- Uma nota sem texto (ou só espaços) não entra.
  constraint agenda_notas_texto_nao_vazio check (length(btrim(texto)) > 0)
);

comment on table public.agenda_notas is
  'Notas do dia da Agenda: o que o próprio aponta num dia, com despertador local opcional. Privada (RLS: só o dono).';
comment on column public.agenda_notas.alerta_id is
  'Identificador devolvido por scheduleNotificationAsync NO APARELHO que agendou. Serve só para cancelar; noutro aparelho não existe.';

-- A leitura típica: as MINHAS, do mês/dia que o calendário está a mostrar.
create index if not exists agenda_notas_perfil_dia_idx
  on public.agenda_notas (perfil_id, dia, criado_em);

-- ----------------------------------------------------------------
-- RLS — o dono faz tudo nas suas; mais ninguém vê nada.
-- (O mesmo padrão da 031, tabela por tabela, sem atalhos.)
-- ----------------------------------------------------------------
alter table public.agenda_notas enable row level security;

drop policy if exists "agenda_notas_dono_ve" on public.agenda_notas;
create policy "agenda_notas_dono_ve" on public.agenda_notas
  for select using (auth.uid() = perfil_id);

drop policy if exists "agenda_notas_dono_cria" on public.agenda_notas;
create policy "agenda_notas_dono_cria" on public.agenda_notas
  for insert with check (auth.uid() = perfil_id);

drop policy if exists "agenda_notas_dono_muda" on public.agenda_notas;
create policy "agenda_notas_dono_muda" on public.agenda_notas
  for update using (auth.uid() = perfil_id) with check (auth.uid() = perfil_id);

drop policy if exists "agenda_notas_dono_apaga" on public.agenda_notas;
create policy "agenda_notas_dono_apaga" on public.agenda_notas
  for delete using (auth.uid() = perfil_id);
