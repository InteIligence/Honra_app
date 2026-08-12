-- ============================================================
-- HONRA — Migração 026: CONTRATO-CONVITE (Fatia B — contrato + assinatura OTP)
-- ------------------------------------------------------------
-- Fecha o NÍVEL i (só contrato assinado — sem cartão/hold). O profissional
-- aceita (Fatia A) → gera-se o TEXTO do contrato + o seu SHA-256 → o convidado
-- volta pelo magic link, lê, aceita explicitamente os dois avisos legais e
-- assina com um OTP por SMS. Zero dinheiro nesta fatia (SetupIntent/cartão são
-- da Fatia C).
--
-- Desenho: docs/DESENHO-CONTRATO-CONVITE.md (§4, §6.10, §7, §13-Fatia B) e as
-- INVARIANTES LEGAIS (§4.3): a assinatura é RECUSADA enquanto o aviso de
-- não-resolução (art. 4.º/1/p DL 24/2014) e a política de cancelamento (regra
-- Visa "properly disclosed") não forem aceites com carimbo.
--
-- "O link identifica; só o OTP autentica" (§6.10): um link morto renasce
-- (gera-se um novo) — mas agir (assinar) exige sempre link válido + OTP fresco.
--
-- Tudo ADITIVO/idempotente (create/add ... if not exists). Correr DEPOIS da 025.
-- NÃO altera de forma destrutiva nada da Fatia A.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) COLUNAS NOVAS em contratos_convite.
--    A 025 já criou contrato_texto, contrato_hash, mandato_*, os dois
--    aviso/politica_*_aceite_em e assinado_em. Aqui só acrescentamos o que
--    faltava para a geração/carimbo do texto e o gancho do selo temporal.
-- ----------------------------------------------------------------
alter table public.contratos_convite
  add column if not exists contrato_versao    text,        -- versão do modelo (ex.: 'convite-v1')
  add column if not exists contrato_gerado_em timestamptz, -- carimbo NOSSO do momento em que o hash foi fixado
  add column if not exists selo_temporal      jsonb;       -- gancho RFC 3161 (QTSP) — null por agora (ver TODO nas funções)

-- ----------------------------------------------------------------
-- 2) MAGIC LINKS — o token que traz o convidado de volta para AGIR.
--    Guarda-se só o HASH do token (nunca o token em claro — padrão da 023).
--    Uso: 'assinar' nesta fatia; as restantes finalidades ficam prontas para
--    C–F. Um link expira (72h) ou gasta-se (usado_em) — e pode RENASCER (nova
--    linha) sem tocar no contrato. RLS sem policies → só service_role.
-- ----------------------------------------------------------------
create table if not exists public.magic_links_convite (
  id           uuid primary key default gen_random_uuid(),
  token_hash   text not null unique,                 -- SHA-256 do token (o token só existe no SMS/URL)
  contrato_id  uuid not null references public.contratos_convite(id) on delete cascade,
  finalidade   text not null check (finalidade in
                 ('rever','assinar','cancelar','repor_cartao','remarcar','avaliar')),
  expira_em    timestamptz not null,
  usado_em     timestamptz,                          -- gasto ao AGIR (assinar) — null enquanto vivo
  criado_em    timestamptz not null default now()
);
create index if not exists magic_links_convite_contrato_idx
  on public.magic_links_convite (contrato_id, finalidade, criado_em desc);

alter table public.magic_links_convite enable row level security;
-- Sem policies: só o servidor cria/valida/gasta os links.

-- ----------------------------------------------------------------
-- 3) OTP DO CONVIDADO — o código que NÓS geramos e validamos (Bird só envia).
--    Tabela IRMÃ da otp_contacto (023), mas keyed pelo CONTRATO (o convidado não
--    tem perfil) — um OTP vivo por contrato. Guarda cliente+telefone para o SMS
--    e a defesa. Mesmo padrão: hash + validade + tentativas + rate-limit.
--    RLS sem policies → só service_role.
-- ----------------------------------------------------------------
create table if not exists public.otp_convidado (
  contrato_id           uuid primary key references public.contratos_convite(id) on delete cascade,
  cliente_convidado_id  uuid not null references public.clientes_convidados(id) on delete cascade,
  telefone              text not null,               -- E.164, em claro (é para lá que o SMS vai)
  codigo_hash           text not null,               -- SHA-256 do código (nunca o código)
  expira_em             timestamptz not null,        -- ~10 min
  tentativas            int not null default 0,       -- trava força-bruta
  enviado_em            timestamptz not null default now()  -- rate-limit de reenvio (45s)
);

alter table public.otp_convidado enable row level security;
-- Sem policies: só o servidor lê/escreve o OTP.

-- ----------------------------------------------------------------
-- 4) ANEXOS DO CONVITE — gancho: o freelancer anexa o SEU contrato/documento e
--    o Honra REGISTA existência + integridade (sha256 + carimbo), NUNCA o
--    interpreta nem garante o conteúdo (doc §7.1, §10). O upload em si (bucket
--    privado + hash na hora) fica como TODO da Fatia B+ — a tabela existe já
--    para o texto do contrato os poder referenciar por nome+hash+carimbo.
-- ----------------------------------------------------------------
create table if not exists public.anexos_convite (
  id            uuid primary key default gen_random_uuid(),
  contrato_id   uuid not null references public.contratos_convite(id) on delete cascade,
  nome_ficheiro text not null,
  sha256        text not null,                        -- integridade
  tamanho       bigint,
  storage_path  text,                                 -- bucket privado 'contratos-convite' (TODO)
  criado_em     timestamptz not null default now()    -- o carimbo temporal
);
create index if not exists anexos_convite_contrato_idx
  on public.anexos_convite (contrato_id, criado_em);

alter table public.anexos_convite enable row level security;
drop policy if exists "anexos_visiveis_ao_profissional" on public.anexos_convite;
create policy "anexos_visiveis_ao_profissional" on public.anexos_convite
  for select using (
    exists (
      select 1 from public.contratos_convite c
      where c.id = anexos_convite.contrato_id
        and c.profissional_id = auth.uid()
    )
  );
-- Escrita só do servidor (regista o hash na hora do upload).

-- ----------------------------------------------------------------
-- 5) GUARDA ESTENDIDA — imutabilidade da PROVA assinada.
--    A 025 já reserva toda a escrita ao servidor. Aqui acrescenta-se uma
--    invariante de audit trail: uma vez fixados, o HASH do contrato e o
--    MOMENTO da assinatura NUNCA se reescrevem — nem pelo próprio servidor
--    (append-only do que sustenta a assinatura eletrónica simples; doc §4.4,
--    §10). Permite-se apenas NULL → valor (a geração e a assinatura); nunca
--    valor → outro-valor. As transições de estado seguintes (Fatias C–F)
--    continuam livres.
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
  end if;

  -- Reserva de escrita ao servidor (espelho da 005 — igual à 025).
  if auth.role() = 'service_role' or auth.uid() is null then
    return coalesce(new, old);  -- em DELETE o NEW é NULL
  end if;
  raise exception 'Escrita no contrato-convite reservada ao servidor.';
end;
$$;
-- (o trigger antes_convite_ciclo criado na 025 continua a apontar para esta função)

-- ----------------------------------------------------------------
-- 6) LIMPEZA de OTPs expirados — higiene (não é crítico; o servidor apaga o OTP
--    usado/expirado nas próprias funções). Índice para o resolver/limpeza varrer.
-- ----------------------------------------------------------------
create index if not exists otp_convidado_expira_idx
  on public.otp_convidado (expira_em);
create index if not exists magic_links_convite_expira_idx
  on public.magic_links_convite (expira_em) where usado_em is null;
