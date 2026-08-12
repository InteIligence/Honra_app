-- ============================================================
-- HONRA — Migração 039: AVISO DA PRIMEIRA CONVERSA (copy honesto)
-- ------------------------------------------------------------
-- Contexto: o botão "Mensagem" no perfil público, quando ainda não há
-- negócio entre os dois, cria um orçamento leve com descricao='Conversa'
-- (perfil/[id].tsx) só para dar corpo à conversa. O trigger de avisos
-- (after_orcamento_notifica → notificar_ciclo, migrações 006/007/032)
-- anunciava "Novo pedido de orçamento" — enganador: ninguém pediu nada.
--
-- Esta migração recria APENAS a função do trigger, mudando SÓ o ramo do
-- INSERT: quando descricao='Conversa', o aviso diz a verdade —
-- título "Alguém quer falar contigo", corpo "<nome> abriu uma conversa
-- contigo." Mantém o tipo 'pedido' e o orcamento_id, por isso tocar no
-- aviso leva EXATAMENTE ao mesmo sítio de antes.
-- Todos os outros casos ficam, à letra, como estavam (corpo copiado da
-- definição viva na BD via pg_get_functiondef antes de recriar).
--
-- ADITIVA e idempotente (create or replace). Correr DEPOIS da 038.
-- ============================================================

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
  select nome into nome_a from public.perfis where id = new.de_perfil;
  select nome into nome_b from public.perfis where id = new.para_perfil;

  -- ===== NOVO PEDIDO (insert) → avisa B =====
  if tg_op = 'INSERT' then
    if new.estado = 'pedido' then
      if new.descricao = 'Conversa' then
        -- Primeira conversa (botão "Mensagem"): não é um pedido de orçamento
        -- — o aviso diz a verdade. Mesmo tipo/destino: tocar abre o mesmo sítio.
        perform public.criar_aviso(new.para_perfil, 'pedido', new.id,
          'Alguém quer falar contigo',
          coalesce(nome_a, 'Alguém') || ' abriu uma conversa contigo.',
          null, true);
      else
        perform public.criar_aviso(new.para_perfil, 'pedido', new.id,
          'Novo pedido de orçamento',
          'De ' || coalesce(nome_a, 'alguém') || '. Aceita e dá a tua palavra para arrancar.',
          null, true);
      end if;
    end if;
    return new;
  end if;

  -- ===== TRANSIÇÕES DE ESTADO (update) =====
  if new.estado is distinct from old.estado then
    if new.estado = 'aceite' then
      -- B aceitou (deu a palavra) → A tem de selar (janela de 48h).
      perform public.criar_aviso(new.de_perfil, 'aceite', new.id,
        'Aceitaram — sela o aperto de mão',
        coalesce(nome_b, 'A outra parte') || ' aceitou e deu a sua palavra. Sela para fechar o compromisso.',
        new.aceite_em + interval '48 hours', true);

    elsif new.estado = 'selado' then
      -- A selou → aperto de mão fechado; avisa B que o projeto arrancou.
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
      -- B marcou entregue → A confirma para concluir e avaliarem.
      perform public.criar_aviso(new.de_perfil, 'entregue', new.id, 'Trabalho entregue',
        coalesce(nome_b, 'A outra parte') || ' marcou o trabalho como entregue. Confirma a entrega.',
        null, true);

    elsif new.estado = 'concluido' then
      perform public.criar_aviso(new.de_perfil, 'concluido', new.id, 'Negócio concluído',
        'Entrega confirmada. Já se podem avaliar.', null, false);
      perform public.criar_aviso(new.para_perfil, 'concluido', new.id, 'Negócio concluído',
        'Entrega confirmada. Já se podem avaliar.', null, false);

    elsif new.estado = 'incumprido' then
      -- A consequência é a MARCA (não há dinheiro a capturar). Voz honesta:
      -- quem faltou fica marcado; quem compareceu fica com o nome limpo.
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
