-- ============================================================
-- HONRA — Migração 005: CAUÇÃO POR HOLD/AUTORIZAÇÃO (dois toques)
-- ------------------------------------------------------------
-- SUBSTITUI o modelo antigo (cobrar 2€ via Checkout + refund na
-- conclusão). Esse foi REJEITADO: guardava dinheiro (=escrow, =precisamos
-- de ser instituição de pagamento). O modelo novo NUNCA cobra — SEGURA
-- (hold) os 2€ com a pessoa presente e só CAPTURA a quem foge.
--
-- Verificado ao vivo no Stripe (2026-07-10):
--   autorizar → requires_capture ; capturar → succeeded 2€ ; cancelar → 0€.
--   janela de 7 dias para holds online (CIT). expira → auto-cancela (fail-safe).
--
-- Máquina de estados (nova):
--   pedido                       A propôs (grátis, sem hold)
--     → aceite                   B aceitou e SEGUROU 2€ (hold_b)         [webhook]
--         → selado               A selou e SEGUROU 2€ (hold_a). Aperto   [webhook]
--                                 de mão fechado; relógio de 7 dias arranca.
--             → honrado          checkpoint: os dois agiram → 2 holds
--                                 LIBERTADOS (nada cobrado). Segue na reputação.
--             → incumprido       dia ~6/7: quem NÃO agiu é CAPTURADO (2€ → Honra)
--                                 + marca. quem_falhou = 'a' | 'b' | 'ambos'.
--             → cancelado        cancelamento mútuo (os dois confirmam). Sem marca.
--         → expirado             A não selou a tempo → hold_b libertado.
--     → recusado                 B recusou (antes de qualquer hold).
--
-- Aditivo. Correr DEPOIS da 004, no SQL Editor do Supabase → Run.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) COLUNAS do novo ciclo
-- ----------------------------------------------------------------
alter table public.orcamentos
  add column if not exists hold_a       text,          -- PaymentIntent de A (de_perfil), no selo
  add column if not exists hold_b       text,          -- PaymentIntent de B (para_perfil), na aceitação
  add column if not exists aceite_em    timestamptz,   -- quando B aceitou+segurou (arranca janela p/ A selar)
  add column if not exists selado_em    timestamptz,   -- quando A selou (arranca relógio de 7 dias)
  add column if not exists a_agiu_em    timestamptz,   -- A confirmou no checkpoint
  add column if not exists b_agiu_em    timestamptz,   -- B apresentou evolução no checkpoint
  add column if not exists cancel_por   uuid,          -- quem pediu o cancelamento mútuo (o outro confirma)
  add column if not exists quem_falhou  text;          -- 'a' | 'b' | 'ambos' quando incumprido

-- ----------------------------------------------------------------
-- 2) ESTADOS — recria o check com os estados novos (mantém os antigos
--    para não partir linhas de teste já existentes na BD).
-- ----------------------------------------------------------------
alter table public.orcamentos
  drop constraint if exists orcamentos_estado_check;

alter table public.orcamentos
  add constraint orcamentos_estado_check
  check (estado in (
    -- ciclo novo
    'pedido', 'aceite', 'selado', 'honrado', 'incumprido', 'cancelado', 'expirado', 'recusado',
    -- legado (rows antigas de teste — não usados pelo fluxo novo)
    'em_curso', 'concluido', 'confirmado_ambos', 'devolvido'
  ));

alter table public.orcamentos
  drop constraint if exists orcamentos_quem_falhou_check;

alter table public.orcamentos
  add constraint orcamentos_quem_falhou_check
  check (quem_falhou is null or quem_falhou in ('a', 'b', 'ambos'));

-- ----------------------------------------------------------------
-- 3) GUARDA "só verificados aceitam" — mantém-se (da 004).
--    Agora 'aceite' é escrito pela função/webhook depois do hold de B;
--    a guarda confirma que B (para_perfil) tem a identidade verificada.
--    (Recriada aqui para ser idempotente mesmo sem a 004.)
-- ----------------------------------------------------------------
create or replace function public.guarda_aceita_verificado()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.estado = 'aceite' and old.estado is distinct from 'aceite' then
    if not exists (
      select 1
      from public.verificacoes v
      where v.perfil_id = new.para_perfil
        and v.aba = 'identidade'
        and v.estado = 'verificado'
    ) then
      raise exception 'Precisas de verificar a identidade para aceitar orçamentos.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists before_orcamento_aceita on public.orcamentos;
create trigger before_orcamento_aceita
  before update on public.orcamentos
  for each row execute function public.guarda_aceita_verificado();

-- ----------------------------------------------------------------
-- 4) AVALIAÇÃO — só há reputação para negócios que chegaram ao aperto de
--    mão e passaram o checkpoint honrado. Reescreve a policy de insert.
--    (Um negócio 'incumprido' ou 'cancelado' NÃO dá direito a avaliar:
--     não se usam reviews como arma numa zanga — princípio da mecânica.)
-- ----------------------------------------------------------------
drop policy if exists "avaliacoes_insere_com_prova" on public.avaliacoes;
create policy "avaliacoes_insere_com_prova" on public.avaliacoes
  for insert with check (
    auth.uid() = de_perfil
    and exists (
      select 1
      from public.orcamentos o
      where o.id = avaliacoes.orcamento_id
        and o.estado in ('honrado', 'concluido', 'confirmado_ambos', 'devolvido')
        and (
          (o.de_perfil = auth.uid()   and o.para_perfil = avaliacoes.para_perfil)
          or
          (o.para_perfil = auth.uid() and o.de_perfil   = avaliacoes.para_perfil)
        )
    )
  );

-- ----------------------------------------------------------------
-- 5) BLINDAGEM DE INTEGRIDADE — o estado agora mexe DINHEIRO real (capturar/
--    libertar holds). A policy RLS deixa cada parte fazer UPDATE nas suas linhas;
--    sem esta guarda, um fantasma podia saltar para 'honrado' ou forjar
--    'a_agiu_em/b_agiu_em' pelo cliente e escapar à captura. Este trigger fecha
--    isso: pelo CLIENTE (authenticated) só se permite 'pedido'→'recusado'; todas
--    as transições e colunas com dinheiro/prova ficam reservadas às Edge Functions
--    (service_role, que passa a guarda). O resolver só pode confiar nos timestamps
--    porque SÓ o servidor os escreve.
-- ----------------------------------------------------------------
create or replace function public.guarda_ciclo_caucao()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- As Edge Functions (service_role) fazem o ciclo todo — passam à vontade.
  -- Robustez: reconhecemos o servidor por DUAS vias (basta uma) — o papel
  -- service_role OU a ausência de auth.uid(). Um cliente normal NUNCA chega a
  -- este UPDATE sem auth.uid() (a policy RLS exige que seja uma das partes), por
  -- isso auth.uid() nulo == é o servidor. Assim a guarda não bloqueia as próprias
  -- funções mesmo que auth.role() não devolva o esperado no ambiente real.
  if auth.role() = 'service_role' or auth.uid() is null then
    return new;
  end if;

  -- Cliente: única transição de estado permitida é recusar um pedido.
  if new.estado is distinct from old.estado
     and not (old.estado = 'pedido' and new.estado = 'recusado') then
    raise exception 'Transição de estado reservada ao servidor (%→%).', old.estado, new.estado;
  end if;

  -- Cliente: não pode tocar nas colunas de caução/prova (só o servidor).
  if new.hold_a      is distinct from old.hold_a
     or new.hold_b      is distinct from old.hold_b
     or new.aceite_em   is distinct from old.aceite_em
     or new.selado_em   is distinct from old.selado_em
     or new.a_agiu_em   is distinct from old.a_agiu_em
     or new.b_agiu_em   is distinct from old.b_agiu_em
     or new.cancel_por  is distinct from old.cancel_por
     or new.quem_falhou is distinct from old.quem_falhou
     or new.valor_taxa  is distinct from old.valor_taxa then
    raise exception 'Coluna de caução reservada ao servidor.';
  end if;

  return new;
end;
$$;

drop trigger if exists before_orcamento_ciclo on public.orcamentos;
create trigger before_orcamento_ciclo
  before update on public.orcamentos
  for each row execute function public.guarda_ciclo_caucao();

-- ----------------------------------------------------------------
-- 6) ÍNDICE p/ o resolver agendado varrer holds a resolver depressa.
-- ----------------------------------------------------------------
create index if not exists orcamentos_estado_selado_idx
  on public.orcamentos (estado, selado_em);
create index if not exists orcamentos_estado_aceite_idx
  on public.orcamentos (estado, aceite_em);
