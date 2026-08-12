-- ============================================================
-- HONRA — Migração 045: CONTRATO-CONVITE (Fatia E — versão evento)
--                       BLINDAGEM DA FUGA E (checkpoint unilateral)
-- ------------------------------------------------------------
-- Red-team 18/07 (docs/RED-TEAM-FUGAS.md §E): o `nao_recebi` do profissional
-- capturava a cláusula penal (pct_caucao) ao cartão do cliente SEM prova nem
-- consentimento — mesmo que o cliente tivesse comparecido/pago. Fuga fechada em
-- 3 camadas + 1 corte estrutural (desenho TRANCADO, 4 decisões do fundador):
--
--   Corte estrutural — a cláusula penal só dispara para NO-SHOW (capacidade
--   reservada e desperdiçada). "Compareceu mas não pagou o total" NUNCA é
--   captura unilateral (o pagamento grande corre por fora do Honra).
--
--   Camada 1 — PROVA-DE-ENCONTRO (co-presença): função `convite-comparencia`
--     emite ao P (JWT) um código ROTATIVO (QR + 6 dígitos) derivado de segredo
--     do servidor, ligado ao contrato, válido só na janela do evento (D0±1); o
--     CLIENTE (magic link + OTP fresco) digita/scaneia o código vivo → cunha
--     `prova_encontro` (append-only) + `prova_encontro_em` IMUTÁVEL. Ninguém
--     cunha sozinho (P precisa do OTP do cliente; o cliente precisa do código
--     vivo do P, presencial; a rotação mata o replay).
--
--   Camada 2 — JANELA DE CONTESTAÇÃO (só quando NÃO há prova): o `nao_recebi`
--     DEIXA de capturar de forma síncrona. Sem prova → 'captura_proposta' +
--     aviso pré-captura ao cliente (magic link + OTP). O cliente CONFIRMA
--     ("faltei") → captura no cron; CONTESTA → 'em_disputa', sem captura, ónus
--     no profissional; SILÊNCIO até ao prazo → captura no cron.
--
--   Camada 3 — ARBITRAGEM (resíduo): o he-said/she-said contestado escala a
--     revisão humana (admin). Estado 'em_disputa'. Default: se P não tem prova
--     de no-show e o cliente afirma presença → NÃO captura (protege o cliente).
--
--   Guarda dura (decisão 2 do fundador): a captura-por-SILÊNCIO EXIGE
--   `consentimento_aviso_entregue = true` (recibo de entrega do aviso). Sem
--   recibo → nunca captura automática (crédito: hold liberta no capture_before;
--   débito: MIT não dispara) → cai em revisão. O Bird está PARQUEADO, por isso
--   esta coluna fica false em produção até o SMS ir ao vivo — a captura-por-
--   silêncio não vai ao vivo antes disso.
--
-- Tudo ADITIVO/idempotente. Correr DEPOIS da 044.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) Colunas novas em contratos_convite (Fatia E).
-- ----------------------------------------------------------------
alter table public.contratos_convite
  -- Prova-de-encontro (co-presença). IMUTÁVEL depois de cunhada (guarda abaixo).
  add column if not exists prova_encontro_em    timestamptz,
  -- Janela de contestação: quando o P declarou falta sem prova.
  add column if not exists captura_proposta_em  timestamptz,
  -- Prazo do silêncio/contestação (min(capture_before−12h, T0+48h) ou T0+48h).
  add column if not exists captura_prazo_em      timestamptz,
  -- Resultado do consentimento do cliente (null enquanto a janela está aberta).
  add column if not exists consentimento_resultado text
    check (consentimento_resultado is null
           or consentimento_resultado in ('confirmado','contestado','silencio')),
  -- Guarda dura: a captura-por-silêncio exige o recibo de entrega do aviso.
  add column if not exists consentimento_aviso_entregue boolean not null default false,
  -- O que o cliente escreveu ao contestar (para a revisão humana).
  add column if not exists contestacao_texto     text;

comment on column public.contratos_convite.prova_encontro_em is
  'Co-presença comprovada (cliente digitou o código vivo do P + OTP fresco). '
  'IMUTÁVEL. Com isto preenchido, o P NÃO pode declarar falta (409 no checkpoint).';
comment on column public.contratos_convite.consentimento_aviso_entregue is
  'Recibo de entrega do aviso pré-captura (Bird DLR). A captura-por-silêncio '
  'EXIGE-o (decisão 2 do fundador). Bird parqueado → fica false → sem captura '
  'automática por silêncio; cai em revisão. Vai ao vivo com o Bird.';

-- Para o resolver varrer as janelas de consentimento abertas.
create index if not exists contratos_convite_captura_proposta_idx
  on public.contratos_convite (estado, captura_prazo_em)
  where estado = 'captura_proposta';

-- ----------------------------------------------------------------
-- 2) Estados novos no CHECK do estado (025): 'captura_proposta', 'em_disputa'.
--    A restrição inline da 025 chama-se contratos_convite_estado_check; recria-se
--    com a lista COMPLETA + os dois estados novos.
-- ----------------------------------------------------------------
alter table public.contratos_convite
  drop constraint if exists contratos_convite_estado_check;
alter table public.contratos_convite
  add constraint contratos_convite_estado_check check (estado in (
    -- Fatia A
    'formulario_recebido', 'recusado', 'formulario_expirado', 'aguarda_assinatura',
    -- Fatias B–D
    'assinatura_expirada', 'assinado', 'caucionado', 'cartao_falhou',
    'sem_caucao', 'honrado', 'incumprido_cliente', 'incumprido_profissional',
    'cancelado_mutuo', 'cancelado_escalao_1', 'cancelado_escalao_2',
    'cancelado_escalao_3', 'cobranca_pendente', 'cobranca_incobravel',
    'cancelado_profissional',
    -- Fatia E (blindagem da fuga E)
    'captura_proposta',    -- janela de contestação aberta (aguarda o cliente)
    'em_disputa',          -- contestado/silêncio-sem-recibo → revisão humana (admin)
    'disputa_arquivada'    -- a arbitragem fechou sem cobrança (protegeu o cliente)
  ));

-- ----------------------------------------------------------------
-- 3) Finalidades novas nos magic links (040 → 045): 'comparencia' (prova de
--    encontro) + 'checkpoint_confirmar'/'checkpoint_contestar' (o aviso
--    pré-captura). Recria o CHECK com a lista completa.
-- ----------------------------------------------------------------
alter table public.magic_links_convite
  drop constraint if exists magic_links_convite_finalidade_check;
alter table public.magic_links_convite
  add constraint magic_links_convite_finalidade_check
  check (finalidade in (
    'rever','assinar','cartao','cancelar','repor_cartao','remarcar','avaliar',
    'comparencia','checkpoint_confirmar','checkpoint_contestar'
  ));

-- ----------------------------------------------------------------
-- 4) GUARDA ESTENDIDA — imutabilidade da prova (025 → 026 → 040 → 045).
--    Acrescenta-se: prova_encontro_em, uma vez cunhada, NUNCA se reescreve
--    (append-only da prova de co-presença, mesmo estatuto de contrato_hash /
--    assinado_em / mandato_aceite_em). O resto é IGUAL à 040.
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
    if old.mandato_aceite_em is not null
       and new.mandato_aceite_em is distinct from old.mandato_aceite_em then
      raise exception 'O aceite do mandato é imutável (append-only da prova).';
    end if;
    -- (045) A prova de co-presença é prova: uma vez cunhada, nunca se reescreve.
    if old.prova_encontro_em is not null
       and new.prova_encontro_em is distinct from old.prova_encontro_em then
      raise exception 'A prova de encontro é imutável (append-only da prova).';
    end if;
  end if;

  -- Reserva de escrita ao servidor (espelho da 005 — igual à 025/026/040).
  if auth.role() = 'service_role' or auth.uid() is null then
    return coalesce(new, old);  -- em DELETE o NEW é NULL
  end if;
  raise exception 'Escrita no contrato-convite reservada ao servidor.';
end;
$$;
-- (o trigger antes_convite_ciclo criado na 025 continua a apontar para esta função)

-- ----------------------------------------------------------------
-- 5) BUCKET dos anexos de contestação do CLIENTE (prova "compareci/paguei por
--    fora"). Privado — só service_role / URLs assinados. O upload em si (página
--    pública) fica como TODO desta fatia; o bucket existe já para o não doer
--    depois. NÃO confundir com o bucket 'contratos-convite' (anexos do P, 026).
-- ----------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('anexos-convite', 'anexos-convite', false)
on conflict (id) do nothing;
