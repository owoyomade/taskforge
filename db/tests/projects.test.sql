-- Projects, boards and tasks: tenant isolation, private projects, viewer
-- read-only access, and the cross-tenant protections from composite keys.
-- Run with: npm run test:db

begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- Cast ------------------------------------------------------------------------
--   owner1   owner of Tenant One          lead1  member of Tenant One (creates projects)
--   member1  member of Tenant One         viewer1 viewer of Tenant One
--   outsider owner of Tenant Two

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner1@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'lead1@test.local'),
  ('33333333-3333-4333-8333-333333333333', 'member1@test.local'),
  ('44444444-4444-4444-8444-444444444444', 'viewer1@test.local'),
  ('55555555-5555-4555-8555-555555555555', 'outsider@test.local');

insert into public.workspaces (id, name, slug) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'Tenant One', 'tenant-one'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'Tenant Two', 'tenant-two');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '22222222-2222-4222-8222-222222222222', 'member'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '33333333-3333-4333-8333-333333333333', 'member'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '44444444-4444-4444-8444-444444444444', 'viewer'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', '55555555-5555-4555-8555-555555555555', 'owner');

-- A label in Tenant Two, used later to prove it can't be attached in Tenant One.
insert into public.labels (id, workspace_id, name) values
  ('cccccccc-0000-4000-8000-00000000000c', 'bbbbbbbb-0000-4000-8000-00000000000b', 'Foreign');

-- lead1 creates a shared and a private project ---------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;

select lives_ok($$select public.create_project('aaaaaaaa-0000-4000-8000-00000000000a', 'Shared', '', 'workspace', 'teal')$$,
  'a member can create a project');
select lives_ok($$select public.create_project('aaaaaaaa-0000-4000-8000-00000000000a', 'Secret', '', 'private', 'rose')$$,
  'a member can create a private project');
select is((select count(*)::int from public.board_columns c join public.projects p on p.id = c.project_id where p.name = 'Shared'),
  3, 'a new project starts with three columns');

reset role;
-- Remember ids for later blocks (postgres can read everything).
create temporary table ids as
select
  (select id from public.projects where name = 'Shared') as shared,
  (select id from public.projects where name = 'Secret') as secret,
  (select id from public.board_columns c where c.project_id = (select id from public.projects where name = 'Shared') and name = 'To do') as todo,
  (select id from public.board_columns c where c.project_id = (select id from public.projects where name = 'Shared') and name = 'Done') as done;
grant select on ids to authenticated;

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;

select lives_ok($$insert into public.tasks (workspace_id, project_id, column_id, title, position, created_by)
  select 'aaaaaaaa-0000-4000-8000-00000000000a', shared, todo, 'First task', 1000, '22222222-2222-4222-8222-222222222222' from ids$$,
  'a member can add a task');
select throws_ok($$insert into public.tasks (workspace_id, project_id, column_id, title, position, created_by)
  select 'aaaaaaaa-0000-4000-8000-00000000000a', shared, todo, 'Forged author', 2000, '11111111-1111-4111-8111-111111111111' from ids$$,
  '42501', null, 'tasks can''t be created in someone else''s name');

reset role;
create temporary table task_ids as select id as first from public.tasks where title = 'First task';
grant select on task_ids to authenticated;

-- Version bumps only on content edits ------------------------------------------------
set local role authenticated;
update public.tasks set position = 1500 where id = (select first from task_ids);
select is((select version from public.tasks where id = (select first from task_ids)), 1,
  'moving a task does not change its version');
update public.tasks set title = 'First task, renamed' where id = (select first from task_ids);
select is((select version from public.tasks where id = (select first from task_ids)), 2,
  'editing a task''s content bumps its version');

-- Subtasks ----------------------------------------------------------------------------
select lives_ok($$insert into public.tasks (workspace_id, project_id, parent_task_id, title, created_by)
  select 'aaaaaaaa-0000-4000-8000-00000000000a', shared, first, 'Subtask', '22222222-2222-4222-8222-222222222222' from ids, task_ids$$,
  'a subtask can be added under a task');
select throws_ok($$insert into public.tasks (workspace_id, project_id, parent_task_id, title, created_by)
  select 'aaaaaaaa-0000-4000-8000-00000000000a', shared, t.id, 'Too deep', '22222222-2222-4222-8222-222222222222'
  from ids, public.tasks t where t.title = 'Subtask'$$,
  'TF001', null, 'subtasks can''t be nested');

-- Composite keys block cross-tenant links ---------------------------------------------
select throws_ok($$insert into public.task_labels (task_id, label_id, project_id, workspace_id)
  select first, 'cccccccc-0000-4000-8000-00000000000c', shared, 'aaaaaaaa-0000-4000-8000-00000000000a' from ids, task_ids$$,
  '23503', null, 'a label from another workspace can''t be attached');
select throws_ok($$insert into public.task_assignees (task_id, project_id, workspace_id, user_id)
  select first, shared, 'aaaaaaaa-0000-4000-8000-00000000000a', '55555555-5555-4555-8555-555555555555' from ids, task_ids$$,
  '23503', null, 'someone outside the workspace can''t be assigned');
select lives_ok($$insert into public.task_assignees (task_id, project_id, workspace_id, user_id)
  select first, shared, 'aaaaaaaa-0000-4000-8000-00000000000a', '33333333-3333-4333-8333-333333333333' from ids, task_ids$$,
  'a workspace member can be assigned');
select throws_ok($$delete from public.board_columns where id = (select todo from ids)$$,
  '23503', null, 'a column that still holds tasks can''t be deleted');
select throws_ok($$delete from public.tasks where id = (select first from task_ids)$$,
  '42501', null, 'tasks can''t be hard-deleted through the API (soft delete only)');

-- Duplicate keeps assignees and labels ---------------------------------------------------
reset role;
insert into public.labels (id, workspace_id, name) values
  ('dddddddd-0000-4000-8000-00000000000d', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Local');
insert into public.task_labels (task_id, label_id, project_id, workspace_id)
  select first, 'dddddddd-0000-4000-8000-00000000000d', shared, 'aaaaaaaa-0000-4000-8000-00000000000a' from ids, task_ids;

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.duplicate_task((select first from task_ids))$$, 'a member can duplicate a task');
select is((select count(*)::int from public.task_labels tl join public.tasks t on t.id = tl.task_id
  where t.title = 'First task, renamed (copy)'), 1, 'the copy keeps its labels');
select is((select count(*)::int from public.task_assignees ta join public.tasks t on t.id = ta.task_id
  where t.title = 'First task, renamed (copy)'), 1, 'the copy keeps its assignees');

-- viewer1: read-only -----------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;

select isnt_empty($$select 1 from public.tasks where id = (select first from task_ids)$$, 'viewers can read tasks');
select throws_ok($$insert into public.tasks (workspace_id, project_id, column_id, title, position, created_by)
  select 'aaaaaaaa-0000-4000-8000-00000000000a', shared, todo, 'Viewer task', 3000, '44444444-4444-4444-8444-444444444444' from ids$$,
  '42501', null, 'viewers can''t add tasks');
update public.tasks set title = 'Viewer edit' where id = (select first from task_ids);
select is((select title from public.tasks where id = (select first from task_ids)), 'First task, renamed',
  'viewers can''t edit tasks');
select is_empty($$select 1 from public.projects where name = 'Secret'$$,
  'viewers can''t see private projects they aren''t part of');

-- member1: private project visibility ----------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select is_empty($$select 1 from public.projects where name = 'Secret'$$,
  'members can''t see a private project until added');
select throws_ok($$insert into public.project_members (project_id, workspace_id, user_id)
  select secret, 'aaaaaaaa-0000-4000-8000-00000000000a', '33333333-3333-4333-8333-333333333333' from ids$$,
  '42501', null, 'members can''t add themselves to a private project');

reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select isnt_empty($$select 1 from public.projects where name = 'Secret'$$,
  'workspace owners can see every project');

reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
insert into public.project_members (project_id, workspace_id, user_id)
  select secret, 'aaaaaaaa-0000-4000-8000-00000000000a', '33333333-3333-4333-8333-333333333333' from ids;

reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select isnt_empty($$select 1 from public.projects where name = 'Secret'$$,
  'the project owner can add someone to a private project');

-- outsider: no access at all ----------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.tasks), 0, 'people outside the workspace see no tasks');
select throws_ok($$insert into public.tasks (workspace_id, project_id, column_id, title, position, created_by)
  select 'aaaaaaaa-0000-4000-8000-00000000000a', shared, todo, 'Intruder', 4000, '55555555-5555-4555-8555-555555555555' from ids$$,
  '42501', null, 'people outside the workspace can''t add tasks');

-- Archiving makes a project read-only for non-managers -------------------------------------------------
reset role;
update public.projects set archived_at = now() where id = (select shared from ids);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$insert into public.tasks (workspace_id, project_id, column_id, title, position, created_by)
  select 'aaaaaaaa-0000-4000-8000-00000000000a', shared, todo, 'Late task', 5000, '33333333-3333-4333-8333-333333333333' from ids$$,
  '42501', null, 'archived projects are read-only for members');

-- Leaving the workspace removes project membership and assignments --------------------------------------
reset role;
delete from public.workspace_members
  where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and user_id = '33333333-3333-4333-8333-333333333333';
select is((select count(*)::int from public.project_members where user_id = '33333333-3333-4333-8333-333333333333'), 0,
  'leaving the workspace removes project memberships');
select is((select count(*)::int from public.task_assignees where user_id = '33333333-3333-4333-8333-333333333333'), 0,
  'leaving the workspace removes task assignments');

select * from finish();
rollback;
