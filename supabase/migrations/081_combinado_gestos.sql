-- ============================================================
-- HONRA — Migração 081: OS GESTOS DO COMBINADO
-- ------------------------------------------------------------
-- A 078 construiu o combinado inteiro do lado do servidor: a tabela, os sete
-- estados, a guarda que impede alguém de confirmar a presença do outro, os
-- contadores blindados e o `fechar_combinado` que decide o desfecho.
--
-- Faltava-lhe o meio. Descoberto a 02/08, ao ir provar o ciclo:
--   · a tabela `combinados` é LIDA em zero sítios da app
--   · `fechar_combinado` é CHAMADA em zero sítios
--   · os estados 'aceite' e 'recusado' existem no check e NADA os escreve —
--     nem podia: a `guarda_combinado` proíbe o cliente de tocar em `estado`,
--     e não havia função nenhuma que o fizesse por ele.
--
-- Resultado prático: marcava-se um combinado, ficava guardado, e nunca mais
-- ninguém lhe tocava. Nenhum chegava a 'cumprido', nenhum a 'falhado', os ±2
-- nunca eram escritos. O combinado COM CONSEQUÊNCIA não tinha consequência.
--
-- ── PORQUE É TUDO POR FUNÇÃO E NÃO POR UPDATE ───────────────────────────
-- A 078 deixou ao cliente o update dos seus próprios carimbos, com a guarda a
-- vigiar. Funcionava, mas obrigava o cliente a saber a coreografia: que
-- carimbo pôr, quando, e quando chamar o `fechar_combinado` a seguir. Regra
-- espalhada por dois lados é regra que se perde — e esta mexe em reputação,
-- que é a coisa que menos se pode dar ao luxo de correr mal.
--
-- Aqui cada GESTO humano é uma função: aceitar, recusar, confirmar presença,
-- declarar falha, contestar. Cada uma faz a sua parte E chama o desfecho. O
-- cliente pede o gesto; o servidor decide tudo o resto.
--
-- ── QUEM PODE O QUÊ (as regras, ditas por extenso) ──────────────────────
--   · RESPONDER   — só quem NÃO propôs, e só enquanto está 'proposto'.
--                   Ninguém aceita um convite que fez a si próprio.
--   · CONFIRMAR   — cada um a SUA presença, e só depois da hora marcada.
--                   Confirmar antes de acontecer não é confirmar, é prometer.
--   · DECLARAR    — só depois da hora, e só quem confirmou a sua própria
--     FALHA         presença: quem também não apareceu não acusa ninguém.
--   · CONTESTAR   — só o acusado, e só dentro dos 3 dias. Passado o prazo o
--                   silêncio já falou.
--
-- Correr DEPOIS da 080.
-- ============================================================

-- ----------------------------------------------------------------
-- 0) O ESTADO 'aceite' TAMBEM VALE COMO CUMPRIVEL.
--    O `fechar_combinado` da 078 sai cedo se o estado ja for terminal; os
--    estados vivos ('proposto', 'aceite') passam. Nada a mudar — fica so
--    registado que 'aceite' e' vivo de proposito.
-- ----------------------------------------------------------------

-- ----------------------------------------------------------------
-- 1) RESPONDER — aceitar ou recusar o convite.
-- ----------------------------------------------------------------
create or replace function public.responder_combinado(p_id uuid, p_aceita boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.combinados%rowtype;
  eu uuid := auth.uid();
begin
  select * into c from public.combinados where id = p_id;
  if not found then
    raise exception 'combinado inexistente';
  end if;
  if eu is null or (eu <> c.a and eu <> c.b) then
    raise exception 'nao es parte deste combinado';
  end if;
  if eu = c.proposto_por then
    raise exception 'quem propoe nao responde ao seu proprio convite';
  end if;
  if c.estado <> 'proposto' then
    return c.estado;   -- ja respondido: nao se responde duas vezes
  end if;

  update public.combinados
     set estado = case when p_aceita then 'aceite' else 'recusado' end
   where id = p_id;

  -- Recusar NAO custa nada a ninguem. Dizer "nao posso" a tempo e' o
  -- contrario de faltar: e' exatamente o que se quer que as pessoas facam.
  return case when p_aceita then 'aceite' else 'recusado' end;
end;
$$;

-- ----------------------------------------------------------------
-- 2) CONFIRMAR A PRESENCA — a minha, nunca a do outro.
-- ----------------------------------------------------------------
create or replace function public.confirmar_presenca(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.combinados%rowtype;
  eu uuid := auth.uid();
begin
  select * into c from public.combinados where id = p_id;
  if not found then
    raise exception 'combinado inexistente';
  end if;
  if eu is null or (eu <> c.a and eu <> c.b) then
    raise exception 'nao es parte deste combinado';
  end if;
  if c.estado not in ('proposto', 'aceite') then
    return c.estado;
  end if;
  -- Antes da hora nao ha nada para confirmar: seria uma promessa, nao uma
  -- presenca. E' esta guarda que impede os dois de "cumprirem" um encontro
  -- que ainda nao aconteceu e arrecadarem os +2 a' cabeca.
  if now() < c.quando then
    raise exception 'ainda nao aconteceu';
  end if;

  if eu = c.a then
    update public.combinados set a_confirmou_em = coalesce(a_confirmou_em, now()) where id = p_id;
  else
    update public.combinados set b_confirmou_em = coalesce(b_confirmou_em, now()) where id = p_id;
  end if;

  return public.fechar_combinado(p_id);
end;
$$;

-- ----------------------------------------------------------------
-- 3) DECLARAR A FALHA — "estive la e a outra pessoa nao apareceu".
-- ----------------------------------------------------------------
create or replace function public.declarar_falha_combinado(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.combinados%rowtype;
  eu uuid := auth.uid();
  eu_confirmei timestamptz;
begin
  select * into c from public.combinados where id = p_id;
  if not found then
    raise exception 'combinado inexistente';
  end if;
  if eu is null or (eu <> c.a and eu <> c.b) then
    raise exception 'nao es parte deste combinado';
  end if;
  if c.estado not in ('proposto', 'aceite') then
    return c.estado;
  end if;
  if now() < c.quando then
    raise exception 'ainda nao aconteceu';
  end if;
  if c.falha_em is not null then
    return c.estado;   -- ja ha uma acusacao em cima da mesa
  end if;

  -- SO ACUSA QUEM COMPARECEU. Sem isto, quem tambem faltou podia acusar
  -- primeiro e sair impune — e a acusacao passaria a ser uma corrida.
  eu_confirmei := case when eu = c.a then c.a_confirmou_em else c.b_confirmou_em end;
  if eu_confirmei is null then
    raise exception 'confirma primeiro que estiveste la';
  end if;

  update public.combinados
     set falha_de = eu, falha_em = now()
   where id = p_id;

  -- Nao fecha nada agora: a outra pessoa tem 3 dias para contestar, e e' o
  -- `fechar_combinado` que conta esse prazo. Ninguem e' condenado no ato.
  return 'acusado';
end;
$$;

-- ----------------------------------------------------------------
-- 4) CONTESTAR — "eu estive la".
-- ----------------------------------------------------------------
create or replace function public.contestar_combinado(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.combinados%rowtype;
  eu uuid := auth.uid();
  acusado uuid;
begin
  select * into c from public.combinados where id = p_id;
  if not found then
    raise exception 'combinado inexistente';
  end if;
  if c.falha_em is null then
    raise exception 'nao ha acusacao para contestar';
  end if;

  acusado := case when c.falha_de = c.a then c.b else c.a end;
  if eu is null or eu <> acusado then
    raise exception 'so quem foi acusado pode contestar';
  end if;
  if c.contestado_em is not null then
    return c.estado;
  end if;
  if now() > c.falha_em + interval '3 days' then
    raise exception 'o prazo de contestacao passou';
  end if;

  update public.combinados set contestado_em = now() where id = p_id;
  return public.fechar_combinado(p_id);
end;
$$;

-- ----------------------------------------------------------------
-- 5) PASSAR O TEMPO — o desfecho que depende so do relogio.
--    Chamada pelo cliente quando abre a conversa: e' o que faz a acusacao nao
--    contestada virar falha ao fim dos 3 dias, e o esquecimento virar
--    'expirado', sem precisar de um cron.
-- ----------------------------------------------------------------
create or replace function public.acertar_combinado(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.combinados%rowtype;
  eu uuid := auth.uid();
begin
  select * into c from public.combinados where id = p_id;
  if not found then
    raise exception 'combinado inexistente';
  end if;
  if eu is null or (eu <> c.a and eu <> c.b) then
    raise exception 'nao es parte deste combinado';
  end if;
  return public.fechar_combinado(p_id);
end;
$$;

-- ----------------------------------------------------------------
-- 6) PERMISSOES — so quem tem sessao. `fechar_combinado` continua a ser
--    chamavel diretamente (a 078 ja lho deu), e nao faz mal: ela so age
--    sobre condicoes que o proprio estado da linha justifica.
-- ----------------------------------------------------------------
revoke all on function public.responder_combinado(uuid, boolean) from public, anon;
revoke all on function public.confirmar_presenca(uuid) from public, anon;
revoke all on function public.declarar_falha_combinado(uuid) from public, anon;
revoke all on function public.contestar_combinado(uuid) from public, anon;
revoke all on function public.acertar_combinado(uuid) from public, anon;

grant execute on function public.responder_combinado(uuid, boolean) to authenticated;
grant execute on function public.confirmar_presenca(uuid) to authenticated;
grant execute on function public.declarar_falha_combinado(uuid) to authenticated;
grant execute on function public.contestar_combinado(uuid) to authenticated;
grant execute on function public.acertar_combinado(uuid) to authenticated;

-- ----------------------------------------------------------------
-- 7) O CLIENTE DEIXA DE ESCREVER NA TABELA.
--    Com os gestos todos em funcoes, a policy de UPDATE da 078 passou a ser
--    uma porta aberta sem serventia — e uma porta aberta sem serventia e' so
--    uma porta aberta. A guarda `combinados_guarda` fica de pe na mesma, como
--    segunda linha.
-- ----------------------------------------------------------------
drop policy if exists "combinados_parte_agir" on public.combinados;
