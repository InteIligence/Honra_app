-- ============================================================
-- HONRA — Migração 078: O COMBINADO COM CONSEQUÊNCIA
-- ------------------------------------------------------------
-- Decisão do Vítor (01/08): marcar um encontro no chat passa a ter peso.
-- Cumprido, +2 de Confiança aos dois. Falhado, −2 a quem faltou.
-- "Não é para ser rico com isto, é para haver consequência pela falha."
--
-- PORQUE NÃO COLIDE COM OS CHECKPOINTS: o checkpoint é o TRABALHO; o combinado
-- é a PRESENÇA. São coisas diferentes e por isso podem coexistir sem ambiguidade
-- — a objeção que travou isto na primeira volta era outra: um "combinado" sem
-- consequência nenhuma parecia um acordo e não era. Com consequência, é.
--
-- A ESCALA importa: numa escada onde Referenciado são 200 honrados, dois pontos
-- não movem escalões. É consequência, não é moeda.
--
-- ── QUEM PODE CONDENAR QUEM ──────────────────────────────────────────────
-- Esta é a parte delicada, e a regra é: NINGUÉM CONDENA SOZINHO E EM SILÊNCIO.
--   · os dois confirmam presença      → CUMPRIDO (+2 a cada)
--   · um declara falha e o outro NÃO contesta dentro do prazo → FALHADO (−2)
--   · o outro CONTESTA                → fica em disputa e não mexe em nada
--   · ninguém diz nada até ao prazo   → EXPIRA sem consequência
-- O silêncio nunca condena — só o silêncio DEPOIS de uma acusação recebida, e
-- essa a pessoa vê. Um botão que tirasse pontos a alguém sem resposta possível
-- seria uma arma, não uma regra.
--
-- Os contadores são COLUNAS PRÓPRIAS e não entram em `negocios_honrados`: a
-- honra de um negócio e a de um encontro não são a mesma coisa, e misturá-las
-- estragava o significado das duas (e a escada, que corre a honrados).
--
-- Correr DEPOIS da 077.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) OS CONTADORES — blindados como toda a reputação (010).
-- ----------------------------------------------------------------
alter table public.perfis
  add column if not exists combinados_cumpridos int not null default 0,
  add column if not exists combinados_falhados  int not null default 0;

comment on column public.perfis.combinados_cumpridos is
  'Encontros combinados que aconteceram (ambos confirmaram). Vale +2 na Confianca cada. Escrito SO por trigger.';
comment on column public.perfis.combinados_falhados is
  'Encontros combinados a que faltou (declarado e nao contestado). Vale -2 na Confianca cada. Escrito SO por trigger.';

-- ----------------------------------------------------------------
-- 2) A TABELA.
-- ----------------------------------------------------------------
create table if not exists public.combinados (
  id            uuid primary key default gen_random_uuid(),
  -- Par ORDENADO (a < b), como nas conversas livres: evita duplicados e
  -- torna as consultas simétricas.
  a             uuid not null references public.perfis(id) on delete cascade,
  b             uuid not null references public.perfis(id) on delete cascade,
  -- Quem propôs — para o outro saber quem chamou, e para a recusa fazer sentido.
  proposto_por  uuid not null references public.perfis(id) on delete cascade,
  -- Contexto OPCIONAL: um combinado pode nascer fora de qualquer negócio.
  orcamento_id  uuid references public.orcamentos(id) on delete set null,
  quando        timestamptz not null,
  onde          text,
  estado        text not null default 'proposto',
  -- Presença: cada lado confirma a SUA. Dois carimbos = aconteceu.
  a_confirmou_em timestamptz,
  b_confirmou_em timestamptz,
  -- Falha: quem a declarou, quando, e se foi contestada.
  falha_de      uuid references public.perfis(id) on delete set null,
  falha_em      timestamptz,
  contestado_em timestamptz,
  criado_em     timestamptz not null default now(),
  constraint combinados_par_ordenado check (a < b),
  constraint combinados_estado_valido check (
    estado in ('proposto', 'aceite', 'cumprido', 'falhado', 'expirado', 'recusado', 'disputado')
  )
);

comment on table public.combinados is
  'Encontros marcados entre duas pessoas. Cumprido vale +2 de Confianca a cada; falhado vale -2 a quem faltou. Ninguem condena sozinho: a falha declarada pode ser contestada.';

create index if not exists combinados_a_idx on public.combinados (a, quando desc);
create index if not exists combinados_b_idx on public.combinados (b, quando desc);

-- ----------------------------------------------------------------
-- 3) RLS — só as duas partes.
-- ----------------------------------------------------------------
alter table public.combinados enable row level security;

drop policy if exists "combinados_partes_veem" on public.combinados;
create policy "combinados_partes_veem" on public.combinados
  for select using (auth.uid() = a or auth.uid() = b);

-- Propor exige identidade verificada e conta livre (mesma regra do pedido).
drop policy if exists "combinados_parte_propoe" on public.combinados;
create policy "combinados_parte_propoe" on public.combinados
  for insert with check (
    (auth.uid() = a or auth.uid() = b)
    and auth.uid() = proposto_por
    and public.identidade_verificada(auth.uid())
    and not public.esta_suspenso(auth.uid())
  );

-- O UPDATE existe, mas quem manda no que pode mudar e' a guarda abaixo:
-- o cliente NUNCA escreve `estado` nem os contadores.
drop policy if exists "combinados_parte_agir" on public.combinados;
create policy "combinados_parte_agir" on public.combinados
  for update using (auth.uid() = a or auth.uid() = b)
  with check (auth.uid() = a or auth.uid() = b);

-- ----------------------------------------------------------------
-- 4) A GUARDA — o estado e' do SERVIDOR, nunca do cliente.
--    Sem isto, qualquer das partes escrevia `estado='cumprido'` e dava a si
--    propria os +2. E' a mesma licao da blindagem 010.
-- ----------------------------------------------------------------
create or replace function public.guarda_combinado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- O servidor age com `service_role`/definer e passa a direito.
  if auth.uid() is null then
    return new;
  end if;
  -- O cliente so pode mexer nos SEUS carimbos e na contestacao.
  if new.estado is distinct from old.estado
     or new.a is distinct from old.a
     or new.b is distinct from old.b
     or new.quando is distinct from old.quando
     or new.orcamento_id is distinct from old.orcamento_id
     or new.proposto_por is distinct from old.proposto_por then
    raise exception 'campo reservado ao servidor';
  end if;
  -- Cada um confirma a SUA presenca — nunca a do outro.
  if auth.uid() = new.a and new.b_confirmou_em is distinct from old.b_confirmou_em then
    raise exception 'nao se confirma a presenca do outro';
  end if;
  if auth.uid() = new.b and new.a_confirmou_em is distinct from old.a_confirmou_em then
    raise exception 'nao se confirma a presenca do outro';
  end if;
  return new;
end;
$$;

drop trigger if exists combinados_guarda on public.combinados;
create trigger combinados_guarda
before update on public.combinados
for each row execute function public.guarda_combinado();

-- ----------------------------------------------------------------
-- 5) O DESFECHO — corre no servidor e mexe nos contadores.
--    Chamado quando alguem confirma presenca ou declara falha.
-- ----------------------------------------------------------------
create or replace function public.fechar_combinado(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.combinados%rowtype;
  culpado uuid;
begin
  select * into c from public.combinados where id = p_id;
  if not found or c.estado in ('cumprido', 'falhado', 'expirado', 'recusado') then
    return coalesce(c.estado, 'inexistente');
  end if;

  -- CUMPRIDO: os dois confirmaram que se encontraram.
  if c.a_confirmou_em is not null and c.b_confirmou_em is not null then
    update public.combinados set estado = 'cumprido' where id = p_id;
    update public.perfis set combinados_cumpridos = combinados_cumpridos + 1
     where id in (c.a, c.b);
    return 'cumprido';
  end if;

  -- FALHADO: houve acusacao, o prazo passou e ninguem contestou.
  -- 3 dias e' o mesmo folego que a casa da' noutras contestacoes.
  if c.falha_em is not null
     and c.contestado_em is null
     and now() > c.falha_em + interval '3 days' then
    culpado := case when c.falha_de = c.a then c.b else c.a end;
    update public.combinados set estado = 'falhado' where id = p_id;
    update public.perfis set combinados_falhados = combinados_falhados + 1
     where id = culpado;
    return 'falhado';
  end if;

  -- CONTESTADO: fica em disputa e NAO mexe em contador nenhum. Duas versoes
  -- da mesma historia nao se resolvem por contagem.
  if c.contestado_em is not null then
    update public.combinados set estado = 'disputado' where id = p_id;
    return 'disputado';
  end if;

  -- EXPIRADO: passou a data, ninguem confirmou nem acusou. Sem consequencia —
  -- o silencio dos dois nao condena ninguem.
  if now() > c.quando + interval '7 days' then
    update public.combinados set estado = 'expirado' where id = p_id;
    return 'expirado';
  end if;

  return c.estado;
end;
$$;

revoke all on function public.fechar_combinado(uuid) from public, anon;
grant execute on function public.fechar_combinado(uuid) to authenticated;

-- ----------------------------------------------------------------
-- 6) Os contadores entram na BLINDAGEM do perfil.
--    Sem isto, o dono escrevia-os por UPDATE e dava a si proprio a Confianca —
--    exatamente o buraco que a blindagem 010 fechou para os honrados. A funcao
--    e' recriada com a lista da 067 MAIS as duas colunas novas.
-- ----------------------------------------------------------------
create or replace function public.guarda_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null
     or coalesce(current_setting('honra.sistema', true), '') = '1' then
    return new;
  end if;
  if new.indice_confianca is distinct from old.indice_confianca
     or new.negocios_honrados is distinct from old.negocios_honrados
     or new.negocios_falhados is distinct from old.negocios_falhados
     or new.apertos_selados is distinct from old.apertos_selados
     or new.cancelados_mutuo is distinct from old.cancelados_mutuo
     or new.ultimo_honrado_em is distinct from old.ultimo_honrado_em
     or new.combinados_cumpridos is distinct from old.combinados_cumpridos
     or new.combinados_falhados is distinct from old.combinados_falhados
     or new.suspenso_ate is distinct from old.suspenso_ate
     or new.nivel_suspensao is distinct from old.nivel_suspensao
     or new.is_admin is distinct from old.is_admin then
    raise exception 'Campos de sistema (confianca / suspensao / admin) nao sao editaveis pelo cliente.';
  end if;
  return new;
end; $$;

-- 7) Os contadores entram na MONTRA publica: a Confianca de alguem le-se no
--    perfil dele, e o grant por-coluna da 066 e' fail-closed (o que nao entra
--    aqui fica invisivel).
grant select (combinados_cumpridos, combinados_falhados) on public.perfis to anon, authenticated;
