-- ============================================================
-- HONRA — Migração 022: SELO "CONTACTO" (telemóvel verificado por OTP)
-- ------------------------------------------------------------
-- Acende a 4ª aba do selo — "Contacto" — provando que a pessoa controla um
-- número. Guardamos só o HASH do número (E.164), nunca o número em claro
-- (minimização RGPD + dedupe). Um número = uma conta (o hash é único). A escrita
-- é SÓ do servidor (a Edge Function `confirmar-contacto`, com service_role, depois
-- de o Bird devolver `verified`); o cliente NUNCA se auto-verifica (é o fosso).
--
-- Fornecedor de OTP: Bird (Amesterdão) — decisão 12/07. Correr DEPOIS da 021.
-- ============================================================

create table if not exists public.contactos_verificados (
  perfil_id      uuid primary key references public.perfis(id) on delete cascade,
  telefone_hash  text not null unique,               -- SHA-256 do E.164 (nunca o nº)
  verificado_em  timestamptz not null default now()
);

alter table public.contactos_verificados enable row level security;

-- O dono vê o SEU (para a app saber que já verificou). Ninguém insere/edita pelo
-- cliente — só o servidor (service_role ignora o RLS). Sem policy de insert/update
-- de propósito: a auto-verificação fica impossível, como na identidade.
drop policy if exists "contacto_dono_ve" on public.contactos_verificados;
create policy "contacto_dono_ve" on public.contactos_verificados
  for select using (auth.uid() = perfil_id);
