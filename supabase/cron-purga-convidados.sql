-- ============================================================
-- HONRA — Agendar a purga RGPD de convidados (064 · #9).
-- Chama a função de BD `purgar_convidados_expirados()` uma vez por dia. Como é
-- uma função da própria base (não uma Edge Function), o cron chama-a DIRETO —
-- sem http_post, sem segredo. Apaga convidados SEM contrato vivo + OTPs + eventos
-- de convite antigos (retenção por omissão: 180 dias). Nunca toca em quem tem
-- contrato/disputa a decorrer.
--
-- Correr UMA vez no SQL Editor.
-- ============================================================

create extension if not exists pg_cron;

select cron.unschedule('honra-purga-convidados')
where exists (select 1 from cron.job where jobname = 'honra-purga-convidados');

-- Todos os dias às 03:30 UTC (fora das horas de pico).
select cron.schedule(
  'honra-purga-convidados',
  '30 3 * * *',
  $$ select public.purgar_convidados_expirados(180); $$
);
