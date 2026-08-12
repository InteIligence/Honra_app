-- ============================================================
-- HONRA — Migração 017: o SELO "Portefólio" acende com trabalho real
-- ------------------------------------------------------------
-- Bug: o utilizador carregava fotos no portefólio mas a aba "Portefólio" do
-- selo continuava trancada (pendente) — porque nunca ligámos o upload ao selo.
-- Agora: ter ≥1 item de portefólio ACENDE a aba a verde (mostrar, não dizer:
-- "portefólio verificado" = tens trabalho real na montra). Zero itens → pendente.
--
-- Correr no SQL Editor DEPOIS da 016.
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
  tem := exists (select 1 from public.portfolio_itens where perfil_id = pid);
  update public.verificacoes
     set estado = case when tem then 'verificado' else 'pendente' end,
         verificado_em = case when tem then now() else null end
   where perfil_id = pid and aba = 'portefolio';
  return null;
end;
$$;

drop trigger if exists after_portfolio_selo on public.portfolio_itens;
create trigger after_portfolio_selo
  after insert or delete on public.portfolio_itens
  for each row execute function public.sincronizar_selo_portefolio();

-- BACKFILL: acende já o selo de quem tem portefólio (e apaga de quem não tem).
update public.verificacoes v
   set estado = 'verificado', verificado_em = now()
 where v.aba = 'portefolio'
   and exists (select 1 from public.portfolio_itens p where p.perfil_id = v.perfil_id);

update public.verificacoes v
   set estado = 'pendente', verificado_em = null
 where v.aba = 'portefolio'
   and not exists (select 1 from public.portfolio_itens p where p.perfil_id = v.perfil_id);
