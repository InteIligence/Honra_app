-- ============================================================
-- HONRA — Migração 025: CONTRATO-CONVITE (Fatia A — o convite sem dinheiro)
-- ------------------------------------------------------------
-- A variante do aperto de mão para quem NÃO tem conta Honra: o profissional
-- traz o cliente pelo Honra Card (link/QR), o cliente vê a prova, preenche um
-- formulário, e o profissional aceita/recusa. Zero dinheiro nesta fatia
-- (assinatura, cartão e holds vêm nas Fatias B–D).
--
-- Desenho formal: docs/DESENHO-CONTRATO-CONVITE.md (secções 4, 7, 13-Fatia A).
--
-- Três tabelas + guardas, espelhando a filosofia do motor 2-toques:
--   • clientes_convidados  — a pessoa sem conta (telefone EM CLARO — ver RGPD 7.2)
--   • contratos_convite    — o contrato e a sua máquina de estados
--   • eventos_convite      — a memória probatória, APPEND-ONLY (audit trail)
--
-- Invariantes já respeitadas nesta fatia:
--   • data do evento (data_inicio) NOT NULL — invariante legal (art. 17.º/1/k
--     DL 24/2014; ver doc 4.3). A BD recusa-a nula.
--   • o público NUNCA lê a BD diretamente — só via Edge Functions com token.
--   • dinheiro/estado só do servidor (guarda_ciclo_convite, espelho da 005).
--
-- Aditivo/idempotente. Correr DEPOIS da 024, no SQL Editor → Run.
-- (O check de estado já lista TODOS os estados do desenho — as Fatias B–F
--  não precisam de o alterar; só de escrever as transições novas.)
-- ============================================================

-- ----------------------------------------------------------------
-- 1) CLIENTES CONVIDADOS — a pessoa sem conta Honra.
--    ⚠️ Diferença deliberada face à 022 (que só guarda HASH do telefone de
--    quem tem conta): aqui o telefone em CLARO é necessário (enviar SMS,
--    identificar a parte no contrato, defender disputas). Base legal e
--    retenção distintas — NÃO misturar com as tabelas do motor (ver doc 7.2).
-- ----------------------------------------------------------------
create table if not exists public.clientes_convidados (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  telefone           text not null,           -- E.164, em claro (base legal art. 6(1)(b))
  email              text,                     -- opcional (canal de reserva)
  stripe_customer_id text,                     -- Fatia C (tokenização do cartão)
  criado_em          timestamptz not null default now()
);

-- Unicidade suave por telefone: o mesmo C em vários contratos = a mesma linha.
create unique index if not exists clientes_convidados_telefone_uidx
  on public.clientes_convidados (telefone);

-- ----------------------------------------------------------------
-- 2) CONTRATOS CONVITE — o contrato e a sua máquina de estados.
--    Colunas de dinheiro/assinatura/Stripe já existem (nullable) para as
--    Fatias B–D entrarem sem ALTER destrutivo — mas SÓ o subconjunto sem
--    dinheiro é usado nesta fatia.
-- ----------------------------------------------------------------
create table if not exists public.contratos_convite (
  id                  uuid primary key default gen_random_uuid(),

  -- Identidade
  profissional_id       uuid not null references public.perfis(id) on delete cascade,
  cliente_convidado_id  uuid not null references public.clientes_convidados(id) on delete cascade,
  token_publico         text not null,        -- token de leitura da página pública do C

  -- Negócio (do formulário)
  servico             text,
  data_inicio         date not null,          -- INVARIANTE LEGAL: data do evento obrigatória
  data_fim            date,                    -- evento multi-dia (doc 6.6)
  ancora_liquidacao   text not null default 'inicio'
                        check (ancora_liquidacao in ('inicio','fim')),
  valor_total         integer,                -- cêntimos (opcional — "valor se conhecido")
  moeda               text not null default 'EUR' check (moeda = 'EUR'),
  sinal_valor         integer,                -- o adiantamento fora do Honra (registado, nunca movido)

  -- Proteção — CONGELA no aceite e nunca muda (doc 4.3 / 6.7). Fatia A: nível 1.
  nivel_protecao      smallint not null default 1 check (nivel_protecao in (1,2,3)),
  pct_caucao          smallint not null default 25 check (pct_caucao between 10 and 30),
  pct_cancelamento    smallint not null default 12 check (pct_cancelamento between 10 and 15),
  janela_x_meses      smallint not null default 2 check (janela_x_meses >= 0),

  -- Contrato + mandato (Fatia B)
  contrato_texto      text,
  contrato_hash       text,
  mandato_texto       text,
  mandato_hash        text,

  -- Stripe — TODOS os objetos vivem na conta Connect de P (direct charges; doc 11.1)
  setup_intent_id     text,
  payment_method_id   text,
  hold_id             text,
  cobranca_id         text,
  stripe_account_id   text,

  -- Avisos legais (Fatia B) — a assinatura é recusada enquanto forem nulos
  aviso_resolucao_aceite_em  timestamptz,      -- art. 4.º/1/p DL 24/2014
  politica_cancel_aceite_em  timestamptz,      -- click-to-accept da política (regra Visa)

  -- Máquina de estados (ver doc 4.2 — lista completa, aditiva para as Fatias B–F)
  estado              text not null default 'formulario_recebido'
                        check (estado in (
                          -- Fatia A (subconjunto sem dinheiro)
                          'formulario_recebido', 'recusado', 'formulario_expirado',
                          'aguarda_assinatura',
                          -- Fatias B–F (ainda não transacionados por código)
                          'assinatura_expirada', 'assinado', 'caucionado', 'cartao_falhou',
                          'sem_caucao', 'honrado', 'incumprido_cliente', 'incumprido_profissional',
                          'cancelado_mutuo', 'cancelado_escalao_1', 'cancelado_escalao_2',
                          'cancelado_escalao_3', 'cobranca_pendente', 'cobranca_incobravel',
                          'cancelado_profissional'
                        )),
  quem_falhou         text check (quem_falhou is null or quem_falhou in ('cliente','profissional')),
  motivo_cancelamento text,

  -- Anti-spam / evidência da submissão (IP em claro só para rate-limit + defesa)
  ip_submissao        text,

  -- Relógio
  formulario_em       timestamptz not null default now(),
  aceite_em           timestamptz,
  assinado_em         timestamptz,
  cartao_gravado_em   timestamptz,
  hold_armado_em      timestamptz,
  checkpoint_em       timestamptz,
  resolvido_em        timestamptz,

  criado_em           timestamptz not null default now()
);

create unique index if not exists contratos_convite_token_uidx
  on public.contratos_convite (token_publico);
create index if not exists contratos_convite_profissional_idx
  on public.contratos_convite (profissional_id, estado, criado_em desc);
-- Para o resolver varrer formulários por expirar depressa.
create index if not exists contratos_convite_estado_formulario_idx
  on public.contratos_convite (estado, formulario_em);

-- ----------------------------------------------------------------
-- 3) EVENTOS CONVITE — a memória probatória. APPEND-ONLY, só service_role.
--    É daqui que sai o pacote de evidência de chargeback (Fatia F) e a linha
--    do tempo. Nesta fatia guarda: formulario, aceite, recusa, expiracao.
-- ----------------------------------------------------------------
create table if not exists public.eventos_convite (
  id           uuid primary key default gen_random_uuid(),
  contrato_id  uuid not null references public.contratos_convite(id) on delete cascade,
  tipo         text not null,   -- formulario|aceite|recusa|expiracao|sms_enviado|otp_ok|assinatura|…
  ip           text,
  user_agent   text,
  payload      jsonb,
  criado_em    timestamptz not null default now()
);
create index if not exists eventos_convite_contrato_idx
  on public.eventos_convite (contrato_id, criado_em);

-- ----------------------------------------------------------------
-- 4) RLS
--    • clientes_convidados: P vê o C SÓ se houver um contrato que os liga
--      (é parte do contrato — interesse legítimo). Escrita: só servidor.
--    • contratos_convite: P vê/lista os SEUS. Escrita: só servidor.
--    • eventos_convite: ninguém lê pelo cliente (sem policies) — só service_role.
--    O convidado NUNCA toca na BD: fala apenas com Edge Functions públicas.
-- ----------------------------------------------------------------
alter table public.clientes_convidados enable row level security;
drop policy if exists "convidado_visivel_ao_profissional" on public.clientes_convidados;
create policy "convidado_visivel_ao_profissional" on public.clientes_convidados
  for select using (
    exists (
      select 1 from public.contratos_convite c
      where c.cliente_convidado_id = clientes_convidados.id
        and c.profissional_id = auth.uid()
    )
  );

alter table public.contratos_convite enable row level security;
drop policy if exists "convite_dono_ve" on public.contratos_convite;
create policy "convite_dono_ve" on public.contratos_convite
  for select using (auth.uid() = profissional_id);
-- Sem policies de insert/update/delete: escrever é EXCLUSIVO do servidor
-- (service_role passa ao lado do RLS). O guarda abaixo é defesa-em-profundidade.

alter table public.eventos_convite enable row level security;
-- Sem policies: o audit trail só se lê/escreve com service_role.

-- ----------------------------------------------------------------
-- 5) GUARDA DE INTEGRIDADE — espelho da guarda_ciclo_caucao (005).
--    O contrato-convite move (nas fatias seguintes) dinheiro real. Reserva-se
--    TODA a escrita ao servidor: reconhece-se o servidor por service_role OU
--    ausência de auth.uid() (um cliente autenticado nunca chega aqui sem uid,
--    porque não há policy de escrita que o deixe). Assim o resolver e as Edge
--    Functions confiam nos timestamps — só o servidor os escreve.
-- ----------------------------------------------------------------
create or replace function public.guarda_ciclo_convite()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null then
    -- coalesce: em DELETE o NEW é NULL (devolver NULL cancelaria o apagamento).
    return coalesce(new, old);
  end if;
  -- Qualquer escrita de um cliente é recusada: o ciclo é todo do servidor.
  raise exception 'Escrita no contrato-convite reservada ao servidor.';
end;
$$;

drop trigger if exists antes_convite_ciclo on public.contratos_convite;
create trigger antes_convite_ciclo
  before insert or update or delete on public.contratos_convite
  for each row execute function public.guarda_ciclo_convite();

-- ----------------------------------------------------------------
-- 6) APPEND-ONLY — um evento NUNCA se altera. Apagar só o servidor pode, e só
--    para a limpeza de retenção (RGPD, Fatia F) ou o cascade de apagamento do
--    contrato — nunca um cliente. Assim o audit trail é imutável durante a sua
--    vida, mas a minimização (doc 7.2) continua possível pelo servidor.
-- ----------------------------------------------------------------
create or replace function public.eventos_convite_imutavel()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'eventos_convite é append-only (não se altera um evento).';
  end if;
  -- DELETE: só o servidor (retenção/cascade). Cliente nunca apaga evidência.
  if auth.role() = 'service_role' or auth.uid() is null then
    return old;
  end if;
  raise exception 'Apagar evidência do convite é reservado ao servidor.';
end;
$$;

drop trigger if exists eventos_convite_sem_update on public.eventos_convite;
create trigger eventos_convite_sem_update
  before update or delete on public.eventos_convite
  for each row execute function public.eventos_convite_imutavel();

-- ----------------------------------------------------------------
-- 7) AVISOS a P — o convidado não tem sino; TODAS as transições avisam P.
--    Reutiliza-se a gaveta `notificacoes` do motor, com uma referência nova
--    ao contrato-convite (nullable — não parte o `orcamento_id` existente).
-- ----------------------------------------------------------------
alter table public.notificacoes
  add column if not exists contrato_convite_id uuid
    references public.contratos_convite(id) on delete cascade;

create or replace function public.criar_aviso_convite(
  p_perfil uuid, p_tipo text, p_contrato uuid,
  p_titulo text, p_corpo text, p_prazo timestamptz, p_urgente boolean
) returns void
language sql
security definer set search_path = public
as $$
  insert into public.notificacoes
    (perfil_id, tipo, contrato_convite_id, titulo, corpo, prazo, urgente)
  values (p_perfil, p_tipo, p_contrato, p_titulo, p_corpo, p_prazo, p_urgente);
$$;

-- O trigger: cada momento do ciclo do convite → um aviso para P.
create or replace function public.notificar_convite()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  nome_c text;
begin
  select nome into nome_c from public.clientes_convidados
    where id = new.cliente_convidado_id;

  -- Novo pedido (insert) → avisa P para responder (janela de 7 dias).
  if tg_op = 'INSERT' then
    if new.estado = 'formulario_recebido' then
      perform public.criar_aviso_convite(
        new.profissional_id, 'convite_novo', new.id,
        'Novo pedido por convite',
        'De ' || coalesce(nome_c, 'alguém') || '. Vê os detalhes e responde.',
        new.formulario_em + interval '7 days', true);
    end if;
    return new;
  end if;

  -- Transições de estado (update).
  if new.estado is distinct from old.estado then
    if new.estado = 'formulario_expirado' then
      perform public.criar_aviso_convite(
        new.profissional_id, 'convite_expirado', new.id,
        'Convite expirou',
        'Não respondeste a tempo ao pedido de ' || coalesce(nome_c, 'um cliente') || '. Nada foi guardado.',
        null, false);
    end if;
    -- 'recusado' e 'aguarda_assinatura' são AÇÕES do próprio P — não geram
    -- aviso (P já sabe). As transições com dinheiro das Fatias B–F ganham
    -- os seus avisos quando forem construídas.
  end if;

  return new;
end;
$$;

drop trigger if exists apos_convite_notifica on public.contratos_convite;
create trigger apos_convite_notifica
  after insert or update on public.contratos_convite
  for each row execute function public.notificar_convite();
