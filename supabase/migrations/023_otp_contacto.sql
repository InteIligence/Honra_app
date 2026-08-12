-- ============================================================
-- HONRA — Migração 023: OTP do Contacto (nós geramos e validamos o código)
-- ------------------------------------------------------------
-- A API do Bird (eu1.platform.bird.com/v1/sms/messages) só ENVIA um SMS com um
-- template onde NÓS pomos o código. Portanto o ciclo do OTP é nosso: gerar →
-- guardar (hash + validade + tentativas) → enviar → validar. Uma linha por
-- utilizador (o novo pedido substitui o anterior). SÓ o servidor mexe aqui
-- (service_role) — o cliente nunca vê nem escreve o código.
--
-- Correr DEPOIS da 022.
-- ============================================================

create table if not exists public.otp_contacto (
  perfil_id    uuid primary key references public.perfis(id) on delete cascade,
  telefone     text not null,               -- E.164 (só em memória curta; a linha é efémera)
  codigo_hash  text not null,               -- SHA-256 do código (nunca o código)
  expira_em    timestamptz not null,        -- ~10 min
  tentativas   int not null default 0,       -- trava força-bruta
  enviado_em   timestamptz not null default now()  -- rate-limit de reenvio
);

-- RLS ligado e SEM policies → só o service_role (as Edge Functions) lê/escreve.
alter table public.otp_contacto enable row level security;
