-- 034 — O sino do ADMIN toca quando entra um pedido de cédula.
-- Antes, os pedidos de profissão (via cédula) caíam na fila de revisão em
-- silêncio: o admin só os via se abrisse o ecrã. Agora cada pedido novo cria
-- um aviso 'cedula_pendente' para TODAS as contas admin (perfis.is_admin),
-- com o nome do requerente e a profissão à vista. Tocar no aviso abre a fila
-- (/revisao-profissao — tratado na app).

create or replace function public.notificar_cedula_pendente()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  nome_req text;
begin
  select nome into nome_req from public.perfis where id = new.perfil_id;

  insert into public.notificacoes (perfil_id, tipo, titulo, corpo, urgente)
  select a.id,
         'cedula_pendente',
         'Pedido de cédula para rever',
         'De ' || coalesce(nome_req, 'alguém')
           || ' · ' || new.profissao_declarada
           || coalesce(' (' || nullif(trim(new.ordem), '') || ')', ''),
         false
  from public.perfis a
  where a.is_admin;

  return new;
end;
$$;

drop trigger if exists apos_pedido_cedula_notifica on public.pedidos_profissao;
create trigger apos_pedido_cedula_notifica
  after insert on public.pedidos_profissao
  for each row execute function public.notificar_cedula_pendente();
