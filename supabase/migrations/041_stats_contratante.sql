-- ============================================================
-- HONRA — Migração 041: STATS DE CONTRATANTE (o outro lado do aperto)
-- ------------------------------------------------------------
-- O perfil público de uma EMPRESA precisa de contar a história dela como
-- CONTRATANTE: quantos negócios honrou como cliente (de_perfil) e quantos
-- trabalhos publicou no mural. Os contadores públicos (016/033) somam os
-- DOIS lados do negócio — não separam o lado de cliente — e os orçamentos
-- estão fechados por RLS às duas partes, por isso um visitante não os pode
-- contar por si.
--
-- Em vez de MAIS contadores denormalizados (colunas + triggers a manter),
-- uma função SECURITY DEFINER devolve APENAS agregados (zero PII, zero
-- linhas) derivados na hora dos dados reais. É a mesma classe de informação
-- que os contadores públicos já expõem — só que separada por lado.
--
-- Aditiva (só uma função, nenhuma coluna). Correr DEPOIS da 040.
-- ============================================================

create or replace function public.stats_contratante(p_perfil uuid)
returns table (honrados int, apertos int, trabalhos_publicados int)
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Negócios honrados como CLIENTE (de_perfil) — a família honrada completa,
    -- incluindo os estados legados (mesma régua do backfill da 016/033).
    (select count(*)::int from orcamentos o
      where o.de_perfil = p_perfil
        and o.estado in ('honrado','entregue','concluido','confirmado_ambos','devolvido')),
    -- Apertos de mão dados como CLIENTE — o denominador do rácio (regra da 033:
    -- selado_em preenchido, OU estado da família honrada nas linhas legadas
    -- anteriores à 005 que nunca escreveram selado_em).
    (select count(*)::int from orcamentos o
      where o.de_perfil = p_perfil
        and (o.selado_em is not null
             or o.estado in ('honrado','entregue','concluido','confirmado_ambos','devolvido'))),
    -- Trabalhos publicados no mural (a tabela já é de leitura pública; aqui é
    -- só a contagem, para o perfil contar a história inteira num só pedido).
    (select count(*)::int from trabalhos t where t.autor_perfil = p_perfil)
$$;

comment on function public.stats_contratante(uuid) is
  'Agregados públicos do LADO CONTRATANTE de um perfil: negócios honrados e apertos dados como cliente + trabalhos publicados. Devolve só números — nunca linhas de orçamentos.';

-- Quem pode perguntar: qualquer sessão (a mesma abertura dos contadores
-- públicos do perfil). Revoga o default e concede explicitamente.
revoke all on function public.stats_contratante(uuid) from public;
grant execute on function public.stats_contratante(uuid) to anon, authenticated, service_role;
