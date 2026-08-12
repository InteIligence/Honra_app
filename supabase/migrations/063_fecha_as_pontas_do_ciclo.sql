-- ============================================================
-- HONRA — Migração 063: FECHA AS PONTAS DO CICLO
-- ------------------------------------------------------------
-- A vistoria 360° (docs/VISTORIA-360-27-07.md) mostrou que a ESPINHA do ciclo
-- é sólida mas as PONTAS não fecham. Esta migração fecha-as, de uma vez, na BD
-- (a app trava, a BD trava na mesma). Cinco achados, um subsistema:
--
--  #1  [RECONCILIADO 27/07 — VER §2] A minha correção tornava `honrado` o fim e
--      abria a avaliação aí. Em paralelo, a 065_pagamento_na_entrega fez do tail
--      honrado→entregue→concluido o FLUXO DE ENTREGA COM PAGAMENTO (o profissional
--      só recebe ao entregar → deixa de compensar prender a crítica). Por decisão
--      do Vítor, fica o pagamento-na-entrega; o meu #1 foi desfeito (o bloco da
--      política saiu do §2). Os #3/#4/#12/#13 abaixo mantêm-se (independentes).
--
--  #4  A agregação declarava `incumprido` à PRIMEIRA falha, com checkpoints por
--      resolver → a culpa `'ambos'` saía por coincidência de calendário e uma
--      contestação pendente era atropelada.
--      → só se declara o desfecho quando NENHUM checkpoint está por resolver
--        (pendente/entregue/contestado); as culpas somam-se todas de uma vez.
--
--  #3  Um checkpoint `contestado` não tinha resolução automática → sem admin,
--      o negócio congelava para sempre.
--      → novo estado terminal-neutro `arquivado`; o resolver arquiva a
--        contestação sem decisão do admin ao fim de um prazo (SEM marca — a
--        régua do Honra: nunca se pune sem prova). A parte do resolver vive na
--        Edge Function; aqui abre-se o estado e ensina-se a agregação a lê-lo.
--
--  #12 Selar sem prazo criava um relógio OCULTO de 6 dias (o resolver inventava
--      `selado + 6d`), que o profissional nunca viu → emboscada.
--      → ao selar, se o negócio não tem prazo, grava-se um prazo VISÍVEL
--        (selado + 7 dias) na própria linha. Nada de relógios escondidos.
--
--  #13 O checkpoint por omissão era criado "best-effort" na Edge Function, FORA
--      da transação do selo → se o insert falhasse, o negócio ficava `selado`
--      com 0 checkpoints e caía no motor LEGADO.
--      → um trigger no servidor garante ≥1 checkpoint ao entrar em `selado`,
--        na MESMA transação. A Edge Function deixa de o fazer (063 na função).
--
-- DECISÃO DE PRODUTO EXPOSTA (Vítor decide, mas fica coerente por defeito):
--   · Contestação sem decisão do admin → arquiva NEUTRO (sem marca). Alternativa
--     seria marcar o prestador (ónus da prova). Escolhi o neutro (não punir sem
--     prova); trocar é mudar um estado no resolver + a agregação abaixo.
--
-- Aditiva. Correr DEPOIS da 062.
-- ============================================================

-- ------------------------------------------------------------
-- 1) NOVO ESTADO terminal-neutro do checkpoint: 'arquivado' (#3).
--    Contestação que o Honra não julgou a tempo → fecha sem marca.
-- ------------------------------------------------------------
alter table public.checkpoints_orcamento drop constraint if exists checkpoints_orcamento_estado_check;
alter table public.checkpoints_orcamento add constraint checkpoints_orcamento_estado_check
  check (estado in (
    'pendente',    -- à espera que o PRESTADOR apresente evidência
    'entregue',    -- prestador apresentou COM substância; à espera do RECETOR
    'confirmado',  -- recetor confirmou → sem marca
    'contestado',  -- recetor contestou → REVISÃO admin (ninguém marcado)
    'incumprido',  -- falha marcada (prestador não apresentou OU recetor em silêncio avisado)
    'arquivado'    -- contestação sem decisão do admin a tempo → fecha NEUTRO, sem marca (063)
  ));

-- ------------------------------------------------------------
-- 2) AVALIAÇÃO — RECONCILIADO 27/07: esta migração ABRIA a avaliação em
--    `honrado` (a minha #1: honrado = fim). Em paralelo, a 065_pagamento_na_entrega
--    construiu o fluxo de ENTREGA COM PAGAMENTO entre honrado e concluido — a
--    avaliação passa a abrir no FIM (`concluido`), a par da política dela. Por
--    decisão do Vítor (fica o pagamento-na-entrega), este bloco foi REMOVIDO
--    daqui para NÃO atropelar a política da 065. A política canónica de
--    `avaliacoes_insere_com_prova` vive na 065 (concluido/confirmado_ambos/
--    devolvido). Ver docs/VISTORIA-360-RESOLUCAO.md.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3) AGREGAÇÃO DETERMINÍSTICA (#4). O desfecho do orçamento só se declara
--    quando NENHUM checkpoint está por resolver (pendente/entregue/contestado).
--    Aí somam-se TODAS as culpas de uma vez → `'ambos'` deixa de depender do
--    calendário e uma contestação por decidir nunca é atropelada.
--    `arquivado` (063) é terminal-neutro: não é falha nem confirmação.
-- ------------------------------------------------------------
create or replace function public.avaliar_checkpoints_orcamento(p_orc uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  o record;
  n_total int;
  n_por_resolver int;
  n_falha_prestador int;
  n_falha_recetor int;
  n_confirmados int;
  qf text;
begin
  select id, estado, de_perfil, para_perfil into o
    from public.orcamentos where id = p_orc;
  if not found or o.estado <> 'selado' then
    return coalesce(o.estado, 'sem_orcamento');
  end if;

  select count(*),
         count(*) filter (where estado in ('pendente', 'entregue', 'contestado')),
         count(*) filter (where estado = 'incumprido' and quem_falhou = 'prestador'),
         count(*) filter (where estado = 'incumprido' and quem_falhou = 'recetor'),
         count(*) filter (where estado = 'confirmado')
    into n_total, n_por_resolver, n_falha_prestador, n_falha_recetor, n_confirmados
    from public.checkpoints_orcamento where orcamento_id = p_orc;

  if n_total = 0 then
    return 'selado';  -- orçamento legado sem checkpoints → segue o caminho antigo
  end if;

  -- Ainda há checkpoints por resolver → NÃO se declara nada (fim de #4: espera
  -- por todos antes de atribuir culpa; a contestação por decidir não é atropelada).
  if n_por_resolver > 0 then
    return 'selado';
  end if;

  -- Todos resolvidos. Se houve QUALQUER falha, soma-se a culpa de uma vez.
  if n_falha_prestador > 0 or n_falha_recetor > 0 then
    qf := case
            when n_falha_prestador > 0 and n_falha_recetor > 0 then 'ambos'
            when n_falha_prestador > 0 then 'b'   -- prestador = para_perfil = B
            else 'a'                              -- recetor  = de_perfil  = A
          end;
    update public.orcamentos
       set estado = 'incumprido', quem_falhou = qf
     where id = p_orc and estado = 'selado';
    return 'incumprido';
  end if;

  -- Sem falhas: se houve pelo menos um confirmado, o negócio é HONRADO.
  -- (Só arquivados, sem nenhum confirmado, também fecha honrado — neutro, sem
  --  marca: o Honra não julgou, ninguém é punido nem premiado com falha.)
  update public.orcamentos
     set estado = 'honrado'
   where id = p_orc and estado = 'selado';
  return 'honrado';
end;
$$;

-- ------------------------------------------------------------
-- 4) AO SELAR: prazo VISÍVEL (#12) + checkpoint garantido na transação (#13).
--    4a) BEFORE UPDATE: se o negócio sela sem prazo, grava-se um prazo REAL
--        (selado + 7 dias) na própria linha — nunca um relógio escondido.
-- ------------------------------------------------------------
create or replace function public.prazo_visivel_ao_selar()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.estado = 'selado' and old.estado is distinct from 'selado' and new.prazo is null then
    new.prazo := (coalesce(new.selado_em, now())::date + 7);
  end if;
  return new;
end;
$$;

drop trigger if exists before_orcamento_prazo_visivel on public.orcamentos;
create trigger before_orcamento_prazo_visivel
  before update on public.orcamentos
  for each row execute function public.prazo_visivel_ao_selar();

-- 4b) AFTER UPDATE: garantir ≥1 checkpoint ao entrar em `selado`, na MESMA
--     transação do selo. Substitui o insert best-effort da Edge Function (#13).
--     O default herda o prazo do negócio (agora sempre preenchido por 4a).
create or replace function public.garantir_checkpoint_ao_selar()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.estado = 'selado' and old.estado is distinct from 'selado' then
    if not exists (
      select 1 from public.checkpoints_orcamento where orcamento_id = new.id
    ) then
      insert into public.checkpoints_orcamento (orcamento_id, ordem, descricao, prazo, estado)
      values (new.id, 1, 'Entrega do trabalho', new.prazo, 'pendente');
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists after_orcamento_garante_checkpoint on public.orcamentos;
create trigger after_orcamento_garante_checkpoint
  after update on public.orcamentos
  for each row execute function public.garantir_checkpoint_ao_selar();

-- ------------------------------------------------------------
-- NOTA de aplicação: como as 060/061/062, esta corre no SQL Editor. Depois de
-- aplicada, o script docs/verificar-estado-vivo.sql (063 UX/infra) deve mostrar
-- o novo trigger e a policy alargada — parte do guardrail de drift (#2).
-- ------------------------------------------------------------
