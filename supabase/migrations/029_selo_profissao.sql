-- ============================================================
-- HONRA — Migração 029: SELO "PROFISSÃO" (o 4.º selo) por DOIS caminhos
-- ------------------------------------------------------------
-- A aba "profissao" do selo acende por duas vias, e mostra a PROVENIÊNCIA à vista:
--
--   (A) COMPROVADA PELO TRABALHO — para ofícios NÃO regulados (pasteleiro, DJ,
--       tatuador…). Acende AUTOMATICAMENTE quando o profissional cruza um limiar
--       de trabalho verificado no Honra (LIMIAR_TRABALHO = 2 negócios honrados).
--       Proveniência gravada: origem = 'trabalho'. É o "mostrar, não dizer": o
--       trabalho real prova o ofício, sem papel nenhum.
--
--   (B) COMPROVADA POR CÉDULA — para profissões REGULADAS (advogado, médico,
--       contabilista…). O profissional submete uma PROVA (foto/PDF da cédula +
--       nº + Ordem + profissão declarada) para o bucket privado 'cedulas'; fica
--       PENDENTE; um ADMIN aprova/rejeita. Só a aprovação acende o selo, com
--       origem = 'cedula'. Verifica-se contra a FONTE (registo público da Ordem),
--       não o documento — o admit cruza nome+nº+ativo no portal da Ordem, e o
--       nome da cédula tem de bater com a IDENTIDADE já verificada.
--
-- A escrita em `verificacoes` continua a ser SÓ do servidor (RLS só deixa LER; a
-- via A é um trigger security-definer, a via B é a Edge Function com service_role).
-- O cliente nunca se auto-verifica — é o fosso.
--
-- Correr no SQL Editor DEPOIS da 028. Só DDL ADITIVO.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) PROVENIÊNCIA do selo profissão — nova coluna em `verificacoes`.
--    Fica nula enquanto a aba não estiver aceite; ganha 'trabalho' ou 'cedula'
--    quando acende. (Optámos por coluna, não tabela: 1:1 com a aba, mais simples
--    de ler no `Selo`/`perfil`; as outras abas mantêm-na nula.)
-- ----------------------------------------------------------------
alter table public.verificacoes
  add column if not exists origem text
    check (origem is null or origem in ('trabalho', 'cedula'));

-- ----------------------------------------------------------------
-- 2) ADMIN — marca simples de conta administradora (o Vítor verifica todos ao
--    início). NÃO marcamos ninguém aqui; o agente principal marca depois com:
--        update public.perfis set is_admin = true where id = '<uuid-do-vitor>';
--    (ou por handle). Protegido de forja pela guarda_perfil (ver ponto 6).
-- ----------------------------------------------------------------
alter table public.perfis
  add column if not exists is_admin boolean not null default false;

-- Helper: é admin? security-definer para poder ser usado em policies RLS sem
-- recursão (lê perfis com privilégio, não reentra na policy da própria tabela).
create or replace function public.e_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.perfis where id = uid), false);
$$;

-- ----------------------------------------------------------------
-- 3) GAVETA: pedidos_profissao — o pedido de cédula (via B).
--    O documento é só a ALEGAÇÃO; a verdade é o registo da Ordem que o admin
--    confirma. Guardamos a prova + os dados declarados + a decisão.
-- ----------------------------------------------------------------
create table if not exists public.pedidos_profissao (
  id                  uuid primary key default gen_random_uuid(),
  perfil_id           uuid not null references public.perfis(id) on delete cascade,
  profissao_declarada text not null,
  cedula_numero       text not null,
  ordem               text not null,               -- ex.: "Ordem dos Advogados"
  ficheiro_path       text not null,               -- caminho no bucket privado 'cedulas'
  estado              text not null default 'pendente'
                        check (estado in ('pendente', 'aprovado', 'rejeitado')),
  motivo_rejeicao     text,
  criado_em           timestamptz not null default now(),
  revisto_em          timestamptz,
  -- on delete set null: apagar a conta de um admin não pode ficar bloqueado por
  -- revisões antigas; guarda-se a decisão, esquece-se quem a fez.
  revisto_por         uuid references public.perfis(id) on delete set null
);

create index if not exists pedidos_profissao_perfil_idx
  on public.pedidos_profissao (perfil_id, criado_em desc);
create index if not exists pedidos_profissao_pendentes_idx
  on public.pedidos_profissao (estado, criado_em) where estado = 'pendente';

alter table public.pedidos_profissao enable row level security;

-- O dono LÊ os seus pedidos (para ver estado/motivo).
drop policy if exists "pedprof_dono_ve" on public.pedidos_profissao;
create policy "pedprof_dono_ve" on public.pedidos_profissao
  for select using (auth.uid() = perfil_id);

-- O admin LÊ todos (a lista de revisão).
drop policy if exists "pedprof_admin_ve" on public.pedidos_profissao;
create policy "pedprof_admin_ve" on public.pedidos_profissao
  for select using (public.e_admin());

-- SEM policy de insert/update/delete de propósito: quem cria o pedido é a Edge
-- Function `profissao-submeter` e quem muda o estado é `profissao-rever` — ambas
-- com service_role (ignoram o RLS). O cliente nunca escreve aqui.

-- ----------------------------------------------------------------
-- 4) STORAGE — bucket PRIVADO 'cedulas' (prova sensível: não é montra).
--    O dono carrega/lê a SUA pasta ({perfil_id}/…); o admin lê tudo (revisão).
--    Sem leitura pública — os URLs são assinados (service_role/admin).
-- ----------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('cedulas', 'cedulas', false)
on conflict (id) do nothing;

drop policy if exists "cedulas_carrega_dono" on storage.objects;
create policy "cedulas_carrega_dono" on storage.objects
  for insert with check (
    bucket_id = 'cedulas' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "cedulas_le_dono" on storage.objects;
create policy "cedulas_le_dono" on storage.objects
  for select using (
    bucket_id = 'cedulas' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "cedulas_le_admin" on storage.objects;
create policy "cedulas_le_admin" on storage.objects
  for select using (bucket_id = 'cedulas' and public.e_admin());

-- ----------------------------------------------------------------
-- 5) VIA (A) — o selo profissão acende com TRABALHO verificado.
--    LIMIAR_TRABALHO = 2 negócios honrados (defensável: prova ancorada em ≥2
--    transações reais e independentes no Honra). Ajusta a constante aqui se um
--    dia mudar. Idempotente; NUNCA baixa um selo já dado (incl. por cédula).
-- ----------------------------------------------------------------
create or replace function public.sincronizar_selo_profissao_trabalho()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  LIMIAR_TRABALHO constant int := 2;  -- ≥2 negócios honrados acende "por trabalho"
begin
  if new.negocios_honrados >= LIMIAR_TRABALHO then
    update public.verificacoes
       set estado = 'verificado',
           origem = coalesce(origem, 'trabalho'),   -- respeita uma cédula já dada
           verificado_em = coalesce(verificado_em, now())
     where perfil_id = new.id
       and aba = 'profissao'
       and estado is distinct from 'verificado';     -- idempotente / não rebaixa
  end if;
  return null;
end;
$$;

drop trigger if exists after_perfil_selo_profissao on public.perfis;
create trigger after_perfil_selo_profissao
  after update of negocios_honrados on public.perfis
  for each row execute function public.sincronizar_selo_profissao_trabalho();

-- ----------------------------------------------------------------
-- 6) GUARDA — is_admin e a origem do selo são do SISTEMA, não do cliente.
--    Recria a guarda_perfil (da 016) a proteger TAMBÉM o is_admin: um utilizador
--    não se pode auto-promover a admin nem forjar os contadores de confiança.
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
     or new.is_admin is distinct from old.is_admin then
    raise exception 'Campos de sistema (confiança / admin) não são editáveis pelo cliente.';
  end if;
  return new;
end; $$;

-- ----------------------------------------------------------------
-- 7) BACKFILL — acende já a via (A) a quem JÁ tem ≥2 negócios honrados e ainda
--    não tem a aba aceite. (Não toca em quem já a tem verificada.)
-- ----------------------------------------------------------------
update public.verificacoes v
   set estado = 'verificado',
       origem = coalesce(v.origem, 'trabalho'),
       verificado_em = coalesce(v.verificado_em, now())
  from public.perfis p
 where v.perfil_id = p.id
   and v.aba = 'profissao'
   and p.negocios_honrados >= 2
   and v.estado is distinct from 'verificado';
