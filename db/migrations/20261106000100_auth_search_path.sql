-- The sign-in library's login looks up its tables in the "auth" schema.
--
-- This used to be a connection option (-c search_path=auth), but Neon's
-- pooled connections (PgBouncer) can't carry per-connection options. A
-- default stored on the role itself applies to every connection that login
-- opens, pooled or not.
do $$
begin
  execute format('alter role taskforge_auth in database %I set search_path = auth', current_database());
end;
$$;
