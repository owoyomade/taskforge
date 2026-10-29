-- Database-wide safety checks. These don't test one feature; they make sure
-- a future migration can't quietly skip a security rule. If one fails after
-- you add a table or function, fix the migration rather than the test.
-- Run with: npm run test:db

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is_empty(
  $$select relname from pg_class
    where relnamespace = 'public'::regnamespace and relkind in ('r', 'p') and not relrowsecurity$$,
  'every table has Row Level Security turned on'
);

select is_empty(
  $$select table_name || ': ' || privilege_type from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'$$,
  'signed-out visitors have no access to any table'
);

-- A SECURITY DEFINER function runs with its owner's rights. Without a fixed
-- search_path, a caller could create a same-named table or function in
-- another schema and trick it into using that instead.
select is_empty(
  $$select proname from pg_proc
    where pronamespace = 'public'::regnamespace and prosecdef
      and not exists (select 1 from unnest(coalesce(proconfig, '{}')) setting where setting like 'search_path=%')$$,
  'every SECURITY DEFINER function pins its search_path'
);

select is_empty(
  $$select p.proname from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and has_function_privilege('anon', p.oid, 'execute')$$,
  'signed-out visitors can''t call any privileged function'
);

select is_empty(
  $$select id from storage.buckets where public$$,
  'no storage bucket is public; files are only reachable through signed URLs'
);

select is_empty(
  $$select id from storage.buckets where file_size_limit is null or allowed_mime_types is null$$,
  'every bucket limits file size and type'
);

-- Keeps the Phase 5 performance fix from regressing: each foreign key needs
-- an index starting with exactly its columns, or cascading deletes and
-- per-project queries scan whole tables.
select is_empty(
  $$select c.conrelid::regclass || ' (' || c.conname || ')'
    from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] <@ c.conkey
      )$$,
  'every foreign key has an index'
);

-- The fast read policies (visible_project_ids) and the per-project check
-- used by writes (project_access_for) are two copies of one rule. Check
-- they agree for every person and project, with a private project and
-- each role in play.
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'member@test.local'),
  ('33333333-3333-4333-8333-333333333333', 'insider@test.local'),
  ('44444444-4444-4444-8444-444444444444', 'viewer@test.local'),
  ('55555555-5555-4555-8555-555555555555', 'outsider@test.local');
insert into public.workspaces (id, name, slug) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Rules', 'rules');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '22222222-2222-4222-8222-222222222222', 'member'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '33333333-3333-4333-8333-333333333333', 'member'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '44444444-4444-4444-8444-444444444444', 'viewer');
insert into public.projects (id, workspace_id, name, visibility, owner_id) values
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Open', 'workspace', '11111111-1111-4111-8111-111111111111'),
  ('cccccccc-0000-4000-8000-00000000000c', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Private', 'private', '22222222-2222-4222-8222-222222222222'),
  ('dddddddd-0000-4000-8000-00000000000d', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Private, shared', 'private', '22222222-2222-4222-8222-222222222222');
insert into public.project_members (project_id, workspace_id, user_id) values
  ('dddddddd-0000-4000-8000-00000000000d', 'aaaaaaaa-0000-4000-8000-00000000000a', '33333333-3333-4333-8333-333333333333');

select is_empty(
  $$select u.email || ' / ' || p.name from auth.users u cross join public.projects p
    where (p.id in (select public.visible_project_ids_for(u.id)))
          is distinct from (public.project_access_for(u.id, p.id) is not null)$$,
  'the fast read rule and the per-project rule agree for everyone'
);

select * from finish();
rollback;
