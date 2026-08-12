-- ============================================================
-- HONRA — Migração 067: ÚLTIMO HONRADO (a recência na montra)
-- ------------------------------------------------------------
-- Pedido do Vítor (28/07): na pesquisa, dizer "há quanto tempo teve o último
-- honrado". A reputação do Honra é VIVA — recência conta uma história que o
-- acumulado esconde ("12 honrados, o último há 2 anos" ≠ "3, o último ontem").
--
-- Desenho: coluna `perfis.ultimo_honrado_em`, carimbada pelo MESMO trigger que
-- já conta os honrados (atualizar_contadores_honra, 048) — nasce e vive no
-- servidor, nunca na mão do cliente (a guarda_perfil já proíbe o dono de mexer
-- em colunas de reputação). Backfill honesto a partir dos negócios reais.
--
-- Correr DEPOIS da 066. (A 066 tornou os GRANTs de perfis por-coluna e
-- fail-closed — por isso esta coluna PÚBLICA tem de entrar no grant aqui.)
-- ============================================================

-- 1) A coluna (parte da montra pública — ver grant no fim).
alter table public.perfis
  add column if not exists ultimo_honrado_em timestamptz;

comment on column public.perfis.ultimo_honrado_em is
  'Carimbo do último negócio honrado (qualquer lado). Escrito SÓ pelo servidor (trigger 048/067). Montra pública — a recência é sinal de reputação viva.';

-- 2) O trigger da 048, RECRIADO FIEL (selado/honrado/cancelado/incumprido +
--    registar_infracao) com UMA adição: o carimbo da recência no ramo honrado.
create or replace function public.atualizar_contadores_honra()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.estado = 'selado' and old.estado is distinct from 'selado' then
    update public.perfis set apertos_selados = apertos_selados + 1
      where id in (new.de_perfil, new.para_perfil);
  elsif new.estado = 'honrado' and old.estado is distinct from 'honrado' then
    update public.perfis
       set negocios_honrados = negocios_honrados + 1,
           ultimo_honrado_em = now()                          -- (067) a recência
      where id in (new.de_perfil, new.para_perfil);
  elsif new.estado = 'cancelado' and old.estado is distinct from 'cancelado' then
    update public.perfis set cancelados_mutuo = cancelados_mutuo + 1
      where id in (new.de_perfil, new.para_perfil);
  elsif new.estado = 'incumprido' and old.estado is distinct from 'incumprido' then
    if new.quem_falhou in ('a', 'ambos') then
      update public.perfis set negocios_falhados = negocios_falhados + 1 where id = new.de_perfil;
      perform public.registar_infracao(new.de_perfil, 'incumprimento', 'aperto:' || new.id);
    end if;
    if new.quem_falhou in ('b', 'ambos') then
      update public.perfis set negocios_falhados = negocios_falhados + 1 where id = new.para_perfil;
      perform public.registar_infracao(new.para_perfil, 'incumprimento', 'aperto:' || new.id);
    end if;
  end if;
  return new;
end;
$$;

-- 3) BACKFILL honesto: o carimbo mais recente que os negócios reais provam.
--    (selado_em como âncora do negócio; estados honrados do ciclo + legados.)
update public.perfis p
   set ultimo_honrado_em = u.ultimo
  from (
    select perfil, max(quando) as ultimo
      from (
        select de_perfil as perfil, coalesce(selado_em, aceite_em, criado_em) as quando
          from public.orcamentos
         where estado in ('honrado', 'entregue', 'concluido', 'confirmado_ambos', 'devolvido')
        union all
        select para_perfil, coalesce(selado_em, aceite_em, criado_em)
          from public.orcamentos
         where estado in ('honrado', 'entregue', 'concluido', 'confirmado_ambos', 'devolvido')
      ) t
     group by perfil
  ) u
 where p.id = u.perfil
   and p.ultimo_honrado_em is null;

-- 4) A guarda_perfil (048) passa a proteger TAMBÉM a recência — o dono nunca
--    carimba a própria reputação. (Recriada fiel, coluna nova na lista.)
create or replace function public.guarda_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null
     or coalesce(current_setting('honra.sistema', true), '') = '1' then
    return new;
  end if;
  if new.indice_confianca is distinct from old.indice_confianca
     or new.negocios_honrados is distinct from old.negocios_honrados
     or new.negocios_falhados is distinct from old.negocios_falhados
     or new.apertos_selados is distinct from old.apertos_selados
     or new.cancelados_mutuo is distinct from old.cancelados_mutuo
     or new.ultimo_honrado_em is distinct from old.ultimo_honrado_em
     or new.suspenso_ate is distinct from old.suspenso_ate
     or new.nivel_suspensao is distinct from old.nivel_suspensao
     or new.is_admin is distinct from old.is_admin then
    raise exception 'Campos de sistema (confiança / suspensão / admin) não são editáveis pelo cliente.';
  end if;
  return new;
end; $$;

-- 5) A coluna entra na MONTRA pública (o grant por-coluna da 066 é fail-closed).
grant select (ultimo_honrado_em) on public.perfis to anon, authenticated;
