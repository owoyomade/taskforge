-- Phase 5: a database check for the app's /api/health endpoint.
--
-- Uptime monitors call /api/health without signing in, so this has to be
-- callable by anonymous visitors. It reads no tables and runs with the
-- caller's (minimal) rights, so it reveals nothing except "the database
-- answered".

create function public.health_check()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

revoke execute on function public.health_check() from public;
grant execute on function public.health_check() to anon, authenticated;
