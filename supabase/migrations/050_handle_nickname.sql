-- ============================================================
-- HONRA — Migração 050: NICKNAME (@handle) a sério
-- ------------------------------------------------------------
-- Decisão (19/07): no registo captura-se um NICKNAME (@handle, para busca e
-- persona) além do NOME REAL + foto (o rosto no perfil). A GARANTIA de
-- identidade continua a ser o selo ✓ (verificação), não a foto/nome — estes
-- humanizam. A coluna `handle` já existia em `perfis` mas estava vazia e
-- desligada. Esta migração:
--   1) torna o handle ÚNICO (case-insensitive), permitindo nulos;
--   2) faz o trigger de signup gravar o handle vindo do metadata;
--   3) faz backfill dos perfis existentes (slug do nome) para a demo dos
--      testers ficar completa.
-- ADITIVA. Correr depois da 049.
-- ============================================================

-- 1) Unicidade case-insensitive (nulos livres — handle é opcional até se querer).
create unique index if not exists perfis_handle_unico
  on public.perfis (lower(handle))
  where handle is not null;

-- 2) O trigger de signup passa a gravar o handle do metadata (além do nome).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $function$
begin
  insert into public.perfis (id, nome, handle, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    nullif(lower(new.raw_user_meta_data->>'handle'), ''),
    upper(substr(coalesce(new.raw_user_meta_data->>'nome', new.email), 1, 2))
  );

  insert into public.verificacoes (perfil_id, aba)
  values (new.id, 'identidade'),
         (new.id, 'profissao'),
         (new.id, 'contacto'),
         (new.id, 'portefolio');

  return new;
end;
$function$;

-- 3) Backfill: gerar handle a partir do nome (sem acentos, só a-z0-9),
--    com sufixo numérico só quando há colisão. Perfis-semente + contas de teste
--    passam a ter @handle para a demo ficar completa.
with base as (
  select id,
    lower(regexp_replace(
      translate(
        coalesce(nome, ''),
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
      ),
      '[^a-zA-Z0-9]', '', 'g'
    )) as slug
  from public.perfis
  where handle is null
),
numbered as (
  select id, slug, row_number() over (partition by slug order by id) as rn
  from base
  where slug <> ''
)
update public.perfis p
set handle = n.slug || case when n.rn = 1 then '' else n.rn::text end
from numbered n
where p.id = n.id;
