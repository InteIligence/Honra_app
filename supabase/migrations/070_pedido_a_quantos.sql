-- ============================================================
-- HONRA — Migração 070: A QUANTOS FOI PEDIDO (o número à vista)
-- ------------------------------------------------------------
-- Decisão do Vítor (31/07), na Pesquisa: pedir orçamento a várias pessoas de
-- uma vez é LEGÍTIMO e não tem teto. Quem vai pintar a casa pedir a oito
-- pintores é são, não é spray — e o exemplo que derrubou o teto foi o dele: um
-- pintor que procura trabalho nunca poderia ficar limitado a três.
--
-- O travão não é uma regra imposta: é o NÚMERO A ANDAR À VISTA. Quem recebe o
-- pedido vê a quantas outras pessoas ele foi feito, e decide se vale o tempo
-- ANTES de o gastar. É o oposto exato da lead-mill, que vende o mesmo pedido a
-- cinco profissionais e deixa cada um julgar-se o único.
--
-- Desenho: uma coluna só, `orcamentos.pedido_a_n`, escrita no momento do pedido.
--   * NULL = pedido de um-para-um (o caminho antigo, pelo perfil). Não é "zero":
--     é "esta pergunta não se põe" — e a UI não deve mostrar nada nesse caso.
--   * >= 1  = nasceu de uma seleção na Pesquisa; o número é quantos receberam
--     ESTE mesmo pedido, incluindo quem o lê.
--
-- Não mexe em RLS: quem já podia ler a linha do orçamento passa a ler mais esta
-- coluna, e é exatamente esse o objetivo — quem recebe TEM de a poder ver.
--
-- Correr DEPOIS da 069.
-- ============================================================

alter table public.orcamentos
  add column if not exists pedido_a_n smallint;

comment on column public.orcamentos.pedido_a_n is
  'Quantas pessoas receberam este mesmo pedido de orçamento (>=1). NULL = pedido individual, feito pelo perfil. Existe para que quem recebe saiba a quantos foi pedido antes de gastar tempo a responder.';

-- Coerência: se o número existe, tem de ser pelo menos 1 (quem lê já conta).
-- Zero seria uma contradição — não haveria pedido nenhum para ler.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orcamentos_pedido_a_n_valido'
  ) then
    alter table public.orcamentos
      add constraint orcamentos_pedido_a_n_valido
      check (pedido_a_n is null or pedido_a_n >= 1);
  end if;
end $$;

-- A 066 tornou os GRANTs por-coluna e fail-closed nalgumas tabelas. `orcamentos`
-- não foi abrangida por essa mudança (só `perfis`), por isso não há grant a
-- acrescentar aqui — mas fica dito, para quem vier a seguir não ter de o ir
-- confirmar à 066.
