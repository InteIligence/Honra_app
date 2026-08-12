-- ============================================================
-- HONRA — Migração 014: aviso ao receber MENSAGEM no chat
-- ------------------------------------------------------------
-- A conversa era muda com a app fechada. Cada mensagem nova gera um aviso à
-- OUTRA parte (que dispara o push, pela cadeia já existente notificacoes→push).
-- Reaproveita `criar_aviso`.
--
-- Correr no SQL Editor DEPOIS da 013.
-- ============================================================

create or replace function public.notificar_mensagem()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  destino uuid;
  nome_autor text;
begin
  -- O destinatário é a parte do orçamento que NÃO escreveu.
  select case when o.de_perfil = new.autor_perfil then o.para_perfil else o.de_perfil end
    into destino
  from public.orcamentos o
  where o.id = new.orcamento_id;

  if destino is null then return new; end if;

  select nome into nome_autor from public.perfis where id = new.autor_perfil;

  perform public.criar_aviso(
    destino, 'mensagem', new.orcamento_id,
    'Nova mensagem',
    coalesce(nome_autor, 'Alguém') || ': ' || left(new.corpo, 80),
    null, true
  );
  return new;
end;
$$;

drop trigger if exists after_mensagem_notifica on public.mensagens;
create trigger after_mensagem_notifica
  after insert on public.mensagens
  for each row execute function public.notificar_mensagem();
