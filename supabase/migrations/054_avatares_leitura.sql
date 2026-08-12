-- ============================================================
-- HONRA — Migração 054: LEITURA nos buckets públicos (corrige o upload de foto)
-- ------------------------------------------------------------
-- BUG (20/07, apanhado no teste do Vítor): carregar a foto de perfil falhava
-- sempre com "new row violates row-level security policy".
--
-- CAUSA: o cliente carrega com `upsert: true`, que no Postgres é
-- `INSERT ... ON CONFLICT DO UPDATE`. Esse comando exige política de **SELECT**
-- sobre a linha (para poder ver o conflito) — e os buckets `avatares` e
-- `portfolio` só tinham políticas de inserir/atualizar/apagar. Sem SELECT, a
-- inserção é recusada. (Provado: o MESMO upload sem `upsert` devolve 200.)
--
-- "Bucket público" só torna público o caminho de LEITURA por URL — não cria
-- política de SELECT na tabela `storage.objects`. Daí a confusão.
--
-- CORREÇÃO: leitura pública nos dois buckets que JÁ são públicos por desenho
-- (a foto de perfil e o portefólio são para ser vistos). Nada muda nos buckets
-- privados (`evolucoes`, `cedulas`, `anexos-convite`) — esses continuam
-- fechados às partes. ADITIVA e idempotente.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'storage.objects'::regclass and polname = 'avatares_le_todos'
  ) then
    create policy avatares_le_todos on storage.objects
      for select using (bucket_id = 'avatares');
  end if;

  if not exists (
    select 1 from pg_policy
    where polrelid = 'storage.objects'::regclass and polname = 'portfolio_le_todos'
  ) then
    create policy portfolio_le_todos on storage.objects
      for select using (bucket_id = 'portfolio');
  end if;
end $$;
