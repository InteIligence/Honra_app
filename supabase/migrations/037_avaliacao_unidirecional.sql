-- ============================================================
-- HONRA — Migração 037: AVALIAÇÃO NUM SÓ SENTIDO (cliente → profissional)
-- ------------------------------------------------------------
-- Decisão (16/07): a avaliação deixa de ser mútua. Só o CLIENTE (quem PEDE /
-- RECEBE o serviço = `orcamentos.de_perfil`) avalia o PROFISSIONAL (quem ACEITA
-- / PRESTA / entrega = `orcamentos.para_perfil`). O profissional NÃO avalia o
-- cliente: o cliente não presta serviço, não há qualidade dele para pontuar; a
-- fiabilidade do cliente já é capturada pela marca do aperto de mão.
--
-- Consequência: o double-blind (015) deixa de fazer sentido — com um só lado
-- não há retaliação a esconder. A avaliação do cliente REVELA-SE logo. Mantém-
-- se a coluna `revelado_em` (015) e o cron de 14 dias (inofensivos agora); a
-- reciprocidade da 015 nunca mais dispara (só há uma avaliação por negócio).
--
-- NÃO se apaga nada. As avaliações do 2.º sentido (profissional→cliente) que já
-- existam ficam intactas e reveladas; apenas se PROÍBE criar novas.
--
-- Correr no SQL Editor DEPOIS da 036.
-- ============================================================

-- 1) GUARDA DE ESCRITA — só o cliente avalia, e só o profissional do negócio.
--    (Mantém o guard "só depois de honrado": estados finais concluido+.)
drop policy if exists "avaliacoes_insere_com_prova" on public.avaliacoes;
create policy "avaliacoes_insere_com_prova" on public.avaliacoes
  for insert with check (
    auth.uid() = de_perfil
    and exists (
      select 1
      from public.orcamentos o
      where o.id = avaliacoes.orcamento_id
        and o.estado in ('concluido', 'confirmado_ambos', 'devolvido')
        -- UM SÓ SENTIDO: o autor é o CLIENTE (de_perfil do negócio) e o
        -- avaliado é o PROFISSIONAL (para_perfil do negócio).
        and o.de_perfil   = auth.uid()
        and o.para_perfil = avaliacoes.para_perfil
    )
  );

-- 2) REVELAÇÃO IMEDIATA — com um só sentido não há segundo lado por quem
--    esperar; a avaliação do cliente é pública assim que entra. Trigger BEFORE
--    INSERT carimba `revelado_em` (o recalc do índice, que só conta reveladas,
--    passa a apanhá-la logo).
create or replace function public.avaliacao_revela_ja()
returns trigger
language plpgsql
as $$
begin
  if new.revelado_em is null then
    new.revelado_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists before_avaliacao_revela_ja on public.avaliacoes;
create trigger before_avaliacao_revela_ja
  before insert on public.avaliacoes
  for each row execute function public.avaliacao_revela_ja();
