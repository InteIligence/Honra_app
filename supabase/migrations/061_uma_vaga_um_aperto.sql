-- ============================================================
-- HONRA — Migração 061: UMA VAGA, UM APERTO (a palavra dada é uma)
-- ------------------------------------------------------------
-- O BURACO (exposto no STATUS 26/07 (2) do ACORDAR.md): a 058 pôs o anúncio a
-- seguir o aperto — quando alguém sela, o anúncio passa a 'a_decorrer' e os
-- candidatos preteridos são avisados. MAS os orçamentos IRMÃOS do mesmo
-- anúncio (negociações abertas com outros candidatos, em 'pedido'/'aceite')
-- ficavam vivos: o autor ainda conseguia selar um SEGUNDO aperto para a mesma
-- vaga. O sincronizador só guardava a posse do anúncio (`where estado =
-- 'aberto'`), pelo que o segundo selo nascia como negócio selado SEM anúncio —
-- uma dupla promessa. No Honra a palavra dada é UMA: uma vaga, um aperto.
--
-- O que esta migração faz (padrão 043/060: a app trava, a BD trava na mesma):
--   1) CASCATA — quando um orçamento com trabalho_id sela, os irmãos vivos
--      pré-selo ('pedido'/'aceite') do mesmo anúncio passam a 'expirado' e o
--      candidato de cada um é avisado com a voz da 058 ("A vaga já tem quem a
--      faça") — salvo se a 058 já o avisou pela candidatura (uma vez, sem
--      drama, nunca duas).
--   2) GUARDA — a transição para 'selado' de um orçamento cujo anúncio já
--      está entregue a OUTRO aperto morre na base, com uma mensagem que a app
--      sabe mostrar (o aperto-agir devolve a razão real e o ecrã do projeto
--      exibe-a). Fecha a corrida de dois selos em simultâneo e qualquer
--      caminho novo (ex.: negociação aberta depois de a vaga ser entregue).
--   3) LIMPEZA — irmãos pré-selo de anúncios JÁ ocupados (selos dados antes
--      desta migração) passam a 'expirado', triggers suspensos (padrão 060):
--      sem avisos fantasma — o aviso da vaga já foi dado pela 058 na altura.
--
-- PORQUÊ 'expirado' (e não 'recusado', nem estado novo): o check da 007 já
-- tem os terminais todos; 'recusado' diria que o CANDIDATO recusou (mentira —
-- ele até queria a vaga), enquanto 'expirado' é literalmente o que aconteceu:
-- o selo deste aperto nunca veio. É neutro na reputação (016/033/041/048 não
-- o contam) e é estado morto para o índice da 060 — o par pode voltar a
-- negociar se o anúncio reabrir.
--
-- E os avisos genéricos do ciclo ("O pedido expirou")? NÃO disparam na
-- cascata: ela iça a flag transacional honra.cascata_selo e o notificar_ciclo
-- (recriado abaixo, à letra igual à 049 + a flag — mesmo padrão do
-- honra.sistema da 015) cala-se. Fala só a voz certa, a da vaga entregue.
--
-- Aditiva e idempotente. Correr no SQL Editor DEPOIS da 060.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) notificar_ciclo com a flag da cascata. Tudo o resto À LETRA igual à 049
--    (que era a versão viva). Só se acrescenta a saída silenciosa no topo.
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
  -- aperto sela. O aviso certo ("A vaga já tem quem a faça") é dado pela
  -- própria cascata — os genéricos do ciclo ficariam a mentir ("expirou"
  -- soa a relógio, e isto foi uma escolha). Uma voz de cada vez.
  if current_setting('honra.cascata_selo', true) = '1' then
    return new;
  end if;

  select nome into nome_a from public.perfis where id = new.de_perfil;
  select nome into nome_b from public.perfis where id = new.para_perfil;

  -- ===== NOVO PEDIDO (insert) → avisa B =====
  if tg_op = 'INSERT' then
    if new.estado = 'pedido' then
      if new.descricao is distinct from 'Conversa' then
        -- Pedido de orçamento REAL → sino (convites/apertos/orçamentos).
        perform public.criar_aviso(new.para_perfil, 'pedido', new.id,
          'Novo pedido de orçamento',
          'De ' || coalesce(nome_a, 'alguém') || '. Aceita e dá a tua palavra para arrancar.',
          null, true);
      end if;
      -- descricao='Conversa' (botão "Mensagem"): SEM aviso no sino — a conversa
      -- vive no badge do Chat (migrações 020/021). Fecha a fuga da 039.
    end if;
    return new;
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
-- 2) A CASCATA — quando um aperto com anúncio sela, os irmãos pré-selo
--    expiram e cada candidato preterido fica a saber. O nome do trigger
--    ordena DEPOIS de after_orcamento_anuncio (058) e after_orcamento_notifica
--    (006) de propósito: quando corre, o anúncio já foi reclamado e os avisos
--    da candidatura já saíram — o dedup abaixo conta com isso.
-- ----------------------------------------------------------------
create or replace function public.encerrar_irmaos_ao_selar()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  tit text;
  reclamado boolean;  -- a 058 reclamou o anúncio NESTE selo (e avisou as candidaturas)?
begin
  -- Negócio sem anúncio por trás — nada a fazer (mesmas saídas da 058).
  if new.trabalho_id is null then
    return null;
  end if;
  if new.estado is not distinct from old.estado then
    return null;
  end if;
  if new.estado <> 'selado' then
    return null;
  end if;

  select t.titulo, (t.orcamento_selado = new.id)
    into tit, reclamado
    from public.trabalhos t
   where t.id = new.trabalho_id;

  -- Os genéricos do ciclo calam-se durante a cascata (ver notificar_ciclo).
  perform set_config('honra.cascata_selo', '1', true);

  -- Os irmãos vivos pré-selo morrem em 'expirado' (o selo deles nunca veio;
  -- sem marca para ninguém) e o candidato de cada um é avisado — EXCETO quem
  -- a 058 já avisou pela candidatura neste mesmo selo (uma vez, nunca duas).
  -- Se a 058 não reclamou o anúncio (ex.: o autor tinha-o fechado à mão e
  -- selou na mesma), ela não avisou ninguém — então avisamos todos.
  with irmaos as (
    update public.orcamentos o
       set estado = 'expirado'
     where o.trabalho_id = new.trabalho_id
       and o.id <> new.id
       and o.estado in ('pedido', 'aceite')
    returning o.para_perfil
  )
  insert into public.notificacoes (perfil_id, tipo, trabalho_id, titulo, corpo)
  select i.para_perfil,
         'trabalho_ocupado',
         new.trabalho_id,
         'A vaga já tem quem a faça',
         coalesce(tit, 'O trabalho') || ' foi entregue a outra pessoa. O teu orçamento ficou sem efeito — sem marca para ti. Obrigado por te teres apresentado — há mais no mural.'
    from irmaos i
   where not (
     coalesce(reclamado, false)
     and exists (
       select 1 from public.candidaturas c
        where c.trabalho_id = new.trabalho_id
          and c.candidato_perfil = i.para_perfil
     )
   );

  perform set_config('honra.cascata_selo', '', true);
  return null;
end;
$$;

drop trigger if exists after_orcamento_vaga_uma on public.orcamentos;
create trigger after_orcamento_vaga_uma
  after update of estado on public.orcamentos
  for each row execute function public.encerrar_irmaos_ao_selar();

-- ----------------------------------------------------------------
-- 3) A GUARDA — o segundo selo morre na base, venha de onde vier (como a
--    guarda_aceita_verificado da 043: SEM bypass de service_role — o selo VEM
--    do servidor, e é exatamente esse update que aqui se guarda). O anúncio
--    está "entregue" se o trabalho aponta para OUTRO aperto (orcamento_selado,
--    058) OU se existe outro irmão já selado/em curso (cobre o caso em que a
--    058 não chegou a reclamar o anúncio).
--    O `for update` na linha do anúncio serializa dois selos em simultâneo:
--    o segundo espera pelo primeiro e, quando lê, já vê a vaga entregue.
--    (Na corrida exata os locks podem cruzar-se em sentidos opostos e dar
--    deadlock — o Postgres desfaz um dos lados com erro; qualquer desfecho é
--    consistente e a app mostra a razão e recarrega.)
-- ----------------------------------------------------------------
create or replace function public.guarda_vaga_uma()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.estado = 'selado' and old.estado is distinct from 'selado'
     and new.trabalho_id is not null then

    perform 1 from public.trabalhos t where t.id = new.trabalho_id for update;

    if exists (
         select 1 from public.trabalhos t
          where t.id = new.trabalho_id
            and t.orcamento_selado is not null
            and t.orcamento_selado <> new.id
       )
       or exists (
         select 1 from public.orcamentos o2
          where o2.trabalho_id = new.trabalho_id
            and o2.id <> new.id
            and o2.estado in ('selado', 'honrado', 'entregue', 'em_curso')
       ) then
      raise exception 'A vaga já tem quem a faça — este anúncio já está entregue a outro aperto de mão.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists before_orcamento_vaga_uma on public.orcamentos;
create trigger before_orcamento_vaga_uma
  before update of estado on public.orcamentos
  for each row execute function public.guarda_vaga_uma();

-- ----------------------------------------------------------------
-- 4) LIMPEZA dos irmãos já ultrapassados: selos dados ANTES desta migração
--    deixaram irmãos 'pedido'/'aceite' vivos em anúncios já entregues. Passam
--    a 'expirado' com os triggers suspensos (padrão 060): não é uma transição
--    real do ciclo e o aviso da vaga já foi dado pela 058 na altura do selo —
--    repeti-lo agora seria drama. (Se a BD viva tiver já uma dupla promessa
--    CONSUMADA — dois selados no mesmo anúncio — esta limpeza não lhe toca:
--    desfazer um selo dado é decisão do Vítor, não de uma migração.)
-- ----------------------------------------------------------------
set session_replication_role = replica;

update public.orcamentos o
   set estado = 'expirado'
  from public.trabalhos t
 where t.id = o.trabalho_id
   and t.orcamento_selado is not null
   and t.orcamento_selado <> o.id
   and o.estado in ('pedido', 'aceite');

set session_replication_role = origin;
