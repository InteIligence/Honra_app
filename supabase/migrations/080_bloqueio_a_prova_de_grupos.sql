-- ============================================================
-- HONRA — Migração 080: O BLOQUEIO PASSA A SER À PROVA DE GRUPOS
-- ------------------------------------------------------------
-- O bloqueio é uma PROMESSA DA CASA: "esta pessoa não te chega". Encontrámos
-- (01/08) três caminhos por onde ela chegava à mesma. Um bloqueio que se
-- contorna é pior do que não existir — dá segurança falsa a quem mais precisa
-- dela, e é a pessoa incomodada que fica a descobrir sozinha que a promessa
-- era vazia.
--
-- ── O QUE ESTAVA ABERTO ─────────────────────────────────────────────────
-- A 024 fechou dois caminhos: novo ORÇAMENTO entre as partes, e mensagem
-- dentro de um orçamento. Mas essa guarda lê `new.orcamento_id` para saber
-- quem são "as partes" — e depois dela vieram dois donos novos de mensagem:
--   · grupos (068)            → orcamento_id é NULL
--   · conversas livres (075)  → orcamento_id é NULL
-- Com o campo a NULL o `select ... into` não devolve nada, as variáveis ficam
-- nulas, o `exists` não encontra ninguém e a mensagem PASSA. A guarda não
-- falhava: ela nem chegava a ser feita.
--
--   1. LÍDER BLOQUEADO JUNTA A VÍTIMA AO GRUPO. `membros_lider_adiciona` só
--      pergunta se quem adiciona é o criador. Bloqueado cria grupo, adiciona
--      quem o bloqueou, e fala com essa pessoa lá dentro.
--   2. INTERMEDIÁRIO JUNTA DUAS PESSOAS COM BLOQUEIO ENTRE ELAS. Nem sequer
--      é preciso má-fé de quem cria: C faz um grupo com A e B sem saber que A
--      bloqueou B.
--   3. BLOQUEIO POSTERIOR NÃO CALA NADA. Numa conversa livre já aberta (a 075
--      só verifica ao ABRIR), quem é bloqueado depois continua a escrever.
--
-- ── O DESENHO, E PORQUE É ESTE ──────────────────────────────────────────
-- Duas naturezas de conversa, duas respostas — e a diferença não é técnica, é
-- de justiça:
--
-- · A DOIS (orçamento ou conversa livre): o bloqueio CALA. Uma conversa a dois
--   com um bloqueio no meio não tem razão para continuar a existir; era isso
--   que a 024 já fazia para os orçamentos e é o que aqui se estende.
--
-- · EM GRUPO: o bloqueio NÃO cala e NÃO expulsa — ESCONDE. Quem bloqueou
--   deixa de ver o que a outra pessoa escreve; toda a gente continua a falar.
--   Calar alguém num grupo de dez por causa de um bloqueio castiga oito
--   inocentes; expulsar transformava o bloqueio numa ARMA (bloqueio-te para
--   te tirar dos grupos onde estás). O bloqueio é meu e serve para me proteger
--   a mim — nunca para dar poder sobre a vida de outra pessoa.
--
-- · E À ENTRADA: duas pessoas com bloqueio entre elas não podem coexistir num
--   grupo. Um grupo é um sítio onde todos falam com todos; deixá-las entrar
--   era criar de propósito a situação que o bloqueio existe para evitar. Vale
--   para quem adiciona E para os que já lá estão — senão bastava um terceiro
--   distraído para furar a regra.
--
-- Correr DEPOIS da 079.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) A PERGUNTA, num sitio so.
--    Existe bloqueio entre estas duas pessoas, em QUALQUER sentido?
--    Uma funcao em vez do mesmo `exists` copiado por cinco sitios: as regras
--    perdem-se quando vivem em copias.
-- ----------------------------------------------------------------
create or replace function public.ha_bloqueio(p_um uuid, p_outro uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bloqueios b
     where (b.bloqueador = p_um    and b.bloqueado = p_outro)
        or (b.bloqueador = p_outro and b.bloqueado = p_um)
  );
$$;

comment on function public.ha_bloqueio(uuid, uuid) is
  'Ha bloqueio entre as duas pessoas, em qualquer sentido? A pergunta do bloqueio vive so aqui.';

revoke all on function public.ha_bloqueio(uuid, uuid) from public, anon;
grant execute on function public.ha_bloqueio(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------
-- 2) A ENTRADA DO GRUPO — ninguem entra para o pe de quem tem bloqueio consigo.
--    `security definer` de proposito: precisa de LER a lista de membros e a
--    tabela de bloqueios de pessoas que nao sao quem esta a inserir, e as
--    politicas de RLS dessas tabelas nao lho permitiriam.
-- ----------------------------------------------------------------
create or replace function public.guarda_bloqueio_membro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conflito uuid;
begin
  -- Contra QUEM ADICIONA (o caso do lider bloqueado) e contra QUEM JA LA ESTA
  -- (o caso do intermediario distraido) — a mesma pergunta, feita a lista toda.
  -- O proprio criador entra pelo trigger da 068 com auth.uid() ja definido, e
  -- passa a direito: ninguem tem bloqueio consigo mesmo.
  select gm.perfil_id into v_conflito
    from public.grupo_membros gm
   where gm.grupo_id = new.grupo_id
     and gm.perfil_id <> new.perfil_id
     and public.ha_bloqueio(gm.perfil_id, new.perfil_id)
   limit 1;

  if v_conflito is not null then
    raise exception 'Ha um bloqueio entre esta pessoa e alguem do grupo.';
  end if;

  if auth.uid() is not null
     and auth.uid() <> new.perfil_id
     and public.ha_bloqueio(auth.uid(), new.perfil_id) then
    raise exception 'Ha um bloqueio entre as partes.';
  end if;

  return new;
end;
$$;

drop trigger if exists antes_membro_bloqueio on public.grupo_membros;
create trigger antes_membro_bloqueio
before insert on public.grupo_membros
for each row execute function public.guarda_bloqueio_membro();

-- ----------------------------------------------------------------
-- 3) A FALA A DOIS — o bloqueio cala, e agora tambem na conversa livre.
--    A funcao da 024 e' reescrita por inteiro: passa a saber os TRES donos de
--    mensagem em vez de so o orcamento. Em grupo devolve `new` sem calar
--    ninguem — nesse ramo quem trata do assunto e' a leitura (ponto 4).
-- ----------------------------------------------------------------
create or replace function public.guarda_bloqueio_mensagem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_de uuid;
  v_para uuid;
begin
  if new.orcamento_id is not null then
    select o.de_perfil, o.para_perfil into v_de, v_para
      from public.orcamentos o where o.id = new.orcamento_id;
  elsif new.conversa_livre_id is not null then
    select c.a, c.b into v_de, v_para
      from public.conversas_livres c where c.id = new.conversa_livre_id;
  else
    -- Grupo: nao se cala uma sala inteira por causa de duas pessoas.
    return new;
  end if;

  if v_de is not null and v_para is not null and public.ha_bloqueio(v_de, v_para) then
    raise exception 'Ha um bloqueio entre as partes.';
  end if;
  return new;
end;
$$;

drop trigger if exists antes_mensagem_bloqueio on public.mensagens;
create trigger antes_mensagem_bloqueio
before insert on public.mensagens
for each row execute function public.guarda_bloqueio_mensagem();

-- ----------------------------------------------------------------
-- 4) A LEITURA — quem bloqueou deixa de ver o que o outro escreve.
--    Reescrita por inteiro a partir da 075 (as regras dos tres ramos ficam
--    iguais) com UMA condicao a mais no fim. Cobre os tres ramos de uma vez:
--    o dia em que alguem bloqueia com um negocio a decorrer, as mensagens
--    dessa pessoa somem para quem bloqueou, sem apagar nada para os outros.
-- ----------------------------------------------------------------
drop policy if exists "mensagens_partes_veem" on public.mensagens;
create policy "mensagens_partes_veem" on public.mensagens
  for select using (
    (
      (orcamento_id is not null and exists (
        select 1 from public.orcamentos o
         where o.id = mensagens.orcamento_id
           and (o.de_perfil = auth.uid() or o.para_perfil = auth.uid())
      ))
      or (grupo_id is not null and public.sou_membro_do_grupo(grupo_id))
      or (conversa_livre_id is not null and exists (
        select 1 from public.conversas_livres c
         where c.id = mensagens.conversa_livre_id
           and (c.a = auth.uid() or c.b = auth.uid())
      ))
    )
    -- As minhas proprias mensagens vejo sempre; as dos outros, so se nao
    -- houver bloqueio entre nos.
    and (
      autor_perfil = auth.uid()
      or not public.ha_bloqueio(autor_perfil, auth.uid())
    )
  );

-- ----------------------------------------------------------------
-- 5) LIMPEZA — os grupos que ja nasceram com um bloqueio la dentro.
--    Nao se apaga ninguem: so se ASSINALA, para o dono decidir. Expulsar
--    pessoas de grupos existentes por causa de uma regra nova seria a mesma
--    arma que o ponto 4 recusa dar a quem bloqueia.
-- ----------------------------------------------------------------
do $$
declare
  n int;
begin
  select count(*) into n
    from public.grupo_membros x
    join public.grupo_membros y
      on y.grupo_id = x.grupo_id and y.perfil_id < x.perfil_id
   where public.ha_bloqueio(x.perfil_id, y.perfil_id);
  if n > 0 then
    raise notice 'ATENCAO: % par(es) com bloqueio ja coexistem em grupos. A leitura ja os protege (ponto 4); a entrada fica travada de agora em diante.', n;
  end if;
end $$;
