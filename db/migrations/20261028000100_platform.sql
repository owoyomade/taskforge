-- The groundwork every later migration relies on. On Supabase these came
-- built in; on plain Postgres (locally and on Neon) we create them here.
--
-- How a signed-in request reaches the database:
--   The app connects as taskforge_app, a login role with no table access of
--   its own. For each request it opens a transaction, switches to the
--   "authenticated" role and records who is signed in:
--
--     set local role authenticated;
--     select set_config('request.jwt.claims', '{"sub":"<user id>"}', true);
--
--   Row Level Security policies then call auth.uid() to read that id. If
--   code ever forgets those two lines, the query runs as taskforge_app and
--   fails for lack of permission, rather than seeing everyone's data.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

-- Roles belong to the whole server, not one database, so they may already
-- exist (for example on a second local database).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  -- Login (with a password) is switched on per environment by
  -- `npm run db:app-role`, so no password ever lives in a migration.
  if not exists (select 1 from pg_roles where rolname = 'taskforge_app') then
    create role taskforge_app nologin noinherit;
  end if;
end;
$$;

grant anon, authenticated to taskforge_app;

-- Nobody but the owner may create objects in the public schema.
revoke create on schema public from public;
grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

-- Kept in their own schema so their many functions don't clutter "public".
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated;
create extension if not exists pgcrypto with schema extensions;

-- Unqualified names (and the pgTAP test functions) resolve in public first,
-- then extensions.
do $$
begin
  execute format('alter database %I set search_path = "$user", public, extensions', current_database());
end;
$$;

-- ---------------------------------------------------------------------------
-- Auth: who is signed in
-- ---------------------------------------------------------------------------

create schema auth;
-- Policies call auth.uid(), so the request roles need to reach the schema;
-- the tables in it stay private (no grants below).
grant usage on schema auth to anon, authenticated;

/**
 * The signed-in user's id for this transaction, or null when signed out.
 * Same contract as Supabase's auth.uid(), so every policy keeps working.
 */
create function auth.uid()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
$$;

/**
 * Accounts. The column set matches what the sign-in library (Better Auth)
 * expects of its user table, so it can use this table directly; the rest
 * of the schema only ever needs id, email, name and email_verified.
 */
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  name text not null default '',
  email_verified boolean not null default false,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on auth.users from public, anon, authenticated;
