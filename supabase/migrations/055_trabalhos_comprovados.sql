-- ============================================================
-- HONRA — Migração 055: TRABALHO COMPROVADO (a montra dos negócios honrados)
-- ------------------------------------------------------------
-- O portefólio (009) mostra fotos SOLTAS — qualquer um põe qualquer coisa.
-- O trabalho comprovado é outra liga: só entra um negócio que CHEGOU a
-- 'honrado' na máquina de estados real — e essa, pela blindagem da 010, é
-- impossível de forjar pelo cliente. É o "mostrar, não dizer" com prova:
-- a foto da entrega + o selo + a data saem de uma transação que aconteceu.
--
-- DECISÃO (Vítor, dono do produto):
--   · O EXECUTANTE ESCOLHE quais negócios honrados destaca (não é automático —
--     a montra é dele, o mérito também).
--   · O NOME de quem contratou só aparece COM CONSENTIMENTO EXPLÍCITO dessa
--     pessoa. A linha aparece sempre; o nome só com o "sim". (E o "sim"
--     pode ser retirado a qualquer momento — consentimento a sério.)
--
-- Correr no SQL Editor DEPOIS da 054. NÃO foi aplicada automaticamente.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) GAVETA: trabalhos_comprovados — cada linha é um negócio honrado que o
--    executante decidiu pôr na montra. unique(orcamento, perfil): cada parte
--    destaca o mesmo negócio no máximo uma vez (os dois carris podem — o
--    mérito do contratante também é história para contar).
-- ----------------------------------------------------------------
create table if not exists public.trabalhos_comprovados (
  id                   uuid primary key default gen_random_uuid(),
  orcamento_id         uuid not null references public.orcamentos(id) on delete cascade,
  perfil_id            uuid not null references public.perfis(id) on delete cascade,  -- o executante que destaca
  titulo               text,                                    -- título curto opcional ("Som ao vivo, casamento")
  mostrar_contratante  boolean not null default false,          -- quer mostrar o nome de quem contratou?
  consentimento_estado text not null default 'pendente'
                       check (consentimento_estado in ('pendente','aceite','recusado')),
  criado_em            timestamptz not null default now(),
  unique (orcamento_id, perfil_id)
);

create index if not exists tcomp_perfil_idx
  on public.trabalhos_comprovados (perfil_id, criado_em desc);

alter table public.trabalhos_comprovados enable row level security;

-- ----------------------------------------------------------------
-- 2) RLS — a linha é pública (a montra é para ser vista); o NOME do
--    contratante NÃO vive aqui, vive na view da secção 5 — por isso ler a
--    linha nunca revela nada que precise de consentimento.
-- ----------------------------------------------------------------
drop policy if exists "tcomp_leitura_publica" on public.trabalhos_comprovados;
create policy "tcomp_leitura_publica" on public.trabalhos_comprovados
  for select using (true);

-- Só o executante destaca — e SÓ um negócio honrado de que é mesmo parte
-- (o molde da 003/007: prova por subselect ao orçamento). O leque de estados
-- é o "chegou a honrado" canónico da casa (o mesmo do backfill da 016).
drop policy if exists "tcomp_executante_destaca" on public.trabalhos_comprovados;
create policy "tcomp_executante_destaca" on public.trabalhos_comprovados
  for insert with check (
    auth.uid() = perfil_id
    and exists (
      select 1 from public.orcamentos o
      where o.id = trabalhos_comprovados.orcamento_id
        and o.estado in ('honrado','entregue','concluido','confirmado_ambos','devolvido')
        and (o.de_perfil = auth.uid() or o.para_perfil = auth.uid())
    )
  );

-- O executante gere o seu destaque (título, toggle do nome). As colunas que
-- NÃO são dele (o consentimento) ficam vigiadas pela guarda da secção 3 —
-- RLS não sabe distinguir colunas, o trigger sabe.
drop policy if exists "tcomp_executante_edita" on public.trabalhos_comprovados;
create policy "tcomp_executante_edita" on public.trabalhos_comprovados
  for update using (auth.uid() = perfil_id) with check (auth.uid() = perfil_id);

-- A contraparte (quem contratou) responde ao consentimento no registo onde
-- é a OUTRA parte do negócio. Só a coluna dela — a guarda vigia o resto.
drop policy if exists "tcomp_contraparte_consente" on public.trabalhos_comprovados;
create policy "tcomp_contraparte_consente" on public.trabalhos_comprovados
  for update using (
    auth.uid() <> perfil_id
    and exists (
      select 1 from public.orcamentos o
      where o.id = trabalhos_comprovados.orcamento_id
        and (o.de_perfil = auth.uid() or o.para_perfil = auth.uid())
    )
  ) with check (
    auth.uid() <> perfil_id
    and exists (
      select 1 from public.orcamentos o
      where o.id = trabalhos_comprovados.orcamento_id
        and (o.de_perfil = auth.uid() or o.para_perfil = auth.uid())
    )
  );

-- Tirar da montra é sempre possível — o destaque é do executante.
drop policy if exists "tcomp_executante_tira" on public.trabalhos_comprovados;
create policy "tcomp_executante_tira" on public.trabalhos_comprovados
  for delete using (auth.uid() = perfil_id);

-- ----------------------------------------------------------------
-- 3) GUARDA — quem mexe em quê (o padrão guarda_* da casa, 010/047):
--    · o consentimento NUNCA nasce dado nem é o executante a dá-lo a si
--      próprio (senão o "consentimento explícito" era teatro);
--    · a contraparte SÓ mexe no consentimento ('aceite'/'recusado' — e pode
--      mudar de ideias mais tarde: retirar o sim faz o nome desaparecer);
--    · voltar a pedir depois de um "não" reabre o pedido (recusado→pendente),
--      mas um "sim" dado fica dado — tirar e repor o toggle não chateia
--      ninguém com um pedido repetido.
-- ----------------------------------------------------------------
create or replace function public.guarda_trabalho_comprovado()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  o record;
  contraparte uuid;
begin
  -- Servidor faz tudo (reconhecido como nas guardas da 010/047).
  if auth.role() = 'service_role' or auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- O consentimento nunca nasce dado — nasce por pedir, sempre.
    new.consentimento_estado := 'pendente';
    return new;
  end if;

  -- As raízes da linha não se transplantam (senão apontava-se a prova a
  -- outro negócio/perfil — o mesmo buraco que a 010 fechou nos orçamentos).
  if new.orcamento_id is distinct from old.orcamento_id
     or new.perfil_id  is distinct from old.perfil_id
     or new.criado_em  is distinct from old.criado_em then
    raise exception 'Coluna imutável do trabalho comprovado.';
  end if;

  select de_perfil, para_perfil into o
    from public.orcamentos where id = new.orcamento_id;
  contraparte := case when o.de_perfil = new.perfil_id then o.para_perfil else o.de_perfil end;

  if auth.uid() = new.perfil_id then
    -- Executante: gere título e toggle; o consentimento não é dele.
    if new.consentimento_estado is distinct from old.consentimento_estado then
      raise exception 'O consentimento é da outra parte — não se dá a si próprio.';
    end if;
    -- Voltar a querer o nome depois de um "não": o pedido reabre (e o aviso
    -- da secção 4 volta a perguntar). Um "sim" já dado fica como está.
    if new.mostrar_contratante and not old.mostrar_contratante
       and old.consentimento_estado = 'recusado' then
      new.consentimento_estado := 'pendente';
    end if;
    return new;
  end if;

  if auth.uid() = contraparte then
    -- Contraparte: SÓ o consentimento, e só para uma resposta real.
    if new.titulo is distinct from old.titulo
       or new.mostrar_contratante is distinct from old.mostrar_contratante then
      raise exception 'Só o consentimento é teu para mudar.';
    end if;
    if new.consentimento_estado not in ('aceite','recusado') then
      raise exception 'Resposta de consentimento inválida.';
    end if;
    return new;
  end if;

  -- Nem executante nem contraparte — a RLS já devia ter travado; cinto e alças.
  raise exception 'Sem permissão sobre este trabalho comprovado.';
end;
$$;

drop trigger if exists before_tcomp_guarda on public.trabalhos_comprovados;
create trigger before_tcomp_guarda
  before insert or update on public.trabalhos_comprovados
  for each row execute function public.guarda_trabalho_comprovado();

-- ----------------------------------------------------------------
-- 4) AVISOS — o pedido de consentimento é um momento do relógio da casa,
--    logo é um aviso (princípio da 006). Sem urgência e sem prazo: um
--    consentimento com pressa não é livre — o sino não pulsa por isto.
-- ----------------------------------------------------------------
create or replace function public.notificar_consentimento_comprovado()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  o record;
  contraparte uuid;
  nome_exec text;
  nome_contra text;
  pedir boolean;
  respondeu boolean := false;
begin
  select de_perfil, para_perfil into o
    from public.orcamentos where id = new.orcamento_id;
  if not found then
    return new;
  end if;
  contraparte := case when o.de_perfil = new.perfil_id then o.para_perfil else o.de_perfil end;
  select nome into nome_exec  from public.perfis where id = new.perfil_id;
  select nome into nome_contra from public.perfis where id = contraparte;

  -- Ramos explícitos por tg_op — num INSERT o OLD não está atribuído, e o SQL
  -- NÃO garante short-circuit: tocar em old.* num insert rebentava em runtime.
  if tg_op = 'INSERT' then
    pedir := new.mostrar_contratante and new.consentimento_estado = 'pendente';
  else
    -- O pedido NASCE pendente com o toggle ligado: ao ligar o toggle, ou ao
    -- reabrir depois de um "não" (guarda §3). Reescritas sem mudança real
    -- não pedem outra vez — ninguém gosta de campainhas repetidas.
    pedir := new.mostrar_contratante and new.consentimento_estado = 'pendente'
             and (old.mostrar_contratante = false or old.consentimento_estado <> 'pendente');
    respondeu := new.consentimento_estado is distinct from old.consentimento_estado
                 and new.consentimento_estado in ('aceite','recusado');
  end if;

  -- ===== PEDIDO → avisa a contraparte =====
  if pedir then
    perform public.criar_aviso(
      contraparte, 'consentimento_comprovado', new.orcamento_id,
      'Querem mostrar o teu nome',
      coalesce(nome_exec, 'Alguém') || ' quer apresentar este trabalho no perfil com o teu nome ao lado. O nome só aparece se aceitares — decides tu.',
      null, false);
  end if;

  -- ===== RESPOSTA → avisa o executante =====
  -- (Também dispara quando a contraparte muda de ideias mais tarde —
  --  retirar o sim é um momento que o executante merece saber.)
  if respondeu then
    if new.consentimento_estado = 'aceite' then
      perform public.criar_aviso(
        new.perfil_id, 'consentimento_resposta', new.orcamento_id,
        'Consentimento dado',
        coalesce(nome_contra, 'A outra parte') || ' aceitou — o nome já aparece no teu trabalho comprovado.',
        null, false);
    else
      perform public.criar_aviso(
        new.perfil_id, 'consentimento_resposta', new.orcamento_id,
        'Preferiu não mostrar o nome',
        'O trabalho continua comprovado no teu perfil — apenas sem o nome de quem contratou.',
        null, false);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists after_tcomp_notifica on public.trabalhos_comprovados;
create trigger after_tcomp_notifica
  after insert or update on public.trabalhos_comprovados
  for each row execute function public.notificar_consentimento_comprovado();

-- ----------------------------------------------------------------
-- 5) VIEW PÚBLICA — trabalhos_comprovados_publico. Os orçamentos são fechados
--    às 2 partes (RLS) e os perfis têm mais do que a montra precisa; a view
--    corre com os direitos do dono (security definer — INTENCIONAL, é o
--    mecanismo para expor SÓ estes campos escolhidos a dedo) e promete:
--      · ficheiro   — a foto da entrega: orcamentos.evolucao_ficheiro (007)
--                     ou, no fluxo novo (047), a evidência do ÚLTIMO
--                     checkpoint com foto;
--      · data_negocio — quando o trabalho foi confirmado (checkpoint) ou,
--                     à falta dele, o selo/nascimento do negócio;
--      · categoria  — o orçamento não tem categoria própria; o ofício do
--                     executante é a etiqueta honesta disponível (v2:
--                     categoria no próprio orçamento);
--      · contratante_nome — SÓ quando o toggle está ligado E o consentimento
--                     é 'aceite'. Caso contrário: null, sempre.
-- ----------------------------------------------------------------
create or replace view public.trabalhos_comprovados_publico as
select
  tc.id,
  tc.perfil_id,
  tc.orcamento_id,
  tc.titulo,
  tc.criado_em,
  coalesce(
    o.evolucao_ficheiro,
    (select cp.evidencia_ficheiro
       from public.checkpoints_orcamento cp
      where cp.orcamento_id = o.id and cp.evidencia_ficheiro is not null
      order by cp.ordem desc limit 1)
  ) as ficheiro,
  coalesce(
    (select max(cp.confirmado_em)
       from public.checkpoints_orcamento cp
      where cp.orcamento_id = o.id),
    o.selado_em,
    o.criado_em
  ) as data_negocio,
  (select min(c.nome)
     from public.perfil_categorias pc
     join public.categorias c on c.id = pc.categoria_id
    where pc.perfil_id = tc.perfil_id) as categoria,
  case
    when tc.mostrar_contratante and tc.consentimento_estado = 'aceite' then
      (select p.nome from public.perfis p
        where p.id = case when o.de_perfil = tc.perfil_id then o.para_perfil else o.de_perfil end)
    else null
  end as contratante_nome
from public.trabalhos_comprovados tc
join public.orcamentos o on o.id = tc.orcamento_id
where o.estado in ('honrado','entregue','concluido','confirmado_ambos','devolvido');

-- Cinto e alças: leitura da view aberta aos dois papéis do cliente.
grant select on public.trabalhos_comprovados_publico to anon, authenticated;

-- ----------------------------------------------------------------
-- 6) STORAGE — o bucket 'evolucoes' é PRIVADO (007: só as 2 partes). Destacar
--    um negócio é, por decisão do produto, tornar pública A FOTO DA ENTREGA —
--    e só ela: a política abre exatamente o ficheiro que a view promete
--    (a mesma expressão), nunca a pasta inteira do orçamento.
-- ----------------------------------------------------------------
drop policy if exists "evolucoes_ve_comprovado" on storage.objects;
create policy "evolucoes_ve_comprovado" on storage.objects
  for select using (
    bucket_id = 'evolucoes'
    and exists (
      select 1
      from public.trabalhos_comprovados tc
      join public.orcamentos o on o.id = tc.orcamento_id
      where storage.objects.name = coalesce(
        o.evolucao_ficheiro,
        (select cp.evidencia_ficheiro
           from public.checkpoints_orcamento cp
          where cp.orcamento_id = o.id and cp.evidencia_ficheiro is not null
          order by cp.ordem desc limit 1)
      )
    )
  );
