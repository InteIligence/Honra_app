-- ============================================================
-- HONRA — Migração 058: o ANÚNCIO SEGUE O APERTO (o mural não se arruma à mão)
-- ------------------------------------------------------------
-- Decisão do Vítor (26/07/2026): "quando escolho um candidato e o aperto de
-- mão é mútuo, o anúncio entra em modo A DECORRER — não tenho de o fechar.
-- Fechar é só quando ninguém aparece ou se desiste da proposta."
--
-- PORQUÊ (a régua da casa): o estado do anúncio é um FACTO, não uma tarefa. O
-- facto já aconteceu na máquina de estados — os dois deram a palavra ('selado').
-- Obrigar o autor a ir arrumar o mural depois disso é pedir-lhe que repita à
-- mão o que o Honra já sabe; e quando ele se esquece (esquece sempre), o mural
-- mente: mostra vagas que já têm dono. Um mural que mente vale zero.
--
-- O BURACO QUE ISTO TAPA: hoje `abrirOrcamento` cria o orçamento SEM guardar
-- de que anúncio veio. Sem esse fio, nada podia seguir nada. Passa a haver fio.
--
-- MÁQUINA DE ESTADOS NOVA DO ANÚNCIO (era só aberto|fechado):
--   aberto      → publicado, a receber candidaturas.
--   a_decorrer  → alguém selou o aperto; sai do mural, ninguém mais se candidata.
--   concluido   → o negócio chegou a bom porto (honrado e afins).
--   fechado     → o AUTOR arrumou-o à mão. Só isto continua a ser botão.
--
-- E SE O NEGÓCIO PARTIR (cancelado/incumprido/expirado)? O anúncio VOLTA a
-- 'aberto' e o autor é avisado. Razão: o trabalho continua por fazer — deixá-lo
-- preso em 'a_decorrer' era o mural a mentir ao contrário (esconder uma vaga
-- livre). Se já não o quiser, tem o botão Fechar, que é exatamente o caso que
-- o Vítor descreveu ("ninguém compareceu / desisti").
--
-- OS OUTROS CANDIDATOS: quando um sela, os restantes são avisados de que a
-- vaga foi entregue. Ficar à espera de uma resposta que nunca vem é a falta de
-- educação das plataformas de emprego — no Honra não entra.
--
-- Aditiva. Correr no SQL Editor DEPOIS da 057.
-- ============================================================

-- ------------------------------------------------------------
-- 1) O FIO: o orçamento sabe de que anúncio nasceu.
-- ------------------------------------------------------------
alter table public.orcamentos
  add column if not exists trabalho_id uuid references public.trabalhos(id) on delete set null;

create index if not exists orcamentos_trabalho_idx on public.orcamentos (trabalho_id);

comment on column public.orcamentos.trabalho_id is
  'Anúncio do mural que deu origem a este orçamento (null = negócio nascido fora do mural).';

-- E o anúncio guarda QUAL o aperto que o ocupou (o vencedor, não os candidatos).
alter table public.trabalhos
  add column if not exists orcamento_selado uuid references public.orcamentos(id) on delete set null;

comment on column public.trabalhos.orcamento_selado is
  'Orçamento que selou este anúncio — o que o pôs a decorrer.';

-- ------------------------------------------------------------
-- 2) Estados novos do anúncio.
-- ------------------------------------------------------------
alter table public.trabalhos drop constraint if exists trabalhos_estado_check;
alter table public.trabalhos add constraint trabalhos_estado_check
  check (estado in ('aberto', 'a_decorrer', 'concluido', 'fechado'));

-- ------------------------------------------------------------
-- 3) Os avisos precisam de saber apontar para um ANÚNCIO (até hoje só sabiam
--    apontar para orçamentos). Sem isto, o aviso ao candidato preterido era
--    um beco: lia-se e não levava a lado nenhum.
-- ------------------------------------------------------------
alter table public.notificacoes
  add column if not exists trabalho_id uuid references public.trabalhos(id) on delete cascade;

-- ------------------------------------------------------------
-- 4) O SINCRONIZADOR — um trigger só, na transição do orçamento.
-- ------------------------------------------------------------
create or replace function public.sincronizar_anuncio()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  tit text;
begin
  -- Negócio sem anúncio por trás (o caso comum: convite direto) — nada a fazer.
  if new.trabalho_id is null then
    return null;
  end if;
  if new.estado is not distinct from old.estado then
    return null;
  end if;

  select titulo into tit from public.trabalhos where id = new.trabalho_id;

  -- SELADO: os dois deram a palavra → o anúncio entra em curso.
  -- A condição `estado = 'aberto'` é a guarda contra o segundo selo: se dois
  -- candidatos chegassem a selar, o primeiro é que fica com o anúncio.
  if new.estado = 'selado' then
    update public.trabalhos
       set estado = 'a_decorrer', orcamento_selado = new.id
     where id = new.trabalho_id
       and estado = 'aberto';

    -- Os preteridos ficam a saber. Uma vez, sem drama, e com porta para o mural.
    if found then
      insert into public.notificacoes (perfil_id, tipo, trabalho_id, titulo, corpo)
      select c.candidato_perfil,
             'trabalho_ocupado',
             new.trabalho_id,
             'A vaga já tem quem a faça',
             coalesce(tit, 'O trabalho') || ' foi entregue a outra pessoa. Obrigado por te teres apresentado — há mais no mural.'
        from public.candidaturas c
       where c.trabalho_id = new.trabalho_id
         and c.candidato_perfil <> new.para_perfil;
    end if;
    return null;
  end if;

  -- Só o aperto que OCUPOU o anúncio manda nele daqui para a frente.
  if not exists (
    select 1 from public.trabalhos
     where id = new.trabalho_id and orcamento_selado = new.id
  ) then
    return null;
  end if;

  -- CHEGOU A BOM PORTO: o anúncio cumpriu-se.
  if new.estado in ('honrado', 'entregue', 'concluido', 'confirmado_ambos', 'devolvido') then
    update public.trabalhos set estado = 'concluido' where id = new.trabalho_id;
    return null;
  end if;

  -- PARTIU: o trabalho continua por fazer → volta ao mural, e o autor sabe-o.
  if new.estado in ('cancelado', 'incumprido', 'expirado', 'recusado') then
    update public.trabalhos
       set estado = 'aberto', orcamento_selado = null
     where id = new.trabalho_id;

    insert into public.notificacoes (perfil_id, tipo, trabalho_id, titulo, corpo)
    select t.autor_perfil,
           'trabalho_reaberto',
           t.id,
           'O teu anúncio voltou ao mural',
           coalesce(tit, 'O trabalho') || ' está outra vez a receber candidaturas, porque o aperto não foi por diante. Se já não precisas, podes fechá-lo.'
      from public.trabalhos t
     where t.id = new.trabalho_id;
  end if;

  return null;
end;
$$;

drop trigger if exists after_orcamento_anuncio on public.orcamentos;
create trigger after_orcamento_anuncio
  after update of estado on public.orcamentos
  for each row execute function public.sincronizar_anuncio();

-- ------------------------------------------------------------
-- 5) O botão Fechar deixa de ser a única saída, mas continua a ser DO AUTOR:
--    a política de update de `trabalhos` (011) já é só do autor, e este
--    trigger corre security definer — passa-lhe ao lado, como deve ser.
-- ------------------------------------------------------------
