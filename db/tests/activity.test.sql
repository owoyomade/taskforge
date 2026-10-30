-- Audit history and notifications.
-- Run with: npm run test:db

begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner1@test.local'),
  ('33333333-3333-4333-8333-333333333333', 'member1@test.local'),
  ('34343434-3434-4343-8343-343434343434', 'member2@test.local'),
  ('55555555-5555-4555-8555-555555555555', 'outsider@test.local');

insert into public.workspaces (id, name, slug) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'Tenant One', 'tenant-one'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'Tenant Two', 'tenant-two');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '33333333-3333-4333-8333-333333333333', 'member'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '34343434-3434-4343-8343-343434343434', 'member'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', '55555555-5555-4555-8555-555555555555', 'owner');

-- member1 builds a project and works on a task ----------------------------------------

select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select public.create_project('aaaaaaaa-0000-4000-8000-00000000000a', 'Shared', '', 'workspace', 'teal');
select public.create_project('aaaaaaaa-0000-4000-8000-00000000000a', 'Secret', '', 'private', 'rose');

reset role;
create temporary table ids as select
  (select id from public.projects where name = 'Shared') as shared,
  (select id from public.projects where name = 'Secret') as secret,
  (select id from public.board_columns where name = 'To do' and project_id = (select id from public.projects where name = 'Shared')) as todo,
  (select id from public.board_columns where name = 'Done' and project_id = (select id from public.projects where name = 'Shared')) as done,
  (select id from public.board_columns where name = 'To do' and project_id = (select id from public.projects where name = 'Secret')) as secret_todo;
grant select on ids to authenticated;

select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
insert into public.tasks (id, workspace_id, project_id, column_id, title, created_by)
  select 'eeeeeeee-0000-4000-8000-00000000000e', 'aaaaaaaa-0000-4000-8000-00000000000a', shared, todo, 'Write brief',
    '33333333-3333-4333-8333-333333333333' from ids;
update public.tasks set column_id = (select done from ids) where id = 'eeeeeeee-0000-4000-8000-00000000000e';
insert into public.task_assignees (task_id, project_id, workspace_id, user_id)
  select 'eeeeeeee-0000-4000-8000-00000000000e', shared, 'aaaaaaaa-0000-4000-8000-00000000000a', '34343434-3434-4343-8343-343434343434' from ids;

-- Audit events --------------------------------------------------------------------------

reset role;
select is((select count(*)::int from public.audit_events where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and event_type = 'project.created'), 2,
  'creating projects is recorded');
select is((select actor_id from public.audit_events where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and event_type = 'task.created'),
  '33333333-3333-4333-8333-333333333333'::uuid, 'events record who did it');
select is((select summary ->> 'to' from public.audit_events where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and event_type = 'task.moved'), 'Done',
  'moves record where the task went');
select is((select summary ->> 'from' from public.audit_events where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and event_type = 'task.moved'), 'To do',
  'moves record where the task came from');
select is((select summary ->> 'user_id' from public.audit_events where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and event_type = 'task.assigned'),
  '34343434-3434-4343-8343-343434343434', 'assignments are recorded');
select ok((select not (summary ? 'description') from public.audit_events where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and event_type = 'task.created'),
  'task descriptions are never copied into the log');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select isnt_empty($$select 1 from public.audit_events where event_type = 'task.moved'$$,
  'members can read the history of projects they can see');
select is_empty($$select 1 from public.audit_events where event_type like 'member.%'$$,
  'members can''t read workspace membership history');
select throws_ok($$insert into public.audit_events (workspace_id, event_type) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'task.created')$$,
  '42501', null, 'nobody can write audit events directly');
select throws_ok($$delete from public.audit_events$$, '42501', null, 'nobody can delete audit events');
select throws_ok($$update public.audit_events set event_type = 'task.renamed'$$, '42501', null, 'nobody can edit audit events');

reset role;
select set_config('request.jwt.claims', '{"sub":"34343434-3434-4343-8343-343434343434","role":"authenticated"}', true);
set local role authenticated;
select is_empty($$select 1 from public.audit_events where project_id = (select secret from ids)$$,
  'private project history is hidden from people outside the project');

reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select isnt_empty($$select 1 from public.audit_events where event_type like 'member.%'$$,
  'owners can read membership history');

reset role;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select is_empty($$select 1 from public.audit_events where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  'other tenants see none of the history');

-- Notifications ----------------------------------------------------------------------------

reset role;
select is((select count(*)::int from public.notifications where recipient_id = '34343434-3434-4343-8343-343434343434' and type = 'assigned'), 1,
  'being assigned creates a notification');
select is((select actor_id from public.notifications where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and type = 'assigned'), '33333333-3333-4333-8333-333333333333'::uuid,
  'the notification says who assigned the task');

-- Assigning yourself doesn't notify you.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
insert into public.task_assignees (task_id, project_id, workspace_id, user_id)
  select 'eeeeeeee-0000-4000-8000-00000000000e', shared, 'aaaaaaaa-0000-4000-8000-00000000000a', '33333333-3333-4333-8333-333333333333' from ids;
reset role;
select is((select count(*)::int from public.notifications where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and recipient_id = '33333333-3333-4333-8333-333333333333'), 0,
  'assigning yourself creates no notification');

-- A comment notifies the assignee; a mention replaces that with a mention.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
insert into public.comments (id, workspace_id, project_id, task_id, author_id, body)
  select 'f0000000-0000-4000-8000-00000000000f', 'aaaaaaaa-0000-4000-8000-00000000000a', shared, 'eeeeeeee-0000-4000-8000-00000000000e',
    '11111111-1111-4111-8111-111111111111', 'Looks good' from ids;
reset role;
select is((select count(*)::int from public.notifications where comment_id = 'f0000000-0000-4000-8000-00000000000f' and type = 'commented'), 2,
  'a comment notifies the task''s assignees and creator');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
insert into public.comment_mentions (comment_id, project_id, workspace_id, user_id)
  select 'f0000000-0000-4000-8000-00000000000f', shared, 'aaaaaaaa-0000-4000-8000-00000000000a', '34343434-3434-4343-8343-343434343434' from ids;
reset role;
select results_eq(
  $$select type::text from public.notifications where comment_id = 'f0000000-0000-4000-8000-00000000000f'
    and recipient_id = '34343434-3434-4343-8343-343434343434'$$,
  $$values ('mentioned')$$,
  'a mention replaces the plain comment notification, so nobody gets two');

-- Running the same notification again changes nothing.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select public.notify('34343434-3434-4343-8343-343434343434', 'mentioned', 'eeeeeeee-0000-4000-8000-00000000000e',
  'f0000000-0000-4000-8000-00000000000f', 'mention:f0000000-0000-4000-8000-00000000000f');
select is((select count(*)::int from public.notifications where recipient_id = '34343434-3434-4343-8343-343434343434' and type = 'mentioned'), 1,
  'notifications are idempotent');

-- Private projects never notify people who can't see them.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
insert into public.tasks (id, workspace_id, project_id, column_id, title, created_by)
  select 'eeeeeeee-0000-4000-8000-0000000000ff', 'aaaaaaaa-0000-4000-8000-00000000000a', secret, secret_todo, 'Secret plan',
    '33333333-3333-4333-8333-333333333333' from ids;
insert into public.task_assignees (task_id, project_id, workspace_id, user_id)
  select 'eeeeeeee-0000-4000-8000-0000000000ff', secret, 'aaaaaaaa-0000-4000-8000-00000000000a', '34343434-3434-4343-8343-343434343434' from ids;
reset role;
select is((select count(*)::int from public.notifications where task_id = 'eeeeeeee-0000-4000-8000-0000000000ff'), 0,
  'assignment in a private project doesn''t notify someone who can''t see it');

-- Preferences: turning a kind off stops it.
insert into public.notification_preferences (user_id, assigned) values ('34343434-3434-4343-8343-343434343434', false);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
delete from public.task_assignees where task_id = 'eeeeeeee-0000-4000-8000-00000000000e' and user_id = '34343434-3434-4343-8343-343434343434';
insert into public.task_assignees (task_id, project_id, workspace_id, user_id)
  select 'eeeeeeee-0000-4000-8000-00000000000e', shared, 'aaaaaaaa-0000-4000-8000-00000000000a', '34343434-3434-4343-8343-343434343434' from ids;
reset role;
select is((select count(*)::int from public.notifications where recipient_id = '34343434-3434-4343-8343-343434343434' and type = 'assigned'), 1,
  'turning off assignment notifications stops new ones');

-- Saving preferences twice (insert, then update) works through an upsert.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
insert into public.notification_preferences (user_id, commented) values ('33333333-3333-4333-8333-333333333333', false);
select lives_ok($$insert into public.notification_preferences (user_id, assigned, mentioned, commented)
  values ('33333333-3333-4333-8333-333333333333', true, true, true)
  on conflict (user_id) do update set user_id = excluded.user_id, assigned = excluded.assigned,
    mentioned = excluded.mentioned, commented = excluded.commented$$,
  'people can update their own saved preferences');
reset role;

-- Access to notifications.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select is_empty($$select 1 from public.notifications where recipient_id = '34343434-3434-4343-8343-343434343434'$$,
  'people can''t read each other''s notifications');
select throws_ok($$insert into public.notifications (workspace_id, project_id, task_id, recipient_id, type, task_title, dedupe_key)
  select 'aaaaaaaa-0000-4000-8000-00000000000a', shared, 'eeeeeeee-0000-4000-8000-00000000000e', '34343434-3434-4343-8343-343434343434',
    'assigned', 'Fake', 'fake' from ids$$, '42501', null, 'notifications can''t be forged');

reset role;
select set_config('request.jwt.claims', '{"sub":"34343434-3434-4343-8343-343434343434","role":"authenticated"}', true);
set local role authenticated;
update public.notifications set read_at = now() where recipient_id = '34343434-3434-4343-8343-343434343434';
select is((select count(*)::int from public.notifications where read_at is null), 0, 'recipients can mark their notifications read');

-- Losing access hides old notifications too.
reset role;
delete from public.workspace_members where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and user_id = '34343434-3434-4343-8343-343434343434';
select set_config('request.jwt.claims', '{"sub":"34343434-3434-4343-8343-343434343434","role":"authenticated"}', true);
set local role authenticated;
select is_empty($$select 1 from public.notifications$$, 'notifications disappear when you lose access to the project');

select * from finish();
rollback;
