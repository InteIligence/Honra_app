-- ============================================================
-- HONRA — Migração 049: A CONVERSA SAI DO SINO
-- ------------------------------------------------------------
-- Achado num teste real (19/07): abrir uma conversa (botão "Mensagem" →
-- orçamento leve com descricao='Conversa', perfil/[id].tsx) gerava um aviso
-- NO SINO ("Alguém quer falar contigo", tipo 'pedido') — migração 039.
--
-- Mas a regra do Honra (migração 021) é: o SINO é SÓ para convites, apertos
-- de mão e orçamentos; as mensagens/conversas vivem SÓ no NÚMERO (badge) do
-- ícone de Chat (migração 020, `leitura_conversa` + `mensagens_nao_lidas`).
-- Uma conversa a cair no sino é a mesma fuga que a 021 fechou, por outra porta.
--
-- Esta migração recria APENAS a função do trigger, mudando SÓ o ramo do INSERT:
-- quando descricao='Conversa' NÃO se cria aviso no sino (a conversa acende no
-- badge do Chat quando chega a 1.ª mensagem). O pedido de orçamento REAL
-- continua a avisar. Todos os outros ramos ficam à letra iguais à 039.
--
-- ADITIVA e idempotente (create or replace). Correr DEPOIS da 039.
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

-- Limpar os avisos de conversa que já caíram no sino (a 039 criava-os).
delete from public.notificacoes where tipo = 'pedido' and titulo = 'Alguém quer falar contigo';
