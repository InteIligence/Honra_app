-- ============================================================
-- HONRA — Migração 046: SELO "PROFISSÃO POR TRABALHO" — SÓ O LADO CONTRATADO
-- ------------------------------------------------------------
-- Decisão do fundador (18/07): o selo de ofício prova que ALGUÉM foi CONTRATADO
-- e cumpriu — não que contratou. A 043 contava as contrapartes distintas dos
-- DOIS lados de um negócio honrado (quem pede E quem presta), pelo que um
-- CONTRATANTE com 2 profissionais distintos verificados também o acendia. Isso
-- infla: contratar não é ter ofício.
--
-- Regra nova (aperta a 043, mesma estrutura): a aba 'profissao' por trabalho só
-- acende para quem foi CONTRATADO — no marketplace interno, quem ACEITA o
-- orçamento = `para_perfil`. Precisa de:
--   · ≥2 negócios honrados em que o perfil é `para_perfil` (o lado que presta), e
--   · com ≥2 CONTRAPARTES (`de_perfil`, os clientes) DISTINTAS, cada uma com
--     identidade verificada.
-- Negócios em que o perfil é `de_perfil` (foi ELE o cliente) já não contam para
-- o selo dele. Selos por cédula (origem='cedula') continuam intactos.
--
-- Backfill honesto (a régua é NUNCA inflacionar): selos 'trabalho' que a regra
-- nova não sustenta APAGAM-SE; acende-se onde já se cumpre. Documentado no
-- ACORDAR.md quem perdeu/ganhou.
--
-- Tudo idempotente / security-definer. Correr DEPOIS da 045.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) A CONTAGEM — só o lado CONTRATADO (para_perfil), contrapartes distintas
--    e verificadas. Substitui, na prática, o papel de
--    contrapartes_honradas_verificadas (043) para o selo de ofício. A 043 fica
--    intacta (pode ser usada noutro sítio); o selo passa a usar esta.
-- ----------------------------------------------------------------
create or replace function public.contrapartes_como_contratado_verificadas(p_perfil uuid)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select count(*)::int
  from (
    select distinct o.de_perfil as cliente
    from public.orcamentos o
    where o.para_perfil = p_perfil                     -- o perfil foi o CONTRATADO
      and o.estado in ('honrado', 'entregue', 'concluido', 'confirmado_ambos', 'devolvido')
      and public.identidade_verificada(o.de_perfil)    -- a contraparte tem rosto
  ) c;
$$;

-- ----------------------------------------------------------------
-- 2) O gesto de acender — igual à 043, mas agora conta SÓ o lado contratado.
--    Idempotente; NUNCA baixa um selo já dado; respeita uma cédula já aprovada.
-- ----------------------------------------------------------------
create or replace function public.acender_selo_profissao_trabalho(p_perfil uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  LIMIAR_TRABALHO constant int := 2;  -- ≥2 clientes distintos verificados
begin
  if public.contrapartes_como_contratado_verificadas(p_perfil) >= LIMIAR_TRABALHO then
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

-- ----------------------------------------------------------------
-- 3) Quando uma identidade acende, recalcular quem a CONTRATOU.
--    Antes (043): recalculava as contrapartes dos DOIS lados. Agora: quando o
--    CLIENTE X ganha rosto, os PROFISSIONAIS que X contratou (para_perfil de
--    negócios honrados onde X = de_perfil) podem passar a cumprir a regra.
--    (O ramo do selo 'profissao' não reentra: a condição só apanha 'identidade'.)
-- ----------------------------------------------------------------
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
      select distinct o.para_perfil as prof
      from public.orcamentos o
      where o.de_perfil = new.perfil_id
        and o.estado in ('honrado', 'entregue', 'concluido', 'confirmado_ambos', 'devolvido')
    loop
      perform public.acender_selo_profissao_trabalho(c.prof);
    end loop;
  end if;
  return null;
end;
$$;
-- (o trigger after_identidade_selo_trabalho, criado na 043, continua a apontar
--  para esta função)

-- ----------------------------------------------------------------
-- 4) BACKFILL HONESTO — recalcular os selos 'trabalho' à luz da regra "só
--    contratado". Cédulas intactas.
-- ----------------------------------------------------------------

-- 4a) Apagar selos 'trabalho' que já não cumprem (contratado < 2).
update public.verificacoes v
   set estado = 'pendente',
       origem = null,
       verificado_em = null
 where v.aba = 'profissao'
   and v.origem = 'trabalho'
   and v.estado = 'verificado'
   and public.contrapartes_como_contratado_verificadas(v.perfil_id) < 2;

-- 4b) Acender onde a regra nova já se cumpre e a aba ainda não está acesa.
update public.verificacoes v
   set estado = 'verificado',
       origem = coalesce(v.origem, 'trabalho'),
       verificado_em = coalesce(v.verificado_em, now())
 where v.aba = 'profissao'
   and v.estado is distinct from 'verificado'
   and public.contrapartes_como_contratado_verificadas(v.perfil_id) >= 2;
