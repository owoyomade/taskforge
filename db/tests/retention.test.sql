-- The daily retention job (purge_expired_records).
-- Run with: npm run test:db

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner1@test.local'),
  ('33333333-3333-4333-8333-333333333333', 'member1@test.local');

insert into public.workspaces (id, name, slug) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'Tenant One', 'tenant-one');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '33333333-3333-4333-8333-333333333333', 'member');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select public.create_project('aaaaaaaa-0000-4000-8000-00000000000a', 'Keep tidy', '', 'workspace', 'teal');
reset role;

insert into public.tasks (id, workspace_id, project_id, column_id, title, created_by)
select 'eeeeeeee-0000-4000-8000-00000000000e', p.workspace_id, p.id, c.id, 'A task', '11111111-1111-4111-8111-111111111111'
from public.projects p join public.board_columns c on c.project_id = p.id and c.name = 'To do'
where p.name = 'Keep tidy';

-- Ages are set directly, as the database owner, to simulate the passage of time.
insert into public.audit_events (workspace_id, event_type, created_at) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'test.old', now() - interval '13 months'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'test.recent', now() - interval '11 months');

insert into public.notifications (workspace_id, project_id, task_id, recipient_id, type, task_title, dedupe_key, read_at, created_at)
select p.workspace_id, p.id, 'eeeeeeee-0000-4000-8000-00000000000e', '33333333-3333-4333-8333-333333333333', 'assigned', 'A task', v.key, v.read_at, v.created_at
from public.projects p,
  (values
    ('read-long-ago', now() - interval '100 days', now() - interval '120 days'),
    ('read-recently', now() - interval '10 days', now() - interval '120 days'),
    ('unread-old', null::timestamptz, now() - interval '13 months'),
    ('unread-recent', null::timestamptz, now() - interval '100 days')
  ) as v(key, read_at, created_at)
where p.name = 'Keep tidy';

insert into public.workspace_invitations (workspace_id, email, role, token_hash, expires_at, accepted_at, revoked_at) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'expired-long-ago@test.local', 'member', 'h1', now() - interval '100 days', null, null),
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'revoked-long-ago@test.local', 'member', 'h2', now() + interval '1 day', null, now() - interval '100 days'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'expired-recently@test.local', 'member', 'h3', now() - interval '10 days', null, null),
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'still-open@test.local', 'member', 'h4', now() + interval '5 days', null, null);

-- Only the scheduler may run it ---------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.purge_expired_records()$$, '42501', null, 'even workspace owners can''t run the purge');
reset role;

-- Run it --------------------------------------------------------------------------------

select ok(
  (select (public.purge_expired_records() ->> 'notifications')::int >= 2),
  'the purge reports how many notifications it removed'
);

select is(
  (select array_agg(event_type order by event_type) from public.audit_events
   where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and event_type like 'test.%'),
  array['test.recent'],
  'activity older than 12 months is removed; newer activity stays'
);
select ok(
  exists (select 1 from public.audit_events where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and event_type = 'project.created'),
  'today''s activity is untouched'
);

select is(
  (select array_agg(dedupe_key order by dedupe_key) from public.notifications
   where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a'),
  array['read-recently', 'unread-recent'],
  'notifications read 90+ days ago, and any 12+ months old, are removed'
);

select is(
  (select array_agg(email order by email) from public.workspace_invitations
   where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a'),
  array['expired-recently@test.local', 'still-open@test.local'],
  'invitations unusable for 90+ days are removed; open and recent ones stay'
);

select ok(
  exists (select 1 from public.audit_events where event_type = 'invitation.sent'
          and summary ->> 'email' = 'revoked-long-ago@test.local'),
  'the history of a purged invitation stays in the activity log'
);

select is((select public.purge_expired_records() ->> 'audit_events'), '0', 'running it again removes nothing');

-- The scheduled job (/api/cron/purge) runs it with the app's own login.
select ok(has_function_privilege('taskforge_app', 'public.purge_expired_records()', 'execute'),
  'the scheduled job''s login can run the purge');


select * from finish();
rollback;
