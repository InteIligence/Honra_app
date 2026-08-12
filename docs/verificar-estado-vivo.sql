-- ============================================================
-- HONRA — VERIFICAR O ESTADO VIVO (guardrail de drift · vistoria 360° #2)
-- ------------------------------------------------------------
-- PORQUÊ: a BD real já esteve com REGRESSÕES CRÍTICAS por aplicação manual
-- parcial das migrações (ex.: `verif_dono_tudo` a deixar o dono auto-verificar
-- a identidade; `avaliacoes` bidirecional; avaliações por revelar expostas).
-- Foram repostas à mão. Como as migrações se colam no SQL Editor uma a uma,
-- nada garante que a RLS/triggers VIVOS == repo.
--
-- COMO USAR: correr este script no SQL Editor DEPOIS de cada aplicação de
-- migrações. Comparar a olho (ou guardar o output e fazer diff) com o que o
-- repo diz. As secções trazem AFIRMAÇÕES-CHAVE que TÊM de bater certo — se
-- alguma falhar, há drift e a blindagem pode estar aberta.
--
-- (Idealmente, a prazo: migrar para `supabase db push` versionado e correr
--  isto num CI. Por agora é a rede de segurança manual.)
-- ============================================================

-- ------------------------------------------------------------
-- 1) TABELAS SEM RLS (deviam ser ZERO nas tabelas de negócio).
-- ------------------------------------------------------------
select 'RLS_OFF' as sinal, n.nspname as schema, c.relname as tabela
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relrowsecurity = false
 order by c.relname;

-- ------------------------------------------------------------
-- 2) POLÍTICAS RLS — todas, com o predicado. Procurar aqui as regressões:
--    · perfis_leitura_publica: select, using (true)  ← ok (montra), mas ver §5
--    · verificacoes: NÃO deve ter política de escrita do dono (ALL/INSERT/
--      UPDATE). Só o servidor escreve; a antiga verif_dono_tudo seria forja de
--      selo (auto-verificação) — tem de estar ausente.
--    · avaliacoes_insere_com_prova: with check TEM de conter de_perfil = auth.uid()
--      e o estado do orçamento em ('honrado','entregue','concluido',...)
-- ------------------------------------------------------------
select tablename, policyname, cmd,
       qual        as using_expr,
       with_check  as check_expr
  from pg_policies
 where schemaname = 'public'
 order by tablename, policyname;

-- ------------------------------------------------------------
-- 3) TRIGGERS das tabelas de negócio (guardas + sincronizadores). Devem existir
--    (entre outros): before_orcamento_ciclo (guarda_ciclo_caucao),
--    before_orcamento_proposta (062), before_orcamento_prazo_visivel (063),
--    after_orcamento_garante_checkpoint (063), before_orcamento_vaga_uma (061),
--    before_checkpoint_guarda (047), before_perfil_guarda (048).
-- ------------------------------------------------------------
select c.relname as tabela, t.tgname as trigger
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and not t.tgisinternal
   and c.relname in ('orcamentos','checkpoints_orcamento','perfis','verificacoes','contratos_convite','avaliacoes')
 order by c.relname, t.tgname;

-- ------------------------------------------------------------
-- 4) STORAGE — cada bucket tem de ter teto e MIME (064). Buckets públicos
--    (avatares, portfolio) NUNCA devem aceitar image/svg+xml nem text/html.
-- ------------------------------------------------------------
select id, public, file_size_limit, allowed_mime_types
  from storage.buckets
 order by id;

-- ------------------------------------------------------------
-- 5) AFIRMAÇÕES-CHAVE (cada linha TEM de devolver ok=true). Se der false,
--    há drift crítico — parar e reconciliar antes de seguir.
-- ------------------------------------------------------------
with checagens as (
  -- (a) verificacoes: o DONO não pode escrever (nada de auto-verificação). O
  --     estado seguro é NÃO existir política de escrita (ALL/INSERT/UPDATE) —
  --     só o servidor (service_role) escreve; a leitura pública fica. A antiga
  --     `verif_dono_tudo` (que deixava o dono pôr estado='verificado') foi
  --     removida pela 010/043; se reaparecer, esta afirmação passa a false.
  select 'verificacoes_so_servidor_escreve' as afirmacao,
         not exists (
           select 1 from pg_policies
            where schemaname='public' and tablename='verificacoes'
              and cmd in ('ALL','INSERT','UPDATE')
         ) as ok
  union all
  -- (b) avaliação é unidirecional (de_perfil = auth.uid()).
  select 'avaliacao_unidirecional',
         exists (
           select 1 from pg_policies
            where schemaname='public' and tablename='avaliacoes'
              and policyname='avaliacoes_insere_com_prova'
              and with_check ilike '%de_perfil%'
         )
  union all
  -- (c) avaliação abre em honrado (063).
  select 'avaliacao_abre_em_honrado',
         exists (
           select 1 from pg_policies
            where schemaname='public' and tablename='avaliacoes'
              and policyname='avaliacoes_insere_com_prova'
              and with_check ilike '%honrado%'
         )
  union all
  -- (d) o trigger que garante checkpoint ao selar existe (063).
  select 'checkpoint_garantido_ao_selar',
         exists (
           select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
            where c.relname='orcamentos' and t.tgname='after_orcamento_garante_checkpoint'
         )
  union all
  -- (e) o índice de uma-vaga-um-aperto existe (061).
  select 'uma_vaga_um_aperto',
         exists (select 1 from pg_indexes where schemaname='public' and indexname='orc_um_vivo_por_trabalho_par')
  union all
  -- (f) perfis JÁ NÃO tem SELECT amplo para anon (065): as colunas confidenciais
  --     (nif/is_admin/semente/suspensão) não podem estar ao alcance de anon.
  select 'perfis_sem_select_amplo_anon',
         not exists (
           select 1 from information_schema.role_table_grants
            where table_schema='public' and table_name='perfis'
              and grantee='anon' and privilege_type='SELECT'
              -- um grant de tabela inteira aparece SEM coluna; o por-coluna vive
              -- em column_privileges. Se isto existir, há SELECT amplo = drift.
         )
)
select afirmacao, ok from checagens order by ok, afirmacao;

-- (f-bis) As colunas confidenciais NÃO devem aparecer concedidas a anon.
select 'FUGA_COLUNA_CONFIDENCIAL' as sinal, column_name
  from information_schema.column_privileges
 where table_schema='public' and table_name='perfis'
   and grantee='anon' and privilege_type='SELECT'
   and column_name in ('nif','is_admin','semente','suspenso_ate','nivel_suspensao');
-- (deve devolver ZERO linhas)
