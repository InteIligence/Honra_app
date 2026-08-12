-- ============================================================
-- HONRA — Migração 064: ENDURECIMENTO DE SEGURANÇA (vistoria 360°)
-- ------------------------------------------------------------
-- Fecha os achados de segurança que são DB-side e de baixo risco de partir:
--   · perfis: o INSERT do dono passa a defender is_admin/reputação (defesa em
--     profundidade — hoje só a colisão de PK do trigger travava um is_admin=true).
--   · orcamentos: `trabalho_id` fica IMUTÁVEL depois de criado (a guarda 010 já
--     travava de/para_perfil; faltava o trabalho_id — reapontar um selado para
--     outro anúncio quebrava a 058/061).
--   · storage: cada bucket ganha teto de tamanho e lista de MIME — sem isto,
--     nos buckets PÚBLICOS (avatares, portfolio) um SVG/HTML servido inline era
--     XSS armazenado na origem de storage, além de hosting/DoS grátis.
--   · convidados (RGPD): purga de PII de não-utilizadores após retenção.
--   · sou_admin(): RPC para a app saber se o próprio é admin SEM puxar a coluna
--     is_admin para o cliente.
--
-- DEFERIDO (com razão): fechar a LEITURA pública das colunas sensíveis de
-- `perfis` (nif/is_admin/semente/suspensao) exige uma view de montra + trocar
-- todos os embeds `perfis!de_perfil(nome)` por ela — um refactor largo que
-- arriscaria partir dezenas de leituras. Fica como tarefa própria (docs/
-- VISTORIA-360). Esta migração corta o vetor mais alto (is_admin no INSERT) e
-- tira a coluna is_admin do cliente pela RPC.
--
-- Aditiva. Correr DEPOIS da 063.
-- ============================================================

-- ------------------------------------------------------------
-- 1) perfis: INSERT do dono defende is_admin e a reputação inicial.
-- ------------------------------------------------------------
drop policy if exists "perfis_dono_insere" on public.perfis;
create policy "perfis_dono_insere" on public.perfis
  for insert with check (
    auth.uid() = id
    and coalesce(is_admin, false) = false
    and coalesce(indice_confianca, 0) = 0
    and coalesce(negocios_honrados, 0) = 0
    and coalesce(negocios_falhados, 0) = 0
    and coalesce(nivel_suspensao, 0) = 0
    and coalesce(semente, false) = false
  );

-- ------------------------------------------------------------
-- 2) orcamentos: `trabalho_id` imutável (junta-se à guarda 010). Recria-se a
--    guarda_ciclo_caucao inteira (fiel à 010) só para acrescentar a coluna.
-- ------------------------------------------------------------
create or replace function public.guarda_ciclo_caucao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null then
    return new;
  end if;

  if new.estado is distinct from old.estado then
    if not (
      (old.estado = 'pedido'   and new.estado = 'recusado')
      or (old.estado = 'honrado'  and new.estado = 'entregue'  and auth.uid() = new.para_perfil)
      or (old.estado = 'entregue' and new.estado = 'concluido' and auth.uid() = new.de_perfil)
    ) then
      raise exception 'Transição de estado reservada ao servidor (%→%).', old.estado, new.estado;
    end if;
  end if;

  if new.de_perfil   is distinct from old.de_perfil
     or new.para_perfil is distinct from old.para_perfil
     or new.trabalho_id is distinct from old.trabalho_id   -- 064: anúncio imutável
     or new.hold_a      is distinct from old.hold_a
     or new.hold_b      is distinct from old.hold_b
     or new.aceite_em   is distinct from old.aceite_em
     or new.selado_em   is distinct from old.selado_em
     or new.a_agiu_em   is distinct from old.a_agiu_em
     or new.b_agiu_em   is distinct from old.b_agiu_em
     or new.cancel_por  is distinct from old.cancel_por
     or new.quem_falhou is distinct from old.quem_falhou
     or new.evolucao_ficheiro is distinct from old.evolucao_ficheiro
     or new.valor_taxa  is distinct from old.valor_taxa then
    raise exception 'Coluna reservada ao servidor.';
  end if;

  return new;
end; $$;

-- ------------------------------------------------------------
-- 3) STORAGE: teto de tamanho + MIME por bucket. (Onde o ALTER for bloqueado
--    no projeto gerido, aplicar os mesmos valores à mão no Dashboard.)
-- ------------------------------------------------------------
update storage.buckets
   set file_size_limit = 5 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'avatares';

update storage.buckets
   set file_size_limit = 60 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']
 where id = 'portfolio';

update storage.buckets
   set file_size_limit = 10 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
 where id in ('evolucoes','cedulas','anexos-convite');

-- ------------------------------------------------------------
-- 4) RGPD — purga de PII de convidados (não-utilizadores) após retenção.
--    Corre pelo cron (a agendar): apaga convidados SEM contrato vivo e cujos
--    eventos/otp já passaram a janela. Nunca toca em quem tem disputa/contrato
--    a decorrer. Chamável só pelo servidor.
-- ------------------------------------------------------------
create or replace function public.purgar_convidados_expirados(p_dias int default 180)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n int;
  corte timestamptz := now() - make_interval(days => p_dias);
begin
  -- OTP de convidado velho (o SMS já não importa passada a janela).
  delete from public.otp_convidado where criado_em < now() - interval '1 day';

  -- Convidados sem NENHUM contrato ainda vivo e criados antes do corte.
  with alvos as (
    select cc.id
      from public.clientes_convidados cc
     where cc.criado_em < corte
       and not exists (
         select 1 from public.contratos_convite ct
          where ct.cliente_convidado_id = cc.id
            and ct.estado not in ('cancelado','expirado','concluido','arquivado','recusado')
       )
  )
  delete from public.clientes_convidados cc using alvos a where cc.id = a.id;
  get diagnostics n = row_count;

  -- Eventos de convite antigos (IP/user-agent/telefone no payload) já sem valor.
  delete from public.eventos_convite where criado_em < corte;

  return n;
end;
$$;

revoke all on function public.purgar_convidados_expirados(int) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5) sou_admin(): a app pergunta sem puxar a coluna is_admin para o cliente.
-- ------------------------------------------------------------
create or replace function public.sou_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_admin from public.perfis where id = auth.uid()), false);
$$;
revoke all on function public.sou_admin() from public, anon;
grant execute on function public.sou_admin() to authenticated;

-- NOTA de aplicação: correr no SQL Editor (como 060–063). A purga (§4) precisa
-- de um cron a chamar `purgar_convidados_expirados()` — agendar junto dos
-- resolvers (ver docs/verificar-estado-vivo.sql / cron-resolver).
