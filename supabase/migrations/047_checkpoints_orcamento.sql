-- ============================================================
-- HONRA — Migração 047: CHECKPOINTS DO ORÇAMENTO (fatia D — marca por inação)
-- ------------------------------------------------------------
-- FUGA D (docs/RED-TEAM-FUGAS.md §3 D): no checkpoint interno a marca caía por
-- INAÇÃO. O prestador tocava "apresentei evolução" (ficheiro OPCIONAL, 007) e o
-- cliente honesto, que não confirmava por nada ter recebido, levava a marca. O
-- sistema julgava TOQUES, não SUBSTÂNCIA.
--
-- Esta migração reconstrói o checkpoint interno com o MOLDE da fatia E (E =
-- convite; declarar→avisar→janela→contestar→revisão) mas SEM dinheiro (decisão
-- 15/07, migração 032: a reputação É a caução; NÃO se reintroduzem holds).
--
-- 5 DECISÕES TRANCADAS (Vítor):
--   1. EVIDÊNCIA OBRIGATÓRIA — "apresentei evolução" (o prestador = para_perfil)
--      só conta com SUBSTÂNCIA anexada (ficheiro/foto/texto). Toque vazio = não
--      agiu. (Corrige o ficheiro-opcional da 007.)
--   2. CONTESTAÇÃO SUSPENDE A MARCA — quem RECEBE (de_perfil) ganha 3ª opção:
--      confirmar / contestar / silêncio. Contestar → NÃO marca ninguém; vai a
--      REVISÃO admin (ónus da prova em quem apresentou). Espelha convite-disputa,
--      SEM cobrança.
--   3. SILÊNCIO AVISADO = MARCA — prestador apresentou COM substância + recetor
--      avisado (in-app) + relembrado (véspera) + silêncio até ao prazo → a marca
--      cai no PASSIVO (o recetor), mas informada, nunca emboscada.
--   4. ANCORAGEM AO PRAZO DO PROJETO — o checkpoint corre ao prazo combinado
--      (orcamentos.prazo / checkpoints_orcamento.prazo), não a um relógio cego
--      de ~6 dias, com um MÍNIMO DE SEGURANÇA (nunca marca antes de selado+24h).
--   5. CHECKPOINTS MÚLTIPLOS — o contratante (de_perfil) define quantos quiser NA
--      PROPOSTA, VISÍVEIS ao contratado ANTES do selo, TRANCADOS após o selo
--      (parafuso crítico: pós-selo o contratante NUNCA acrescenta/move — senão é
--      armadilha de marca). Cada checkpoint corre a MESMA máquina.
--
-- MODELAÇÃO (documentada no relatório): tabela nova `checkpoints_orcamento`,
-- sub-unidades do orçamento. O orçamento MANTÉM a sua máquina de estados
-- (selado→honrado|incumprido) intacta — o desfecho do orçamento é a AGREGAÇÃO
-- dos checkpoints (todos confirmados → honrado; algum incumprido → incumprido +
-- quem_falhou). Contadores 016/033 disparam no estado do ORÇAMENTO, exatamente
-- como hoje. Um checkpoint contestado deixa o orçamento em 'selado' (em curso)
-- enquanto a revisão admin decide — sem estado novo no orçamento, §5 intacta.
--
-- Aditiva. Correr DEPOIS da 046.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) PRAZO DO PROJETO no orçamento (decisão 4). Antes não existia; agora o
--    combinado tem casa. É a âncora por omissão dos checkpoints sem prazo próprio.
-- ----------------------------------------------------------------
alter table public.orcamentos
  add column if not exists prazo date;

-- ----------------------------------------------------------------
-- 2) TABELA checkpoints_orcamento — os checkpoints definidos na proposta.
-- ----------------------------------------------------------------
create table if not exists public.checkpoints_orcamento (
  id             uuid primary key default gen_random_uuid(),
  orcamento_id   uuid not null references public.orcamentos(id) on delete cascade,
  ordem          int  not null,
  descricao      text not null,
  prazo          date,                          -- ancoragem (decisão 4); null → usa orcamentos.prazo
  estado         text not null default 'pendente'
                 check (estado in (
                   'pendente',    -- à espera que o PRESTADOR apresente evidência
                   'entregue',    -- prestador apresentou COM substância; à espera do RECETOR
                   'confirmado',  -- recetor confirmou → sem marca
                   'contestado',  -- recetor contestou → REVISÃO admin (ninguém marcado)
                   'incumprido'   -- falha marcada (prestador não apresentou OU recetor em silêncio avisado)
                 )),
  evidencia_ficheiro text,                       -- caminho no bucket 'evolucoes' (reutiliza 007)
  evidencia_texto    text,                       -- substância textual (alternativa/complemento)
  apresentado_em     timestamptz,
  confirmado_em      timestamptz,
  contestado_em      timestamptz,
  contestacao_texto  text,
  aviso_entregue     boolean not null default false, -- recibo do aviso ao recetor (decisão 3)
  relembrado_em      timestamptz,                    -- lembrete de véspera enviado (decisão 3)
  quem_falhou        text check (quem_falhou in ('prestador','recetor')),
  resolvido_em       timestamptz,
  criado_em          timestamptz not null default now(),
  unique (orcamento_id, ordem)
);

create index if not exists checkpoints_orcamento_orc_idx
  on public.checkpoints_orcamento (orcamento_id);
create index if not exists checkpoints_orcamento_estado_idx
  on public.checkpoints_orcamento (estado);

alter table public.checkpoints_orcamento enable row level security;

-- ----------------------------------------------------------------
-- 3) RLS — as duas partes leem; SÓ o contratante (de_perfil) escreve, e SÓ
--    antes do selo (o guarda da secção 4 remata a imutabilidade pós-selo).
-- ----------------------------------------------------------------
drop policy if exists "checkpoints_leem_partes" on public.checkpoints_orcamento;
create policy "checkpoints_leem_partes" on public.checkpoints_orcamento
  for select using (
    exists (
      select 1 from public.orcamentos o
      where o.id = checkpoints_orcamento.orcamento_id
        and (o.de_perfil = auth.uid() or o.para_perfil = auth.uid())
    )
  );

drop policy if exists "checkpoints_contratante_define" on public.checkpoints_orcamento;
create policy "checkpoints_contratante_define" on public.checkpoints_orcamento
  for insert with check (
    exists (
      select 1 from public.orcamentos o
      where o.id = checkpoints_orcamento.orcamento_id
        and o.de_perfil = auth.uid()
        and o.estado in ('pedido','aceite')   -- só ANTES do selo (decisão 5)
    )
    and estado = 'pendente'
  );

drop policy if exists "checkpoints_contratante_edita" on public.checkpoints_orcamento;
create policy "checkpoints_contratante_edita" on public.checkpoints_orcamento
  for update using (
    exists (
      select 1 from public.orcamentos o
      where o.id = checkpoints_orcamento.orcamento_id
        and o.de_perfil = auth.uid()
        and o.estado in ('pedido','aceite')
    )
  );

drop policy if exists "checkpoints_contratante_apaga" on public.checkpoints_orcamento;
create policy "checkpoints_contratante_apaga" on public.checkpoints_orcamento
  for delete using (
    exists (
      select 1 from public.orcamentos o
      where o.id = checkpoints_orcamento.orcamento_id
        and o.de_perfil = auth.uid()
        and o.estado in ('pedido','aceite')
    )
  );

-- ----------------------------------------------------------------
-- 4) GUARDA — a espinha do parafuso da decisão 5: pós-selo, TRANCADO.
--    · O servidor (service_role / auth.uid() nulo) faz tudo (apresentar
--      evidência, confirmar, contestar, marcar) — corre pelas Edge Functions.
--    · O cliente (contratante) só mexe ANTES do selo, e NUNCA nas colunas de
--      máquina (estado / evidência / marca / carimbos) — essas são do servidor.
-- ----------------------------------------------------------------
create or replace function public.guarda_checkpoints()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  est_orc text;
  dono uuid;
  -- Num BEFORE DELETE, devolver NEW (=NULL) CANCELA a remoção. Tem de ser OLD.
  ret record := case when tg_op = 'DELETE' then old else new end;
begin
  -- Servidor faz tudo (reconhecido como na guarda_ciclo_caucao da 010). Aqui
  -- passam também as remoções em CASCATA (apagar o orçamento apaga os seus
  -- checkpoints) — corridas pelo servidor / sem sessão de utilizador.
  if auth.role() = 'service_role' or auth.uid() is null then
    return ret;
  end if;

  -- Estado + contratante do orçamento-pai (para INSERT usa NEW; senão OLD).
  select o.estado, o.de_perfil into est_orc, dono
    from public.orcamentos o
   where o.id = coalesce(new.orcamento_id, old.orcamento_id);

  -- Só o contratante mexe, e só antes do selo.
  if auth.uid() is distinct from dono then
    raise exception 'Só o contratante define os checkpoints deste projeto.';
  end if;
  if est_orc is distinct from 'pedido' and est_orc is distinct from 'aceite' then
    raise exception 'Checkpoints trancados após o selo — não se acrescentam nem se movem.';
  end if;

  -- Colunas de máquina reservadas ao servidor (o cliente só toca descrição/prazo/ordem).
  if tg_op = 'UPDATE' then
    if new.estado            is distinct from old.estado
       or new.evidencia_ficheiro is distinct from old.evidencia_ficheiro
       or new.evidencia_texto    is distinct from old.evidencia_texto
       or new.apresentado_em     is distinct from old.apresentado_em
       or new.confirmado_em      is distinct from old.confirmado_em
       or new.contestado_em      is distinct from old.contestado_em
       or new.contestacao_texto  is distinct from old.contestacao_texto
       or new.aviso_entregue     is distinct from old.aviso_entregue
       or new.relembrado_em      is distinct from old.relembrado_em
       or new.quem_falhou        is distinct from old.quem_falhou
       or new.resolvido_em       is distinct from old.resolvido_em then
      raise exception 'Coluna de máquina do checkpoint reservada ao servidor.';
    end if;
  end if;

  return ret;
end;
$$;

drop trigger if exists before_checkpoint_guarda on public.checkpoints_orcamento;
create trigger before_checkpoint_guarda
  before insert or update or delete on public.checkpoints_orcamento
  for each row execute function public.guarda_checkpoints();

-- ----------------------------------------------------------------
-- 5) AGREGAÇÃO — o desfecho do ORÇAMENTO a partir dos seus checkpoints.
--    Chamada pelo servidor (Edge Functions, service_role) após cada resolução
--    de checkpoint. Mantém a máquina do orçamento e os contadores 016/033.
--      · algum 'incumprido' → orçamento 'incumprido' + quem_falhou:
--          prestador (para_perfil=B) → 'b'; recetor (de_perfil=A) → 'a';
--          os dois lados falharam em checkpoints diferentes → 'ambos'.
--      · todos 'confirmado'  → orçamento 'honrado'.
--      · caso contrário (ainda há pendentes/entregues/contestados) → fica 'selado'.
-- ----------------------------------------------------------------
create or replace function public.avaliar_checkpoints_orcamento(p_orc uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  o record;
  n_total int;
  n_confirmados int;
  n_falha_prestador int;
  n_falha_recetor int;
  novo_estado text;
  qf text;
begin
  select id, estado, de_perfil, para_perfil into o
    from public.orcamentos where id = p_orc;
  if not found or o.estado <> 'selado' then
    return coalesce(o.estado, 'sem_orcamento');
  end if;

  select count(*),
         count(*) filter (where estado = 'confirmado'),
         count(*) filter (where estado = 'incumprido' and quem_falhou = 'prestador'),
         count(*) filter (where estado = 'incumprido' and quem_falhou = 'recetor')
    into n_total, n_confirmados, n_falha_prestador, n_falha_recetor
    from public.checkpoints_orcamento where orcamento_id = p_orc;

  if n_total = 0 then
    return 'selado';  -- orçamento legado sem checkpoints → segue o caminho antigo
  end if;

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
  elsif n_confirmados = n_total then
    update public.orcamentos
       set estado = 'honrado'
     where id = p_orc and estado = 'selado';
    return 'honrado';
  end if;

  return 'selado';
end;
$$;

-- ----------------------------------------------------------------
-- 6) NOTA sobre os avisos: o checkpoint interno usa o SINO (avisos in-app,
--    tabela notificacoes) — as duas partes têm conta, o aviso "entrega-se"
--    sempre (linha na BD + realtime), ao contrário do convite (Bird parqueado).
--    Os avisos por checkpoint são criados pelas Edge Functions via criar_aviso
--    (não por trigger, para poderem carregar o texto certo por checkpoint).
-- ----------------------------------------------------------------
