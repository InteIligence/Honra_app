-- ============================================================
-- HONRA — Migração 072: FECHAR registar_infracao (URGENTE)
-- ------------------------------------------------------------
-- BURACO CRÍTICO, confirmado ao vivo na base de dados de produção a 01/08/2026:
-- qualquer pessoa com a chave `anon` — que viaja dentro do bundle da app, e
-- portanto é pública — podia suspender qualquer conta, até 2 anos.
--
-- Prova: um POST anónimo a /rest/v1/rpc/registar_infracao com um uuid
-- inexistente respondeu 409 com violação de CHAVE ESTRANGEIRA — e não com
-- "permission denied". Isto é: a função EXECUTOU. Só falhou porque o perfil não
-- existia. Com um uuid real (e a coluna `perfis.id` é pública desde a 066, logo
-- os uuids são todos obteníveis) a conta ficava suspensa.
--
-- PORQUE ACONTECEU: em PostgreSQL, o EXECUTE de uma função nova é concedido a
-- PUBLIC por omissão, e o PostgREST expõe tudo o que vive no schema `public`.
-- A 048 escreveu a intenção certa no comentário da linha 77 — "só o sistema
-- (registar_infracao é security definer / service_role)" — mas nunca a impôs.
-- As outras funções sensíveis desta casa têm o revoke explícito (041:49,
-- 064:140, 064:151, 066:47). Esta escapou. Uma intenção em comentário não é
-- uma permissão.
--
-- CONSEQUÊNCIA DO ATAQUE, para se perceber a gravidade: um suspenso não pode
-- pedir, aceitar, selar, publicar, apresentar evolução nem aceitar convites —
-- e também não pode APAGAR A CONTA (eliminar-conta:41). Ficava preso.
--
-- SEGURO DE APLICAR, verificado antes de escrever:
--   · a função NÃO é usada dentro de nenhuma policy de RLS (revogar não parte
--     nenhuma leitura nem escrita);
--   · quem a chama são duas Edge Functions — resolver-convites e
--     checkpoint-disputa — e ambas correm com `service_role`, que é dono e
--     ignora estes GRANTs.
--
-- Correr assim que possível. Não depende de nenhuma migração anterior.
-- ============================================================

do $$
declare
  f record;
begin
  -- Por assinatura, apanhando todas as sobrecargas que existam.
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'registar_infracao'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    raise notice 'revogado: %', f.sig;
  end loop;
end $$;

-- Verificação (deve devolver ZERO linhas depois de correr o bloco acima):
--   select p.oid::regprocedure, r.rolname
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--     cross join lateral aclexplode(p.proacl) a
--     join pg_roles r on r.oid = a.grantee
--    where n.nspname = 'public' and p.proname = 'registar_infracao'
--      and r.rolname in ('anon','authenticated','public');
