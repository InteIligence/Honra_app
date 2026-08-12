-- ============================================================
-- HONRA — Migração 040: CONTRATO-CONVITE (Fatia C-2 — cartão gravado + mandato)
-- ------------------------------------------------------------
-- O NÍVEL ii ganha corpo: depois de assinar (Fatia B), o convidado lê e aceita
-- o MANDATO (que nomeia o PROFISSIONAL como beneficiário — EBA Q&A 2019_4794)
-- e guarda o cartão via Checkout `mode=setup` criado DIRETAMENTE na conta
-- Connect do profissional (direct charges — doc §11.1; o Honra nunca toca nos
-- fundos nem nos números do cartão).
--
-- O estado NÃO muda com o cartão: o desenho (§4.1/4.2) mantém o nível ii em
-- 'assinado' até ao evento — 'caucionado' é EXCLUSIVO do hold armado (nível
-- iii, Fatia D). O cartão fica registado em `cartao_gravado_em` +
-- `setup_intent_id`/`payment_method_id` (colunas da 025).
--
-- O que esta migração acrescenta:
--   1) `mandato_aceite_em` — o carimbo do click-to-accept do mandato (coluna
--      própria, invariante legal: antes do cartão, nunca depois).
--   2) `stripe_customer_id` no CONTRATO — o Customer vive na conta Connect do
--      profissional (direct charges), logo é por-contrato e desnormalizado
--      como o `stripe_account_id` (a conta de P pode mudar, o contrato não).
--      (O `clientes_convidados.stripe_customer_id` da 025 fica intacto — era o
--      gancho do desenho pré-Connect; não se usa no fluxo direct charges.)
--   3) Finalidade 'cartao' nos magic links (o passo do cartão é um ATO próprio,
--      separado do 'assinar' — que se gasta na assinatura — e do 'repor_cartao',
--      que é a recuperação da Fatia D).
--   4) Guarda estendida: `mandato_aceite_em`, uma vez fixado, é IMUTÁVEL
--      (append-only da prova, como o hash do contrato e o momento da
--      assinatura na 026). O hash do mandato aceite fica também congelado no
--      evento 'mandato' (append-only) — dupla âncora.
--
-- Aditivo/idempotente. Correr DEPOIS da 039.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) Colunas novas em contratos_convite.
-- ----------------------------------------------------------------
alter table public.contratos_convite
  add column if not exists mandato_aceite_em  timestamptz,  -- click-to-accept do mandato (antes do cartão)
  add column if not exists stripe_customer_id text;          -- Customer na conta Connect de P (direct charges)

comment on column public.contratos_convite.mandato_aceite_em is
  'Carimbo do click-to-accept do texto do mandato (P nomeado beneficiário, '
  'valores e datas concretos) — obrigatório ANTES de guardar o cartão (C-2). '
  'Imutável depois de fixado (guarda_ciclo_convite).';
comment on column public.contratos_convite.stripe_customer_id is
  'Customer criado NA conta Connect do profissional (header Stripe-Account) — '
  'é a ele que o payment_method fica anexado para as cobranças MIT (direct charges).';

-- ----------------------------------------------------------------
-- 2) Finalidade 'cartao' nos magic links (alarga o CHECK da 026 — aditivo).
-- ----------------------------------------------------------------
alter table public.magic_links_convite
  drop constraint if exists magic_links_convite_finalidade_check;
alter table public.magic_links_convite
  add constraint magic_links_convite_finalidade_check
  check (finalidade in
    ('rever','assinar','cartao','cancelar','repor_cartao','remarcar','avaliar'));

-- ----------------------------------------------------------------
-- 3) GUARDA ESTENDIDA — imutabilidade da prova (025 → 026 → 040).
--    Acrescenta-se: mandato_aceite_em nunca se reescreve depois de fixado
--    (permite-se apenas NULL → valor). O resto é IGUAL à 026.
-- ----------------------------------------------------------------
create or replace function public.guarda_ciclo_convite()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Imutabilidade da prova — corre para TODOS (inclusive service_role).
  if tg_op = 'UPDATE' then
    if old.contrato_hash is not null
       and new.contrato_hash is distinct from old.contrato_hash then
      raise exception 'O hash do contrato assinado é imutável (append-only da prova).';
    end if;
    if old.assinado_em is not null
       and new.assinado_em is distinct from old.assinado_em then
      raise exception 'O momento da assinatura é imutável (append-only da prova).';
    end if;
    -- (040) O aceite do mandato é prova: uma vez carimbado, nunca se reescreve.
    if old.mandato_aceite_em is not null
       and new.mandato_aceite_em is distinct from old.mandato_aceite_em then
      raise exception 'O aceite do mandato é imutável (append-only da prova).';
    end if;
  end if;

  -- Reserva de escrita ao servidor (espelho da 005 — igual à 025/026).
  if auth.role() = 'service_role' or auth.uid() is null then
    return coalesce(new, old);  -- em DELETE o NEW é NULL
  end if;
  raise exception 'Escrita no contrato-convite reservada ao servidor.';
end;
$$;
-- (o trigger antes_convite_ciclo criado na 025 continua a apontar para esta função)
