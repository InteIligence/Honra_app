-- ============================================================
-- HONRA — Migração 010: BLINDAGEM DA REPUTAÇÃO E DA VERIFICAÇÃO
-- ------------------------------------------------------------
-- Achados da auditoria de segurança (2026-07-10). A reputação-como-credencial é
-- o fosso do Honra — se for falsificável, não vale nada. Estes fixes fecham as
-- vias de forjar verificação, negócios e avaliações.
--
-- Correr no SQL Editor DEPOIS da 009.
-- ============================================================

-- ----------------------------------------------------------------
-- FIX 1 (CRÍTICO) — Auto-verificação do selo.
-- Antes: `verif_dono_tudo` (for all) deixava o dono pôr estado='verificado'
-- sozinho → selo falso + passar a guarda "só verificados aceitam".
-- Agora: o cliente NÃO escreve verificacoes; só o servidor (webhook Identity,
-- via service_role) o faz. A leitura continua pública (o selo é público).
-- ----------------------------------------------------------------
drop policy if exists "verif_dono_tudo" on public.verificacoes;
-- (mantém-se `verif_leitura_publica` — leitura pública do selo.)

-- ----------------------------------------------------------------
-- FIX 2 (CRÍTICO) — Fabricar um negócio já concluído.
-- Antes: `orc_pede` só checava de_perfil → dava para inserir direto um orçamento
-- com estado='concluido' e um "parceiro" à escolha, e depois avaliá-lo.
-- Agora: os orçamentos NASCEM em 'pedido'; chegar a concluído exige o ciclo real.
-- ----------------------------------------------------------------
drop policy if exists "orc_pede" on public.orcamentos;
create policy "orc_pede" on public.orcamentos
  for insert with check (auth.uid() = de_perfil and estado = 'pedido');

-- ----------------------------------------------------------------
-- FIX 3 (ALTO) — Inflar o próprio índice de confiança.
-- Antes: o dono podia `update perfis set indice_confianca=5`.
-- Agora: o índice é do SISTEMA. O recalc marca uma flag de transação; a guarda
-- bloqueia qualquer mudança do cliente a essa coluna.
-- ----------------------------------------------------------------
create or replace function public.recalc_indice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('honra.sistema', '1', true);  -- "é o sistema a escrever"
  update public.perfis
     set indice_confianca = (
       select coalesce(avg(nota), 0) from public.avaliacoes where para_perfil = new.para_perfil
     )
   where id = new.para_perfil;
  return new;
end; $$;

create or replace function public.guarda_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null
     or coalesce(current_setting('honra.sistema', true), '') = '1' then
    return new;
  end if;
  if new.indice_confianca is distinct from old.indice_confianca then
    raise exception 'O índice de confiança é calculado pelo sistema, não é editável.';
  end if;
  return new;
end; $$;

drop trigger if exists before_perfil_guarda on public.perfis;
create trigger before_perfil_guarda
  before update on public.perfis
  for each row execute function public.guarda_perfil();

-- ----------------------------------------------------------------
-- FIX 4 (MÉDIO-ALTO) — Reescrever as PARTES de um orçamento.
-- Antes: a guarda do ciclo não protegia de_perfil/para_perfil → uma parte podia
-- apontar um negócio concluído a uma vítima e avaliá-la.
-- Agora: as partes ficam nas colunas reservadas ao servidor. (Recria a guarda
-- da 007 + de_perfil/para_perfil.)
-- ----------------------------------------------------------------
create or replace function public.guarda_ciclo_caucao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null then
    return new;
  end if;

  if new.estado is distinct from old.estado then
    if not (
      (old.estado = 'pedido'   and new.estado = 'recusado')
      or (old.estado = 'honrado'  and new.estado = 'entregue'  and auth.uid() = new.para_perfil)
      or (old.estado = 'entregue' and new.estado = 'concluido' and auth.uid() = new.de_perfil)
    ) then
      raise exception 'Transição de estado reservada ao servidor (%→%).', old.estado, new.estado;
    end if;
  end if;

  if new.de_perfil   is distinct from old.de_perfil
     or new.para_perfil is distinct from old.para_perfil
     or new.hold_a      is distinct from old.hold_a
     or new.hold_b      is distinct from old.hold_b
     or new.aceite_em   is distinct from old.aceite_em
     or new.selado_em   is distinct from old.selado_em
     or new.a_agiu_em   is distinct from old.a_agiu_em
     or new.b_agiu_em   is distinct from old.b_agiu_em
     or new.cancel_por  is distinct from old.cancel_por
     or new.quem_falhou is distinct from old.quem_falhou
     or new.evolucao_ficheiro is distinct from old.evolucao_ficheiro
     or new.valor_taxa  is distinct from old.valor_taxa then
    raise exception 'Coluna reservada ao servidor.';
  end if;

  return new;
end; $$;
-- (o trigger `before_orcamento_ciclo` já executa esta função.)

-- ----------------------------------------------------------------
-- FIX 5 (BAIXO) — Plágio no portefólio.
-- Antes: `ficheiro` livre → referenciar a foto pública de outro perfil.
-- Agora: o ficheiro tem de estar na pasta do próprio ({uid}/...).
-- ----------------------------------------------------------------
drop policy if exists "portfolio_itens_dono_insere" on public.portfolio_itens;
create policy "portfolio_itens_dono_insere" on public.portfolio_itens
  for insert with check (
    auth.uid() = perfil_id and ficheiro like auth.uid()::text || '/%'
  );
