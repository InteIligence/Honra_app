-- ============================================================
-- HONRA — Migração 003: AVALIAÇÕES (reputação com prova de interação)
-- Princípio-chave: só quem teve uma interação REALMENTE confirmada
-- pode avaliar. A caução trava o fantasma; a avaliação trata da entrega.
-- Correr no Supabase: painel → SQL Editor → colar tudo → Run.
-- (Aditivo: correr DEPOIS da 002. Não mexe nas gavetas existentes.)
-- ============================================================

-- ----------------------------------------------------------------
-- GAVETA: avaliacoes  (uma avaliação por parte, por orçamento)
-- de_perfil  = quem avalia   |   para_perfil = o avaliado
-- unique(orcamento_id, de_perfil) → cada parte avalia uma só vez.
-- ----------------------------------------------------------------
create table if not exists public.avaliacoes (
  id           uuid primary key default gen_random_uuid(),
  criado_em    timestamptz not null default now(),
  orcamento_id uuid not null references public.orcamentos(id) on delete cascade,
  de_perfil    uuid not null references public.perfis(id) on delete cascade,
  para_perfil  uuid not null references public.perfis(id) on delete cascade,
  nota         int not null check (nota between 1 and 5),
  comentario   text,
  unique (orcamento_id, de_perfil)
);

-- ============================================================
-- REGRAS DE ACESSO (Row Level Security)
-- "As avaliações são públicas de ler; só se escreve com prova
--  de interação confirmada — e sobre a OUTRA parte do orçamento."
-- ============================================================
alter table public.avaliacoes enable row level security;

-- Leitura pública: as avaliações são a reputação, ficam à vista.
drop policy if exists "avaliacoes_leitura_publica" on public.avaliacoes;
create policy "avaliacoes_leitura_publica" on public.avaliacoes
  for select using (true);

-- Escrita blindada:
--  1) sou eu quem avalia (auth.uid() = de_perfil);
--  2) existe um orçamento concluído/confirmado em que eu sou uma parte
--     e o avaliado (para_perfil) é a OUTRA parte.
drop policy if exists "avaliacoes_insere_com_prova" on public.avaliacoes;
create policy "avaliacoes_insere_com_prova" on public.avaliacoes
  for insert with check (
    auth.uid() = de_perfil
    and exists (
      select 1
      from public.orcamentos o
      where o.id = avaliacoes.orcamento_id
        and o.estado in ('concluido', 'confirmado_ambos')
        and (
          (o.de_perfil = auth.uid()   and o.para_perfil = avaliacoes.para_perfil)
          or
          (o.para_perfil = auth.uid() and o.de_perfil   = avaliacoes.para_perfil)
        )
    )
  );

-- ============================================================
-- AUTOMAÇÃO: cada avaliação recalcula o índice de confiança do avaliado.
-- indice_confianca = média das notas recebidas (0 se ainda nenhuma).
-- security definer → o trigger escreve em perfis mesmo com RLS ligado.
-- ============================================================
create or replace function public.recalc_indice()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.perfis
     set indice_confianca = (
       select coalesce(avg(nota), 0)
       from public.avaliacoes
       where para_perfil = new.para_perfil
     )
   where id = new.para_perfil;
  return new;
end;
$$;

drop trigger if exists after_avaliacao_insere on public.avaliacoes;
create trigger after_avaliacao_insere
  after insert on public.avaliacoes
  for each row execute function public.recalc_indice();
