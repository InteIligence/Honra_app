-- ============================================================
-- HONRA — Migração 073: QUEM CONTA É O SERVIDOR
-- ------------------------------------------------------------
-- A 070 criou `orcamentos.pedido_a_n` para cumprir a decisão de 30/07: pedir
-- orçamento a várias pessoas não tem teto, mas o NÚMERO ANDA À VISTA — quem
-- recebe sabe a quantos foi pedido antes de gastar tempo a responder.
--
-- O buraco: esse número era calculado no browser (`marcadosLista.length`) e
-- enviado pelo cliente. Ou seja, o único travão contra a lead-mill estava
-- entregue a quem devia ser travado. Bastava pedir a vinte pessoas e gravar 1
-- para que as vinte se julgassem únicas — a lead-mill a entrar pela janela que
-- fechámos à porta.
--
-- Agora quem conta é o servidor, e conta o que aconteceu de facto: um gatilho
-- ao nível da INSTRUÇÃO vê todas as linhas nascidas no mesmo insert e carimba
-- a contagem real por cima do que o cliente tiver mandado. Não há como mentir
-- porque não há nada a pedir ao cliente — o número deixa de ser uma declaração
-- e passa a ser uma observação.
--
-- Semântica final (mais simples que a da 070): carimba-se SEMPRE.
--   1  = pedido individual  → a UI não mostra número nenhum
--   >1 = pedido em lote     → a UI mostra "pediste a N"
-- É mais honesto do que o NULL: uma linha sem número deixava de se distinguir
-- entre "foi individual" e "nasceu antes desta migração".
--
-- Correr DEPOIS da 072.
-- ============================================================

create or replace function public.carimbar_pedido_a_n()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Conta as linhas do MESMO insert, por remetente: se alguém inserir em nome
  -- de dois remetentes na mesma instrução (não acontece hoje, mas o servidor
  -- não deve assumir boa-fé), cada um leva a sua contagem.
  update public.orcamentos o
     set pedido_a_n = c.n
    from (
      select de_perfil, count(*)::smallint as n
        from novas
       group by de_perfil
    ) c
   where o.de_perfil = c.de_perfil
     and o.id in (select id from novas);
  return null;
end;
$$;

comment on function public.carimbar_pedido_a_n() is
  'Carimba orcamentos.pedido_a_n com a contagem REAL das linhas do mesmo insert. O cliente não decide este número — só o observa.';

drop trigger if exists orcamentos_carimba_pedido_a_n on public.orcamentos;
create trigger orcamentos_carimba_pedido_a_n
after insert on public.orcamentos
referencing new table as novas
for each statement
execute function public.carimbar_pedido_a_n();

-- A função é chamada pelo gatilho, nunca por RPC. Fechada por omissão — a
-- lição da 072: uma intenção em comentário não é uma permissão.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'carimbar_pedido_a_n'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
