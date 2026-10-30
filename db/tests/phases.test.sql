-- Phases (milestones), building projects from templates, and saved templates.
-- Run with: npm run test:db

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner1@test.local'),
  ('33333333-3333-4333-8333-333333333333', 'member1@test.local'),
  ('34343434-3434-4343-8343-343434343434', 'member2@test.local'),
  ('44444444-4444-4444-8444-444444444444', 'viewer1@test.local'),
  ('55555555-5555-4555-8555-555555555555', 'outsider@test.local');

insert into public.workspaces (id, name, slug) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'Tenant One', 'tenant-one'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'Tenant Two', 'tenant-two');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '33333333-3333-4333-8333-333333333333', 'member'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '34343434-3434-4343-8343-343434343434', 'member'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '44444444-4444-4444-8444-444444444444', 'viewer'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', '55555555-5555-4555-8555-555555555555', 'owner');

insert into public.labels (workspace_id, name, color) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Venue', 'blue');

create temporary table template (body jsonb);
insert into template values ($json${
  "columns": [{"name": "Not started"}, {"name": "Doing"}, {"name": "Done", "isDone": true}],
  "labels": [{"name": "venue", "color": "rose"}, {"name": "Budget", "color": "amber"}],
  "phases": [{"name": "Plan", "offsetDays": -30}, {"name": "Event day", "offsetDays": 0}],
  "tasks": [
    {"title": "Set a budget", "phase": 0, "dueOffsetDays": -28, "priority": "high", "labels": ["Budget"],
     "checklist": ["Food", "Room", "Extras"]},
    {"title": "Book the room", "phase": 0, "dueOffsetDays": -21, "labels": ["Venue"], "subtasks": ["Shortlist three", "Visit"]},
    {"title": "Welcome guests", "phase": 1, "dueOffsetDays": 0, "column": 1}
  ]
}$json$);
grant select on template to authenticated;

-- Building from a template ---------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;

select lives_ok($$select public.create_project_from_template('aaaaaaaa-0000-4000-8000-00000000000a', 'Team party', '',
  'workspace', 'rose', '2030-06-30', (select body from template))$$, 'a member can create a project from a template');

reset role;
create temporary table party as select id from public.projects where name = 'Team party';
grant select on party to authenticated;

select is((select count(*)::int from public.board_columns where project_id = (select id from party)), 3,
  'the template''s columns are created');
select is((select count(*)::int from public.milestones where project_id = (select id from party)), 2,
  'the template''s phases are created');
select is((select target_date from public.milestones where project_id = (select id from party) and name = 'Plan'),
  '2030-05-31'::date, 'phase dates count back from the finish date');
select is((select due_date from public.tasks where project_id = (select id from party) and title = 'Set a budget'),
  '2030-06-02'::date, 'task due dates count back from the finish date');
select is((select count(*)::int from public.milestone_tasks where project_id = (select id from party)), 3,
  'every task is placed in its phase');
select is((select count(*)::int from public.checklist_items where project_id = (select id from party)), 3,
  'checklists are created');
select is((select count(*)::int from public.tasks where project_id = (select id from party) and parent_task_id is not null), 2,
  'subtasks are created');
select is((select count(*)::int from public.labels where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and lower(name) = 'venue'), 1,
  'existing labels are reused, not duplicated');
select is((select count(*)::int from public.task_labels where project_id = (select id from party)), 2,
  'tasks get their labels');

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.create_project_from_template('aaaaaaaa-0000-4000-8000-00000000000a', 'Nope', '',
  'workspace', 'teal', null, (select body from template))$$, '42501', null, 'viewers can''t create projects from templates');
select isnt_empty($$select 1 from public.milestones where project_id = (select id from party)$$, 'viewers can see the phases');

reset role;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.create_project_from_template('aaaaaaaa-0000-4000-8000-00000000000a', 'Intruder', '',
  'workspace', 'teal', null, (select body from template))$$, '42501', null, 'other tenants can''t create projects here');
select is_empty($$select 1 from public.milestones$$, 'other tenants can''t see the phases');
select throws_ok($$select public.create_project_from_template('bbbbbbbb-0000-4000-8000-00000000000b', 'Empty', '',
  'workspace', 'teal', null, '{"columns": []}'::jsonb)$$, 'TF001', null, 'a template needs at least one column');
select throws_ok($$select public.create_project_from_template('bbbbbbbb-0000-4000-8000-00000000000b', 'Huge', '',
  'workspace', 'teal', null, jsonb_build_object('columns', '[{"name":"A"}]'::jsonb,
  'tasks', (select jsonb_agg(jsonb_build_object('title', 'T' || n)) from generate_series(1, 151) n)))$$,
  'TF001', null, 'oversized templates are refused');

-- Phase rules ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$insert into public.milestone_tasks (milestone_id, task_id, project_id, workspace_id)
  select m.id, t.id, m.project_id, m.workspace_id
  from public.milestones m, public.tasks t
  where m.project_id = (select id from party) and m.name = 'Event day' and t.title = 'Set a budget'$$,
  '23505', null, 'a task can only be in one phase');

reset role;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$insert into public.milestones (workspace_id, project_id, name)
  values ('aaaaaaaa-0000-4000-8000-00000000000a', (select id from party), 'Viewer phase')$$,
  '42501', null, 'viewers can''t add phases');

-- Saved templates ----------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into public.project_templates (workspace_id, name, definition, created_by)
  values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Our party', (select body from template), '33333333-3333-4333-8333-333333333333')$$,
  'members can save a template');

reset role;
select set_config('request.jwt.claims', '{"sub":"34343434-3434-4343-8343-343434343434","role":"authenticated"}', true);
set local role authenticated;
delete from public.project_templates where name = 'Our party';
reset role;
select is((select count(*)::int from public.project_templates where name = 'Our party'), 1,
  'members can''t delete someone else''s template');

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$insert into public.project_templates (workspace_id, name, definition, created_by)
  values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Viewer template', '{}'::jsonb, '44444444-4444-4444-8444-444444444444')$$,
  '42501', null, 'viewers can''t save templates');

reset role;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select is_empty($$select 1 from public.project_templates$$, 'other tenants can''t see saved templates');

select * from finish();
rollback;
