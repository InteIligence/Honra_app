-- ============================================================
-- HONRA — Migração 033: APERTOS DE MÃO CONTADOS (o rácio é o sinal)
-- ------------------------------------------------------------
-- DECISÃO (Vítor): expor a contagem de apertos de mão ao lado dos trabalhos
-- honrados. "190 apertos e 10 trabalhos é de desconfiar; 190 apertos e 169
-- trabalhos é outra dinâmica. O cancelamento mútuo também faz a sua história."
-- Com o dinheiro fora do aperto interno (032), a reputação É a caução — e esta
-- contagem é a espinha dessa reputação.
--
-- O MODELO:
--   · Aperto de mão dado = negócio SELADO (chegou a 'selado' — os dois deram a
--     palavra). É o DENOMINADOR.
--   · Honrados (negocios_honrados, da 016) = numerador principal.
--   · Cancelados de comum acordo = contam à parte, NEUTROS — não são falha,
--     mas fazem história (mostram-se, não penalizam).
--   · Incumpridos já existem (negocios_falhados, da 016).
--   · Invariante aproximada: selados ≈ honrados + incumpridos + cancelados
--     + em curso.
--
-- MESMO PADRÃO da 016: contadores denormalizados no perfil (leitura pública —
-- os orçamentos estão fechados por RLS às 2 partes), mantidos por trigger,
-- protegidos de forja pela guarda_perfil.
--
-- Aditiva (add column if not exists / create or replace). Correr DEPOIS da 032.
-- ============================================================

-- 1) Contadores públicos novos no perfil.
alter table public.perfis
  add column if not exists apertos_selados  int not null default 0,
  add column if not exists cancelados_mutuo int not null default 0;

-- 2) TRIGGER: estende atualizar_contadores_honra (da 016) — o MESMO trigger
--    after_orcamento_contadores continua a chamá-la; só a função muda.
--    +1 aperto (aos DOIS) quando o negócio chega a 'selado' (a palavra dada).
--    +1 cancelado mútuo (aos DOIS) quando chega a 'cancelado' (desfeito a dois,
--    sem marca — mas fica na história).
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
    update public.perfis set negocios_honrados = negocios_honrados + 1
      where id in (new.de_perfil, new.para_perfil);
  elsif new.estado = 'cancelado' and old.estado is distinct from 'cancelado' then
    update public.perfis set cancelados_mutuo = cancelados_mutuo + 1
      where id in (new.de_perfil, new.para_perfil);
  elsif new.estado = 'incumprido' and old.estado is distinct from 'incumprido' then
    if new.quem_falhou in ('a', 'ambos') then
      update public.perfis set negocios_falhados = negocios_falhados + 1 where id = new.de_perfil;
    end if;
    if new.quem_falhou in ('b', 'ambos') then
      update public.perfis set negocios_falhados = negocios_falhados + 1 where id = new.para_perfil;
    end if;
  end if;
  return new;
end;
$$;

-- 3) BACKFILL a partir da história real.
--    Prova de um aperto ao nível da linha: selado_em is not null (todo o ciclo
--    novo escreve-o ao selar) OU um estado da família honrada (linhas LEGADAS
--    anteriores à 005 sem selado_em — chegar a honrado implica ter havido
--    aperto). E um CHÃO: os contadores da 016 são cumulativos (houve ciclos de
--    teste cujas linhas já foram apagadas mas cujos contadores ficaram — de
--    propósito, a reputação não se apaga com a limpeza) → todo o honrado e todo
--    o falhado passou por 'selado', logo apertos_selados nunca pode ser menor
--    que honrados + falhados. greatest() honra as duas fontes.
update public.perfis p set apertos_selados = greatest(
  (select count(*) from public.orcamentos o
    where (o.de_perfil = p.id or o.para_perfil = p.id)
      and (o.selado_em is not null
           or o.estado in ('honrado', 'entregue', 'concluido', 'confirmado_ambos', 'devolvido'))),
  p.negocios_honrados + p.negocios_falhados
);
update public.perfis p set cancelados_mutuo = (
  select count(*) from public.orcamentos o
  where (o.de_perfil = p.id or o.para_perfil = p.id)
    and o.estado = 'cancelado'
);

-- 4) GUARDA: os contadores novos são do SISTEMA — o cliente não os pode forjar.
--    Recria a guarda_perfil (da 029) a proteger também estes campos.
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
     or new.is_admin is distinct from old.is_admin then
    raise exception 'Campos de sistema (confiança / admin) não são editáveis pelo cliente.';
  end if;
  return new;
end; $$;
