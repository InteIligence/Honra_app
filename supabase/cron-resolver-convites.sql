-- ============================================================
-- HONRA — Agendar o resolver do CONTRATO-CONVITE (o relógio dos convites).
-- Função IRMÃ do resolver da caução: corre a Edge Function `resolver-convites`
-- uma vez por dia, 5 min depois da outra (não competem). Nesta fatia (A)
-- expira formulários sem resposta de P (>7 dias). As Fatias B–D acrescentam
-- expiração de assinatura, arme/retentativa de hold e checkpoint.
--
-- Correr UMA vez no SQL Editor do Supabase. Usa o MESMO RESOLVER_SECRET já
-- definido para o resolver-caucoes (a função valida-o no header).
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotente.
select cron.unschedule('honra-resolver-convites')
where exists (select 1 from cron.job where jobname = 'honra-resolver-convites');

-- Todos os dias às 09:05 UTC (logo a seguir ao resolver-caucoes).
select cron.schedule(
  'honra-resolver-convites',
  '5 9 * * *',
  $$
  select net.http_post(
    url     := 'https://haqynnhstjgzgtnnwqsi.supabase.co/functions/v1/resolver-convites',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-resolver-secret', '<RESOLVER_SECRET>'
               ),
    body    := '{}'::jsonb
  );
  $$
);
