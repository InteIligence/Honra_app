-- ============================================================
-- 060 — UM negócio vivo por (trabalho, par). O histórico vive
-- DENTRO do negócio, nunca na lista.
-- Problema (26/07): "Abrir orçamento" inseria às cegas — cada
-- clique do autor sobre o mesmo candidato paria mais um cartão
-- em Orçamentos (3× "TESTE 058" na lista de recebidos). A regra
-- do produto é outra: o negócio é UM; o que está pendente
-- consulta-se no interior do projeto (linha do tempo).
-- A app passou a devolver o negócio vivo existente (lib/trabalho
-- .tsx, guarda 060) — aqui a BD deixa de confiar no cliente.
-- ============================================================

-- 1) LIMPEZA dos irmãos já nascidos: por cada (trabalho, par)
-- mantém-se o mais avançado no ciclo (em empate, o mais antigo —
-- o original); os restantes ficam 'cancelado'. Triggers suspensos
-- de propósito: isto não é uma transição real do ciclo — sem
-- avisos fantasma para as partes.
set session_replication_role = replica;

with vivos as (
  select id,
         row_number() over (
           partition by trabalho_id, de_perfil, para_perfil
           order by case estado
                      when 'entregue' then 6
                      when 'honrado'  then 5
                      when 'selado'   then 4
                      when 'em_curso' then 3
                      when 'aceite'   then 2
                      else 1
                    end desc,
                    criado_em asc
         ) as n
  from public.orcamentos
  where trabalho_id is not null
    and estado in ('pedido','aceite','selado','honrado','entregue','em_curso')
)
update public.orcamentos o
   set estado = 'cancelado'
  from vivos v
 where o.id = v.id and v.n > 1;

set session_replication_role = origin;

-- 2) GUARDA — o segundo vivo morre na base, venha de onde vier
-- (mesmo padrão da 043: a app trava, a BD trava na mesma).
create unique index if not exists orc_um_vivo_por_trabalho_par
  on public.orcamentos (trabalho_id, de_perfil, para_perfil)
  where trabalho_id is not null
    and estado in ('pedido','aceite','selado','honrado','entregue','em_curso');
