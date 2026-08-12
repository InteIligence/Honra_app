-- ============================================================
-- HONRA — Migração 016: "ON HONRA" + índice decomposto (contadores públicos)
-- ------------------------------------------------------------
-- Confiança em SINAIS SEPARADOS e verificáveis (não numa média de estrelas):
--   ★ média das avaliações (já existe: indice_confianca)
--   ✓ nº de negócios HONRADOS no Honra (prova ancorada em transações reais)
--   % de conclusão (honrados vs falhados = fiabilidade)
-- Os orçamentos estão fechados por RLS às 2 partes → um visitante não os pode
-- contar. Por isso denormalizamos contadores no perfil (leitura pública) e um
-- trigger mantém-nos ao vivo. Protegidos de forja pela guarda_perfil.
--
-- Correr no SQL Editor DEPOIS da 015.
-- ============================================================

-- 1) Contadores públicos no perfil.
alter table public.perfis
  add column if not exists negocios_honrados int not null default 0,
  add column if not exists negocios_falhados int not null default 0;

-- 2) TRIGGER: mantém os contadores ao ritmo do ciclo.
--    +1 honrado (aos DOIS) quando um negócio chega a 'honrado'.
--    +1 falhado a quem NÃO cumpriu quando chega a 'incumprido'.
create or replace function public.atualizar_contadores_honra()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.estado = 'honrado' and old.estado is distinct from 'honrado' then
    update public.perfis set negocios_honrados = negocios_honrados + 1
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

drop trigger if exists after_orcamento_contadores on public.orcamentos;
create trigger after_orcamento_contadores
  after update on public.orcamentos
  for each row execute function public.atualizar_contadores_honra();

-- 3) BACKFILL: contar o que já existe (honrado ou além = honrado).
update public.perfis p set negocios_honrados = (
  select count(*) from public.orcamentos o
  where (o.de_perfil = p.id or o.para_perfil = p.id)
    and o.estado in ('honrado', 'entregue', 'concluido', 'confirmado_ambos', 'devolvido')
);
update public.perfis p set negocios_falhados = (
  select count(*) from public.orcamentos o
  where o.estado = 'incumprido'
    and (
      (o.de_perfil = p.id and o.quem_falhou in ('a', 'ambos')) or
      (o.para_perfil = p.id and o.quem_falhou in ('b', 'ambos'))
    )
);

-- 4) GUARDA: os contadores são do SISTEMA — o cliente não os pode forjar.
--    Recria a guarda_perfil (da 010) a proteger também estes campos.
create or replace function public.guarda_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null
     or coalesce(current_setting('honra.sistema', true), '') = '1' then
    return new;
  end if;
  if new.indice_confianca is distinct from old.indice_confianca
     or new.negocios_honrados is distinct from old.negocios_honrados
     or new.negocios_falhados is distinct from old.negocios_falhados then
    raise exception 'Sinais de confiança são calculados pelo sistema, não editáveis.';
  end if;
  return new;
end; $$;
