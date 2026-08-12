-- ============================================================
-- HONRA — Migração 062: A PROPOSTA DO CLIENTE (valor + prazo)
-- ------------------------------------------------------------
-- O ciclo do negócio (decisão 27/07, Vítor): "O CLIENTE faz a proposta +
-- orçamento, surge o aperto de mão e os checkpoints são elaborados pelo
-- cliente — NUNCA pelo profissional."
--
-- Os checkpoints já cumprem (047: só de_perfil escreve, pré-selo, trancados
-- no selo). Faltavam as outras duas peças da proposta:
--   · VALOR — o orçamento não tinha preço. A coluna nem existia; a proposta
--     do cliente nunca levava o combinado em euros.
--   · PRAZO — existia (047) mas sem guarda: qualquer parte podia mexer-lhe,
--     a qualquer momento. O prazo é a âncora das marcas dos checkpoints —
--     um prestador que o pudesse empurrar mudava o contrato depois da palavra.
--
-- REGRA (o mesmo parafuso da 047, decisão 5):
--   · valor_proposta e prazo são do CLIENTE (de_perfil), pré-selo apenas
--     ('pedido'/'aceite'). O profissional NUNCA os escreve — vê-os antes de
--     aceitar (é a isso que diz sim) e o selo tranca-os para os dois.
--   · O servidor (service_role) continua a poder tudo (Edge Functions).
--
-- Aditiva. Correr DEPOIS da 061.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) O VALOR da proposta — em euros, como orcamento_valor do anúncio (013).
-- ----------------------------------------------------------------
alter table public.orcamentos
  add column if not exists valor_proposta numeric;

comment on column public.orcamentos.valor_proposta is
  'O orçamento combinado (€), proposto pelo CLIENTE (de_perfil) — nunca pelo profissional. Pré-selo apenas; o selo tranca (guarda_proposta_cliente).';

comment on column public.orcamentos.prazo is
  'Prazo do projeto (âncora dos checkpoints, 047). Do CLIENTE, pré-selo apenas; o selo tranca (guarda_proposta_cliente).';

-- ----------------------------------------------------------------
-- 2) A GUARDA — irmã da guarda_checkpoints (047 §4): a app trava,
--    a BD trava na mesma.
-- ----------------------------------------------------------------
create or replace function public.guarda_proposta_cliente()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Servidor faz tudo (mesmo reconhecimento da guarda_ciclo_caucao, 010).
  if auth.role() = 'service_role' or auth.uid() is null then
    return new;
  end if;

  -- Só interessa quando a PROPOSTA muda; o resto do ciclo tem as suas guardas.
  if new.valor_proposta is not distinct from old.valor_proposta
     and new.prazo is not distinct from old.prazo then
    return new;
  end if;

  if auth.uid() is distinct from old.de_perfil then
    raise exception 'A proposta (valor e prazo) é do cliente — nunca do profissional.';
  end if;
  if old.estado not in ('pedido', 'aceite') then
    raise exception 'Proposta trancada após o selo — o combinado não se move.';
  end if;

  return new;
end;
$$;

drop trigger if exists before_orcamento_proposta on public.orcamentos;
create trigger before_orcamento_proposta
  before update on public.orcamentos
  for each row execute function public.guarda_proposta_cliente();
