-- Sign-in tables for Better Auth, the open-source sign-in library the app
-- uses. auth.users already exists (platform migration); these hold the rest.
-- Column names are mapped in src/lib/better-auth.ts. Ids default to random
-- UUIDs here, because Better Auth leaves id generation to Postgres.
--
-- Better Auth connects with its own login, taskforge_auth, which can reach
-- these tables and nothing else. The app's login (taskforge_app) and the
-- request roles get no access at all: passwords and session tokens are
-- only ever handled by the sign-in library.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'taskforge_auth') then
    create role taskforge_auth nologin;
  end if;
end;
$$;

-- Signed-in browsers. The token is what the session cookie carries.
create table auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sessions_user_id_idx on auth.sessions (user_id);

-- How someone signs in. For email and password, provider_id is
-- 'credential' and password holds a salted scrypt hash, never the password.
create table auth.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id text not null,
  provider_id text not null,
  password text,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, account_id)
);

create index accounts_user_id_idx on auth.accounts (user_id);

-- One-time codes behind email confirmation and password reset links.
create table auth.verifications (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index verifications_identifier_idx on auth.verifications (identifier);

-- Sign-in attempt counters. Kept in the database rather than in memory
-- because the host runs several short-lived server instances, and a limit
-- each instance counted separately would be easy to get around.
create table auth.rate_limits (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  count integer not null,
  last_request bigint not null
);

-- ---------------------------------------------------------------------------
-- Attempt limits for the app's own sign-in forms
--
-- The table above serves the sign-in library's web endpoints. The app's
-- forms call the library from server code, so they get their own counters:
-- a window per key (for example "sign-in:ip:203.0.113.7"), restarted once
-- it's older than the window length.
-- ---------------------------------------------------------------------------

create table auth.attempts (
  key text primary key,
  window_started_at timestamptz not null,
  count integer not null
);

/** True while the key has had fewer than max_attempts in the current window. Doesn't count anything. */
create function auth.attempts_allowed(attempt_key text, max_attempts integer, window_seconds integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select a.count < max_attempts or a.window_started_at < now() - make_interval(secs => window_seconds)
     from auth.attempts a where a.key = attempt_key),
    true
  );
$$;

/** Counts one attempt, starting a fresh window if the last one has expired. */
create function auth.record_attempt(attempt_key text, window_seconds integer)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into auth.attempts as a (key, window_started_at, count)
  values (attempt_key, now(), 1)
  on conflict (key) do update set
    count = case when a.window_started_at < now() - make_interval(secs => window_seconds) then 1 else a.count + 1 end,
    window_started_at = case when a.window_started_at < now() - make_interval(secs => window_seconds) then now() else a.window_started_at end;
$$;

revoke execute on function auth.attempts_allowed(text, integer, integer), auth.record_attempt(text, integer)
from public, anon, authenticated;
grant execute on function auth.attempts_allowed(text, integer, integer), auth.record_attempt(text, integer)
to taskforge_auth;

revoke all on auth.sessions, auth.accounts, auth.verifications, auth.rate_limits, auth.attempts
from public, anon, authenticated;

grant usage on schema auth to taskforge_auth;
grant select, insert, update, delete
  on auth.users, auth.sessions, auth.accounts, auth.verifications, auth.rate_limits
  to taskforge_auth;
