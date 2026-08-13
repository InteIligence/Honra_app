-- ============================================================
-- HONRA — Migração 084: A GUARDA DO COMBINADO DEIXA PASSAR QUEM DEVE
-- ------------------------------------------------------------
-- Descoberto a correr o ciclo de ponta a ponta pela primeira vez (12/08).
-- Até aqui o combinado nunca tinha sido provado a sério, e parecia certo.
--
-- O QUE ACONTECIA: os dois lados confirmavam presença e o desfecho rebentava
-- com "campo reservado ao servidor". Ou seja, nenhum combinado chegava a
-- 'cumprido' — os +2 de Confiança nunca eram escritos, e o "combinado com
-- consequência" continuava sem consequência, agora por outra razão.
--
-- A CAUSA, e é um engano meu de raiz: a `guarda_combinado` (078) deixa passar
-- quando `auth.uid() is null`, na suposição de que uma função `security
-- definer` corre sem utilizador. NÃO CORRE. O `security definer` troca o PAPEL
-- (o dono da função), mas o `auth.uid()` sai do JWT do pedido e continua lá.
-- Resultado: as funções da 081, que existem precisamente para serem as únicas
-- a mexer no estado, eram barradas pela guarda que devia proteger delas todos
-- os outros.
--
-- O REMÉDIO é o padrão que a casa já usa na `guarda_perfil` (067): uma
-- BANDEIRA DE SESSÃO. Quem tem direito a escrever levanta-a antes de escrever;
-- a guarda vê a bandeira e deixa passar. É melhor do que confiar no papel
-- porque é explícita: só passa quem a levanta de propósito, dentro de uma
-- função que nós escrevemos, e a bandeira morre com a transação (`true` no
-- terceiro argumento = `set local`).
--
-- Correr DEPOIS da 083.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) A GUARDA aprende a bandeira.
-- ----------------------------------------------------------------
create or replace function public.guarda_combinado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- O servidor age com `service_role`, sem sessao, OU com a bandeira levantada
  -- por uma das funcoes de gesto (081). Qualquer um dos tres passa a direito.
  if auth.uid() is null
     or auth.role() = 'service_role'
     or coalesce(current_setting('honra.sistema', true), '') = '1' then
    return new;
  end if;

  -- Daqui para baixo e' o CLIENTE a escrever direto na tabela — e o cliente
  -- nao decide o estado de nada.
  if new.estado is distinct from old.estado
     or new.a is distinct from old.a
     or new.b is distinct from old.b
     or new.quando is distinct from old.quando
     or new.orcamento_id is distinct from old.orcamento_id
     or new.proposto_por is distinct from old.proposto_por then
    raise exception 'campo reservado ao servidor';
  end if;

  if auth.uid() = new.a and new.b_confirmou_em is distinct from old.b_confirmou_em then
    raise exception 'nao se confirma a presenca do outro';
  end if;
  if auth.uid() = new.b and new.a_confirmou_em is distinct from old.a_confirmou_em then
    raise exception 'nao se confirma a presenca do outro';
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------
-- 2) AS FUNCOES DE GESTO levantam a bandeira antes de escrever.
--    Uma a uma, e so' a volta do que escrevem — `set local`, que morre no fim
--    da transacao. Quem chamar estas funcoes nao leva a bandeira para casa.
-- ----------------------------------------------------------------

create or replace function public.responder_combinado(p_id uuid, p_aceita boolean)
returns text language plpgsql security definer set search_path = public as $$
declare c public.combinados%rowtype; eu uuid := auth.uid();
begin
  select * into c from public.combinados where id = p_id;
  if not found then raise exception 'combinado inexistente'; end if;
  if eu is null or (eu <> c.a and eu <> c.b) then raise exception 'nao es parte deste combinado'; end if;
  if eu = c.proposto_por then raise exception 'quem propoe nao responde ao seu proprio convite'; end if;
  if c.estado <> 'proposto' then return c.estado; end if;

  perform set_config('honra.sistema', '1', true);
  update public.combinados
     set estado = case when p_aceita then 'aceite' else 'recusado' end
   where id = p_id;
  return case when p_aceita then 'aceite' else 'recusado' end;
end; $$;

create or replace function public.confirmar_presenca(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c public.combinados%rowtype; eu uuid := auth.uid();
begin
  select * into c from public.combinados where id = p_id;
  if not found then raise exception 'combinado inexistente'; end if;
  if eu is null or (eu <> c.a and eu <> c.b) then raise exception 'nao es parte deste combinado'; end if;
  if c.estado not in ('proposto', 'aceite') then return c.estado; end if;
  if now() < c.quando then raise exception 'ainda nao aconteceu'; end if;

  perform set_config('honra.sistema', '1', true);
  if eu = c.a then
    update public.combinados set a_confirmou_em = coalesce(a_confirmou_em, now()) where id = p_id;
  else
    update public.combinados set b_confirmou_em = coalesce(b_confirmou_em, now()) where id = p_id;
  end if;
  return public.fechar_combinado(p_id);
end; $$;

create or replace function public.declarar_falha_combinado(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c public.combinados%rowtype; eu uuid := auth.uid(); eu_confirmei timestamptz;
begin
  select * into c from public.combinados where id = p_id;
  if not found then raise exception 'combinado inexistente'; end if;
  if eu is null or (eu <> c.a and eu <> c.b) then raise exception 'nao es parte deste combinado'; end if;
  if c.estado not in ('proposto', 'aceite') then return c.estado; end if;
  if now() < c.quando then raise exception 'ainda nao aconteceu'; end if;
  if c.falha_em is not null then return c.estado; end if;

  eu_confirmei := case when eu = c.a then c.a_confirmou_em else c.b_confirmou_em end;
  if eu_confirmei is null then raise exception 'confirma primeiro que estiveste la'; end if;

  perform set_config('honra.sistema', '1', true);
  update public.combinados set falha_de = eu, falha_em = now() where id = p_id;
  return 'acusado';
end; $$;

create or replace function public.contestar_combinado(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c public.combinados%rowtype; eu uuid := auth.uid(); acusado uuid;
begin
  select * into c from public.combinados where id = p_id;
  if not found then raise exception 'combinado inexistente'; end if;
  if c.falha_em is null then raise exception 'nao ha acusacao para contestar'; end if;
  acusado := case when c.falha_de = c.a then c.b else c.a end;
  if eu is null or eu <> acusado then raise exception 'so quem foi acusado pode contestar'; end if;
  if c.contestado_em is not null then return c.estado; end if;
  if now() > c.falha_em + interval '3 days' then raise exception 'o prazo de contestacao passou'; end if;

  perform set_config('honra.sistema', '1', true);
  update public.combinados set contestado_em = now() where id = p_id;
  return public.fechar_combinado(p_id);
end; $$;

-- ----------------------------------------------------------------
-- 3) O DESFECHO tambem escreve estado e contadores — levanta a bandeira.
--    (E' chamado de dentro das de cima, mas tambem pode ser chamado direto.)
-- ----------------------------------------------------------------
create or replace function public.fechar_combinado(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c public.combinados%rowtype; culpado uuid;
begin
  select * into c from public.combinados where id = p_id;
  if not found or c.estado in ('cumprido','falhado','expirado','recusado') then
    return coalesce(c.estado, 'inexistente');
  end if;

  perform set_config('honra.sistema', '1', true);

  if c.a_confirmou_em is not null and c.b_confirmou_em is not null then
    update public.combinados set estado = 'cumprido' where id = p_id;
    update public.perfis set combinados_cumpridos = combinados_cumpridos + 1
     where id in (c.a, c.b);
    return 'cumprido';
  end if;

  if c.falha_em is not null and c.contestado_em is null
     and now() > c.falha_em + interval '3 days' then
    culpado := case when c.falha_de = c.a then c.b else c.a end;
    update public.combinados set estado = 'falhado' where id = p_id;
    update public.perfis set combinados_falhados = combinados_falhados + 1 where id = culpado;
    return 'falhado';
  end if;

  if c.contestado_em is not null then
    update public.combinados set estado = 'disputado' where id = p_id;
    return 'disputado';
  end if;

  if now() > c.quando + interval '7 days' then
    update public.combinados set estado = 'expirado' where id = p_id;
    return 'expirado';
  end if;

  return c.estado;
end; $$;

-- ----------------------------------------------------------------
-- 4) A `guarda_perfil` tem de deixar passar os contadores do combinado.
--    O `fechar_combinado` escreve em `perfis` com a bandeira levantada — e a
--    guarda_perfil (067/078) ja' respeita a mesma bandeira. Fica so' registado
--    que e' por isso que funciona: uma bandeira, duas guardas.
-- ----------------------------------------------------------------
