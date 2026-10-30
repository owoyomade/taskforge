-- Tenant isolation and role rules for Phase 1 tables.
-- Run with: npm run test:db   (requires the local Supabase stack)
--
-- Each block switches to a different signed-in user by setting the JWT claims
-- Supabase reads in auth.uid(), then switching to the "authenticated" role so
-- RLS applies exactly as it would for a real API request. Everything runs in
-- a transaction that is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- Cast of characters ---------------------------------------------------------
--   owner1  owns Tenant One        owner2  owns Tenant Two (separate tenant)
--   admin1  admin in Tenant One    member1 member in Tenant One
--   viewer1 viewer in Tenant One

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner1@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'owner2@test.local'),
  ('33333333-3333-4333-8333-333333333333', 'viewer1@test.local'),
  ('44444444-4444-4444-8444-444444444444', 'admin1@test.local'),
  ('55555555-5555-4555-8555-555555555555', 'member1@test.local');

insert into public.workspaces (id, name, slug, created_by) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'Tenant One', 'tenant-one', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'Tenant Two', 'tenant-two', '22222222-2222-4222-8222-222222222222');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '44444444-4444-4444-8444-444444444444', 'admin'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '55555555-5555-4555-8555-555555555555', 'member'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '33333333-3333-4333-8333-333333333333', 'viewer'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', '22222222-2222-4222-8222-222222222222', 'owner');

select ok(
  exists (select 1 from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'a profile is created automatically for every new auth user'
);

-- owner1: cross-tenant isolation ----------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.workspaces), 1, 'owner1 sees exactly one workspace');
select is_empty($$select 1 from public.workspaces where id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$,
  'owner1 cannot read another tenant''s workspace');
select is_empty($$select 1 from public.workspace_members where workspace_id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$,
  'owner1 cannot read another tenant''s members');
select is_empty($$select 1 from public.profiles where id = '22222222-2222-4222-8222-222222222222'$$,
  'owner1 cannot read the profile of someone outside their workspaces');
select isnt_empty($$select 1 from public.profiles where id = '33333333-3333-4333-8333-333333333333'$$,
  'owner1 can read a teammate''s profile');
select lives_ok($$update public.workspaces set name = 'Hacked' where id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$,
  'a cross-tenant update runs but matches no rows');
select throws_ok($$update public.profiles set email = 'spoof@test.local' where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'users cannot rewrite their own profile email');
select throws_ok($$insert into public.workspace_members (workspace_id, user_id, role)
  values ('bbbbbbbb-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-111111111111', 'owner')$$,
  '42501', null, 'users cannot add themselves to a workspace directly');
select throws_ok($$update public.workspace_members set role = 'admin'
  where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and user_id = '11111111-1111-4111-8111-111111111111'$$,
  'TF001', null, 'the last owner cannot demote themselves');
select throws_ok($$delete from public.workspace_members
  where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and user_id = '11111111-1111-4111-8111-111111111111'$$,
  'TF001', null, 'the last owner cannot leave');

reset role;
select is((select name from public.workspaces where id = 'bbbbbbbb-0000-4000-8000-00000000000b'), 'Tenant Two',
  'the cross-tenant update changed nothing');

-- viewer1: read-only ----------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;

select isnt_empty($$select 1 from public.workspaces where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  'viewer1 can read their workspace');
select lives_ok($$update public.workspaces set name = 'Viewer Edit' where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  'a viewer rename runs but matches no rows');
select lives_ok($$update public.workspace_members set role = 'owner'
  where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and user_id = '33333333-3333-4333-8333-333333333333'$$,
  'a viewer self-promotion runs but matches no rows');

reset role;
select is((select name from public.workspaces where id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 'Tenant One',
  'viewers cannot rename the workspace');
select is((select role::text from public.workspace_members
  where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and user_id = '33333333-3333-4333-8333-333333333333'),
  'viewer', 'viewers cannot promote themselves');

-- admin1: can manage non-owners, cannot touch owners ---------------------------
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;

select throws_ok($$update public.workspace_members set role = 'owner'
  where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and user_id = '55555555-5555-4555-8555-555555555555'$$,
  'TF001', null, 'admins cannot grant the owner role');
select throws_ok($$delete from public.workspace_members
  where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and user_id = '11111111-1111-4111-8111-111111111111'$$,
  'TF001', null, 'admins cannot remove an owner');
select lives_ok($$update public.workspace_members set role = 'viewer'
  where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and user_id = '55555555-5555-4555-8555-555555555555'$$,
  'admins can change a member''s role');

reset role;
select is((select role::text from public.workspace_members
  where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and user_id = '55555555-5555-4555-8555-555555555555'),
  'viewer', 'the admin role change was saved');

-- Profile photos ---------------------------------------------------------------
-- Files live outside the database; the app asks can_view_avatar() before
-- serving one, and only lets people upload into their own folder.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select ok(public.can_view_avatar('11111111-1111-4111-8111-111111111111/avatar.png'),
  'users can see their own photo');
select ok(not public.can_view_avatar('22222222-2222-4222-8222-222222222222/avatar.png'),
  'users can''t see a stranger''s photo');

reset role;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select ok(public.can_view_avatar('11111111-1111-4111-8111-111111111111/avatar.png'),
  'teammates can see each other''s photos');

reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select ok(not public.can_view_avatar('11111111-1111-4111-8111-111111111111/avatar.png'),
  'people outside the workspace cannot see the photo');

-- owner2: creating a workspace through the RPC ---------------------------------
select lives_ok($$select public.create_workspace('Second Space', 'second-space')$$,
  'a signed-in user can create a workspace');
select is((select role::text from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  where w.slug = 'second-space' and m.user_id = '22222222-2222-4222-8222-222222222222'),
  'owner', 'the creator becomes the owner');
select throws_ok($$select public.create_workspace('Duplicate', 'tenant-one')$$,
  '23505', null, 'workspace slugs are unique');

-- Membership revocation ----------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
delete from public.workspace_members
  where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and user_id = '33333333-3333-4333-8333-333333333333';

reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.workspaces), 0, 'a removed member immediately loses access');

-- Anonymous visitors ---------------------------------------------------------------
reset role;
set local role anon;
select throws_ok($$select public.create_workspace('Anon Space', 'anon-space')$$,
  '42501', null, 'anonymous visitors cannot create workspaces');

select * from finish();
rollback;
