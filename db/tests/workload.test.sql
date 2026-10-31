-- Weekly capacity (workload radar): who can read and change it.
-- Run with: npm run test:db
--
-- Same approach as tenancy.test.sql: each block signs in as a different user
-- by setting request.jwt.claims and switching to the "authenticated" role,
-- and everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

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

select is((select weekly_capacity from public.workspaces where id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 5::smallint,
  'a new workspace starts with a capacity of 5 tasks per person per week');

-- viewer1: read-only ---------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;

select is((select weekly_capacity from public.workspaces where id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 5::smallint,
  'a viewer can read the capacity (the radar shows it)');
update public.workspaces set weekly_capacity = 40 where id = 'aaaaaaaa-0000-4000-8000-00000000000a';

-- member1: can't change it either ----------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
update public.workspaces set weekly_capacity = 41 where id = 'aaaaaaaa-0000-4000-8000-00000000000a';

reset role;
select is((select weekly_capacity from public.workspaces where id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 5::smallint,
  'viewers and members cannot change the capacity (their updates match no rows)');

-- owner2: another tenant -------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;

select is_empty($$select weekly_capacity from public.workspaces where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  'another tenant cannot read the capacity');
update public.workspaces set weekly_capacity = 42 where id = 'aaaaaaaa-0000-4000-8000-00000000000a';

reset role;
select is((select weekly_capacity from public.workspaces where id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 5::smallint,
  'another tenant cannot change the capacity');

-- admin1: allowed, within limits -------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;

update public.workspaces set weekly_capacity = 8 where id = 'aaaaaaaa-0000-4000-8000-00000000000a';
select is((select weekly_capacity from public.workspaces where id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 8::smallint,
  'an admin can change the capacity');
select throws_ok($$update public.workspaces set weekly_capacity = 0 where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  '23514', null, 'the capacity must be at least 1');
select throws_ok($$update public.workspaces set weekly_capacity = 51 where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  '23514', null, 'the capacity can be at most 50');
select throws_ok($$update public.workspaces set slug = 'stolen-slug' where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  '42501', null, 'the capacity grant does not let an admin change other columns, like the slug');

select * from finish();
rollback;
