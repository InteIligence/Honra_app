-- ============================================================
-- HONRA — Migração 038: CONTAS CONNECT — versão da API Stripe (v1 | v2)
-- ------------------------------------------------------------
-- PORQUÊ: a Stripe descontinuou o Accounts v1 para integrações novas
-- ("Stripe no longer recommends Accounts v1 for new Connect integrations.
-- Create connected accounts with POST /v2/core/accounts instead") — a conta
-- da plataforma é nova e só tem v1 por um interruptor de compatibilidade.
-- A partir desta migração, contas Connect NOVAS nascem via /v2/core/accounts
-- (Accounts v2) e o onboarding usa Account Links v2 (/v2/core/account_links).
--
-- Esta coluna diz a cada linha por que via nasceu a conta, porque os dois
-- mundos diferem em 2 pontos operacionais:
--   • o link de onboarding: /v1/account_links (form) vs /v2/core/account_links
--     (JSON + use_case);
--   • os eventos: `account.updated` (endpoint Connect, "Contas conectadas")
--     vs thin events `v2.core.account[...]` (event destination "A sua conta",
--     webhook connect-webhook-v2).
-- A conta v1 já provada (acct_1Ttw2c…) fica intacta: default 'v1'.
--
-- Aditivo/idempotente. Correr DEPOIS da 037.
-- ============================================================

alter table public.contas_connect
  add column if not exists api_versao text not null default 'v1';

do $$
begin
  alter table public.contas_connect
    add constraint contas_connect_api_versao_chk
    check (api_versao in ('v1', 'v2'));
exception
  when duplicate_object then null; -- já existe: idempotente
end $$;

comment on column public.contas_connect.api_versao is
  'Via de criação da conta Stripe: v1 (/v1/accounts, type=express) ou v2 '
  '(/v2/core/accounts, dashboard=express + configuration.merchant). Decide o '
  'recurso do link de onboarding e o webhook que a atualiza (038).';
