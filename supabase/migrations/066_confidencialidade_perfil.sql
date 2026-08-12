-- ============================================================
-- HONRA — Migração 066: CONFIDENCIALIDADE DO PERFIL
-- (renumerada de 065→066: a sessão paralela já tinha uma 065_pagamento_na_entrega)
-- ------------------------------------------------------------
-- A política `perfis_leitura_publica` (using true) tornava as LINHAS de perfil
-- públicas — correto para a montra. Mas, sem limite de COLUNAS, expunha a
-- QUALQUER pessoa (anon) TODAS as colunas, incluindo as confidenciais:
--   · nif             — número de contribuinte (PII de empresa)
--   · is_admin        — permite enumerar admins para atacar a moderação
--   · semente         — revela perfis de demonstração (mina "pessoas reais")
--   · suspenso_ate / nivel_suspensao — estado de sanção (privado)
--
-- CORREÇÃO por COLUNA (não por linha): revoga-se o SELECT da tabela e concede-se
-- só a MONTRA. As leituras que o PRÓPRIO faz às suas colunas reservadas passam
-- a ir por RPC (sou_admin() da 064 + meu_perfil_reservado() aqui). Os embeds
-- `perfis!de_perfil(nome)` espalhados pela app CONTINUAM a funcionar — só leem
-- `nome`, que é uma coluna concedida.
--
-- POSTURA (fail-closed): qualquer coluna NOVA de perfis fica PRIVADA por omissão
-- — para a tornar pública, acrescenta-se ao GRANT abaixo, numa migração. É a
-- direção segura de falha (uma coluna nova nunca vaza sozinha).
--
-- As Edge Functions leem as colunas reservadas com service_role (que ignora
-- estes GRANTs), logo nada do lado do servidor parte.
--
-- Aditiva. Correr DEPOIS da 064.
-- ============================================================

-- 1) Cortar o acesso amplo e reconceder só a MONTRA (as 15 colunas públicas).
revoke select on public.perfis from anon, authenticated;

grant select (
  id, criado_em, nome, handle, avatar, avatar_url, papel, cidade, tipo,
  disponibilidade, indice_confianca, negocios_honrados, negocios_falhados,
  apertos_selados, cancelados_mutuo
) on public.perfis to anon, authenticated;

-- 2) O PRÓPRIO lê as SUAS colunas reservadas (nunca as de outros).
create or replace function public.meu_perfil_reservado()
returns table (nif text, suspenso_ate timestamptz, nivel_suspensao int)
language sql stable security definer set search_path = public
as $$
  select nif, suspenso_ate, nivel_suspensao
    from public.perfis
   where id = auth.uid();
$$;
revoke all on function public.meu_perfil_reservado() from public, anon;
grant execute on function public.meu_perfil_reservado() to authenticated;

-- NOTA: is_admin lê-se por sou_admin() (064). O `verificar-estado-vivo.sql`
-- ganhou uma afirmação que confirma que a tabela perfis JÁ NÃO tem SELECT amplo
-- para anon (senão é drift e a confidencialidade está aberta).
