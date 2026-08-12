-- ============================================================
-- HONRA — Migração 076: AS PASTAS ANTIGAS CONVERGEM
-- ------------------------------------------------------------
-- Antes da 075, falar com alguém criava um ORÇAMENTO chamado *Conversa*, que
-- do outro lado aparecia como um pedido a aceitar ou recusar. Quem recusava
-- matava a conversa — e as mensagens ficavam presas numa pasta morta. Foi o
-- que aconteceu ao Vítor com a Paula Vaz: duas linhas no chat, uma delas uma
-- "Conversa" RECUSADA com duas mensagens lá dentro.
--
-- A regra (Vítor, 01/08): "as pastas antigas convergem numa só conversa. Há
-- apenas uma só conversa."
--
-- O CRITÉRIO, ajustado ao que os dados mostraram (a 1.ª versão só olhava a
-- `estado = 'pedido'` e não apanhava nada — as pastas estavam em `recusado`):
--   · descricao = 'Conversa'  → NUNCA foi negócio, seja qual for o estado;
--   · ou o negócio MORREU     → recusado / expirado / cancelado.
-- Nos dois casos as mensagens são conversa entre duas pessoas, e a conversa
-- entre duas pessoas é uma só.
--
-- O QUE NÃO TOCA, e é o que interessa: negócios VIVOS (pedido à espera de
-- resposta, aceite, selado) e FECHADOS COM SUCESSO (honrado, entregue,
-- concluido). Esses têm fio próprio e ficam intactos com as suas mensagens.
-- Na dúvida não mexe — é mais barato uma pasta a mais do que um negócio a
-- menos.
--
-- As mensagens não se perdem: mudam de dono antes de a pasta ser apagada, e a
-- ordem é a do carimbo original. Nada se reescreve.
--
-- Correr DEPOIS da 075.
-- ============================================================

do $$
declare
  v_par record;
  v_conv uuid;
  v_movidas int := 0;
  v_pastas int := 0;
  v_pares int := 0;
begin
  -- Um ciclo por PAR de pessoas (ordenado, como manda a 075), não por pasta:
  -- é isso que faz várias pastas caírem todas na mesma conversa.
  for v_par in
    select least(de_perfil, para_perfil) as a,
           greatest(de_perfil, para_perfil) as b
      from public.orcamentos
     where (descricao = 'Conversa' or estado in ('recusado', 'expirado', 'cancelado'))
       and de_perfil is not null
       and para_perfil is not null
       and de_perfil <> para_perfil
     group by 1, 2
  loop
    v_pares := v_pares + 1;

    -- A conversa do par: a que já existir, ou uma nova.
    insert into public.conversas_livres (a, b)
    values (v_par.a, v_par.b)
    on conflict (a, b) do nothing;

    select id into v_conv
      from public.conversas_livres
     where a = v_par.a and b = v_par.b;

    -- As mensagens trocam de dono. A check `mensagens_um_dono` obriga a que
    -- fique exatamente UM: por isso o orcamento_id sai no mesmo update.
    with pastas as (
      select id from public.orcamentos
       where (descricao = 'Conversa' or estado in ('recusado', 'expirado', 'cancelado'))
         and least(de_perfil, para_perfil) = v_par.a
         and greatest(de_perfil, para_perfil) = v_par.b
    ), movidas as (
      update public.mensagens m
         set conversa_livre_id = v_conv,
             orcamento_id = null
       where m.orcamento_id in (select id from pastas)
      returning 1
    )
    select count(*) into v_movidas from movidas;

    -- As pastas, agora vazias, saem. Só estas — a condição é a mesma de cima.
    with apagadas as (
      delete from public.orcamentos
       where (descricao = 'Conversa' or estado in ('recusado', 'expirado', 'cancelado'))
         and least(de_perfil, para_perfil) = v_par.a
         and greatest(de_perfil, para_perfil) = v_par.b
      returning 1
    )
    select v_pastas + count(*) into v_pastas from apagadas;

    raise notice 'par % / %: % mensagens movidas', v_par.a, v_par.b, v_movidas;
  end loop;

  raise notice 'CONVERGENCIA: % pares, % pastas apagadas', v_pares, v_pastas;
end $$;

-- Verificação (deve devolver ZERO): pastas-conversa que ainda restem.
--   select count(*) from public.orcamentos
--    where descricao = 'Conversa' or estado in ('recusado','expirado','cancelado');
--
-- E nenhuma mensagem pode ter ficado órfã (a check já o garante, mas confirma):
--   select count(*) from public.mensagens
--    where num_nonnulls(orcamento_id, grupo_id, conversa_livre_id) <> 1;
