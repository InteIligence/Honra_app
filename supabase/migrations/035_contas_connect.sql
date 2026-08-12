-- ============================================================
-- HONRA — Migração 035: CONTAS CONNECT (Fatia C-1 — o alicerce regulatório)
-- ------------------------------------------------------------
-- A ESTRUTURA que a lei nos obriga: as penalizações/holds do contrato-convite
-- TÊM de cair na conta Stripe do PROFISSIONAL (direct charges na sua conta
-- Connect Express + application fee do Honra), NUNCA na conta do Honra — senão
-- o Honra entraria na posse de fundos de terceiros = atividade licenciável pelo
-- Banco de Portugal (art. 5.º/b DL 91/2018; considerando 11 PSD2; EBA Q&A
-- 2020_5354/5355). Ver docs/DESENHO-CONTRATO-CONVITE.md §11.1 e
-- docs/JURIDICO-CONTRATO-CONVITE.md §6.
--
-- Esta fatia é SÓ o onboarding Connect: a tabela `contas_connect`, atualizada
-- pela Edge Function `connect-onboarding` (cria a conta Express + Account Link)
-- e pelo webhook Connect `connect-webhook` (account.updated → charges_enabled).
-- O SetupIntent/cartão (nível ii) é a Fatia C-2; o hold (nível iii) é a C-3.
--
-- DAC7 (Lei 36/2023): recolhe-se aqui o NIF de P — o Express pede-o e a AT vai
-- exigi-lo no reporte anual (ver doc §12.9). Coluna `nif`.
--
-- Aditivo/idempotente. Correr DEPOIS da 034.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) CONTAS CONNECT — a conta Stripe Express de P.
--    PK = perfil_id (uma conta Connect por profissional). Todos os objetos
--    Stripe do contrato-convite (SetupIntent, hold, cobrança) viverão NESTA
--    conta (header Stripe-Account = stripe_account_id) — direct charges.
--
--    Máquina de estados do onboarding:
--      'a_configurar' — linha nasce assim (ainda sem conta Stripe criada).
--      'pendente'     — conta Express criada, onboarding por concluir
--                       (charges_enabled ainda false).
--      'ativa'        — charges_enabled=true: P pode receber cauções/cobranças
--                       (é o GATE dos níveis ii/iii do contrato-convite).
--      'restrita'     — a Stripe restringiu/rejeitou a conta (disabled_reason).
-- ----------------------------------------------------------------
create table if not exists public.contas_connect (
  perfil_id          uuid primary key references public.perfis(id) on delete cascade,
  stripe_account_id  text unique,                 -- acct_… (null enquanto 'a_configurar')
  nif                text,                          -- NIF de P (DAC7 — Lei 36/2023)
  estado             text not null default 'a_configurar'
                       check (estado in ('a_configurar','pendente','ativa','restrita')),
  charges_enabled    boolean not null default false,  -- pode cobrar/segurar? (GATE ii/iii)
  payouts_enabled    boolean not null default false,  -- pode receber transferências?
  detalhes_em_falta  jsonb,                         -- requirements pendentes (do webhook)
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- 2) RLS
--    • O DONO lê a SUA conta Connect (para o ecrã "Ativar pagamentos" mostrar o
--      estado). Escrita: SÓ o servidor (service_role) — via connect-onboarding e
--      connect-webhook. Um cliente autenticado nunca escreve aqui.
-- ----------------------------------------------------------------
alter table public.contas_connect enable row level security;

drop policy if exists "connect_dono_ve" on public.contas_connect;
create policy "connect_dono_ve" on public.contas_connect
  for select using (auth.uid() = perfil_id);
-- Sem policies de insert/update/delete: escrever é EXCLUSIVO do servidor
-- (service_role passa ao lado do RLS). O guarda abaixo é defesa-em-profundidade.

-- ----------------------------------------------------------------
-- 3) GUARDA DE INTEGRIDADE — espelho da guarda_ciclo_convite (025).
--    O estado desta tabela decide se o dinheiro do contrato-convite pode
--    correr; reserva-se TODA a escrita ao servidor (service_role OU ausência de
--    auth.uid()). Assim as Edge Functions/webhook confiam nas colunas — só o
--    servidor as escreve.
-- ----------------------------------------------------------------
create or replace function public.guarda_contas_connect()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null then
    -- coalesce: em DELETE o NEW é NULL (devolver NULL cancelaria o apagamento).
    return coalesce(new, old);
  end if;
  raise exception 'Escrita em contas_connect reservada ao servidor.';
end;
$$;

drop trigger if exists antes_contas_connect on public.contas_connect;
create trigger antes_contas_connect
  before insert or update or delete on public.contas_connect
  for each row execute function public.guarda_contas_connect();

-- ----------------------------------------------------------------
-- 4) atualizado_em — carimba-se sozinho a cada UPDATE (o webhook não precisa
--    de o pôr à mão).
-- ----------------------------------------------------------------
create or replace function public.contas_connect_touch()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists contas_connect_touch on public.contas_connect;
create trigger contas_connect_touch
  before update on public.contas_connect
  for each row execute function public.contas_connect_touch();

-- ----------------------------------------------------------------
-- 5) GATE — os níveis de proteção ii (cartão) e iii (hold) do contrato-convite
--    SÓ ficam disponíveis quando a conta Connect de P está ATIVA
--    (charges_enabled = true): sem isso, a captura/cobrança não teria onde cair
--    a favor de P (direct charge). Sem conta = só nível i (contrato assinado).
--
--    Esta função é o gate, pronta para a Fatia C-2 a chamar quando P escolher o
--    nível no `convite-decidir` (hoje esse fluxo fixa nível 1). Também serve o
--    ecrã do profissional e o servidor. security definer para ler a tabela
--    independentemente do RLS de quem pergunta.
-- ----------------------------------------------------------------
create or replace function public.pode_nivel_protecao_avancado(p_perfil uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.contas_connect
    where perfil_id = p_perfil
      and charges_enabled = true
      and estado = 'ativa'
  );
$$;

comment on function public.pode_nivel_protecao_avancado(uuid) is
  'GATE dos níveis ii/iii do contrato-convite: true sse P tem conta Connect '
  'ativa (charges_enabled). Fatia C-2 (convite-decidir) chama-a antes de deixar '
  'P escolher cartão/hold. Ver migração 035 e DESENHO-CONTRATO-CONVITE.md §11.1.';
