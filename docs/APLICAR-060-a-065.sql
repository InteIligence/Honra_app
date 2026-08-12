-- ############################################################
-- HONRA — PACOTE DE MIGRAÇÕES 060 → 065 (colar no SQL Editor do Supabase)
-- ############################################################
--
-- COMO USAR:
--   1) Cola TUDO isto no SQL Editor e corre. As migrações estão por ORDEM e são
--      re-executáveis (usam `if not exists` / `create or replace` / `drop ... if
--      exists`), por isso podes correr mesmo que já tenhas aplicado algumas.
--   2) Se as linhas de `update storage.buckets ...` (secção 064) derem erro de
--      permissão (projeto gerido), IGNORA-as aqui e aplica os mesmos limites de
--      tamanho/MIME à mão no Dashboard → Storage → cada bucket. O resto aplica na
--      mesma.
--   3) DEPOIS de correr, corre tambem `docs/verificar-estado-vivo.sql` — todas as
--      afirmacoes-chave (secção 5) TÊM de dar `true`.
--
-- A SEGUIR (fora do SQL Editor): redeploy destas Edge Functions —
--   aperto-agir, agir-checkpoint, resolver-caucoes, convite-formulario,
--   exportar-dados, e as 7 de convite (modoTeste): convite-otp, convite-decidir,
--   convite-checkpoint, convite-cancelar, convite-cartao, convite-comparencia,
--   resolver-convites.
--
-- E agendar os crons (purga de convidados; confirmar resolver-convites).
-- ############################################################



-- ============================================================
-- ▼▼▼  060_um_negocio_vivo_por_par.sql
-- ============================================================
-- ============================================================
-- 060 — UM negócio vivo por (trabalho, par). O histórico vive
-- DENTRO do negócio, nunca na lista.
-- Problema (26/07): "Abrir orçamento" inseria às cegas — cada
-- clique do autor sobre o mesmo candidato paria mais um cartão
-- em Orçamentos (3× "TESTE 058" na lista de recebidos). A regra
-- do produto é outra: o negócio é UM; o que está pendente
-- consulta-se no interior do projeto (linha do tempo).
-- A app passou a devolver o negócio vivo existente (lib/trabalho
-- .tsx, guarda 060) — aqui a BD deixa de confiar no cliente.
-- ============================================================

-- 1) LIMPEZA dos irmãos já nascidos: por cada (trabalho, par)
-- mantém-se o mais avançado no ciclo (em empate, o mais antigo —
-- o original); os restantes ficam 'cancelado'. Triggers suspensos
-- de propósito: isto não é uma transição real do ciclo — sem
-- avisos fantasma para as partes.
set session_replication_role = replica;

with vivos as (
  select id,
         row_number() over (
           partition by trabalho_id, de_perfil, para_perfil
           order by case estado
                      when 'entregue' then 6
                      when 'honrado'  then 5
                      when 'selado'   then 4
                      when 'em_curso' then 3
                      when 'aceite'   then 2
                      else 1
                    end desc,
                    criado_em asc
         ) as n
  from public.orcamentos
  where trabalho_id is not null
    and estado in ('pedido','aceite','selado','honrado','entregue','em_curso')
)
update public.orcamentos o
   set estado = 'cancelado'
  from vivos v
 where o.id = v.id and v.n > 1;

set session_replication_role = origin;

-- 2) GUARDA — o segundo vivo morre na base, venha de onde vier
-- (mesmo padrão da 043: a app trava, a BD trava na mesma).
create unique index if not exists orc_um_vivo_por_trabalho_par
  on public.orcamentos (trabalho_id, de_perfil, para_perfil)
  where trabalho_id is not null
    and estado in ('pedido','aceite','selado','honrado','entregue','em_curso');


-- ============================================================
-- ▼▼▼  061_uma_vaga_um_aperto.sql
-- ============================================================
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


-- ============================================================
-- ▼▼▼  062_proposta_do_cliente.sql
-- ============================================================
-- ============================================================
-- HONRA — Migração 062: A PROPOSTA DO CLIENTE (valor + prazo)
-- ------------------------------------------------------------
-- O ciclo do negócio (decisão 27/07, Vítor): "O CLIENTE faz a proposta +
-- orçamento, surge o aperto de mão e os checkpoints são elaborados pelo
-- cliente — NUNCA pelo profissional."
--
-- Os checkpoints já cumprem (047: só de_perfil escreve, pré-selo, trancados
-- no selo). Faltavam as outras duas peças da proposta:
--   · VALOR — o orçamento não tinha preço. A coluna nem existia; a proposta
--     do cliente nunca levava o combinado em euros.
--   · PRAZO — existia (047) mas sem guarda: qualquer parte podia mexer-lhe,
--     a qualquer momento. O prazo é a âncora das marcas dos checkpoints —
--     um prestador que o pudesse empurrar mudava o contrato depois da palavra.
--
-- REGRA (o mesmo parafuso da 047, decisão 5):
--   · valor_proposta e prazo são do CLIENTE (de_perfil), pré-selo apenas
--     ('pedido'/'aceite'). O profissional NUNCA os escreve — vê-os antes de
--     aceitar (é a isso que diz sim) e o selo tranca-os para os dois.
--   · O servidor (service_role) continua a poder tudo (Edge Functions).
--
-- Aditiva. Correr DEPOIS da 061.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) O VALOR da proposta — em euros, como orcamento_valor do anúncio (013).
-- ----------------------------------------------------------------
alter table public.orcamentos
  add column if not exists valor_proposta numeric;

comment on column public.orcamentos.valor_proposta is
  'O orçamento combinado (€), proposto pelo CLIENTE (de_perfil) — nunca pelo profissional. Pré-selo apenas; o selo tranca (guarda_proposta_cliente).';

comment on column public.orcamentos.prazo is
  'Prazo do projeto (âncora dos checkpoints, 047). Do CLIENTE, pré-selo apenas; o selo tranca (guarda_proposta_cliente).';

-- ----------------------------------------------------------------
-- 2) A GUARDA — irmã da guarda_checkpoints (047 §4): a app trava,
--    a BD trava na mesma.
-- ----------------------------------------------------------------
create or replace function public.guarda_proposta_cliente()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Servidor faz tudo (mesmo reconhecimento da guarda_ciclo_caucao, 010).
  if auth.role() = 'service_role' or auth.uid() is null then
    return new;
  end if;

  -- Só interessa quando a PROPOSTA muda; o resto do ciclo tem as suas guardas.
  if new.valor_proposta is not distinct from old.valor_proposta
     and new.prazo is not distinct from old.prazo then
    return new;
  end if;

  if auth.uid() is distinct from old.de_perfil then
    raise exception 'A proposta (valor e prazo) é do cliente — nunca do profissional.';
  end if;
  if old.estado not in ('pedido', 'aceite') then
    raise exception 'Proposta trancada após o selo — o combinado não se move.';
  end if;

  return new;
end;
$$;

drop trigger if exists before_orcamento_proposta on public.orcamentos;
create trigger before_orcamento_proposta
  before update on public.orcamentos
  for each row execute function public.guarda_proposta_cliente();


-- ============================================================
-- ▼▼▼  063_fecha_as_pontas_do_ciclo.sql
-- ============================================================
-- ============================================================
-- HONRA — Migração 063: FECHA AS PONTAS DO CICLO
-- ------------------------------------------------------------
-- A vistoria 360° (docs/VISTORIA-360-27-07.md) mostrou que a ESPINHA do ciclo
-- é sólida mas as PONTAS não fecham. Esta migração fecha-as, de uma vez, na BD
-- (a app trava, a BD trava na mesma). Cinco achados, um subsistema:
--
--  #1  O tail `honrado→entregue→concluido` não tinha resolver e a avaliação só
--      abria em `concluido` → o profissional, calando-se, ficava com a honra
--      (contada em `honrado`, 048) e TRANCAVA a crítica para sempre.
--      → `honrado` passa a ser o FIM: a avaliação abre em `honrado`. O tail
--        (entregue/concluido) fica só para dados legados, também avaliáveis.
--
--  #4  A agregação declarava `incumprido` à PRIMEIRA falha, com checkpoints por
--      resolver → a culpa `'ambos'` saía por coincidência de calendário e uma
--      contestação pendente era atropelada.
--      → só se declara o desfecho quando NENHUM checkpoint está por resolver
--        (pendente/entregue/contestado); as culpas somam-se todas de uma vez.
--
--  #3  Um checkpoint `contestado` não tinha resolução automática → sem admin,
--      o negócio congelava para sempre.
--      → novo estado terminal-neutro `arquivado`; o resolver arquiva a
--        contestação sem decisão do admin ao fim de um prazo (SEM marca — a
--        régua do Honra: nunca se pune sem prova). A parte do resolver vive na
--        Edge Function; aqui abre-se o estado e ensina-se a agregação a lê-lo.
--
--  #12 Selar sem prazo criava um relógio OCULTO de 6 dias (o resolver inventava
--      `selado + 6d`), que o profissional nunca viu → emboscada.
--      → ao selar, se o negócio não tem prazo, grava-se um prazo VISÍVEL
--        (selado + 7 dias) na própria linha. Nada de relógios escondidos.
--
--  #13 O checkpoint por omissão era criado "best-effort" na Edge Function, FORA
--      da transação do selo → se o insert falhasse, o negócio ficava `selado`
--      com 0 checkpoints e caía no motor LEGADO.
--      → um trigger no servidor garante ≥1 checkpoint ao entrar em `selado`,
--        na MESMA transação. A Edge Function deixa de o fazer (063 na função).
--
-- DECISÃO DE PRODUTO EXPOSTA (Vítor decide, mas fica coerente por defeito):
--   · Contestação sem decisão do admin → arquiva NEUTRO (sem marca). Alternativa
--     seria marcar o prestador (ónus da prova). Escolhi o neutro (não punir sem
--     prova); trocar é mudar um estado no resolver + a agregação abaixo.
--
-- Aditiva. Correr DEPOIS da 062.
-- ============================================================

-- ------------------------------------------------------------
-- 1) NOVO ESTADO terminal-neutro do checkpoint: 'arquivado' (#3).
--    Contestação que o Honra não julgou a tempo → fecha sem marca.
-- ------------------------------------------------------------
alter table public.checkpoints_orcamento drop constraint if exists checkpoints_orcamento_estado_check;
alter table public.checkpoints_orcamento add constraint checkpoints_orcamento_estado_check
  check (estado in (
    'pendente',    -- à espera que o PRESTADOR apresente evidência
    'entregue',    -- prestador apresentou COM substância; à espera do RECETOR
    'confirmado',  -- recetor confirmou → sem marca
    'contestado',  -- recetor contestou → REVISÃO admin (ninguém marcado)
    'incumprido',  -- falha marcada (prestador não apresentou OU recetor em silêncio avisado)
    'arquivado'    -- contestação sem decisão do admin a tempo → fecha NEUTRO, sem marca (063)
  ));

-- ------------------------------------------------------------
-- 2) AVALIAÇÃO ABRE EM `honrado` (#1). O sentido único (cliente→profissional)
--    e a identidade verificada (043) mantêm-se; só se alarga a porta do estado:
--    `honrado` é agora o fim honroso; entregue/concluido ficam para o legado.
-- ------------------------------------------------------------
drop policy if exists "avaliacoes_insere_com_prova" on public.avaliacoes;
create policy "avaliacoes_insere_com_prova" on public.avaliacoes
  for insert with check (
    auth.uid() = de_perfil
    and public.identidade_verificada(auth.uid())
    and exists (
      select 1
      from public.orcamentos o
      where o.id = avaliacoes.orcamento_id
        -- `honrado` = fim honroso do fluxo de checkpoints (063). Os restantes
        -- são desfechos terminais legados, ainda avaliáveis.
        and o.estado in ('honrado', 'entregue', 'concluido', 'confirmado_ambos', 'devolvido')
        -- UM SÓ SENTIDO (037): o autor é o CLIENTE, o avaliado é o PROFISSIONAL.
        and o.de_perfil   = auth.uid()
        and o.para_perfil = avaliacoes.para_perfil
    )
  );

-- ------------------------------------------------------------
-- 3) AGREGAÇÃO DETERMINÍSTICA (#4). O desfecho do orçamento só se declara
--    quando NENHUM checkpoint está por resolver (pendente/entregue/contestado).
--    Aí somam-se TODAS as culpas de uma vez → `'ambos'` deixa de depender do
--    calendário e uma contestação por decidir nunca é atropelada.
--    `arquivado` (063) é terminal-neutro: não é falha nem confirmação.
-- ------------------------------------------------------------
create or replace function public.avaliar_checkpoints_orcamento(p_orc uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  o record;
  n_total int;
  n_por_resolver int;
  n_falha_prestador int;
  n_falha_recetor int;
  n_confirmados int;
  qf text;
begin
  select id, estado, de_perfil, para_perfil into o
    from public.orcamentos where id = p_orc;
  if not found or o.estado <> 'selado' then
    return coalesce(o.estado, 'sem_orcamento');
  end if;

  select count(*),
         count(*) filter (where estado in ('pendente', 'entregue', 'contestado')),
         count(*) filter (where estado = 'incumprido' and quem_falhou = 'prestador'),
         count(*) filter (where estado = 'incumprido' and quem_falhou = 'recetor'),
         count(*) filter (where estado = 'confirmado')
    into n_total, n_por_resolver, n_falha_prestador, n_falha_recetor, n_confirmados
    from public.checkpoints_orcamento where orcamento_id = p_orc;

  if n_total = 0 then
    return 'selado';  -- orçamento legado sem checkpoints → segue o caminho antigo
  end if;

  -- Ainda há checkpoints por resolver → NÃO se declara nada (fim de #4: espera
  -- por todos antes de atribuir culpa; a contestação por decidir não é atropelada).
  if n_por_resolver > 0 then
    return 'selado';
  end if;

  -- Todos resolvidos. Se houve QUALQUER falha, soma-se a culpa de uma vez.
  if n_falha_prestador > 0 or n_falha_recetor > 0 then
    qf := case
            when n_falha_prestador > 0 and n_falha_recetor > 0 then 'ambos'
            when n_falha_prestador > 0 then 'b'   -- prestador = para_perfil = B
            else 'a'                              -- recetor  = de_perfil  = A
          end;
    update public.orcamentos
       set estado = 'incumprido', quem_falhou = qf
     where id = p_orc and estado = 'selado';
    return 'incumprido';
  end if;

  -- Sem falhas: se houve pelo menos um confirmado, o negócio é HONRADO.
  -- (Só arquivados, sem nenhum confirmado, também fecha honrado — neutro, sem
  --  marca: o Honra não julgou, ninguém é punido nem premiado com falha.)
  update public.orcamentos
     set estado = 'honrado'
   where id = p_orc and estado = 'selado';
  return 'honrado';
end;
$$;

-- ------------------------------------------------------------
-- 4) AO SELAR: prazo VISÍVEL (#12) + checkpoint garantido na transação (#13).
--    4a) BEFORE UPDATE: se o negócio sela sem prazo, grava-se um prazo REAL
--        (selado + 7 dias) na própria linha — nunca um relógio escondido.
-- ------------------------------------------------------------
create or replace function public.prazo_visivel_ao_selar()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.estado = 'selado' and old.estado is distinct from 'selado' and new.prazo is null then
    new.prazo := (coalesce(new.selado_em, now())::date + 7);
  end if;
  return new;
end;
$$;

drop trigger if exists before_orcamento_prazo_visivel on public.orcamentos;
create trigger before_orcamento_prazo_visivel
  before update on public.orcamentos
  for each row execute function public.prazo_visivel_ao_selar();

-- 4b) AFTER UPDATE: garantir ≥1 checkpoint ao entrar em `selado`, na MESMA
--     transação do selo. Substitui o insert best-effort da Edge Function (#13).
--     O default herda o prazo do negócio (agora sempre preenchido por 4a).
create or replace function public.garantir_checkpoint_ao_selar()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.estado = 'selado' and old.estado is distinct from 'selado' then
    if not exists (
      select 1 from public.checkpoints_orcamento where orcamento_id = new.id
    ) then
      insert into public.checkpoints_orcamento (orcamento_id, ordem, descricao, prazo, estado)
      values (new.id, 1, 'Entrega do trabalho', new.prazo, 'pendente');
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists after_orcamento_garante_checkpoint on public.orcamentos;
create trigger after_orcamento_garante_checkpoint
  after update on public.orcamentos
  for each row execute function public.garantir_checkpoint_ao_selar();

-- ------------------------------------------------------------
-- NOTA de aplicação: como as 060/061/062, esta corre no SQL Editor. Depois de
-- aplicada, o script docs/verificar-estado-vivo.sql (063 UX/infra) deve mostrar
-- o novo trigger e a policy alargada — parte do guardrail de drift (#2).
-- ------------------------------------------------------------


-- ============================================================
-- ▼▼▼  064_endurecimento_seguranca.sql
-- ============================================================
-- ============================================================
-- HONRA — Migração 064: ENDURECIMENTO DE SEGURANÇA (vistoria 360°)
-- ------------------------------------------------------------
-- Fecha os achados de segurança que são DB-side e de baixo risco de partir:
--   · perfis: o INSERT do dono passa a defender is_admin/reputação (defesa em
--     profundidade — hoje só a colisão de PK do trigger travava um is_admin=true).
--   · orcamentos: `trabalho_id` fica IMUTÁVEL depois de criado (a guarda 010 já
--     travava de/para_perfil; faltava o trabalho_id — reapontar um selado para
--     outro anúncio quebrava a 058/061).
--   · storage: cada bucket ganha teto de tamanho e lista de MIME — sem isto,
--     nos buckets PÚBLICOS (avatares, portfolio) um SVG/HTML servido inline era
--     XSS armazenado na origem de storage, além de hosting/DoS grátis.
--   · convidados (RGPD): purga de PII de não-utilizadores após retenção.
--   · sou_admin(): RPC para a app saber se o próprio é admin SEM puxar a coluna
--     is_admin para o cliente.
--
-- DEFERIDO (com razão): fechar a LEITURA pública das colunas sensíveis de
-- `perfis` (nif/is_admin/semente/suspensao) exige uma view de montra + trocar
-- todos os embeds `perfis!de_perfil(nome)` por ela — um refactor largo que
-- arriscaria partir dezenas de leituras. Fica como tarefa própria (docs/
-- VISTORIA-360). Esta migração corta o vetor mais alto (is_admin no INSERT) e
-- tira a coluna is_admin do cliente pela RPC.
--
-- Aditiva. Correr DEPOIS da 063.
-- ============================================================

-- ------------------------------------------------------------
-- 1) perfis: INSERT do dono defende is_admin e a reputação inicial.
-- ------------------------------------------------------------
drop policy if exists "perfis_dono_insere" on public.perfis;
create policy "perfis_dono_insere" on public.perfis
  for insert with check (
    auth.uid() = id
    and coalesce(is_admin, false) = false
    and coalesce(indice_confianca, 0) = 0
    and coalesce(negocios_honrados, 0) = 0
    and coalesce(negocios_falhados, 0) = 0
    and coalesce(nivel_suspensao, 0) = 0
    and coalesce(semente, false) = false
  );

-- ------------------------------------------------------------
-- 2) orcamentos: `trabalho_id` imutável (junta-se à guarda 010). Recria-se a
--    guarda_ciclo_caucao inteira (fiel à 010) só para acrescentar a coluna.
-- ------------------------------------------------------------
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
     or new.trabalho_id is distinct from old.trabalho_id   -- 064: anúncio imutável
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

-- ------------------------------------------------------------
-- 3) STORAGE: teto de tamanho + MIME por bucket. (Onde o ALTER for bloqueado
--    no projeto gerido, aplicar os mesmos valores à mão no Dashboard.)
-- ------------------------------------------------------------
update storage.buckets
   set file_size_limit = 5 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'avatares';

update storage.buckets
   set file_size_limit = 60 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']
 where id = 'portfolio';

update storage.buckets
   set file_size_limit = 10 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
 where id in ('evolucoes','cedulas','anexos-convite');

-- ------------------------------------------------------------
-- 4) RGPD — purga de PII de convidados (não-utilizadores) após retenção.
--    Corre pelo cron (a agendar): apaga convidados SEM contrato vivo e cujos
--    eventos/otp já passaram a janela. Nunca toca em quem tem disputa/contrato
--    a decorrer. Chamável só pelo servidor.
-- ------------------------------------------------------------
create or replace function public.purgar_convidados_expirados(p_dias int default 180)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n int;
  corte timestamptz := now() - make_interval(days => p_dias);
begin
  -- OTP de convidado velho (o SMS já não importa passada a janela).
  delete from public.otp_convidado where criado_em < now() - interval '1 day';

  -- Convidados sem NENHUM contrato ainda vivo e criados antes do corte.
  with alvos as (
    select cc.id
      from public.clientes_convidados cc
     where cc.criado_em < corte
       and not exists (
         select 1 from public.contratos_convite ct
          where ct.cliente_convidado_id = cc.id
            and ct.estado not in ('cancelado','expirado','concluido','arquivado','recusado')
       )
  )
  delete from public.clientes_convidados cc using alvos a where cc.id = a.id;
  get diagnostics n = row_count;

  -- Eventos de convite antigos (IP/user-agent/telefone no payload) já sem valor.
  delete from public.eventos_convite where criado_em < corte;

  return n;
end;
$$;

revoke all on function public.purgar_convidados_expirados(int) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5) sou_admin(): a app pergunta sem puxar a coluna is_admin para o cliente.
-- ------------------------------------------------------------
create or replace function public.sou_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_admin from public.perfis where id = auth.uid()), false);
$$;
revoke all on function public.sou_admin() from public, anon;
grant execute on function public.sou_admin() to authenticated;

-- NOTA de aplicação: correr no SQL Editor (como 060–063). A purga (§4) precisa
-- de um cron a chamar `purgar_convidados_expirados()` — agendar junto dos
-- resolvers (ver docs/verificar-estado-vivo.sql / cron-resolver).


-- ============================================================
-- ▼▼▼  065_confidencialidade_perfil.sql
-- ============================================================
-- ============================================================
-- HONRA — Migração 065: CONFIDENCIALIDADE DO PERFIL
-- ------------------------------------------------------------
-- A política `perfis_leitura_publica` (using true) tornava as LINHAS de perfil
-- públicas — correto para a montra. Mas, sem limite de COLUNAS, expunha a
-- QUALQUER pessoa (anon) TODAS as colunas, incluindo as confidenciais:
--   · nif             — número de contribuinte (PII de empresa)
--   · is_admin        — permite enumerar admins para atacar a moderação
--   · semente         — revela perfis de demonstração (mina "pessoas reais")
--   · suspenso_ate / nivel_suspensao — estado de sanção (privado)
--
-- CORREÇÃO por COLUNA (não por linha): revoga-se o SELECT da tabela e concede-se
-- só a MONTRA. As leituras que o PRÓPRIO faz às suas colunas reservadas passam
-- a ir por RPC (sou_admin() da 064 + meu_perfil_reservado() aqui). Os embeds
-- `perfis!de_perfil(nome)` espalhados pela app CONTINUAM a funcionar — só leem
-- `nome`, que é uma coluna concedida.
--
-- POSTURA (fail-closed): qualquer coluna NOVA de perfis fica PRIVADA por omissão
-- — para a tornar pública, acrescenta-se ao GRANT abaixo, numa migração. É a
-- direção segura de falha (uma coluna nova nunca vaza sozinha).
--
-- As Edge Functions leem as colunas reservadas com service_role (que ignora
-- estes GRANTs), logo nada do lado do servidor parte.
--
-- Aditiva. Correr DEPOIS da 064.
-- ============================================================

-- 1) Cortar o acesso amplo e reconceder só a MONTRA (as 15 colunas públicas).
revoke select on public.perfis from anon, authenticated;

grant select (
  id, criado_em, nome, handle, avatar, avatar_url, papel, cidade, tipo,
  disponibilidade, indice_confianca, negocios_honrados, negocios_falhados,
  apertos_selados, cancelados_mutuo
) on public.perfis to anon, authenticated;

-- 2) O PRÓPRIO lê as SUAS colunas reservadas (nunca as de outros).
create or replace function public.meu_perfil_reservado()
returns table (nif text, suspenso_ate timestamptz, nivel_suspensao int)
language sql stable security definer set search_path = public
as $$
  select nif, suspenso_ate, nivel_suspensao
    from public.perfis
   where id = auth.uid();
$$;
revoke all on function public.meu_perfil_reservado() from public, anon;
grant execute on function public.meu_perfil_reservado() to authenticated;

-- NOTA: is_admin lê-se por sou_admin() (064). O `verificar-estado-vivo.sql`
-- ganhou uma afirmação que confirma que a tabela perfis JÁ NÃO tem SELECT amplo
-- para anon (senão é drift e a confidencialidade está aberta).
