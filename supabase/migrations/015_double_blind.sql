-- ============================================================
-- HONRA — Migração 015: AVALIAÇÃO ÀS CEGAS (double-blind)
-- ------------------------------------------------------------
-- Contra a retaliação (o pior das reviews do "resto do mundo"): cada parte
-- avalia a outra, mas NENHUMA se revela até AMBAS estarem submetidas — ou até
-- passar uma janela de 14 dias. Só as reveladas contam para o índice e são
-- públicas. Ninguém avalia a reagir à nota do outro.
--
-- Correr no SQL Editor DEPOIS da 014.
-- ============================================================

-- 1) Coluna de revelação (null = ainda oculta).
alter table public.avaliacoes
  add column if not exists revelado_em timestamptz;

-- Reviews que já existiam eram públicas → revela-as (não se esconde o passado).
update public.avaliacoes set revelado_em = criado_em where revelado_em is null;

-- 2) VISIBILIDADE: pública só quando revelada; o AUTOR vê sempre a sua (para
--    saber que submeteu). O avaliado NÃO a vê até ser revelada.
drop policy if exists "avaliacoes_leitura_publica" on public.avaliacoes;
create policy "avaliacoes_leitura_publica" on public.avaliacoes
  for select using (revelado_em is not null or auth.uid() = de_perfil);

-- 3) REVELAÇÃO por reciprocidade: quando entra a 2.ª avaliação de um orçamento,
--    revela AMBAS. (security definer → escreve apesar do RLS.)
create or replace function public.revelar_avaliacoes()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (
    select 1 from public.avaliacoes a
    where a.orcamento_id = new.orcamento_id
      and a.de_perfil is distinct from new.de_perfil
  ) then
    update public.avaliacoes
       set revelado_em = now()
     where orcamento_id = new.orcamento_id and revelado_em is null;
  end if;
  return new;
end;
$$;

drop trigger if exists after_avaliacao_revela on public.avaliacoes;
create trigger after_avaliacao_revela
  after insert on public.avaliacoes
  for each row execute function public.revelar_avaliacoes();

-- 4) ÍNDICE conta só as REVELADAS. Recalcula no insert E quando se revela.
--    (Mantém a flag honra.sistema para passar a guarda_perfil da 010.)
create or replace function public.recalc_indice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('honra.sistema', '1', true);
  update public.perfis
     set indice_confianca = (
       select coalesce(avg(nota), 0)
       from public.avaliacoes
       where para_perfil = new.para_perfil and revelado_em is not null
     )
   where id = new.para_perfil;
  return new;
end; $$;

drop trigger if exists after_avaliacao_insere on public.avaliacoes;
create trigger after_avaliacao_insere
  after insert or update on public.avaliacoes
  for each row execute function public.recalc_indice();

-- 5) REVELAÇÃO por prazo: passados 14 dias, revela as que ficaram penduradas
--    (o outro lado nunca avaliou). pg_cron diário.
select cron.unschedule('honra-revelar-avaliacoes')
where exists (select 1 from cron.job where jobname = 'honra-revelar-avaliacoes');

select cron.schedule(
  'honra-revelar-avaliacoes',
  '30 9 * * *',
  $$ update public.avaliacoes set revelado_em = now()
     where revelado_em is null and criado_em < now() - interval '14 days'; $$
);
