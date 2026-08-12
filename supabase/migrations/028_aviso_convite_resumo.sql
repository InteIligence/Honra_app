-- 028 — A notificação do convite passa a RESUMIR o formulário preenchido.
-- Antes: "De Afonso. Vê os detalhes e responde." (não dizia nada do pedido).
-- Agora: "De Afonso · 16/07/2026 · <serviço> · <valor>" — o profissional vê o
-- essencial logo no sino, sem ter de abrir. Só muda o corpo do aviso 'convite_novo';
-- o resto do ciclo (expirado, etc.) fica igual. Aditivo: create or replace.

create or replace function public.notificar_convite()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  nome_c text;
  resumo text;
begin
  select nome into nome_c from public.clientes_convidados
    where id = new.cliente_convidado_id;

  if tg_op = 'INSERT' then
    if new.estado = 'formulario_recebido' then
      -- Resumo do formulário: nome · data(–data_fim) · serviço · valor.
      -- Cada peça só entra se foi preenchida (coalesce → '').
      resumo :=
        'De ' || coalesce(nome_c, 'alguém')
        || ' · ' || to_char(new.data_inicio, 'DD/MM/YYYY')
        || coalesce(' – ' || to_char(new.data_fim, 'DD/MM/YYYY'), '')
        || coalesce(' · ' || nullif(trim(new.servico), ''), '')
        || coalesce(
             ' · ' || replace(to_char(new.valor_total / 100.0, 'FM999999990.00'), '.', ',') || ' €',
             '');

      perform public.criar_aviso_convite(
        new.profissional_id, 'convite_novo', new.id,
        'Novo pedido por convite',
        resumo,
        new.formulario_em + interval '7 days', true);
    end if;
    return new;
  end if;

  if new.estado is distinct from old.estado then
    if new.estado = 'formulario_expirado' then
      perform public.criar_aviso_convite(
        new.profissional_id, 'convite_expirado', new.id,
        'Convite expirou',
        'Não respondeste a tempo ao pedido de ' || coalesce(nome_c, 'um cliente') || '. Nada foi guardado.',
        null, false);
    end if;
  end if;

  return new;
end;
$$;

-- Backfill: pôr o resumo nos avisos 'convite_novo' que ainda estão por responder
-- (para o teste do Vítor mostrar já a versão rica, sem esperar por um convite novo).
update public.notificacoes n
set corpo =
  'De ' || coalesce(cc.nome, 'alguém')
  || ' · ' || to_char(c.data_inicio, 'DD/MM/YYYY')
  || coalesce(' – ' || to_char(c.data_fim, 'DD/MM/YYYY'), '')
  || coalesce(' · ' || nullif(trim(c.servico), ''), '')
  || coalesce(' · ' || replace(to_char(c.valor_total / 100.0, 'FM999999990.00'), '.', ',') || ' €', '')
from public.contratos_convite c
  left join public.clientes_convidados cc on cc.id = c.cliente_convidado_id
where n.contrato_convite_id = c.id
  and n.tipo = 'convite_novo'
  and c.estado = 'formulario_recebido';
