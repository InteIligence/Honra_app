-- ============================================================
-- HONRA — Migração 056: um TRABALHO COMPROVADO também acende o selo
-- ------------------------------------------------------------
-- Decisão do Vítor (25/07/2026), ao ver o próprio perfil: havia um trabalho
-- comprovado no portefólio e o cadeado da aba "Portefólio" continuava fechado,
-- porque a 017 só olhava para `portfolio_itens` (fotos soltas).
--
-- Isso contradizia a régua da casa: uma prova validada pela máquina (negócio
-- que chegou a honrado, impossível de forjar) vale MAIS do que uma foto que
-- qualquer um carrega. Se a foto solta acende o selo, o comprovado tem de
-- acender também — "uma capacidade só entra quando for honrada".
--
-- O QUE MUDA:
--   · sincronizar_selo_portefolio() passa a aceitar QUALQUER das duas provas:
--     ≥1 foto no portefólio OU ≥1 trabalho comprovado destacado.
--   · nasce um gatilho em `trabalhos_comprovados` — destacar acende o selo,
--     retirar o destaque volta a avaliar (e só apaga se não sobrar nada).
--   · a função é chamada por gatilhos em DUAS tabelas com nomes de coluna
--     iguais (`perfil_id` nas duas), por isso serve as duas sem ramificar.
--   · BACKFILL no fim: acerta o selo de toda a gente com a regra nova.
--
-- Correr no SQL Editor DEPOIS da 055. Só reescreve função/gatilhos — aditivo.
-- ============================================================

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
  -- A montra tem substância se houver foto solta OU prova comprovada.
  tem := exists (select 1 from public.portfolio_itens where perfil_id = pid)
      or exists (select 1 from public.trabalhos_comprovados where perfil_id = pid);
  update public.verificacoes
     set estado = case when tem then 'verificado' else 'pendente' end,
         verificado_em = case when tem then now() else null end
   where perfil_id = pid and aba = 'portefolio';
  return null;
end;
$$;

-- Gatilho existente (fotos soltas) — recriado para ficar explícito nesta migração.
drop trigger if exists after_portfolio_selo on public.portfolio_itens;
create trigger after_portfolio_selo
  after insert or delete on public.portfolio_itens
  for each row execute function public.sincronizar_selo_portefolio();

-- Gatilho novo: destacar/retirar um trabalho comprovado mexe no selo.
drop trigger if exists after_tcomp_selo on public.trabalhos_comprovados;
create trigger after_tcomp_selo
  after insert or delete on public.trabalhos_comprovados
  for each row execute function public.sincronizar_selo_portefolio();

-- ------------------------------------------------------------
-- BACKFILL — acerta o selo de todos com a regra nova.
-- ------------------------------------------------------------
update public.verificacoes v
   set estado = 'verificado', verificado_em = now()
 where v.aba = 'portefolio'
   and v.estado is distinct from 'verificado'
   and (
     exists (select 1 from public.portfolio_itens p where p.perfil_id = v.perfil_id)
     or exists (select 1 from public.trabalhos_comprovados c where c.perfil_id = v.perfil_id)
   );

update public.verificacoes v
   set estado = 'pendente', verificado_em = null
 where v.aba = 'portefolio'
   and v.estado is distinct from 'pendente'
   and not exists (select 1 from public.portfolio_itens p where p.perfil_id = v.perfil_id)
   and not exists (select 1 from public.trabalhos_comprovados c where c.perfil_id = v.perfil_id);
