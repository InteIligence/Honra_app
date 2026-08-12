-- ============================================================
-- HONRA — Migração 082: TETO DIÁRIO DE SMS
-- ------------------------------------------------------------
-- Havia travão de 45 segundos entre envios, e mais nada. Quarenta e cinco
-- segundos não é um teto: é um ritmo. Dá 1 920 SMS por dia por conta e, a
-- ~0,05 € cada, são ~96 €/dia — de uma conta só, e nada impede dez.
--
-- ── E O PIOR NÃO É O DINHEIRO ───────────────────────────────────────────
-- O `convite-otp` manda SMS para números de PESSOAS QUE NÃO TÊM CONTA — é
-- assim que o contrato-convite funciona. Sem teto por DESTINO, o Honra podia
-- ser usado para martelar o telemóvel de alguém de fora, e essa pessoa não
-- teria sequer onde se queixar: para ela, o remetente é o Honra. Uma casa que
-- promete reputação verificada não pode ser o instrumento de quem assedia.
--
-- Por isso o teto é DUPLO, e as duas metades protegem gente diferente:
--   · por QUEM PEDE    → protege a casa (a fatura)
--   · por QUEM RECEBE  → protege quem está do outro lado, mesmo sem ser nosso
--
-- Os números: 10/dia por remetente e 5/dia por número. Quem verifica o
-- contacto gasta 1 ou 2; quem assina um contrato-convite gasta 1, e talvez
-- outro se o código expirar. Dez é folga larga para uso honesto e parede para
-- o resto. Ficam AQUI, num sítio só, para se afinarem com dados reais.
--
-- Correr DEPOIS da 081.
-- ============================================================

create table if not exists public.sms_diario (
  -- Quem: 'p:<uuid>' para quem tem conta, 'n:<E.164>' para o número de destino.
  -- Um prefixo em vez de duas tabelas — a pergunta é a mesma, muda o sujeito.
  chave     text not null,
  dia       date not null default (now() at time zone 'utc')::date,
  enviados  int  not null default 0,
  primary key (chave, dia)
);

comment on table public.sms_diario is
  'Contagem diaria de SMS por remetente e por numero de destino. So o servidor escreve; serve o teto da funcao registar_sms.';

alter table public.sms_diario enable row level security;
-- Sem policies: so o service_role (as Edge Functions) toca aqui. O cliente
-- nao tem nada a ganhar em ver isto e teria muito a ganhar em mexer-lhe.

-- Higiene: as linhas de ontem nao servem para nada depois de contadas.
create index if not exists sms_diario_dia_idx on public.sms_diario (dia);

-- ----------------------------------------------------------------
-- REGISTAR UM ENVIO — devolve TRUE se pode enviar, FALSE se ja chegou ao teto.
--
-- Conta PRIMEIRO e responde depois, num upsert atomico: se contasse depois de
-- responder, dois pedidos ao mesmo tempo passavam os dois. Um teto que se
-- fura com dois cliques simultaneos nao e' um teto.
-- ----------------------------------------------------------------
create or replace function public.registar_sms(p_chave text, p_teto int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
begin
  insert into public.sms_diario (chave, enviados)
       values (p_chave, 1)
  on conflict (chave, dia)
    do update set enviados = public.sms_diario.enviados + 1
    returning enviados into v_total;

  return v_total <= p_teto;
end;
$$;

revoke all on function public.registar_sms(text, int) from public, anon, authenticated;
-- SO o service_role. Uma funcao que decide se se gasta dinheiro nao se
-- oferece a quem tem sessao.

-- ----------------------------------------------------------------
-- LIMPEZA — a contagem de ontem ja fez o seu trabalho.
-- Sem cron: corre quando alguem envia (a funcao acima e' chamada em todos os
-- envios, e uma limpeza barata de 7 em 7 dias nao pesa nada).
-- ----------------------------------------------------------------
create or replace function public.limpar_sms_antigos()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.sms_diario
   where dia < (now() at time zone 'utc')::date - 7;
$$;

revoke all on function public.limpar_sms_antigos() from public, anon, authenticated;
