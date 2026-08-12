-- ============================================================
-- HONRA — Migração 059: VÍDEO NO PORTEFÓLIO (a montra ganha movimento)
-- ------------------------------------------------------------
-- O portefólio (009) mostra fotos — mas há ofícios que só se PROVAM em
-- movimento: um DJ, um barbeiro, um soldador. "Mostrar, não dizer" pede vídeo.
--
-- A RÉGUA (Vítor, 26/07/2026):
--   · Até 3 vídeos por portefólio, 60 segundos cada — montra, não canal.
--   · Upload NATIVO apenas: o ficheiro entra na casa. Nunca links de
--     Instagram/YouTube — a prova vive aqui, não numa plataforma alheia.
--   · A galeria carrega SÓ a capa (primeira frame, jpeg); o vídeo só puxa
--     dados quando alguém toca no play. Por isso a capa é COLUNA, não
--     derivação: quem lê a montra nunca toca no ficheiro pesado.
--
-- ADITIVA: só acrescenta. As fotos existentes ficam como estão (default
-- 'foto') e a app publicada continua a funcionar sem saber destas colunas.
--
-- Correr no SQL Editor DEPOIS da 058. NÃO foi aplicada automaticamente.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) COLUNAS — o tipo do item, a duração (para o distintivo "0:42" sem abrir
--    o ficheiro) e o caminho da capa no mesmo bucket público.
-- ----------------------------------------------------------------
alter table public.portfolio_itens
  add column if not exists tipo text not null default 'foto';

alter table public.portfolio_itens
  add column if not exists duracao_segundos integer;

alter table public.portfolio_itens
  add column if not exists capa_path text;

-- Guardas de forma (constraints com nome, para o drop/add ser re-executável):
alter table public.portfolio_itens
  drop constraint if exists portfolio_itens_tipo_chk;
alter table public.portfolio_itens
  add constraint portfolio_itens_tipo_chk
  check (tipo in ('foto','video'));

-- 60 segundos é lei do produto — o servidor também a conhece, não só a UI.
alter table public.portfolio_itens
  drop constraint if exists portfolio_itens_duracao_chk;
alter table public.portfolio_itens
  add constraint portfolio_itens_duracao_chk
  check (duracao_segundos is null or (duracao_segundos between 1 and 60));

-- Um vídeo sem capa obrigava a galeria a descarregar o ficheiro pesado só
-- para mostrar a miniatura — exatamente o que a régua proíbe. Sem capa e sem
-- duração, o vídeo não entra.
alter table public.portfolio_itens
  drop constraint if exists portfolio_itens_video_completo_chk;
alter table public.portfolio_itens
  add constraint portfolio_itens_video_completo_chk
  check (tipo <> 'video' or (capa_path is not null and duracao_segundos is not null));

-- ----------------------------------------------------------------
-- 2) GUARDA — máximo 3 vídeos por perfil. A UI esconde o botão ao terceiro,
--    mas a UI não é fronteira (cinto e alças, o costume da casa: 010/047/055).
-- ----------------------------------------------------------------
create or replace function public.guarda_portfolio_video()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Servidor faz tudo (reconhecido como nas guardas da 010/047).
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.tipo = 'video' then
    if (select count(*) from public.portfolio_itens
         where perfil_id = new.perfil_id and tipo = 'video') >= 3 then
      raise exception 'O portefólio leva até 3 vídeos.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists before_portfolio_video_guarda on public.portfolio_itens;
create trigger before_portfolio_video_guarda
  before insert on public.portfolio_itens
  for each row execute function public.guarda_portfolio_video();

-- ----------------------------------------------------------------
-- 3) STORAGE — nada de bucket novo: vídeos e capas vivem no 'portfolio'
--    (público, leitura aberta — é uma montra), na pasta do dono, e as
--    políticas da 009 ({perfil_id}/...) já cobrem carregar e apagar.
--    Acrescenta-se só o TETO de 60 MB no próprio bucket: é o limite do
--    upload direto sem compressão; quando a compressão no dispositivo
--    chegar (dev build), o ficheiro guardado fica abaixo disto (alvo
--    1080p H.264, ~40-60 MB por minuto). As fotos nem se aproximam.
-- ----------------------------------------------------------------
-- ⚠️ Nota (26/07): em projetos Supabase recentes o esquema `storage` é
-- blindado — o UPDATE direto pode falhar com "permission denied / must be
-- owner" e, num run único, ARRASTAR TUDO no rollback. Por isso o teto vai
-- embrulhado: se não houver privilégio, a migração AVISA e segue — o resto
-- (colunas, guardas, trigger) entra na mesma. Nesse caso o teto põe-se à mão
-- no Dashboard: Storage → portfolio → Edit bucket → File size limit → 60 MB.
do $$
begin
  update storage.buckets
     set file_size_limit = 62914560  -- 60 MB
   where id = 'portfolio';
exception when others then
  raise notice 'Sem privilégio para storage.buckets — põe o teto de 60 MB à mão no Dashboard (Storage → portfolio).';
end $$;
