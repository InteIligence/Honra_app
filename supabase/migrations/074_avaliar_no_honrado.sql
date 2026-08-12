-- ============================================================
-- HONRA — Migração 074: AVALIAR QUANDO ESTÁ HONRADO (destranca o ciclo)
-- ------------------------------------------------------------
-- O ciclo do Honra nunca chegava ao fim. Ninguém, nunca, conseguiu avaliar
-- ninguém — e a avaliação é a última etapa, a que alimenta a reputação.
--
-- PORQUÊ: a máquina do servidor termina em `honrado` (063). Mas a regra de
-- quem pode avaliar, escrita na 004, exige `concluido`/`confirmado_ambos`/
-- `devolvido` — a cauda antiga, de quando havia botões manuais para lá chegar.
-- Esses botões saíram da app; a cauda ficou na regra. Confirmei por varredura:
-- NADA, em migração ou Edge Function, escreve `orcamentos.estado='concluido'`.
-- O negócio pagava, entregava, libertava o dinheiro — e ficava preso em
-- `honrado`, com o botão de avaliar a nunca aparecer.
--
-- A REGRA, dita pelo Vítor (01/08): "assim que o pagamento é feito e avaliado,
-- é honrado". `honrado` é o selo do negócio cumprido — é DAÍ que se avalia.
-- Por isso a correção certa não é inventar mais um estado no fim da máquina: é
-- reconhecer que o fim da máquina já chegou.
--
-- `honrado` ENTRA na lista. Os três estados antigos ficam, para as linhas que
-- nasceram antes desta migração continuarem a poder ser avaliadas.
--
-- O que NÃO muda, e é de propósito:
--   · continua a exigir-se um negócio REAL entre as duas partes (a prova);
--   · continua a ser preciso ser-se parte dele (nada de avaliar terceiros);
--   · o double-blind fica intacto — esta policy é de INSERT, e quem revela é a
--     de leitura (044), que não se toca aqui;
--   · `incumprido` continua de FORA: quem falhou à palavra não é avaliado, é
--     marcado. A falha já pesa na Confiança; uma crítica por cima seria bater
--     duas vezes pelo mesmo.
--
-- Correr DEPOIS da 073.
-- ============================================================

drop policy if exists "avaliacoes_insere_com_prova" on public.avaliacoes;
create policy "avaliacoes_insere_com_prova" on public.avaliacoes
  for insert with check (
    auth.uid() = de_perfil
    and exists (
      select 1
        from public.orcamentos o
       where o.id = avaliacoes.orcamento_id
         -- 'honrado' é o estado final REAL da máquina (063). Os outros três são
         -- a cauda legada, mantida para não trancar linhas antigas.
         and o.estado in ('honrado', 'concluido', 'confirmado_ambos', 'devolvido')
         and (
           (o.de_perfil = auth.uid()   and o.para_perfil = avaliacoes.para_perfil)
           or
           (o.para_perfil = auth.uid() and o.de_perfil   = avaliacoes.para_perfil)
         )
    )
  );

comment on policy "avaliacoes_insere_com_prova" on public.avaliacoes is
  'Só se avalia quem foi parte de um negócio que chegou a bom porto. honrado = estado final da máquina; os restantes são cauda legada. incumprido fica de fora de propósito.';
