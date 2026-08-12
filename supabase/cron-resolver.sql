-- ============================================================
-- HONRA — Agendar o resolver da caução (o relógio do aperto de mão).
-- Corre a função Edge `resolver-caucoes` uma vez por dia. Ela liberta os
-- holds de quem honrou, captura o 2€ de quem fugiu e marca — tudo DENTRO
-- dos 7 dias do hold (por isso disparamos cedo, ~dia 6).
--
-- Correr UMA vez no SQL Editor do Supabase. Antes:
--   1) definir o segredo RESOLVER_SECRET na função (Dashboard → Edge Functions
--      → resolver-caucoes → Secrets), OU via CLI:
--        npx supabase secrets set RESOLVER_SECRET=<uma-frase-longa-aleatoria>
--   2) trocar <RESOLVER_SECRET> abaixo pela MESMA frase.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remover agendamento anterior com o mesmo nome (idempotente).
select cron.unschedule('honra-resolver-caucoes')
where exists (select 1 from cron.job where jobname = 'honra-resolver-caucoes');

-- Todos os dias às 09:00 UTC.
select cron.schedule(
  'honra-resolver-caucoes',
  '0 9 * * *',
  $$
  select net.http_post(
    url     := 'https://haqynnhstjgzgtnnwqsi.supabase.co/functions/v1/resolver-caucoes',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-resolver-secret', '<RESOLVER_SECRET>'
               ),
    body    := '{}'::jsonb
  );
  $$
);

-- Ver os agendamentos:
--   select jobname, schedule, active from cron.job;
-- Ver as últimas corridas:
--   select * from cron.job_run_details order by start_time desc limit 10;
