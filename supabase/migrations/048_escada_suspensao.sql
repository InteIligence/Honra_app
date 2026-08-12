-- ============================================================
-- HONRA — Migração 048: ESCADA DE SUSPENSÃO (reincidência, sem prisão perpétua)
-- ------------------------------------------------------------
-- FUGA A (docs/RED-TEAM-FUGAS.md §3 A + §6): hoje só existe a MARCA pública. Não
-- há degrau nenhum de que fugir — nem retenção quando existir. Esta migração
-- constrói a consequência DIGNA e reincidente que faltava:
--
-- DESENHO TRANCADO (Vítor):
--   · A escada conta MARCAS DE INCUMPRIMENTO numa JANELA DE REINCIDÊNCIA de 6 MESES.
--   · 1.ª marca = SÓ marca pública (SEM suspensão). A escada arranca na
--     reincidência: 2.ª marca em <6m → 1 mês; 3.ª → 6 meses; 4.ª+ → 2 anos.
--   · SEM expulsão permanente ("não há prisão perpétua"). Topo = 2 anos; a porta
--     reabre sozinha em suspenso_ate.
--   · ATAQUE deliberado (fraude/farm comprovada) NÃO tem "1.ª = só marca": o admin
--     aplica suspensão direta (caminho de admin) sem esperar reincidência — nunca
--     ganha o primeiro degrau livre.
--   · RETENÇÃO enquanto suspenso: a conta mantém a identidade na BD e BLOQUEIA-SE
--     o apagamento da própria conta durante a suspensão (impede a fuga por
--     apagamento; defensável — sanção temporária). O gancho de retenção de
--     fingerprint pós-apagamento / denylist fica DOCUMENTADO (depende do advogado,
--     Q10-A) — NÃO se constrói dedup por documento aqui.
--   · Enquanto suspenso: não pode pedir / aceitar / selar / apresentar / aceitar
--     convites / publicar; PODE login + ver (ecrã honesto) + exportar (RGPD).
--     Expira sozinho em suspenso_ate.
--
-- FILOSOFIA: mostrar-não-dizer; consequência digna, não humilhante; redenção
-- real; SEM dinheiro (a moeda é a reputação — migração 032).
--
-- MODELAÇÃO: estado no perfil (suspenso_ate / nivel_suspensao) + tabela
-- `infracoes` APPEND-ONLY (auditável) para contar a reincidência. Função SQL
-- reutilizável `registar_infracao` que ao emitir marca conta as infrações dos
-- últimos 6 meses e aplica a escada. Alimentada em DOIS ramos:
--   · INTERNO (resolver-caucoes / disputas de checkpoint): pelo MESMO trigger dos
--     contadores 016/033 (atualizar_contadores_honra) — dispara no exato momento
--     em que o orçamento chega a 'incumprido', cobrindo o caminho novo (fatia D),
--     o legado e a revisão admin, sem tocar no TS do resolver.
--   · CONVITE (resolver-convites): por RPC `registar_infracao` ao marcar
--     'incumprido_profissional' (o cliente-convidado não tem conta → não entra na
--     escada; ver fuga M).
--
-- Guarda server-side (estilo 004/010) que bloqueia os gestos de marketplace
-- quando now() < suspenso_ate, nos dois ramos + no eliminar-conta.
--
-- Contadores 016/033 e §5 do red-team ficam INTACTOS (esta migração só ESTENDE).
-- Aditiva. Correr DEPOIS da 047.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) ESTADO no perfil: até quando está suspenso, e em que degrau.
--    suspenso_ate NULL ou no passado = não suspenso (expira sozinho).
--    nivel_suspensao: 0=nenhum, 1=1 mês, 2=6 meses, 3=2 anos (o degrau mais alto
--    já atingido — histórico do escalonamento).
-- ----------------------------------------------------------------
alter table public.perfis
  add column if not exists suspenso_ate    timestamptz,
  add column if not exists nivel_suspensao int not null default 0;

-- ----------------------------------------------------------------
-- 2) TABELA infracoes — APPEND-ONLY. O livro auditável da reincidência.
--    Uma linha por marca emitida. Nunca se apaga nem se edita (a honra segue a
--    pessoa). tipo: 'incumprimento' (marca normal) | 'ataque' (admin, sem grace).
-- ----------------------------------------------------------------
create table if not exists public.infracoes (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references public.perfis(id) on delete cascade,
  tipo       text not null default 'incumprimento'
             check (tipo in ('incumprimento', 'ataque')),
  origem     text,                         -- 'aperto:<orc_id>' | 'convite:<contrato_id>' | 'admin:<motivo>'
  criado_em  timestamptz not null default now()
);

create index if not exists infracoes_perfil_idx  on public.infracoes (perfil_id, criado_em desc);

alter table public.infracoes enable row level security;

-- O dono lê o seu histórico (transparência + export RGPD). Ninguém escreve pelo
-- cliente — só o sistema (registar_infracao é security definer / service_role).
drop policy if exists "infracoes_dono_le" on public.infracoes;
create policy "infracoes_dono_le" on public.infracoes
  for select using (auth.uid() = perfil_id);

-- ----------------------------------------------------------------
-- 3) HELPER esta_suspenso(perfil) — a pergunta que as guardas fazem.
--    security definer: lê perfis mesmo sob RLS. STABLE (usa now()).
-- ----------------------------------------------------------------
create or replace function public.esta_suspenso(p_perfil uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = p_perfil
      and suspenso_ate is not null
      and suspenso_ate > now()
  );
$$;

-- ----------------------------------------------------------------
-- 4) A ESCADA — registar_infracao(perfil, tipo, origem).
--    Função reutilizável, chamada no momento em que a marca é emitida (pelo
--    trigger dos contadores no ramo interno, por RPC no ramo convite, e pelo
--    admin no caminho de ataque). Regista a infração (append-only), conta as
--    dos últimos 6 MESES (janela de reincidência) e aplica o degrau.
--
--    Degraus (por nº de infrações na janela, ESTA incluída):
--       1 → 0  (só marca pública, SEM suspensão)     — a escada arranca na 2.ª
--       2 → 1 mês
--       3 → 6 meses
--      4+ → 2 anos                                    — topo (a porta reabre)
--    ATAQUE: nunca ganha o degrau 0 — o piso é o degrau 1 (1 mês) mesmo à 1.ª.
--
--    NUNCA encurta uma suspensão viva (só escala). Devolve o degrau aplicado.
-- ----------------------------------------------------------------
create or replace function public.registar_infracao(
  p_perfil uuid,
  p_tipo   text default 'incumprimento',
  p_origem text default null
)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  tipo_ok  text := case when p_tipo = 'ataque' then 'ataque' else 'incumprimento' end;
  n        int;
  efetivo  int;
  nivel    int;
  dur      interval;
  novo_ate timestamptz;
begin
  if p_perfil is null then
    return 0;
  end if;

  -- Livro auditável: uma linha por marca (append-only).
  insert into public.infracoes (perfil_id, tipo, origem)
  values (p_perfil, tipo_ok, p_origem);

  -- Reincidência: infrações na janela de 6 meses (esta incluída).
  select count(*) into n
    from public.infracoes
   where perfil_id = p_perfil
     and criado_em > now() - interval '6 months';

  -- Ataque não ganha o 1.º degrau livre: o piso é a 2.ª posição da escada.
  efetivo := n;
  if tipo_ok = 'ataque' and efetivo < 2 then
    efetivo := 2;
  end if;

  nivel := case
             when efetivo <= 1 then 0   -- 1.ª marca = só marca pública
             when efetivo = 2  then 1   -- 1 mês
             when efetivo = 3  then 2   -- 6 meses
             else                    3  -- 2 anos (topo; sem perpétua)
           end;

  if nivel = 0 then
    return 0;  -- só marca pública; a escada ainda não arrancou
  end if;

  dur := case nivel
           when 1 then interval '1 month'
           when 2 then interval '6 months'
           else        interval '2 years'
         end;
  novo_ate := now() + dur;

  -- É o SISTEMA a escrever o estado de suspensão (guarda_perfil deixa passar).
  -- greatest() garante que uma reincidência nunca ENCURTA uma suspensão viva.
  perform set_config('honra.sistema', '1', true);
  update public.perfis
     set suspenso_ate    = greatest(coalesce(suspenso_ate, now()), novo_ate),
         nivel_suspensao = greatest(coalesce(nivel_suspensao, 0), nivel)
   where id = p_perfil;

  return nivel;
end;
$$;

-- ----------------------------------------------------------------
-- 5) RAMO INTERNO — o trigger dos contadores 016/033 alimenta a escada.
--    Reproduz EXACTAMENTE o corpo vivo (033) e só ACRESCENTA registar_infracao
--    no ramo 'incumprido', a quem falhou (a=de_perfil, b=para_perfil), no exato
--    momento em que o contador negocios_falhados sobe. Os contadores ficam
--    INTACTOS. O mesmo trigger after_orcamento_contadores continua a chamá-la.
-- ----------------------------------------------------------------
create or replace function public.atualizar_contadores_honra()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.estado = 'selado' and old.estado is distinct from 'selado' then
    update public.perfis set apertos_selados = apertos_selados + 1
      where id in (new.de_perfil, new.para_perfil);
  elsif new.estado = 'honrado' and old.estado is distinct from 'honrado' then
    update public.perfis set negocios_honrados = negocios_honrados + 1
      where id in (new.de_perfil, new.para_perfil);
  elsif new.estado = 'cancelado' and old.estado is distinct from 'cancelado' then
    update public.perfis set cancelados_mutuo = cancelados_mutuo + 1
      where id in (new.de_perfil, new.para_perfil);
  elsif new.estado = 'incumprido' and old.estado is distinct from 'incumprido' then
    if new.quem_falhou in ('a', 'ambos') then
      update public.perfis set negocios_falhados = negocios_falhados + 1 where id = new.de_perfil;
      perform public.registar_infracao(new.de_perfil, 'incumprimento', 'aperto:' || new.id);
    end if;
    if new.quem_falhou in ('b', 'ambos') then
      update public.perfis set negocios_falhados = negocios_falhados + 1 where id = new.para_perfil;
      perform public.registar_infracao(new.para_perfil, 'incumprimento', 'aperto:' || new.id);
    end if;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------
-- 6) GUARDA DO ESTADO — suspenso_ate / nivel_suspensao são do SISTEMA.
--    Reproduz o corpo vivo da guarda_perfil (033) e ACRESCENTA as duas colunas
--    novas à lista protegida (o cliente não se des-suspende nem se auto-suspende).
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
     or new.suspenso_ate is distinct from old.suspenso_ate
     or new.nivel_suspensao is distinct from old.nivel_suspensao
     or new.is_admin is distinct from old.is_admin then
    raise exception 'Campos de sistema (confiança / suspensão / admin) não são editáveis pelo cliente.';
  end if;
  return new;
end; $$;

-- ----------------------------------------------------------------
-- 7) GUARDA DOS GESTOS (aceitar / selar) — bloqueia se suspenso.
--    Reproduz o corpo vivo da guarda_aceita_verificado (043) e ACRESCENTA a
--    verificação de suspensão. Corre em TODOS os updates (inclusive service_role
--    das Edge Functions) — a defesa de fundo, mesmo que o TS falhe. A marca de
--    suspensão nunca é imposta a quem já a tinha antes do gesto.
-- ----------------------------------------------------------------
create or replace function public.guarda_aceita_verificado()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.estado = 'aceite' and old.estado is distinct from 'aceite' then
    if public.esta_suspenso(new.para_perfil) then
      raise exception 'Conta suspensa: não podes aceitar orçamentos enquanto durar a suspensão.';
    end if;
    if not public.identidade_verificada(new.para_perfil) then
      raise exception 'Precisas de verificar a identidade para aceitar orçamentos.';
    end if;
  end if;
  if new.estado = 'selado' and old.estado is distinct from 'selado' then
    if public.esta_suspenso(new.de_perfil) then
      raise exception 'Conta suspensa: não podes selar apertos de mão enquanto durar a suspensão.';
    end if;
    if not public.identidade_verificada(new.de_perfil) then
      raise exception 'Precisas de verificar a identidade para selar o aperto de mão.';
    end if;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------
-- 8) GUARDA DE PEDIR (orc_pede) — recria a policy viva (043) + suspensão.
-- ----------------------------------------------------------------
drop policy if exists "orc_pede" on public.orcamentos;
create policy "orc_pede" on public.orcamentos
  for insert with check (
    auth.uid() = de_perfil
    and estado = 'pedido'
    and public.identidade_verificada(auth.uid())
    and not public.esta_suspenso(auth.uid())
  );

-- ----------------------------------------------------------------
-- 9) GUARDA DE PUBLICAR (trabalhos) — recria a policy viva (011) + suspensão.
-- ----------------------------------------------------------------
drop policy if exists "trabalhos_autor_insere" on public.trabalhos;
create policy "trabalhos_autor_insere" on public.trabalhos
  for insert with check (
    auth.uid() = autor_perfil
    and not public.esta_suspenso(auth.uid())
  );

-- ----------------------------------------------------------------
-- 10) GANCHO DOCUMENTADO (advogado, Q10-A) — retenção pós-apagamento.
--     A suspensão vive na conta e o eliminar-conta bloqueia o apagamento
--     enquanto ela durar (impede a fuga por apagamento). O passo seguinte —
--     reter um HASH irreversível do documento + denylist de expulsos que
--     SOBREVIVA ao apagamento — NÃO se constrói aqui: depende do parecer do
--     advogado sobre interesse legítimo vs direito ao apagamento (LIA art.
--     6.º/1/f). Sem isso, a fuga A fica MITIGADA (não se apaga enquanto
--     suspenso), não FECHADA (após a suspensão expirar, o apagamento volta a
--     ser possível). Deixado explícito para não fingir que está resolvido.
-- ----------------------------------------------------------------
