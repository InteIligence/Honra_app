-- ============================================================
-- HONRA — Migração 008: PUSH (fase 2 dos avisos)
-- ------------------------------------------------------------
-- A fase 1 (006) acende o sino DENTRO da app (realtime). Isto é a camada que
-- chega a quem NÃO tem a app aberta: quando nasce um aviso em `notificacoes`,
-- um trigger empurra-o para a Edge Function `enviar-push`, que fala com a Expo
-- Push API e entrega a notificação ao telemóvel.
--
-- Princípio: o push é o MESMO aviso, só que entregue mais longe. Não é uma
-- feature à parte — é o reflexo do mesmo momento do ciclo, agora fora da app.
--
-- Segurança/robustez: o disparo corre security definer e nunca rebenta o insert
-- do aviso (se a rede/função falhar, o aviso IN-APP fica na mesma — o push é
-- best-effort). Segue o padrão do resolver: o segredo vai no SQL (placeholder
-- <PUSH_SECRET>), porque o Postgres não tem env próprio.
--
-- Precisa de pg_net (já ativo, o cron do resolver usa-o).
-- Correr no SQL Editor DEPOIS da 006. ANTES: trocar <PUSH_SECRET> pela mesma
-- frase posta como segredo da função (ver ACORDAR.md, secção PUSH).
-- ============================================================

create extension if not exists pg_net;

-- ----------------------------------------------------------------
-- 1) GAVETA: push_tokens — o "endereço" do telemóvel de cada perfil.
--    Um perfil pode ter vários (telemóvel + tablet). O token é único: se o
--    mesmo aparelho reinstalar, faz upsert por token.
-- ----------------------------------------------------------------
create table if not exists public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references public.perfis(id) on delete cascade,
  token      text not null unique,          -- ExponentPushToken[...]
  plataforma text,                          -- ios | android | web
  criado_em  timestamptz not null default now()
);

create index if not exists push_tokens_perfil_idx
  on public.push_tokens (perfil_id);

-- ----------------------------------------------------------------
-- 2) RLS — cada um só mexe nos SEUS tokens. O envio é do servidor (a Edge
--    Function corre com service_role e ignora o RLS para ler os tokens do
--    destinatário).
-- ----------------------------------------------------------------
alter table public.push_tokens enable row level security;

drop policy if exists "push_dono_ve" on public.push_tokens;
create policy "push_dono_ve" on public.push_tokens
  for select using (auth.uid() = perfil_id);

drop policy if exists "push_dono_insere" on public.push_tokens;
create policy "push_dono_insere" on public.push_tokens
  for insert with check (auth.uid() = perfil_id);

drop policy if exists "push_dono_atualiza" on public.push_tokens;
create policy "push_dono_atualiza" on public.push_tokens
  for update using (auth.uid() = perfil_id) with check (auth.uid() = perfil_id);

drop policy if exists "push_dono_apaga" on public.push_tokens;
create policy "push_dono_apaga" on public.push_tokens
  for delete using (auth.uid() = perfil_id);

-- ----------------------------------------------------------------
-- 3) O DISPARO — a cada aviso novo, chama a Edge Function `enviar-push`.
--    Best-effort: envolto em begin/exception para NUNCA rebentar o insert do
--    aviso (o aviso in-app é sagrado; o push é um bónus que pode falhar).
--    net.http_post é assíncrono (não bloqueia o insert à espera da resposta).
-- ----------------------------------------------------------------
create or replace function public.push_ao_avisar()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  begin
    perform net.http_post(
      url     := 'https://haqynnhstjgzgtnnwqsi.supabase.co/functions/v1/enviar-push',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-push-secret', '<PUSH_SECRET>'
                 ),
      body    := jsonb_build_object('notificacao_id', new.id)
    );
  exception when others then
    -- Rede/extensão em baixo? O aviso in-app fica na mesma. Não propaga o erro.
    null;
  end;
  return new;
end;
$$;

drop trigger if exists after_notificacao_push on public.notificacoes;
create trigger after_notificacao_push
  after insert on public.notificacoes
  for each row execute function public.push_ao_avisar();
