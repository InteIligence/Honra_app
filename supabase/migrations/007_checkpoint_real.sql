-- ============================================================
-- HONRA — Migração 007: CHECKPOINT REAL (evidência + entrega + avaliação certa)
-- ------------------------------------------------------------
-- Duas correções ao ciclo, decididas com o Vítor (2026-07-10):
--   1) EVIDÊNCIA: o freelancer anexa foto/ficheiro ao apresentar evolução; a
--      empresa confirma porque VIU (mostrar, não dizer). Guardado no Storage
--      (bucket 'evolucoes') + a referência em orcamentos.evolucao_ficheiro.
--   2) AVALIAÇÃO NO MOMENTO CERTO: 'honrado' é só o ARRANQUE honrado (caução
--      libertada), NÃO a entrega. Depois de honrado, o projeto segue na
--      reputação; quando o trabalho é entregue, há um "concluído" MÚTUO (sem
--      dinheiro) e SÓ AÍ abre a avaliação.
--
-- Novo troço da máquina de estados (depois de honrado):
--   honrado → entregue (B marca "entregue") → concluido (A confirma) → avaliar
--
-- Correr no SQL Editor DEPOIS da 006.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) COLUNA da evidência + ESTADO 'entregue'
-- ----------------------------------------------------------------
alter table public.orcamentos
  add column if not exists evolucao_ficheiro text;  -- caminho no bucket 'evolucoes'

alter table public.orcamentos drop constraint if exists orcamentos_estado_check;
alter table public.orcamentos add constraint orcamentos_estado_check
  check (estado in (
    'pedido','aceite','selado','honrado','entregue','concluido',
    'incumprido','cancelado','expirado','recusado',
    -- legado
    'em_curso','confirmado_ambos','devolvido'
  ));

-- ----------------------------------------------------------------
-- 2) GUARDA de integridade — agora permite as transições de ENTREGA
--    (sem dinheiro, feitas direto pelo cliente na app), mantendo tudo o
--    resto reservado ao servidor. Recria a função da 005 com estas regras.
-- ----------------------------------------------------------------
create or replace function public.guarda_ciclo_caucao()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Servidor (Edge Functions) faz tudo. Reconhecido por service_role OU auth.uid() nulo.
  if auth.role() = 'service_role' or auth.uid() is null then
    return new;
  end if;

  -- Transições de estado permitidas ao CLIENTE (todas sem dinheiro):
  --   pedido   → recusado   (B recusa)
  --   honrado  → entregue   (B, para_perfil, marca o trabalho entregue)
  --   entregue → concluido  (A, de_perfil, confirma a entrega)
  if new.estado is distinct from old.estado then
    if not (
      (old.estado = 'pedido'   and new.estado = 'recusado')
      or (old.estado = 'honrado'  and new.estado = 'entregue'  and auth.uid() = new.para_perfil)
      or (old.estado = 'entregue' and new.estado = 'concluido' and auth.uid() = new.de_perfil)
    ) then
      raise exception 'Transição de estado reservada ao servidor (%→%).', old.estado, new.estado;
    end if;
  end if;

  -- Colunas de caução/prova continuam só do servidor.
  if new.hold_a      is distinct from old.hold_a
     or new.hold_b      is distinct from old.hold_b
     or new.aceite_em   is distinct from old.aceite_em
     or new.selado_em   is distinct from old.selado_em
     or new.a_agiu_em   is distinct from old.a_agiu_em
     or new.b_agiu_em   is distinct from old.b_agiu_em
     or new.cancel_por  is distinct from old.cancel_por
     or new.quem_falhou is distinct from old.quem_falhou
     or new.evolucao_ficheiro is distinct from old.evolucao_ficheiro
     or new.valor_taxa  is distinct from old.valor_taxa then
    raise exception 'Coluna de caução/prova reservada ao servidor.';
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------
-- 3) AVALIAÇÃO — só na CONCLUSÃO (tira 'honrado'; a entrega é que dá reputação).
-- ----------------------------------------------------------------
drop policy if exists "avaliacoes_insere_com_prova" on public.avaliacoes;
create policy "avaliacoes_insere_com_prova" on public.avaliacoes
  for insert with check (
    auth.uid() = de_perfil
    and exists (
      select 1 from public.orcamentos o
      where o.id = avaliacoes.orcamento_id
        and o.estado in ('concluido', 'confirmado_ambos', 'devolvido')  -- SEM 'honrado'
        and (
          (o.de_perfil = auth.uid()   and o.para_perfil = avaliacoes.para_perfil)
          or (o.para_perfil = auth.uid() and o.de_perfil   = avaliacoes.para_perfil)
        )
    )
  );

-- ----------------------------------------------------------------
-- 4) STORAGE — bucket privado 'evolucoes' + políticas (só as 2 partes).
--    Caminho: {orcamento_id}/{ficheiro}. B carrega; A e B veem.
-- ----------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('evolucoes', 'evolucoes', false)
on conflict (id) do nothing;

drop policy if exists "evolucoes_veem_partes" on storage.objects;
create policy "evolucoes_veem_partes" on storage.objects
  for select using (
    bucket_id = 'evolucoes' and exists (
      select 1 from public.orcamentos o
      where o.id = ((storage.foldername(name))[1])::uuid
        and (o.de_perfil = auth.uid() or o.para_perfil = auth.uid())
    )
  );

drop policy if exists "evolucoes_carrega_freelancer" on storage.objects;
create policy "evolucoes_carrega_freelancer" on storage.objects
  for insert with check (
    bucket_id = 'evolucoes' and exists (
      select 1 from public.orcamentos o
      where o.id = ((storage.foldername(name))[1])::uuid
        and o.para_perfil = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- 5) AVISOS — acrescenta os momentos da ENTREGA ao trigger do ciclo.
--    (Recria notificar_ciclo da 006 com dois ramos novos.)
-- ----------------------------------------------------------------
create or replace function public.notificar_ciclo()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  nome_a text;
  nome_b text;
  prazo_check timestamptz;
begin
  select nome into nome_a from public.perfis where id = new.de_perfil;
  select nome into nome_b from public.perfis where id = new.para_perfil;

  if tg_op = 'INSERT' then
    if new.estado = 'pedido' then
      perform public.criar_aviso(new.para_perfil, 'pedido', new.id,
        'Novo pedido de orçamento',
        'De ' || coalesce(nome_a, 'alguém') || '. Aceita e segura a caução para arrancar.',
        null, true);
    end if;
    return new;
  end if;

  if new.estado is distinct from old.estado then
    if new.estado = 'aceite' then
      perform public.criar_aviso(new.de_perfil, 'aceite', new.id,
        'Aceitaram — sela o aperto de mão',
        coalesce(nome_b, 'A outra parte') || ' aceitou e segurou a caução. Fecha o aperto de mão.',
        new.aceite_em + interval '48 hours', true);

    elsif new.estado = 'selado' then
      perform public.criar_aviso(new.para_perfil, 'selado', new.id,
        'Aperto de mão selado',
        'O projeto arrancou. Mostra evolução antes do prazo para libertar a caução.',
        new.selado_em + interval '6 days', false);

    elsif new.estado = 'honrado' then
      perform public.criar_aviso(new.de_perfil, 'honrado', new.id, 'Aperto de mão honrado',
        'Caução libertada — nada foi cobrado. O projeto segue na reputação.', null, false);
      perform public.criar_aviso(new.para_perfil, 'honrado', new.id, 'Aperto de mão honrado',
        'Caução libertada — nada foi cobrado. O projeto segue na reputação.', null, false);

    elsif new.estado = 'entregue' then
      -- B marcou entregue → A confirma para concluir e avaliarem.
      perform public.criar_aviso(new.de_perfil, 'entregue', new.id, 'Trabalho entregue',
        coalesce(nome_b, 'A outra parte') || ' marcou o trabalho como entregue. Confirma a entrega.',
        null, true);

    elsif new.estado = 'concluido' then
      perform public.criar_aviso(new.de_perfil, 'concluido', new.id, 'Negócio concluído',
        'Entrega confirmada. Já se podem avaliar.', null, false);
      perform public.criar_aviso(new.para_perfil, 'concluido', new.id, 'Negócio concluído',
        'Entrega confirmada. Já se podem avaliar.', null, false);

    elsif new.estado = 'incumprido' then
      perform public.criar_aviso(new.de_perfil, 'incumprido', new.id,
        case when new.quem_falhou in ('a','ambos') then 'Não compareceste a tempo'
             else 'A outra parte não compareceu' end,
        case when new.quem_falhou in ('a','ambos') then 'A caução de 2€ foi cobrada e o negócio ficou marcado.'
             else 'A tua caução foi libertada.' end, null, false);
      perform public.criar_aviso(new.para_perfil, 'incumprido', new.id,
        case when new.quem_falhou in ('b','ambos') then 'Não compareceste a tempo'
             else 'A outra parte não compareceu' end,
        case when new.quem_falhou in ('b','ambos') then 'A caução de 2€ foi cobrada e o negócio ficou marcado.'
             else 'A tua caução foi libertada.' end, null, false);

    elsif new.estado = 'cancelado' then
      perform public.criar_aviso(new.de_perfil, 'cancelado', new.id,
        'Cancelado de comum acordo', 'Os holds foram libertados. Sem marca.', null, false);
      perform public.criar_aviso(new.para_perfil, 'cancelado', new.id,
        'Cancelado de comum acordo', 'Os holds foram libertados. Sem marca.', null, false);

    elsif new.estado = 'expirado' then
      perform public.criar_aviso(new.de_perfil, 'expirado', new.id,
        'Aperto de mão não fechado a tempo', 'O selo não foi dado dentro do prazo.', null, false);
      perform public.criar_aviso(new.para_perfil, 'expirado', new.id,
        'Aperto de mão não fechado a tempo', 'O selo não foi dado a tempo. A tua caução foi libertada.', null, false);

    elsif new.estado = 'recusado' then
      perform public.criar_aviso(new.de_perfil, 'recusado', new.id,
        'Pedido recusado', coalesce(nome_b, 'A outra parte') || ' recusou o pedido.', null, false);
    end if;

    return new;
  end if;

  -- Checkpoint / cancelamento (ainda 'selado').
  prazo_check := new.selado_em + interval '6 days';

  if new.b_agiu_em is distinct from old.b_agiu_em and new.b_agiu_em is not null then
    perform public.criar_aviso(new.de_perfil, 'apresentou', new.id, 'Evolução apresentada',
      coalesce(nome_b, 'A outra parte') || ' mostrou evolução. Confirma para libertarem a caução.',
      prazo_check, true);
  end if;

  if new.a_agiu_em is distinct from old.a_agiu_em and new.a_agiu_em is not null then
    perform public.criar_aviso(new.para_perfil, 'confirmou', new.id, 'Confirmação recebida',
      coalesce(nome_a, 'A outra parte') || ' confirmou. Falta a tua parte no checkpoint.',
      prazo_check, true);
  end if;

  if new.cancel_por is distinct from old.cancel_por and new.cancel_por is not null then
    perform public.criar_aviso(
      case when new.cancel_por = new.de_perfil then new.para_perfil else new.de_perfil end,
      'cancel_pedido', new.id, 'Pedido de cancelamento',
      'A outra parte quer cancelar de comum acordo. Confirma se concordas.', prazo_check, true);
  end if;

  return new;
end;
$$;
