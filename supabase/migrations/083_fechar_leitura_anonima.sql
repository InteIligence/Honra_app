-- ============================================================
-- HONRA — Migração 083: A MONTRA FECHA A PORTA A QUEM NÃO ENTROU
-- ------------------------------------------------------------
-- Vistoria de 08/08. A chave `anon` vive no bundle da app — é pública por
-- desenho e não há nada a esconder nisso. O problema é o que ela abre:
-- com ela, e SEM sessão nenhuma, qualquer pessoa consegue hoje
--
--   GET /rest/v1/verificacoes?select=*        → 68 linhas, a tabela inteira
--   GET /rest/v1/perfis?select=nome,handle    → a lista de toda a gente
--
-- Nenhum dado sensível escapa — `email` e `telefone` nem sequer vivem em
-- `perfis` (estão em `auth.users`, fechado), e o `nif` já está travado pelo
-- grant-por-coluna da 066. Mas junta-se uma coisa à outra e tem-se a LISTA
-- COMPLETA de quem usa o Honra, com nome, cidade, negócios honrados e o
-- estado de verificação de cada um.
--
-- ── PORQUE ISTO IMPORTA NUMA CASA DE REPUTAÇÃO ──────────────────────────
-- Não é o vazamento clássico; é ENUMERAÇÃO. Serve para duas coisas, ambas
-- más para nós:
--   · saber ao certo quantos somos e quem somos (para quem quiser copiar ou
--     abordar a nossa gente um a um);
--   · engenharia social afinada — "olá, reparei que a tua verificação está
--     pendente" é uma frase muito mais eficaz vinda de quem sabe que está
--     mesmo pendente.
-- Quem confia a sua cara e o seu histórico ao Honra não espera que a lista
-- de quem lá está se puxe com um pedido.
--
-- ── PORQUE ISTO NÃO PARTE NADA (verificado antes de escrever) ───────────
-- As páginas que funcionam SEM login não leem estas tabelas diretamente:
--   · a página do convite (`c/[token]`) faz 21 chamadas e TODAS são a Edge
--     Functions, que correm com service_role e passam por cima do RLS;
--   · a `comparencia` não faz uma única leitura direta.
-- Tudo o resto na app acontece depois de entrar. A leitura pública destas
-- duas tabelas não estava a servir ninguém — estava só aberta.
--
-- O que MUDA: `authenticated` continua a ver tudo o que via. `anon` deixa de
-- ver. É a diferença entre a montra e o inventário.
--
-- Correr DEPOIS da 082.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) PERFIS — a montra continua aberta a quem entrou.
--    As policies existentes ficam como estao; o que se tira e' o GRANT ao
--    papel `anon`. E' a mesma tecnica da 066 (grant-por-coluna): o RLS diz
--    QUE LINHAS, o grant diz QUEM E QUE COLUNAS. Aqui basta o quem.
-- ----------------------------------------------------------------
revoke select on public.perfis from anon;

-- ----------------------------------------------------------------
-- 2) VERIFICACOES — o estado dos selos e' publico DENTRO da casa.
--    O selo de alguem continua a ver-se no perfil dessa pessoa; o que deixa
--    de dar e' pedir a tabela toda de uma vez sem sequer ter conta.
-- ----------------------------------------------------------------
revoke select on public.verificacoes from anon;

-- ----------------------------------------------------------------
-- 3) AS OUTRAS QUE A VISTORIA ENCONTROU ABERTAS AO MESMO PAPEL.
--    Todas devolviam `[]` hoje (o RLS ja' as protege por linha), mas um
--    revoke e' uma parede e uma policy e' uma porta com porteiro. Onde nao
--    ha razao nenhuma para o anonimo bater, tira-se a porta.
--    NAO se mexe em `categorias` nem `perfil_categorias`: a taxonomia e'
--    publica de proposito (002) e nao diz nada sobre ninguem.
-- ----------------------------------------------------------------
revoke select on public.orcamentos  from anon;
revoke select on public.mensagens   from anon;
revoke select on public.bloqueios   from anon;

-- ----------------------------------------------------------------
-- 4) PROVA — correr isto DEPOIS e confirmar que `anon` fica sem nada.
--    Do lado de fora (curl com a chave anon, sem sessao) as cinco tabelas
--    passam a responder 42501 em vez de devolverem linhas.
-- ----------------------------------------------------------------
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee = 'anon'
   and table_name in ('perfis', 'verificacoes', 'orcamentos', 'mensagens', 'bloqueios')
 order by table_name;
-- Esperado: ZERO linhas.
