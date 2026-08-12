-- ============================================================
-- HONRA — Migração 004: GUARDAS + FECHO DO CICLO (caução devolvível)
-- Duas coisas, uma migração:
--   1) Guarda "só verificados aceitam": quem aceita um orçamento tem
--      de ter a identidade verificada (a caução não chega, a honra começa
--      na identidade real).
--   2) Fecho do ciclo da caução: novo estado 'devolvido' + a coluna
--      pagamento_id (o payment_intent do Stripe) para poder devolver os 2€
--      quando o cliente confirma a conclusão.
-- Máquina de estados final:
--   pedido → aceite → confirmado_ambos (caução paga)
--          → concluido (freelancer marcou) → devolvido (cliente confirmou
--            + caução devolvida).   (recusado é ramo à parte.)
-- Correr no Supabase: painel → SQL Editor → colar tudo → Run.
-- (Aditivo: correr DEPOIS da 003. Não parte nada do que já existe.)
-- ============================================================

-- ----------------------------------------------------------------
-- 1) COLUNA pagamento_id  (guarda o payment_intent do Stripe)
--    Sem isto não há como devolver a caução mais tarde.
-- ----------------------------------------------------------------
alter table public.orcamentos
  add column if not exists pagamento_id text;

-- ----------------------------------------------------------------
-- 2) NOVO ESTADO 'devolvido'  (recria o check com todos os estados)
-- ----------------------------------------------------------------
alter table public.orcamentos
  drop constraint if exists orcamentos_estado_check;

alter table public.orcamentos
  add constraint orcamentos_estado_check
  check (estado in (
    'pedido',
    'aceite',
    'em_curso',
    'concluido',
    'confirmado_ambos',
    'recusado',
    'devolvido'
  ));

-- ----------------------------------------------------------------
-- 3) GUARDA "só verificados aceitam"
--    Trigger BEFORE UPDATE: se o orçamento passa a 'aceite', quem aceita
--    (para_perfil) tem de ter a aba 'identidade' verificada. Senão, pára.
--    security definer → o trigger lê verificacoes mesmo com RLS ligado.
-- ----------------------------------------------------------------
create or replace function public.guarda_aceita_verificado()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.estado = 'aceite' and old.estado is distinct from 'aceite' then
    if not exists (
      select 1
      from public.verificacoes v
      where v.perfil_id = new.para_perfil
        and v.aba = 'identidade'
        and v.estado = 'verificado'
    ) then
      raise exception 'Precisas de verificar a identidade para aceitar orçamentos.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists before_orcamento_aceita on public.orcamentos;
create trigger before_orcamento_aceita
  before update on public.orcamentos
  for each row execute function public.guarda_aceita_verificado();

-- ----------------------------------------------------------------
-- 4) AVALIAÇÃO continua possível depois de 'devolvido'
--    Reescreve a policy de insert para incluir o novo estado final.
--    (Sem isto, avaliar um orçamento já devolvido ficaria bloqueado.)
-- ----------------------------------------------------------------
drop policy if exists "avaliacoes_insere_com_prova" on public.avaliacoes;
create policy "avaliacoes_insere_com_prova" on public.avaliacoes
  for insert with check (
    auth.uid() = de_perfil
    and exists (
      select 1
      from public.orcamentos o
      where o.id = avaliacoes.orcamento_id
        and o.estado in ('concluido', 'confirmado_ambos', 'devolvido')
        and (
          (o.de_perfil = auth.uid()   and o.para_perfil = avaliacoes.para_perfil)
          or
          (o.para_perfil = auth.uid() and o.de_perfil   = avaliacoes.para_perfil)
        )
    )
  );
