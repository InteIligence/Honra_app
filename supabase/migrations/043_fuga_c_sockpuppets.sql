-- ============================================================
-- HONRA — Migração 043: FUGA C BLINDADA — farm de reputação com sockpuppets
-- ------------------------------------------------------------
-- Red-team 18/07 (docs/RED-TEAM-FUGAS.md §C): 1 identidade verificada + N
-- contas descartáveis fabricavam negócios honrados, acendiam o selo
-- "profissão por trabalho" e enchiam o perfil de 5★ — porque só quem ACEITA
-- precisava de identidade. A partir daqui, TODOS os gestos que criam
-- reputação exigem identidade verificada: PEDIR, ACEITAR (já desde a 004),
-- SELAR e AVALIAR. E o selo "por trabalho" só acende com ≥2 CONTRAPARTES
-- DISTINTAS, cada uma com identidade verificada — 2 negócios com a mesma
-- conta (ou com contas sem rosto) deixam de provar um ofício.
--
-- Cada sockpuppet passa a custar uma identidade REAL verificada — e a dedup
-- por documento (fuga A/B, com o advogado) remata a economia do ataque.
--
-- O que muda (tudo imposto na BD — o cliente é contornável):
--   1) `orc_pede`: criar um pedido exige identidade verificada de quem pede.
--      (Recupera também o `estado='pedido'` da 010 — a BD viva tinha uma
--      versão anterior da policy, sem ele.)
--   2) `guarda_aceita_verificado` passa a guardar também o SELAR:
--      aceite→selado exige identidade verificada de quem sela (de_perfil).
--      Como na 004, aplica-se a TODOS os updates, incluindo service_role.
--   3) `avaliacoes_insere_com_prova`: além da prova de negócio concluído e do
--      sentido único cliente→profissional (037 — a BD viva tinha ainda a
--      versão bidirecional; fica alinhada com o repo), o AUTOR tem de ter
--      identidade verificada.
--   4) Selo "profissão por trabalho" (029): deixa de contar negócios e passa
--      a contar CONTRAPARTES DISTINTAS verificadas em negócios honrados
--      (LIMIAR_TRABALHO = 2). Backfill honesto: selos 'trabalho' que não
--      cumprem a regra nova APAGAM-SE (a régua do Honra é nunca inflacionar).
--      Selos por cédula (origem='cedula') não são tocados.
--
-- FORA (de propósito): contrato-convite (fuga E aguarda decisão do Vítor);
-- velocity/graph limits e ponderação do índice (fase 2).
-- Correr no SQL Editor DEPOIS da 042.
-- ============================================================

-- ----------------------------------------------------------------
-- 0) HELPER — identidade_verificada(perfil). Uma pergunta, um sítio.
--    security definer: utilizável em policies/guardas sem depender do RLS
--    de `verificacoes`.
-- ----------------------------------------------------------------
create or replace function public.identidade_verificada(p_perfil uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.verificacoes v
    where v.perfil_id = p_perfil
      and v.aba = 'identidade'
      and v.estado = 'verificado'
  );
$$;

-- ----------------------------------------------------------------
-- 1) PEDIR exige identidade verificada (+ nascer em 'pedido', da 010).
--    Sem isto, a conta descartável A do ataque criava o pedido que o
--    beneficiário B aceitava — o ciclo inteiro arrancava sem custo.
-- ----------------------------------------------------------------
drop policy if exists "orc_pede" on public.orcamentos;
create policy "orc_pede" on public.orcamentos
  for insert with check (
    auth.uid() = de_perfil
    and estado = 'pedido'
    and public.identidade_verificada(auth.uid())
  );

-- ----------------------------------------------------------------
-- 2) SELAR exige identidade verificada (a guarda da 004, estendida).
--    O mesmo trigger `before_orcamento_aceita` executa esta função; agora
--    guarda os dois gestos do aperto de mão:
--      · pedido→aceite : quem aceita (para_perfil) verificado (004)
--      · aceite→selado : quem sela (de_perfil) verificado (novo)
-- ----------------------------------------------------------------
create or replace function public.guarda_aceita_verificado()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.estado = 'aceite' and old.estado is distinct from 'aceite' then
    if not public.identidade_verificada(new.para_perfil) then
      raise exception 'Precisas de verificar a identidade para aceitar orçamentos.';
    end if;
  end if;
  if new.estado = 'selado' and old.estado is distinct from 'selado' then
    if not public.identidade_verificada(new.de_perfil) then
      raise exception 'Precisas de verificar a identidade para selar o aperto de mão.';
    end if;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------
-- 3) AVALIAR exige identidade verificada (+ alinhar com a 037).
--    Sentido único cliente→profissional; só negócios concluídos; e agora o
--    autor tem rosto — uma conta descartável não fabrica 5★.
-- ----------------------------------------------------------------
drop policy if exists "avaliacoes_insere_com_prova" on public.avaliacoes;
create policy "avaliacoes_insere_com_prova" on public.avaliacoes
  for insert with check (
    auth.uid() = de_perfil
    and public.identidade_verificada(auth.uid())
    and exists (
      select 1
      from public.orcamentos o
      where o.id = avaliacoes.orcamento_id
        and o.estado in ('concluido', 'confirmado_ambos', 'devolvido')
        -- UM SÓ SENTIDO (037): o autor é o CLIENTE, o avaliado é o PROFISSIONAL.
        and o.de_perfil   = auth.uid()
        and o.para_perfil = avaliacoes.para_perfil
    )
  );

-- ----------------------------------------------------------------
-- 4) SELO "PROFISSÃO POR TRABALHO" — contrapartes distintas e verificadas.
--    A prova de um ofício são pessoas REAIS e DIFERENTES que o viram cumprir:
--    ≥2 contrapartes distintas, cada uma com identidade verificada, em
--    negócios da família honrada. 2 negócios com a mesma contraparte (ou com
--    contas sem identidade) já não acendem nada.
-- ----------------------------------------------------------------

-- 4a) A contagem: com quantas contrapartes DISTINTAS e VERIFICADAS é que
--     este perfil honrou negócios?
create or replace function public.contrapartes_honradas_verificadas(p_perfil uuid)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select count(*)::int
  from (
    select distinct
      case when o.de_perfil = p_perfil then o.para_perfil else o.de_perfil end
        as contraparte
    from public.orcamentos o
    where (o.de_perfil = p_perfil or o.para_perfil = p_perfil)
      and o.estado in ('honrado', 'entregue', 'concluido', 'confirmado_ambos', 'devolvido')
  ) c
  where public.identidade_verificada(c.contraparte);
$$;

-- 4b) O gesto de acender (idempotente; NUNCA baixa um selo já dado — e
--     respeita uma cédula já aprovada, como na 029).
create or replace function public.acender_selo_profissao_trabalho(p_perfil uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  LIMIAR_TRABALHO constant int := 2;  -- ≥2 contrapartes distintas verificadas
begin
  if public.contrapartes_honradas_verificadas(p_perfil) >= LIMIAR_TRABALHO then
    update public.verificacoes
       set estado = 'verificado',
           origem = coalesce(origem, 'trabalho'),
           verificado_em = coalesce(verificado_em, now())
     where perfil_id = p_perfil
       and aba = 'profissao'
       and estado is distinct from 'verificado';
  end if;
end;
$$;

-- 4c) O trigger da 029, reescrito: dispara na mesma quando os honrados mexem
--     (o trigger `after_perfil_selo_profissao` continua a executá-lo), mas a
--     regra é agora a das contrapartes.
create or replace function public.sincronizar_selo_profissao_trabalho()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.acender_selo_profissao_trabalho(new.id);
  return null;
end;
$$;

-- 4d) NOVO: quando uma identidade acende, as CONTRAPARTES dessa pessoa podem
--     passar a cumprir a regra (o negócio honrou-se antes da verificação).
--     Recalcula-se o selo delas na hora — sem esperar pelo próximo negócio.
--     (O update do selo 'profissao' não reentra aqui: a condição só apanha a
--     aba 'identidade'.)
create or replace function public.selo_trabalho_apos_identidade()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  c record;
begin
  if new.aba = 'identidade' and new.estado = 'verificado'
     and old.estado is distinct from 'verificado' then
    for c in
      select distinct
        case when o.de_perfil = new.perfil_id then o.para_perfil else o.de_perfil end
          as contraparte
      from public.orcamentos o
      where (o.de_perfil = new.perfil_id or o.para_perfil = new.perfil_id)
        and o.estado in ('honrado', 'entregue', 'concluido', 'confirmado_ambos', 'devolvido')
    loop
      perform public.acender_selo_profissao_trabalho(c.contraparte);
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists after_identidade_selo_trabalho on public.verificacoes;
create trigger after_identidade_selo_trabalho
  after update on public.verificacoes
  for each row execute function public.selo_trabalho_apos_identidade();

-- ----------------------------------------------------------------
-- 5) BACKFILL HONESTO — recalcular os selos 'trabalho' existentes à luz da
--    regra nova. A régua do Honra é NUNCA inflacionar: um selo que a regra
--    nova não sustenta apaga-se (volta a 'pendente'). Cédulas intactas.
-- ----------------------------------------------------------------

-- 5a) Apagar selos 'trabalho' que não cumprem (contrapartes < 2).
update public.verificacoes v
   set estado = 'pendente',
       origem = null,
       verificado_em = null
 where v.aba = 'profissao'
   and v.origem = 'trabalho'
   and v.estado = 'verificado'
   and public.contrapartes_honradas_verificadas(v.perfil_id) < 2;

-- 5b) Acender onde a regra nova já é cumprida e a aba ainda não está acesa.
update public.verificacoes v
   set estado = 'verificado',
       origem = coalesce(v.origem, 'trabalho'),
       verificado_em = coalesce(v.verificado_em, now())
 where v.aba = 'profissao'
   and v.estado is distinct from 'verificado'
   and public.contrapartes_honradas_verificadas(v.perfil_id) >= 2;

-- ----------------------------------------------------------------
-- 6) ALINHAMENTO COM O REPO — recalc_indice (achado na prova de 18/07).
--    A BD viva tinha uma versão ANTIGA (pré-010/015) de recalc_indice: sem a
--    flag `honra.sistema` e a contar todas as avaliações (não só reveladas).
--    Consequência: o insert de uma avaliação LEGÍTIMA rebentava na
--    guarda_perfil ("Campos de sistema … não editáveis") e abortava.
--    Recria-se aqui a versão canónica da 015. (Não é a fuga C — é a reposição
--    de uma migração que a BD viva perdeu; sem isto, avaliar não funciona.)
-- ----------------------------------------------------------------
create or replace function public.recalc_indice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('honra.sistema', '1', true);
  update public.perfis
     set indice_confianca = (
       select coalesce(avg(nota), 0)
       from public.avaliacoes
       where para_perfil = new.para_perfil and revelado_em is not null
     )
   where id = new.para_perfil;
  return new;
end; $$;

-- ----------------------------------------------------------------
-- 7) ALINHAMENTO COM O REPO — verif_dono_tudo (achado CRÍTICO na prova).
--    A 010 FIX 1 mandava REMOVER esta policy (o dono podia escrever as suas
--    `verificacoes` → auto-verificar identidade e selos!), mas a BD viva
--    ainda a tinha — o que furava toda a blindagem desta migração: um
--    sockpuppet auto-verificava a identidade com um UPDATE. Só o servidor
--    (webhook/Edge Functions com service_role) escreve verificacoes; a
--    leitura continua pública (o selo é público).
-- ----------------------------------------------------------------
drop policy if exists "verif_dono_tudo" on public.verificacoes;
