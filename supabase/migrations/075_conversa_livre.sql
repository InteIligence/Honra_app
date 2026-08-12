-- ============================================================
-- HONRA — Migração 075: CONVERSA LIVRE (falar sem abrir negócio)
-- ------------------------------------------------------------
-- Hoje, para fazer uma pergunta a alguém, a app abre um ORÇAMENTO. Do outro
-- lado nasce um "pedido" chamado *Conversa*, que a pessoa tem de aceitar ou
-- recusar — e recusar mata a conversa. É cerimónia a mais para um "olá", e é
-- por isso que o histórico do Vítor já tem pastas vazias a dobrar.
--
-- O DESENHO (Vítor, 01/08): há duas naturezas de conversa e ambas ficam.
--   · a do NEGÓCIO — vive no orçamento, tem o trabalho por contexto;
--   · a LIVRE — uma só por pessoa, para o que ainda não é negócio nenhum.
-- Não são dois sítios com a mesma coisa: são dois contextos diferentes, e a
-- lista de Conversas mostra os dois, porque é lá que se PROCURA. A lei "a mesma
-- informação nunca em duas secções" fica intacta — o fio é um, as portas é que
-- são duas.
--
-- UMA SÓ por par, e é isso que mata a duplicação: o par guarda-se ORDENADO
-- (menor uuid em `a`, maior em `b`) e tem índice único. Quem quer que comece a
-- conversa, cai sempre na mesma linha. Não é preciso lembrar quem falou
-- primeiro, nem limpar duplicados depois.
--
-- As mensagens continuam na MESMA tabela: passa a haver três donos possíveis
-- (orçamento, grupo, conversa livre) e a check garante que é sempre exatamente
-- um. Uma mensagem órfã ou com dois donos não pode existir.
--
-- Correr DEPOIS da 074.
-- ============================================================

create table if not exists public.conversas_livres (
  id        uuid primary key default gen_random_uuid(),
  -- Par ORDENADO: a < b, sempre. É o que torna a conversa única por par.
  a         uuid not null references public.perfis(id) on delete cascade,
  b         uuid not null references public.perfis(id) on delete cascade,
  criado_em timestamptz not null default now(),
  constraint conversas_livres_par_ordenado check (a < b),
  constraint conversas_livres_par_unico unique (a, b)
);

comment on table public.conversas_livres is
  'Conversa livre entre duas pessoas, fora de qualquer negocio. Uma so por par (par ordenado a<b com unique). Privada: so as duas partes.';

create index if not exists conversas_livres_a_idx on public.conversas_livres (a, criado_em desc);
create index if not exists conversas_livres_b_idx on public.conversas_livres (b, criado_em desc);

alter table public.conversas_livres enable row level security;

-- So as duas partes veem e criam. Nao ha update (nao ha nada para mudar) nem
-- delete (uma conversa nao se apaga por um lado so).
drop policy if exists "conv_livres_partes_veem" on public.conversas_livres;
create policy "conv_livres_partes_veem" on public.conversas_livres
  for select using (auth.uid() = a or auth.uid() = b);

-- Quem cria tem de ser uma das partes E ter identidade verificada: falar com
-- um estranho e' um gesto publico, e a regra e' a mesma do pedido (043).
drop policy if exists "conv_livres_parte_cria" on public.conversas_livres;
create policy "conv_livres_parte_cria" on public.conversas_livres
  for insert with check (
    (auth.uid() = a or auth.uid() = b)
    and public.identidade_verificada(auth.uid())
    and not public.esta_suspenso(auth.uid())
  );

-- ----------------------------------------------------------------
-- As mensagens ganham o terceiro dono possivel.
-- ----------------------------------------------------------------
alter table public.mensagens
  add column if not exists conversa_livre_id uuid
  references public.conversas_livres(id) on delete cascade;

alter table public.mensagens drop constraint if exists mensagens_um_dono;
alter table public.mensagens add constraint mensagens_um_dono
  check (num_nonnulls(orcamento_id, grupo_id, conversa_livre_id) = 1);

create index if not exists mensagens_conv_livre_idx
  on public.mensagens (conversa_livre_id, criado_em);

-- ----------------------------------------------------------------
-- Policies das mensagens, alargadas ao terceiro dono.
-- (Reescritas por inteiro: sao as mesmas regras dos outros dois ramos.)
-- ----------------------------------------------------------------
drop policy if exists "mensagens_partes_veem" on public.mensagens;
create policy "mensagens_partes_veem" on public.mensagens
  for select using (
    (orcamento_id is not null and exists (
      select 1 from public.orcamentos o
       where o.id = mensagens.orcamento_id
         and (o.de_perfil = auth.uid() or o.para_perfil = auth.uid())
    ))
    or (grupo_id is not null and public.sou_membro_do_grupo(grupo_id))
    or (conversa_livre_id is not null and exists (
      select 1 from public.conversas_livres c
       where c.id = mensagens.conversa_livre_id
         and (c.a = auth.uid() or c.b = auth.uid())
    ))
  );

drop policy if exists "mensagens_parte_escreve" on public.mensagens;
create policy "mensagens_parte_escreve" on public.mensagens
  for insert with check (
    -- NOTA: nao ha guarda de suspensao aqui, de proposito. A 068 nao a tinha,
    -- e um suspenso com um negocio a decorrer ainda precisa de comunicar. A
    -- suspensao trava GESTOS NOVOS (pedir, selar, abrir conversa livre), nao
    -- a fala dentro do que ja existe. Decisao por confirmar com o dono.
    auth.uid() = autor_perfil
    and (
      (orcamento_id is not null and exists (
        select 1 from public.orcamentos o
         where o.id = mensagens.orcamento_id
           and (o.de_perfil = auth.uid() or o.para_perfil = auth.uid())
      ))
      or (grupo_id is not null and public.sou_membro_do_grupo(grupo_id))
      or (conversa_livre_id is not null and exists (
        select 1 from public.conversas_livres c
         where c.id = mensagens.conversa_livre_id
           and (c.a = auth.uid() or c.b = auth.uid())
      ))
    )
  );

-- ----------------------------------------------------------------
-- ABRIR (ou reencontrar) a conversa livre com alguem.
-- Uma funcao em vez de um insert do cliente, por duas razoes: ordena o par
-- (o cliente nao tem de saber da regra a<b) e resolve a corrida de duas
-- pessoas a abrirem a mesma conversa ao mesmo tempo, com on conflict.
-- ----------------------------------------------------------------
create or replace function public.abrir_conversa_livre(p_com uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_eu uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_id uuid;
begin
  if v_eu is null or p_com is null or p_com = v_eu then
    raise exception 'conversa invalida';
  end if;
  -- Bloqueio nos dois sentidos: quem bloqueou, ou foi bloqueado, nao abre.
  if exists (
    select 1 from public.bloqueios
     where (bloqueador = v_eu and bloqueado = p_com)
        or (bloqueador = p_com and bloqueado = v_eu)
  ) then
    raise exception 'bloqueado';
  end if;

  v_a := least(v_eu, p_com);
  v_b := greatest(v_eu, p_com);

  insert into public.conversas_livres (a, b) values (v_a, v_b)
  on conflict (a, b) do nothing;

  select id into v_id from public.conversas_livres where a = v_a and b = v_b;
  return v_id;
end;
$$;

comment on function public.abrir_conversa_livre(uuid) is
  'Devolve a conversa livre com alguem, criando-a se ainda nao existir. Ordena o par e resolve corridas. security invoker: a RLS continua a mandar.';

revoke all on function public.abrir_conversa_livre(uuid) from public, anon;
grant execute on function public.abrir_conversa_livre(uuid) to authenticated;
