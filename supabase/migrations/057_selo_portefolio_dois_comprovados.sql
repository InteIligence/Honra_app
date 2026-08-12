-- ============================================================
-- HONRA — Migração 057: o selo "Portefólio" exige DOIS trabalhos comprovados
-- ------------------------------------------------------------
-- Decisão do Vítor (25/07/2026): "o cadeado abre com a amostra de 2 trabalhos
-- concluídos através do Honra".
--
-- O QUE MUDA face à 056 (e porquê):
--   · ANTES (017): bastava 1 FOTO no portefólio. Qualquer pessoa carrega uma
--     foto — o selo não provava nada, era teatro.
--   · 056: passou a contar também 1 trabalho comprovado.
--   · AGORA (057): só conta trabalho CONCLUÍDO NO HONRA, e são precisos DOIS.
--     Foto solta deixa de acender o selo (continua a mostrar-se no portefólio,
--     mas mostrar não é provar).
--
-- PORQUÊ DOIS e não um: um negócio honrado pode ser sorte ou um favor entre
-- conhecidos; dois já é AMOSTRA — mostra repetição, que é o que uma credencial
-- deve atestar. É a régua da casa: uma capacidade só entra quando for honrada.
--
-- CONSEQUÊNCIA ASSUMIDA: quem tinha o selo aceso só por ter foto PERDE-O neste
-- backfill. É a correção de um selo que estava a dizer uma coisa que não era
-- verdade — preferimos o cadeado honesto ao visto fácil.
--
-- Correr no SQL Editor DEPOIS da 056. Só reescreve função/gatilhos — aditivo.
-- ============================================================

-- Quantos comprovados são precisos para a "amostra". Fica numa função própria
-- para o número viver num sítio só (e poder mudar sem caçar condições soltas).
create or replace function public.min_comprovados_selo()
returns int
language sql
immutable
as $$ select 2 $$;

comment on function public.min_comprovados_selo() is
  'Quantos trabalhos comprovados acendem o selo Portefólio (decisão 25/07/2026: 2 = amostra, não sorte).';

create or replace function public.sincronizar_selo_portefolio()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  pid uuid;
  tem boolean;
begin
  pid := coalesce(new.perfil_id, old.perfil_id);
  -- SÓ trabalho concluído no Honra conta, e são precisos >= 2.
  -- (Fotos soltas continuam a viver no portefólio; não acendem credencial.)
  tem := (
    select count(*) >= public.min_comprovados_selo()
      from public.trabalhos_comprovados
     where perfil_id = pid
  );
  update public.verificacoes
     set estado = case when tem then 'verificado' else 'pendente' end,
         verificado_em = case when tem then now() else null end
   where perfil_id = pid and aba = 'portefolio';
  return null;
end;
$$;

-- O gatilho das FOTOS deixa de existir: o portefólio de fotos já não mexe no
-- selo. (Se ficasse, uma foto apagada reavaliava o selo à toa.)
drop trigger if exists after_portfolio_selo on public.portfolio_itens;

-- Destacar / retirar um trabalho comprovado é o que mexe no selo.
drop trigger if exists after_tcomp_selo on public.trabalhos_comprovados;
create trigger after_tcomp_selo
  after insert or delete on public.trabalhos_comprovados
  for each row execute function public.sincronizar_selo_portefolio();

-- ------------------------------------------------------------
-- BACKFILL — acerta o selo de toda a gente com a regra nova.
-- ------------------------------------------------------------
update public.verificacoes v
   set estado = 'verificado', verificado_em = now()
 where v.aba = 'portefolio'
   and v.estado is distinct from 'verificado'
   and (
     select count(*) from public.trabalhos_comprovados c where c.perfil_id = v.perfil_id
   ) >= public.min_comprovados_selo();

update public.verificacoes v
   set estado = 'pendente', verificado_em = null
 where v.aba = 'portefolio'
   and v.estado is distinct from 'pendente'
   and (
     select count(*) from public.trabalhos_comprovados c where c.perfil_id = v.perfil_id
   ) < public.min_comprovados_selo();
