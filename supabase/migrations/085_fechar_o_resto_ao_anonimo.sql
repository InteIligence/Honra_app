-- ============================================================
-- HONRA — Migração 085: O RESTO DA CASA FECHA A MESMA PORTA
-- ------------------------------------------------------------
-- A 083 fechou `perfis`, `verificacoes`, `orcamentos`, `mensagens` e
-- `bloqueios` ao papel `anon`. Uma vistoria completa a 12/08 — tabela a
-- tabela, com a chave anónima e sem sessão — encontrou mais CINCO a
-- responder com dados:
--
--   avaliacoes             ← o pior: são TEXTOS que pessoas escreveram
--   portfolio_itens        ← os ficheiros de portefólio de toda a gente
--   trabalhos              ← todos os anúncios publicados
--   trabalhos_comprovados  ← a prova de trabalho de cada um
--   perfil_categorias      ← quem faz o quê
--
-- A 083 não estava errada; estava incompleta. Fechei o que a fuga daquele dia
-- mostrou e não voltei a percorrer a casa toda — e é assim que ficam portas
-- abertas: fecha-se a que se viu.
--
-- ── PORQUE ESTAS TAMBÉM SE FECHAM ───────────────────────────────────────
-- Com `perfis` já fechado, o que sai daqui são UUIDs sem nome — e é fácil
-- concluir que não faz mal. Faz duas coisas:
--
--   · as AVALIAÇÕES saem com o texto todo. Não é preciso saber quem escreveu
--     para ler o que se escreveu, e há aqui frases sobre o trabalho de pessoas
--     reais. Numa casa de reputação, isso não se dá a quem não entrou;
--   · o resto permite CONTAR e mapear a atividade inteira da plataforma —
--     quantos anúncios, quantos trabalhos provados, que categorias mexem.
--     Não é dado de ninguém em particular; é o retrato do negócio todo.
--
-- Nada disto parte a app: tudo o que vive aqui aparece DEPOIS de entrar, e as
-- páginas sem login (a do convite, a comparência) leem por Edge Functions com
-- `service_role`, que passam por cima do RLS.
--
-- `categorias` e a vista `trabalhos_comprovados_publico` FICAM abertas de
-- propósito: a taxonomia é pública desde a 002 e não diz nada sobre ninguém, e
-- a vista pública existe precisamente para ser vista.
--
-- Correr DEPOIS da 084.
-- ============================================================

revoke select on public.avaliacoes            from anon;
revoke select on public.portfolio_itens       from anon;
revoke select on public.trabalhos             from anon;
revoke select on public.trabalhos_comprovados from anon;
revoke select on public.perfil_categorias     from anon;

-- ----------------------------------------------------------------
-- PROVA — depois de correr, isto tem de vir VAZIO.
-- Lista qualquer privilegio que o papel `anon` ainda tenha nas tabelas que
-- guardam gente. Se aparecer alguma linha, ficou porta aberta.
-- ----------------------------------------------------------------
select table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee = 'anon'
   and table_name in (
     'perfis', 'verificacoes', 'orcamentos', 'mensagens', 'bloqueios',
     'avaliacoes', 'portfolio_itens', 'trabalhos', 'trabalhos_comprovados',
     'perfil_categorias', 'combinados', 'contratos_convite', 'denuncias',
     'agenda_notas', 'tarefas', 'listas', 'listas_membros', 'notificacoes'
   )
 order by table_name, privilege_type;
