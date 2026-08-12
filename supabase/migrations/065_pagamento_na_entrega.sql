-- ============================================================
-- HONRA — Migração 065: PAGAMENTO NA ENTREGA (o dinheiro entra no ciclo)
-- ------------------------------------------------------------
-- Desenho aprovado 27/07 (Vítor). O dinheiro entra no ciclo NA ENTREGA:
--
--   1) O PROFISSIONAL (B, para_perfil) apresenta a entrega final — o ficheiro
--      REAL ("limpo") + uma prova de antevisão ("prova") — e a bola passa ao
--      cliente.
--   2) O CLIENTE (A, de_perfil) PAGA — CAPTURA REAL via Stripe Checkout,
--      NUNCA hold de capture_method=manual: os holds expiram em 4d18h–7 dias
--      (docs/PAGAMENTOS-HOLD-METRICAS.md §1) e o prazo de confirmação (5 dias)
--      + uma disputa rebentariam sempre essa janela. O dinheiro fica RETIDO
--      na conta da plataforma (Stripe Connect, separate charges & transfers)
--      até haver decisão.
--   3) O cliente tem DOIS — e só dois — poderes unilaterais:
--        · CONFIRMAR   → transfer ao Connect de B ('libertado').
--        · CONTESTAR   → o dinheiro CONGELA ('congelado') — não anda para
--                        lado nenhum. A DEVOLUÇÃO NUNCA É UM BOTÃO DO CLIENTE:
--                        só existe como veredito da revisão (checkpoint-disputa).
--   4) SILÊNCIO no prazo de confirmação = liberta ao PROFISSIONAL — avisado
--      no momento do pagamento E relembrado na véspera, nunca emboscada (o
--      mesmo princípio da "marca por inação" da fatia D, 047/decisão 3).
--   5) ENTREGA EM DUAS CAMADAS, imposta por ACESSO (não por fé): a "prova" é
--      visível ao cliente desde a apresentação (com marca de água renderizada
--      por cima na UI — dissuasão, não DRM); o "limpo" SÓ se torna legível ao
--      cliente com pagamento_estado='libertado' (política de Storage abaixo).
--      Devolução ⇒ o cliente nunca teve acesso ao ficheiro entregue.
--   6) Contestação julgada infundada = marca no carril do CONTRATANTE
--      (registar_infracao, 048) — decidida na revisão existente, não num
--      julgamento novo.
--   7) O estado 'congelado' NÃO tem automatismo de saída: aguarda veredito
--      manual da revisão. É DELIBERADO — o destino final do dinheiro congelado
--      em disputa é decisão pendente com o advogado. O resolver NUNCA lhe toca.
--
-- ISTO SUBSTITUI a alocação antiga do hold no fluxo interno: o hold de 2€ do
-- aperto está morto desde 15/07 (migração 032; `autorizar-caucao` é legado e
-- assim fica). FRONTEIRA: este fluxo aplica-se a negócios COM entregável
-- digital E valor combinado (valor_proposta, 062) — o upload é o gatilho. O
-- ciclo de evidência sem dinheiro (checkpoints, 047) continua intacto para o
-- resto.
--
-- NOTA DE NUMERAÇÃO: o briefing desta fatia chamava-lhe 063, mas a 063
-- (fecha as pontas do ciclo) já existia — esta é a 065.
--
-- Aditiva. Correr no SQL Editor DEPOIS da 063.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) COLUNAS do pagamento na entrega, em `orcamentos`.
--    A máquina do DINHEIRO (pagamento_estado) é ortogonal à máquina da HONRA
--    (estado): os checkpoints continuam a fechar o negócio em honrado/
--    incumprido; o dinheiro segue o seu próprio carril.
-- ----------------------------------------------------------------
alter table public.orcamentos
  add column if not exists pagamento_estado text not null default 'sem_pagamento'
    check (pagamento_estado in (
      'sem_pagamento',     -- ainda não há dinheiro no ciclo
      'aguarda_pagamento', -- A abriu o Checkout; sessão por concluir
      'pago_retido',       -- pago; retido na plataforma; relógio de confirmação a correr
      'congelado',         -- A contestou; NÃO anda — só sai por veredito da revisão
      'libertado',         -- transfer ao Connect de B (ou pendente de conta ativa)
      'devolvido'          -- veredito da revisão devolveu ao cliente (nunca botão de A)
    )),
  add column if not exists pagamento_intent  text,        -- PaymentIntent (pi_…) da captura
  add column if not exists pagamento_transfer text,       -- Transfer (tr_…); null em 'libertado' = transferência PENDENTE (resolver re-tenta)
  add column if not exists pago_em           timestamptz, -- quando o webhook confirmou a captura
  add column if not exists confirmar_ate     timestamptz, -- pago_em + PRAZO_CONFIRMACAO_DIAS (5; constante em _shared/pagamentos.ts)
  add column if not exists libertado_em      timestamptz,
  add column if not exists pagamento_relembrado_em timestamptz, -- lembrete de véspera enviado a A (nunca emboscada)
  add column if not exists pagamento_contestacao   text,        -- evidência textual da contestação (obrigatória)
  add column if not exists pagamento_contestado_em timestamptz,
  add column if not exists entrega_prova     text,        -- caminho no bucket 'entregas' ({orcamento_id}/prova-…) — antevisão
  add column if not exists entrega_limpa     text,        -- caminho no bucket 'entregas' ({orcamento_id}/limpa-…) — o ficheiro REAL
  add column if not exists entrega_em        timestamptz; -- quando B apresentou a entrega

comment on column public.orcamentos.pagamento_estado is
  'Máquina do DINHEIRO (065): sem_pagamento→aguarda_pagamento→pago_retido→{libertado|congelado→(veredito)→libertado|devolvido}. Ortogonal ao `estado` (honra). congelado SÓ sai por veredito da revisão — deliberado (decisão pendente c/ advogado).';
comment on column public.orcamentos.pagamento_transfer is
  'Transfer (tr_…) ao Connect de B. Em ''libertado'' com null = transferência pendente (B sem conta ativa) — o resolver re-tenta com Idempotency-Key, nunca duplica.';
comment on column public.orcamentos.confirmar_ate is
  'Prazo de confirmação de A (pago_em + 5 dias). Passado o prazo, o resolver liberta a B — mas só depois de A avisado (pago_retido) E relembrado na véspera (pagamento_relembrado_em).';
comment on column public.orcamentos.entrega_limpa is
  'O ficheiro REAL da entrega. Acesso do cliente TRANCADO por política de Storage até pagamento_estado=''libertado'' — a imposição é por acesso, não por fé.';

-- O resolver varre pago_retido (prazo) e libertado sem transfer (re-tentativa).
create index if not exists orcamentos_pagamento_idx
  on public.orcamentos (pagamento_estado, confirmar_ate)
  where pagamento_estado <> 'sem_pagamento';

-- ----------------------------------------------------------------
-- 2) GUARDA — recria guarda_ciclo_caucao (última versão: 010) com as colunas
--    novas. Bypass do servidor intacto (service_role / auth.uid() nulo).
--
--    Critério de quem escreve o quê (comentado, como pede a régua):
--      · SÓ SERVIDOR: pagamento_estado, pagamento_intent, pagamento_transfer,
--        pago_em, confirmar_ate, libertado_em, pagamento_relembrado_em,
--        pagamento_contestacao, pagamento_contestado_em — é o dinheiro; o
--        cliente pede às Edge Functions, nunca escreve.
--      · B (para_perfil) PODE escrever entrega_prova/entrega_limpa/entrega_em
--        via RLS, MAS SÓ enquanto: estado pós-selo ('selado','honrado',
--        'entregue','concluido' — os dois últimos são o tail legado, mantido
--        para não criar becos), pagamento_estado='sem_pagamento' (depois de
--        pago a entrega TRANCA — o cliente pagou o que viu), valor_proposta
--        definido (sem valor não há fluxo de pagamento — fica o ciclo de
--        evidência legado), e os caminhos dentro da pasta DESTE negócio.
-- ----------------------------------------------------------------
create or replace function public.guarda_ciclo_caucao()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null then
    return new;
  end if;

  -- Transições de estado permitidas ao CLIENTE (inalteradas desde a 010):
  --   pedido→recusado; e o tail legado honrado→entregue (B) / entregue→concluido (A).
  if new.estado is distinct from old.estado then
    if not (
      (old.estado = 'pedido'   and new.estado = 'recusado')
      or (old.estado = 'honrado'  and new.estado = 'entregue'  and auth.uid() = new.para_perfil)
      or (old.estado = 'entregue' and new.estado = 'concluido' and auth.uid() = new.de_perfil)
    ) then
      raise exception 'Transição de estado reservada ao servidor (%→%).', old.estado, new.estado;
    end if;
  end if;

  -- A ENTREGA (065): a única janela de escrita do cliente nas colunas novas.
  if new.entrega_prova is distinct from old.entrega_prova
     or new.entrega_limpa is distinct from old.entrega_limpa
     or new.entrega_em    is distinct from old.entrega_em then
    if auth.uid() is distinct from old.para_perfil then
      raise exception 'A entrega é do profissional deste negócio.';
    end if;
    if old.estado not in ('selado', 'honrado', 'entregue', 'concluido') then
      raise exception 'A entrega só se apresenta com o aperto de mão selado.';
    end if;
    if old.pagamento_estado is distinct from 'sem_pagamento' then
      raise exception 'Entrega trancada: o pagamento já entrou no ciclo.';
    end if;
    if old.valor_proposta is null then
      raise exception 'Este negócio não tem valor combinado — a entrega com pagamento não se aplica.';
    end if;
    if new.entrega_limpa is not null and new.entrega_limpa not like (new.id::text || '/%') then
      raise exception 'O ficheiro da entrega tem de viver na pasta deste negócio.';
    end if;
    if new.entrega_prova is not null and new.entrega_prova not like (new.id::text || '/%') then
      raise exception 'A prova da entrega tem de viver na pasta deste negócio.';
    end if;
    if new.entrega_em is not null and new.entrega_limpa is null then
      raise exception 'A entrega precisa do ficheiro final.';
    end if;
  end if;

  -- Colunas reservadas ao servidor (lista da 010 + o dinheiro da 065).
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
     or new.valor_taxa  is distinct from old.valor_taxa
     or new.pagamento_estado        is distinct from old.pagamento_estado
     or new.pagamento_intent        is distinct from old.pagamento_intent
     or new.pagamento_transfer      is distinct from old.pagamento_transfer
     or new.pago_em                 is distinct from old.pago_em
     or new.confirmar_ate           is distinct from old.confirmar_ate
     or new.libertado_em            is distinct from old.libertado_em
     or new.pagamento_relembrado_em is distinct from old.pagamento_relembrado_em
     or new.pagamento_contestacao   is distinct from old.pagamento_contestacao
     or new.pagamento_contestado_em is distinct from old.pagamento_contestado_em then
    raise exception 'Coluna reservada ao servidor.';
  end if;

  return new;
end; $$;
-- (o trigger `before_orcamento_ciclo` já executa esta função.)

-- ----------------------------------------------------------------
-- 3) AVISOS — recria notificar_ciclo (última versão: 061, à letra) com os
--    momentos novos do dinheiro. Tom Honra: empurra para ação, nunca medo.
--      · entrega apresentada  → A: "vê a entrega e paga"
--      · pago_retido          → B (pagamento retido) + A (relógio de confirmação)
--      · libertado            → B ("pagamento a caminho") + A (o ficheiro é teu)
--      · congelado            → os dois (em revisão)
--      · devolvido            → os dois (veredito)
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
  -- CASCATA DA VAGA (061): os irmãos preteridos expiram em bloco quando um
  -- aperto sela. O aviso certo é dado pela própria cascata. Uma voz de cada vez.
  if current_setting('honra.cascata_selo', true) = '1' then
    return new;
  end if;

  select nome into nome_a from public.perfis where id = new.de_perfil;
  select nome into nome_b from public.perfis where id = new.para_perfil;

  -- ===== NOVO PEDIDO (insert) → avisa B =====
  if tg_op = 'INSERT' then
    if new.estado = 'pedido' then
      if new.descricao is distinct from 'Conversa' then
        perform public.criar_aviso(new.para_perfil, 'pedido', new.id,
          'Novo pedido de orçamento',
          'De ' || coalesce(nome_a, 'alguém') || '. Aceita e dá a tua palavra para arrancar.',
          null, true);
      end if;
    end if;
    return new;
  end if;

  -- ===== PAGAMENTO NA ENTREGA (065) — a máquina do dinheiro fala aqui =====
  if new.pagamento_estado is distinct from old.pagamento_estado then
    if new.pagamento_estado = 'pago_retido' then
      perform public.criar_aviso(new.para_perfil, 'pago_retido', new.id,
        'Pagamento recebido e retido',
        coalesce(nome_a, 'O cliente') || ' pagou a entrega. O valor está retido em segurança e liberta-se com a confirmação — ou pelo prazo.',
        new.confirmar_ate, false);
      perform public.criar_aviso(new.de_perfil, 'pago_retido', new.id,
        'Pagamento feito — confirma a entrega',
        'O valor está retido. Confirma a entrega para o libertar — ou contesta com evidência. Sem resposta até ao prazo, liberta-se ao profissional.',
        new.confirmar_ate, true);

    elsif new.pagamento_estado = 'libertado' then
      perform public.criar_aviso(new.para_perfil, 'pag_libertado', new.id,
        'Pagamento a caminho',
        'A entrega ficou confirmada e o pagamento foi libertado para a tua conta.',
        null, false);
      perform public.criar_aviso(new.de_perfil, 'pag_libertado', new.id,
        'Entrega confirmada',
        'O pagamento seguiu para o profissional. O ficheiro final da entrega é teu — já o podes abrir no negócio.',
        null, false);

    elsif new.pagamento_estado = 'congelado' then
      perform public.criar_aviso(new.para_perfil, 'pag_congelado', new.id,
        'Entrega contestada — pagamento congelado',
        'O cliente contestou a entrega. O valor não anda para lado nenhum até ao veredito da revisão do Honra. Junta a tua prova na conversa do negócio.',
        null, true);
      perform public.criar_aviso(new.de_perfil, 'pag_congelado', new.id,
        'Contestação registada',
        'O pagamento ficou congelado até ao veredito da revisão. Congelar não é devolver: a devolução só existe por decisão da revisão.',
        null, false);

    elsif new.pagamento_estado = 'devolvido' then
      perform public.criar_aviso(new.de_perfil, 'pag_devolvido', new.id,
        'Pagamento devolvido',
        'A revisão do Honra decidiu a teu favor. O valor voltou ao teu cartão.',
        null, false);
      perform public.criar_aviso(new.para_perfil, 'pag_devolvido', new.id,
        'Veredito da revisão',
        'A revisão do Honra devolveu o pagamento ao cliente. O ficheiro da entrega nunca lhe foi aberto.',
        null, false);
    end if;
    -- (aguarda_pagamento e o regresso a sem_pagamento não fazem barulho:
    --  são passos do próprio A, sem ação de ninguém.)
  end if;

  -- Entrega apresentada (B escreveu entrega_em via RLS) → a bola passa a A.
  if new.entrega_em is distinct from old.entrega_em and new.entrega_em is not null then
    perform public.criar_aviso(new.de_perfil, 'entrega_final', new.id,
      'Entrega final apresentada',
      coalesce(nome_b, 'O profissional') || ' apresentou a entrega final. Vê a prova e paga para a receberes — o valor fica retido até confirmares.',
      null, true);
  end if;

  -- ===== TRANSIÇÕES DE ESTADO (update) =====
  if new.estado is distinct from old.estado then
    if new.estado = 'aceite' then
      perform public.criar_aviso(new.de_perfil, 'aceite', new.id,
        'Aceitaram — sela o aperto de mão',
        coalesce(nome_b, 'A outra parte') || ' aceitou e deu a sua palavra. Sela para fechar o compromisso.',
        new.aceite_em + interval '48 hours', true);

    elsif new.estado = 'selado' then
      perform public.criar_aviso(new.para_perfil, 'selado', new.id,
        'Aperto de mão selado',
        'O projeto arrancou. Mostra evolução antes do prazo — a tua palavra está dada.',
        new.selado_em + interval '6 days', false);

    elsif new.estado = 'honrado' then
      perform public.criar_aviso(new.de_perfil, 'honrado', new.id, 'Aperto de mão honrado',
        'Os dois compareceram. O projeto segue na reputação.', null, false);
      perform public.criar_aviso(new.para_perfil, 'honrado', new.id, 'Aperto de mão honrado',
        'Os dois compareceram. O projeto segue na reputação.', null, false);

    elsif new.estado = 'entregue' then
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
        case when new.quem_falhou in ('a','ambos') then 'Faltaste à palavra dada. O incumprimento ficou marcado no teu registo.'
             else 'O incumprimento ficou marcado no registo da outra parte. O teu nome fica limpo.' end,
        null, false);
      perform public.criar_aviso(new.para_perfil, 'incumprido', new.id,
        case when new.quem_falhou in ('b','ambos') then 'Não compareceste a tempo'
             else 'A outra parte não compareceu' end,
        case when new.quem_falhou in ('b','ambos') then 'Faltaste à palavra dada. O incumprimento ficou marcado no teu registo.'
             else 'O incumprimento ficou marcado no registo da outra parte. O teu nome fica limpo.' end,
        null, false);

    elsif new.estado = 'cancelado' then
      perform public.criar_aviso(new.de_perfil, 'cancelado', new.id,
        'Cancelado de comum acordo', 'Desfeito a dois. Sem marca para ninguém.', null, false);
      perform public.criar_aviso(new.para_perfil, 'cancelado', new.id,
        'Cancelado de comum acordo', 'Desfeito a dois. Sem marca para ninguém.', null, false);

    elsif new.estado = 'expirado' then
      perform public.criar_aviso(new.de_perfil, 'expirado', new.id,
        'Aperto de mão não fechado a tempo', 'O selo não foi dado dentro do prazo. O pedido expirou.', null, false);
      perform public.criar_aviso(new.para_perfil, 'expirado', new.id,
        'Aperto de mão não fechado a tempo', 'O selo não foi dado a tempo. O pedido expirou — sem marca.', null, false);

    elsif new.estado = 'recusado' then
      perform public.criar_aviso(new.de_perfil, 'recusado', new.id,
        'Pedido recusado', coalesce(nome_b, 'A outra parte') || ' recusou o pedido.', null, false);
    end if;

    return new;
  end if;

  -- ===== CHECKPOINT / CANCELAMENTO (sem mudar de estado, ainda 'selado') =====
  prazo_check := new.selado_em + interval '6 days';

  if new.b_agiu_em is distinct from old.b_agiu_em and new.b_agiu_em is not null then
    perform public.criar_aviso(new.de_perfil, 'apresentou', new.id, 'Evolução apresentada',
      coalesce(nome_b, 'A outra parte') || ' mostrou evolução. Confirma para honrarem o aperto de mão.',
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

-- ----------------------------------------------------------------
-- 4) STORAGE — bucket privado 'entregas'. A lei das duas camadas vive AQUI:
--      · B (para_perfil) CARREGA na pasta do seu negócio, só enquanto a
--        entrega está aberta (pós-selo, sem pagamento no ciclo, com valor).
--      · B LÊ sempre o que é seu.
--      · A (de_perfil) LÊ a PROVA sempre que for parte ({id}/prova…).
--      · A SÓ LÊ o LIMPO com pagamento_estado='libertado' — o cliente nunca
--        obtém URL do limpo antes disso. Devolvido ⇒ nunca o teve.
--    Sem políticas de update/delete: os ficheiros são imutáveis (substituir =
--    novo nome + atualizar a referência na linha, enquanto a guarda deixar).
-- ----------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('entregas', 'entregas', false)
on conflict (id) do nothing;

drop policy if exists "entregas_b_carrega" on storage.objects;
create policy "entregas_b_carrega" on storage.objects
  for insert with check (
    bucket_id = 'entregas' and exists (
      select 1 from public.orcamentos o
      where o.id = ((storage.foldername(name))[1])::uuid
        and o.para_perfil = auth.uid()
        and o.estado in ('selado', 'honrado', 'entregue', 'concluido')
        and o.pagamento_estado = 'sem_pagamento'
        and o.valor_proposta is not null
    )
  );

drop policy if exists "entregas_b_le" on storage.objects;
create policy "entregas_b_le" on storage.objects
  for select using (
    bucket_id = 'entregas' and exists (
      select 1 from public.orcamentos o
      where o.id = ((storage.foldername(name))[1])::uuid
        and o.para_perfil = auth.uid()
    )
  );

drop policy if exists "entregas_a_le_prova" on storage.objects;
create policy "entregas_a_le_prova" on storage.objects
  for select using (
    bucket_id = 'entregas' and exists (
      select 1 from public.orcamentos o
      where o.id = ((storage.foldername(name))[1])::uuid
        and o.de_perfil = auth.uid()
        and name like o.id::text || '/prova%'
    )
  );

drop policy if exists "entregas_a_le_limpa" on storage.objects;
create policy "entregas_a_le_limpa" on storage.objects
  for select using (
    bucket_id = 'entregas' and exists (
      select 1 from public.orcamentos o
      where o.id = ((storage.foldername(name))[1])::uuid
        and o.de_perfil = auth.uid()
        and o.pagamento_estado = 'libertado'
    )
  );

-- ------------------------------------------------------------
-- NOTA de aplicação: como as 060–063, corre no SQL Editor. Depois de aplicada:
--   · deploy das funções entrega-pagamento / entrega-decidir + redeploy de
--     stripe-webhook, checkpoint-disputa, cancelar-mutuo e resolver-caucoes
--     (comandos em docs/PAGAMENTO-NA-ENTREGA.md);
--   · no dashboard da Stripe, o endpoint do stripe-webhook precisa dos eventos
--     checkout.session.completed E checkout.session.expired.
-- ------------------------------------------------------------
