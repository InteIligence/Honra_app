-- HONRA — Migração 051: verificar se um @handle está livre (no registo, sem sessão).
-- RPC security-definer, callable por anon; não expõe perfis, só devolve disponível/não.
create or replace function public.handle_disponivel(p_handle text)
returns boolean
language sql
security definer set search_path = public
as $$
  select not exists (
    select 1 from public.perfis where lower(handle) = lower(trim(p_handle))
  );
$$;
grant execute on function public.handle_disponivel(text) to anon, authenticated;
