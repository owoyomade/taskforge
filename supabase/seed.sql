-- Local development seed data. Runs on `npm run db:reset`.
-- NEVER run this against a hosted project: it creates users with a known password.
--
-- Every account below signs in with the password: Password123
--
--   alice@example.com  owner of "Acme Studio"
--   dave@example.com   admin in "Acme Studio"
--   carol@example.com  viewer in "Acme Studio"
--   bob@example.com    owner of "Bobcat Labs" (a separate tenant)

with seed_users (id, email, full_name) as (
  values
    ('a1a1a1a1-0000-4000-8000-000000000001'::uuid, 'alice@example.com', 'Alice Adeyemi'),
    ('b2b2b2b2-0000-4000-8000-000000000002'::uuid, 'bob@example.com', 'Bob Okafor'),
    ('c3c3c3c3-0000-4000-8000-000000000003'::uuid, 'carol@example.com', 'Carol Chen'),
    ('d4d4d4d4-0000-4000-8000-000000000004'::uuid, 'dave@example.com', 'Dave Mensah')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  extensions.crypt('Password123', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}', jsonb_build_object('full_name', full_name),
  now(), now(), '', '', '', ''
from seed_users;

-- Supabase Auth needs a matching identity row for email/password sign-in.
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(), id, id::text, 'email',
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  now(), now(), now()
from auth.users
where email like '%@example.com';

-- Profiles were created by the on_auth_user_created trigger.

insert into public.workspaces (id, name, slug, created_by) values
  ('10000000-0000-4000-8000-000000000001', 'Acme Studio', 'acme-studio', 'a1a1a1a1-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'Bobcat Labs', 'bobcat-labs', 'b2b2b2b2-0000-4000-8000-000000000002');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('10000000-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'owner'),
  ('10000000-0000-4000-8000-000000000001', 'd4d4d4d4-0000-4000-8000-000000000004', 'admin'),
  ('10000000-0000-4000-8000-000000000001', 'c3c3c3c3-0000-4000-8000-000000000003', 'viewer'),
  ('20000000-0000-4000-8000-000000000002', 'b2b2b2b2-0000-4000-8000-000000000002', 'owner');

-- Phase 2: a demo project with a board, labels and tasks in Acme Studio,
-- plus a private project only Alice and Dave can see.

insert into public.projects (id, workspace_id, name, description, owner_id, visibility, status, color, start_date, target_date, created_by) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Website relaunch',
   'New marketing site for the spring launch: copy, design and build.', 'a1a1a1a1-0000-4000-8000-000000000001',
   'workspace', 'active', 'teal', current_date - 14, current_date + 30, 'a1a1a1a1-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Hiring plan',
   'Roles and budget for next year. Private to leadership.', 'a1a1a1a1-0000-4000-8000-000000000001',
   'private', 'planned', 'violet', null, current_date + 60, 'a1a1a1a1-0000-4000-8000-000000000001');

insert into public.project_members (project_id, workspace_id, user_id) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'd4d4d4d4-0000-4000-8000-000000000004');

insert into public.board_columns (id, workspace_id, project_id, name, position, is_done) values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'To do', 1000, false),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'In progress', 2000, false),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Review', 3000, false),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Done', 4000, true),
  ('40000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'To do', 1000, false),
  ('40000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'Done', 2000, true);

insert into public.labels (id, workspace_id, name, color) values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Design', 'violet'),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Copy', 'amber'),
  ('50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Engineering', 'blue');

insert into public.tasks (id, workspace_id, project_id, column_id, title, description, priority, due_date, position, created_by) values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001', 'Write homepage copy', 'Hero, three feature blocks and the closing call to action.', 'high', current_date + 5, 1000, 'a1a1a1a1-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001', 'Collect customer logos', '', 'low', null, 2000, 'a1a1a1a1-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000002', 'Design pricing page', 'Three tiers, monthly and yearly toggle.', 'medium', current_date + 2, 1000, 'd4d4d4d4-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000003', 'Set up analytics', '', 'medium', current_date - 1, 1000, 'd4d4d4d4-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000004', 'Kickoff call with stakeholders', '', 'none', null, 1000, 'a1a1a1a1-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
   '40000000-0000-4000-8000-000000000005', 'Draft senior designer role', '', 'high', current_date + 20, 1000, 'a1a1a1a1-0000-4000-8000-000000000001');

insert into public.tasks (workspace_id, project_id, parent_task_id, title, completed_at, position, created_by) values
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'Hero headline options', now(), 1000, 'a1a1a1a1-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'Feature block copy', null, 2000, 'a1a1a1a1-0000-4000-8000-000000000001');

insert into public.task_assignees (task_id, project_id, workspace_id, user_id) values
  ('60000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'd4d4d4d4-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'd4d4d4d4-0000-4000-8000-000000000004');

insert into public.task_labels (task_id, label_id, project_id, workspace_id) values
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');

insert into public.checklists (id, task_id, project_id, workspace_id, title) values
  ('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Before review');

insert into public.checklist_items (checklist_id, task_id, project_id, workspace_id, content, is_done, position) values
  ('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Mobile layout', true, 1000),
  ('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Dark mode check', false, 2000);
