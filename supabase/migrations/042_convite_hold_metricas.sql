-- ============================================================
-- HONRA — Migração 042: CONTRATO-CONVITE (Fatia D — o hold vivo + métricas)
-- ------------------------------------------------------------
-- O NÍVEL de proteção com cartão ganha o instrumento final: o HOLD de caução
-- armado pelo cron a D−2 (a investigação corrigiu o −3 do desenho — a janela
-- MIT da Visa é ~4d18h; ver docs/PAGAMENTOS-HOLD-METRICAS.md §1), SÓ em cartões
-- de CRÉDITO (funding). Débito/pré-pago/desconhecido = SEM hold (modelo Fresha):
-- o cartão gravado garante, e cobra-se MIT direto apenas na quebra (doc §4).
--
-- O que esta migração acrescenta (tudo ADITIVO):
--   1) Colunas do hold/dunning em `contratos_convite`. NOTA: `hold_id` e
--      `hold_armado_em` JÁ existem desde a 025 — reutilizam-se (não se cria
--      `hold_intent_id` duplicado). Novas: o `capture_before` real lido em
--      runtime, o funding do cartão, a DECISÃO do arme (registada e mostrada
--      com honestidade), o perdão, e a máquina de dunning (motivo, valor,
--      tentativas, próxima, último decline, prazo SCA).
--   2) `metricas_pagamento` — eventos IMUTÁVEIS de pagamento (append-only,
--      como eventos_convite; PAGAMENTOS-HOLD-METRICAS §6). Fonte das 8 métricas
--      núcleo; sem dashboards ainda. Sobrevive ao apagamento do contrato
--      (agregados sem PII — referências ficam a null).
--   3) `alertas_vamp_profissional` — a view dos thresholds VAMP (§5):
--      amarelo a 2 disputas+EFW/90d OU ratio ≥ 0,3%; vermelho a ≥5/12m E
--      ratio ≥ 0,5%. Só dados — a UI fica para depois.
--
-- Aditivo/idempotente. Correr DEPOIS da 041.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) Colunas novas em contratos_convite.
-- ----------------------------------------------------------------
alter table public.contratos_convite
  -- O funding lido do payment_method na Stripe (decide hold vs sem-hold).
  add column if not exists funding_cartao text
    check (funding_cartao is null or funding_cartao in ('credit','debit','prepaid','unknown')),
  -- A decisão do arme, registada com verdade (mostra-se a P e sustenta métricas).
  add column if not exists hold_decisao text
    check (hold_decisao is null or hold_decisao in (
      'hold_armado',        -- crédito: PaymentIntent manual-capture armada
      'sem_hold_debito',    -- débito: sem retenção; MIT direto só na quebra
      'sem_hold_prepaid',   -- pré-pago: idem
      'sem_hold_unknown',   -- funding desconhecido: tratado como débito (conservador)
      'sem_hold_sem_valor', -- valor do contrato "(a combinar)" — nada a segurar
      'hold_falhou'         -- o cartão recusou o arme até ao fim — MIT na quebra
    )),
  -- O capture_before REAL da autorização (latest_charge.payment_method_details
  -- .card.capture_before) — a única verdade sobre a janela; lido no arme.
  add column if not exists hold_capture_before timestamptz,
  -- Perdão de uma cobrança pendente (fee 0; nada se cobra a ninguém).
  add column if not exists perdoado_em timestamptz,
  -- Máquina de DUNNING (tentativa 0 + retries D+1/D+3/D+7; máx. 4 tentativas).
  add column if not exists cobranca_motivo text
    check (cobranca_motivo is null or cobranca_motivo in
      ('escalao_2','escalao_3','incumprimento_cliente')),
  add column if not exists cobranca_valor integer,           -- cêntimos devidos
  add column if not exists cobranca_iniciada_em timestamptz, -- tentativa 0
  add column if not exists cobranca_tentativas smallint not null default 0,
  add column if not exists cobranca_proxima_em timestamptz,  -- null = sem retry por máquina
  add column if not exists cobranca_ultimo_decline text,     -- gating por decline code
  add column if not exists cobranca_sca_prazo_em timestamptz; -- 72h do fallback SCA

comment on column public.contratos_convite.hold_capture_before is
  'Expiração REAL da autorização do hold (Visa MIT ≈ 4d18h). Nunca capturar '
  'depois disto; a decisão final agenda-se a capture_before − 12h.';
comment on column public.contratos_convite.hold_decisao is
  'A decisão do arme a D−2, registada com honestidade: hold só em crédito; '
  'débito/pré-pago = modelo Fresha (MIT direto na quebra).';

-- Para o resolver varrer por data do evento sem full scan.
create index if not exists contratos_convite_estado_data_idx
  on public.contratos_convite (estado, data_inicio);
-- Dunning: as pendentes com retry agendado.
create index if not exists contratos_convite_dunning_idx
  on public.contratos_convite (estado, cobranca_proxima_em)
  where estado = 'cobranca_pendente';

-- ----------------------------------------------------------------
-- 2) MÉTRICAS DE PAGAMENTO — eventos imutáveis (append-only).
--    Vocabulário (não é CHECK para as fatias seguintes o alargarem sem ALTER):
--      arme_ok | arme_falhou | arme_dispensado | hold_libertado | hold_expirado
--      captura_ok | captura_falhou | mit_ok | mit_falhou | retry
--      sca_pedido | incobravel | fee_cobrada | perdoado
--      disputa_aberta | efw_recebido   (webhooks de charge — TODO Fatia D+)
--    Referências com ON DELETE SET NULL: a métrica é agregado financeiro sem
--    PII e sobrevive à limpeza RGPD do contrato.
-- ----------------------------------------------------------------
create table if not exists public.metricas_pagamento (
  id              uuid primary key default gen_random_uuid(),
  evento          text not null,
  contrato_id     uuid references public.contratos_convite(id) on delete set null,
  profissional_id uuid references public.perfis(id) on delete set null,
  valor           integer,            -- cêntimos do movimento (autorizado/capturado/tentado)
  fee_centimos    integer,            -- application fee do Honra (0 no perdão)
  decline_code    text,               -- o gating do dunning vive disto
  rede            text,               -- visa|mastercard|…
  funding         text,               -- credit|debit|prepaid|unknown
  pi_id           text,               -- PaymentIntent na conta Connect de P
  payload         jsonb,              -- detalhe honesto (capture_before, tentativa, motivo…)
  criado_em       timestamptz not null default now()
);

create index if not exists metricas_pagamento_prof_idx
  on public.metricas_pagamento (profissional_id, criado_em desc);
create index if not exists metricas_pagamento_contrato_idx
  on public.metricas_pagamento (contrato_id, criado_em);
create index if not exists metricas_pagamento_evento_idx
  on public.metricas_pagamento (evento, criado_em);

alter table public.metricas_pagamento enable row level security;
-- Sem policies: só service_role lê/escreve (como eventos_convite).

-- APPEND-ONLY: uma métrica nunca se altera; apagar só o servidor (retenção).
create or replace function public.metricas_pagamento_imutavel()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'metricas_pagamento é append-only (não se altera um evento).';
  end if;
  if auth.role() = 'service_role' or auth.uid() is null then
    return old;
  end if;
  raise exception 'Apagar métricas de pagamento é reservado ao servidor.';
end;
$$;

drop trigger if exists metricas_pagamento_sem_update on public.metricas_pagamento;
create trigger metricas_pagamento_sem_update
  before update or delete on public.metricas_pagamento
  for each row execute function public.metricas_pagamento_imutavel();

-- ----------------------------------------------------------------
-- 3) ALERTAS VAMP por profissional (só dados; UI depois).
--    Espelha o programa da Visa com margem (PAGAMENTOS §5):
--      amarelo  — ≥2 disputas+EFW em 90d  OU ratio 90d ≥ 0,3%
--      vermelho — ≥5 disputas+EFW em 12m  E  ratio 12m ≥ 0,5%
--    Denominador = cobranças capturadas (captura_ok + mit_ok). Os eventos
--    disputa_aberta/efw_recebido nascem dos webhooks de charge (TODO Fatia D+)
--    — até lá a view devolve 0 disputas, honestamente.
--    security_invoker: quem não vê a tabela (RLS sem policies) não vê a view.
-- ----------------------------------------------------------------
create or replace view public.alertas_vamp_profissional
with (security_invoker = true) as
with base as (
  select
    profissional_id,
    count(*) filter (where evento in ('captura_ok','mit_ok')
                       and criado_em >= now() - interval '90 days')  as cobrancas_90d,
    count(*) filter (where evento in ('captura_ok','mit_ok')
                       and criado_em >= now() - interval '365 days') as cobrancas_12m,
    count(*) filter (where evento in ('disputa_aberta','efw_recebido')
                       and criado_em >= now() - interval '90 days')  as disputas_90d,
    count(*) filter (where evento in ('disputa_aberta','efw_recebido')
                       and criado_em >= now() - interval '365 days') as disputas_12m
  from public.metricas_pagamento
  where profissional_id is not null
  group by profissional_id
)
select
  profissional_id,
  cobrancas_90d, disputas_90d,
  round(disputas_90d::numeric / nullif(cobrancas_90d, 0), 4) as ratio_90d,
  cobrancas_12m, disputas_12m,
  round(disputas_12m::numeric / nullif(cobrancas_12m, 0), 4) as ratio_12m,
  case
    when disputas_12m >= 5
     and disputas_12m::numeric / nullif(cobrancas_12m, 0) >= 0.005 then 'vermelho'
    when disputas_90d >= 2
      or disputas_90d::numeric / nullif(cobrancas_90d, 0) >= 0.003 then 'amarelo'
    else 'ok'
  end as alerta
from base;

-- Cinto-e-suspensórios: nem anon nem authenticated tocam na view.
revoke all on public.alertas_vamp_profissional from anon, authenticated;
