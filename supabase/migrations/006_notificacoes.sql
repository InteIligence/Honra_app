-- ============================================================
-- HONRA — Migração 006: NOTIFICAÇÕES (projeção da máquina de estados)
-- ------------------------------------------------------------
-- Princípio: um aviso NÃO é uma feature à parte — é o REFLEXO de um momento
-- em que o relógio do aperto de mão mexe. Como TODAS as transições da caução
-- já passam pela BD (webhook, funções, resolver), um único trigger em
-- `orcamentos` cria o aviso certo, para a pessoa certa, no momento exato.
-- Só o "lembrete de véspera" (baseado no tempo, não numa transição) vem do
-- resolver agendado, via a função `criar_aviso`.
--
-- O tom empurra para a AÇÃO, não para o medo ("mostra evolução até X", nunca
-- "vais ser cobrado"). O `prazo` alimenta a contagem decrescente na app; o
-- `urgente` diz se o sino deve pulsar.
--
-- Correr no SQL Editor DEPOIS da 005.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) GAVETA: notificacoes
-- ----------------------------------------------------------------
create table if not exists public.notificacoes (
  id           uuid primary key default gen_random_uuid(),
  criado_em    timestamptz not null default now(),
  perfil_id    uuid not null references public.perfis(id) on delete cascade,   -- destinatário
  tipo         text not null,          -- pedido|aceite|selado|apresentou|confirmou|cancel_pedido|honrado|incumprido|expirado|recusado|lembrete
  orcamento_id uuid references public.orcamentos(id) on delete cascade,
  titulo       text not null,
  corpo        text,
  prazo        timestamptz,            -- fim da contagem (null = sem relógio)
  urgente      boolean not null default false,  -- alimenta o pulsar do sino
  lida         boolean not null default false
);

create index if not exists notificacoes_perfil_idx
  on public.notificacoes (perfil_id, lida, criado_em desc);

-- ----------------------------------------------------------------
-- 2) RLS — cada um vê e marca como lidas SÓ as suas. Inserir é só do
--    servidor (o trigger/rpc corre security definer e ignora o RLS).
-- ----------------------------------------------------------------
alter table public.notificacoes enable row level security;

drop policy if exists "notif_dono_ve" on public.notificacoes;
create policy "notif_dono_ve" on public.notificacoes
  for select using (auth.uid() = perfil_id);

drop policy if exists "notif_dono_marca" on public.notificacoes;
create policy "notif_dono_marca" on public.notificacoes
  for update using (auth.uid() = perfil_id) with check (auth.uid() = perfil_id);

-- Realtime: a app ouve os seus avisos ao vivo (o sino acende sem refrescar).
-- Idempotente: só adiciona se ainda não fizer parte da publicação.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'notificacoes'
  ) then
    alter publication supabase_realtime add table public.notificacoes;
  end if;
end $$;

-- ----------------------------------------------------------------
-- 3) HELPER: criar_aviso — um só sítio a inserir. Usado pelo trigger e,
--    por rpc, pelo resolver (lembrete de véspera).
-- ----------------------------------------------------------------
create or replace function public.criar_aviso(
  p_perfil uuid, p_tipo text, p_orcamento uuid,
  p_titulo text, p_corpo text, p_prazo timestamptz, p_urgente boolean
) returns void
language sql
security definer set search_path = public
as $$
  insert into public.notificacoes (perfil_id, tipo, orcamento_id, titulo, corpo, prazo, urgente)
  values (p_perfil, p_tipo, p_orcamento, p_titulo, p_corpo, p_prazo, p_urgente);
$$;

-- ----------------------------------------------------------------
-- 4) O TRIGGER — traduz cada momento do ciclo num aviso.
--    A = de_perfil (cliente que pede) · B = para_perfil (freelancer).
-- ----------------------------------------------------------------
create or replace function public.notificar_ciclo()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  nome_a text;
  nome_b text;
  prazo_check timestamptz;
begin
  select nome into nome_a from public.perfis where id = new.de_perfil;
  select nome into nome_b from public.perfis where id = new.para_perfil;

  -- ===== NOVO PEDIDO (insert) → avisa B =====
  if tg_op = 'INSERT' then
    if new.estado = 'pedido' then
      perform public.criar_aviso(
        new.para_perfil, 'pedido', new.id,
        'Novo pedido de orçamento',
        'De ' || coalesce(nome_a, 'alguém') || '. Aceita e segura a caução para arrancar.',
        null, true);
    end if;
    return new;
  end if;

  -- ===== TRANSIÇÕES DE ESTADO (update) =====
  if new.estado is distinct from old.estado then
    if new.estado = 'aceite' then
      -- B aceitou e segurou → A tem de selar (janela de 48h).
      perform public.criar_aviso(
        new.de_perfil, 'aceite', new.id,
        'Aceitaram — sela o aperto de mão',
        coalesce(nome_b, 'A outra parte') || ' aceitou e segurou a caução. Fecha o aperto de mão.',
        new.aceite_em + interval '48 hours', true);

    elsif new.estado = 'selado' then
      -- A selou → aperto de mão fechado; avisa B que o projeto arrancou.
      perform public.criar_aviso(
        new.para_perfil, 'selado', new.id,
        'Aperto de mão selado',
        'O projeto arrancou. Mostra evolução antes do prazo para libertar a caução.',
        new.selado_em + interval '6 days', false);

    elsif new.estado = 'honrado' then
      perform public.criar_aviso(new.de_perfil, 'honrado', new.id,
        'Aperto de mão honrado',
        'Caução libertada — nada foi cobrado. Já se podem avaliar.', null, false);
      perform public.criar_aviso(new.para_perfil, 'honrado', new.id,
        'Aperto de mão honrado',
        'Caução libertada — nada foi cobrado. Já se podem avaliar.', null, false);

    elsif new.estado = 'incumprido' then
      -- Mensagem depende de quem falhou (A=de_perfil, B=para_perfil).
      perform public.criar_aviso(new.de_perfil, 'incumprido', new.id,
        case when new.quem_falhou in ('a','ambos') then 'Não compareceste a tempo'
             else 'A outra parte não compareceu' end,
        case when new.quem_falhou in ('a','ambos') then 'A caução de 2€ foi cobrada e o negócio ficou marcado.'
             else 'A tua caução foi libertada.' end, null, false);
      perform public.criar_aviso(new.para_perfil, 'incumprido', new.id,
        case when new.quem_falhou in ('b','ambos') then 'Não compareceste a tempo'
             else 'A outra parte não compareceu' end,
        case when new.quem_falhou in ('b','ambos') then 'A caução de 2€ foi cobrada e o negócio ficou marcado.'
             else 'A tua caução foi libertada.' end, null, false);

    elsif new.estado = 'cancelado' then
      perform public.criar_aviso(new.de_perfil, 'cancelado', new.id,
        'Cancelado de comum acordo', 'Os holds foram libertados. Sem marca.', null, false);
      perform public.criar_aviso(new.para_perfil, 'cancelado', new.id,
        'Cancelado de comum acordo', 'Os holds foram libertados. Sem marca.', null, false);

    elsif new.estado = 'expirado' then
      perform public.criar_aviso(new.de_perfil, 'expirado', new.id,
        'Aperto de mão não fechado a tempo', 'O selo não foi dado dentro do prazo.', null, false);
      perform public.criar_aviso(new.para_perfil, 'expirado', new.id,
        'Aperto de mão não fechado a tempo', 'O selo não foi dado a tempo. A tua caução foi libertada.', null, false);

    elsif new.estado = 'recusado' then
      perform public.criar_aviso(new.de_perfil, 'recusado', new.id,
        'Pedido recusado', coalesce(nome_b, 'A outra parte') || ' recusou o pedido.', null, false);
    end if;

    return new;
  end if;

  -- ===== CHECKPOINT / CANCELAMENTO (sem mudar de estado, ainda 'selado') =====
  prazo_check := new.selado_em + interval '6 days';

  -- B apresentou evolução → avisa A para confirmar.
  if new.b_agiu_em is distinct from old.b_agiu_em and new.b_agiu_em is not null then
    perform public.criar_aviso(new.de_perfil, 'apresentou', new.id,
      'Evolução apresentada',
      coalesce(nome_b, 'A outra parte') || ' mostrou evolução. Confirma para libertarem a caução.',
      prazo_check, true);
  end if;

  -- A confirmou → avisa B que falta a sua parte.
  if new.a_agiu_em is distinct from old.a_agiu_em and new.a_agiu_em is not null then
    perform public.criar_aviso(new.para_perfil, 'confirmou', new.id,
      'Confirmação recebida',
      coalesce(nome_a, 'A outra parte') || ' confirmou. Falta a tua parte no checkpoint.',
      prazo_check, true);
  end if;

  -- Alguém pediu cancelamento → avisa a OUTRA parte.
  if new.cancel_por is distinct from old.cancel_por and new.cancel_por is not null then
    perform public.criar_aviso(
      case when new.cancel_por = new.de_perfil then new.para_perfil else new.de_perfil end,
      'cancel_pedido', new.id,
      'Pedido de cancelamento',
      'A outra parte quer cancelar de comum acordo. Confirma se concordas.', prazo_check, true);
  end if;

  return new;
end;
$$;

drop trigger if exists after_orcamento_notifica on public.orcamentos;
create trigger after_orcamento_notifica
  after insert or update on public.orcamentos
  for each row execute function public.notificar_ciclo();
