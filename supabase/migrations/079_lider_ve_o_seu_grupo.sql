-- ============================================================
-- HONRA — Migração 079: O LÍDER VÊ O SEU PRÓPRIO GRUPO
-- ------------------------------------------------------------
-- BUG: criar um grupo falhava sempre, com "Não foi possível criar o grupo.
-- Precisas da identidade verificada" — mostrado a quem TEM as quatro abas
-- verificadas. A mensagem era falsa (é fixa no cliente) e mandou-nos procurar
-- um problema de identidade que não existia.
--
-- A CAUSA, encontrada por eliminação em 01/08: o cliente faz
--     .insert(...).select('id').single()
-- e isso obriga o Postgres a LER a linha logo a seguir a escrevê-la. Mas ler
-- um grupo exigia `sou_membro_do_grupo(id)` — e o líder só entra em
-- `grupo_membros` pelo trigger `after insert`, que corre DEPOIS de a linha ser
-- devolvida. No instante da leitura, o criador ainda não é membro do seu
-- próprio grupo. A leitura era recusada e o Supabase reportava-a como violação
-- de política de escrita.
--
-- PROVA: o mesmo insert SEM `return=representation` devolveu 201. Com, 403.
-- (E o grupo era criado na mesma — cada tentativa deixou um grupo órfão.)
--
-- PORQUE NÃO SE ARRANJA NO TRIGGER: passá-lo a `before insert` violaria a
-- chave estrangeira — a linha do grupo ainda não existe nesse momento.
--
-- A CORREÇÃO é a que devia lá estar desde o princípio: quem criou o grupo vê-o
-- sempre, por direito próprio, sem depender de um trigger ter corrido. O
-- criador é o líder; um líder que não pode ver o que criou é uma contradição.
--
-- Correr DEPOIS da 078.
-- ============================================================

drop policy if exists "grupos_membros_veem" on public.grupos_conversa;
create policy "grupos_membros_veem" on public.grupos_conversa
  for select using (
    public.sou_membro_do_grupo(id)
    or criador_perfil = auth.uid()
  );

-- Limpeza: os grupos ORFAOS que nasceram das tentativas falhadas — criados
-- com sucesso, nunca vistos por ninguem, e sem uma unica mensagem.
delete from public.grupos_conversa g
 where not exists (select 1 from public.mensagens m where m.grupo_id = g.id)
   and not exists (
     select 1 from public.grupo_membros gm
      where gm.grupo_id = g.id and gm.perfil_id <> g.criador_perfil
   );
