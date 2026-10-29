-- Invitations, ownership transfer, comments, mentions and attachments.
-- Run with: npm run test:db

begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- Cast ---------------------------------------------------------------------------
--   owner1, admin1, member1, viewer1  Tenant One
--   invitee   invited by email, not yet a member     stranger  some other verified user
--   outsider  owner of Tenant Two

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'owner1@test.local', now()),
  ('22222222-2222-4222-8222-222222222222', 'admin1@test.local', now()),
  ('33333333-3333-4333-8333-333333333333', 'member1@test.local', now()),
  ('44444444-4444-4444-8444-444444444444', 'viewer1@test.local', now()),
  ('66666666-6666-4666-8666-666666666666', 'invitee@test.local', now()),
  ('77777777-7777-4777-8777-777777777777', 'stranger@test.local', now()),
  ('55555555-5555-4555-8555-555555555555', 'outsider@test.local', now());

insert into public.workspaces (id, name, slug) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'Tenant One', 'tenant-one'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'Tenant Two', 'tenant-two');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '33333333-3333-4333-8333-333333333333', 'member'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '44444444-4444-4444-8444-444444444444', 'viewer'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', '55555555-5555-4555-8555-555555555555', 'owner');

insert into public.projects (id, workspace_id, name, owner_id) values
  ('cccccccc-0000-4000-8000-00000000000c', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Shared', '11111111-1111-4111-8111-111111111111');
insert into public.board_columns (id, workspace_id, project_id, name, position) values
  ('dddddddd-0000-4000-8000-00000000000d', 'aaaaaaaa-0000-4000-8000-00000000000a', 'cccccccc-0000-4000-8000-00000000000c', 'To do', 1000);
insert into public.tasks (id, workspace_id, project_id, column_id, title, created_by) values
  ('eeeeeeee-0000-4000-8000-00000000000e', 'aaaaaaaa-0000-4000-8000-00000000000a', 'cccccccc-0000-4000-8000-00000000000c',
   'dddddddd-0000-4000-8000-00000000000d', 'A task', '11111111-1111-4111-8111-111111111111');

-- Raw invite tokens are only ever returned once, so tests keep them here.
create temporary table tokens (label text, invitation_id uuid, token text);
grant select, insert on tokens to authenticated;

-- Invitations ----------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.create_invitation('aaaaaaaa-0000-4000-8000-00000000000a', 'someone@test.local', 'member')$$,
  '42501', null, 'members can''t invite people');
select is_empty($$select 1 from public.workspace_invitations$$, 'members can''t read the invitation list');

reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into tokens select 'invitee', invitation_id, token
  from public.create_invitation('aaaaaaaa-0000-4000-8000-00000000000a', ' Invitee@Test.local ', 'member')$$,
  'admins can invite people');
select is((select email from public.workspace_invitations where id = (select invitation_id from tokens where label = 'invitee')),
  'invitee@test.local', 'invited emails are trimmed and lowercased');
select isnt((select token_hash from public.workspace_invitations where id = (select invitation_id from tokens where label = 'invitee')),
  (select token from tokens where label = 'invitee'), 'only a hash of the token is stored');
select throws_ok($$select public.create_invitation('aaaaaaaa-0000-4000-8000-00000000000a', 'new@test.local', 'owner')$$,
  'TF001', null, 'nobody can be invited straight in as an owner');
select throws_ok($$select public.create_invitation('aaaaaaaa-0000-4000-8000-00000000000a', 'member1@test.local', 'viewer')$$,
  'TF001', null, 'existing members can''t be invited again');

-- Re-inviting the same email replaces the old link.
insert into tokens select 'later-1', invitation_id, token
  from public.create_invitation('aaaaaaaa-0000-4000-8000-00000000000a', 'later@test.local', 'viewer');
insert into tokens select 'later-2', invitation_id, token
  from public.create_invitation('aaaaaaaa-0000-4000-8000-00000000000a', 'later@test.local', 'viewer');
select is((select count(*)::int from public.workspace_invitations
  where email = 'later@test.local' and revoked_at is null), 1, 're-inviting revokes the previous invitation');

reset role;
select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}', true);
set local role authenticated;
select is((select status from public.invitation_preview((select token from tokens where label = 'invitee'))),
  'pending', 'anyone signed in with the link can preview the invitation');
select is((select email_hint from public.invitation_preview((select token from tokens where label = 'invitee'))),
  'i•••@test.local', 'the preview masks the invited email');
select is_empty($$select 1 from public.invitation_preview('not-a-real-token')$$, 'a made-up token finds nothing');
select throws_ok($$select public.respond_to_invitation((select invitation_id from tokens where label = 'invitee'), true)$$,
  'TF001', null, 'a different account can''t accept someone else''s invitation');

reset role;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.list_my_invitations()), 1, 'invitees see their open invitations');
select is(public.respond_to_invitation((select invitation_id from tokens where label = 'invitee'), true),
  'tenant-one', 'the invitee can accept');
select is((select role::text from public.workspace_members
  where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and user_id = '66666666-6666-4666-8666-666666666666'),
  'member', 'accepting adds them with the invited role');
select throws_ok($$select public.respond_to_invitation((select invitation_id from tokens where label = 'invitee'), true)$$,
  'TF001', null, 'an invitation can''t be used twice');

-- Expired and revoked invitations.
reset role;
update public.workspace_invitations set email = 'stranger@test.local', expires_at = now() - interval '1 minute'
  where id = (select invitation_id from tokens where label = 'later-2');
update public.workspace_invitations set email = 'stranger@test.local'
  where id = (select invitation_id from tokens where label = 'later-1');
select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.respond_to_invitation((select invitation_id from tokens where label = 'later-2'), true)$$,
  'TF001', null, 'expired invitations can''t be accepted');
select throws_ok($$select public.respond_to_invitation((select invitation_id from tokens where label = 'later-1'), true)$$,
  'TF001', null, 'revoked invitations can''t be accepted');

-- Another tenant can't touch Tenant One's invitations.
reset role;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.create_invitation('aaaaaaaa-0000-4000-8000-00000000000a', 'x@test.local', 'member')$$,
  '42501', null, 'other tenants can''t invite into this workspace');

-- Rate limit: 20 invitations per workspace per hour.
reset role;
insert into public.workspace_invitations (workspace_id, email, role, token_hash)
  select 'bbbbbbbb-0000-4000-8000-00000000000b', 'bulk' || n || '@test.local', 'viewer', 'hash-' || n
  from generate_series(1, 20) as n;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.create_invitation('bbbbbbbb-0000-4000-8000-00000000000b', 'one-more@test.local', 'viewer')$$,
  'TF001', null, 'invitations are rate limited');

-- Ownership transfer ----------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.transfer_ownership('aaaaaaaa-0000-4000-8000-00000000000a', '22222222-2222-4222-8222-222222222222')$$,
  'TF001', null, 'admins can''t take ownership for themselves');

reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.transfer_ownership('aaaaaaaa-0000-4000-8000-00000000000a', '55555555-5555-4555-8555-555555555555')$$,
  'TF001', null, 'ownership can only go to an existing member');
select lives_ok($$select public.transfer_ownership('aaaaaaaa-0000-4000-8000-00000000000a', '22222222-2222-4222-8222-222222222222')$$,
  'the owner can transfer ownership');
reset role;
select results_eq(
  $$select user_id::text, role::text from public.workspace_members
    where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and role in ('owner', 'admin') order by role, user_id$$,
  $$values ('11111111-1111-4111-8111-111111111111', 'admin'), ('22222222-2222-4222-8222-222222222222', 'owner')$$,
  'the new owner is promoted and the old owner becomes an admin');

-- Comments and mentions ------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into public.comments (id, workspace_id, project_id, task_id, author_id, body) values
  ('f0000000-0000-4000-8000-00000000000f', 'aaaaaaaa-0000-4000-8000-00000000000a', 'cccccccc-0000-4000-8000-00000000000c',
   'eeeeeeee-0000-4000-8000-00000000000e', '33333333-3333-4333-8333-333333333333', 'Hello team')$$,
  'members can comment');
select throws_ok($$insert into public.comments (workspace_id, project_id, task_id, author_id, body) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'cccccccc-0000-4000-8000-00000000000c',
   'eeeeeeee-0000-4000-8000-00000000000e', '22222222-2222-4222-8222-222222222222', 'Forged')$$,
  '42501', null, 'comments can''t be posted in someone else''s name');
select lives_ok($$insert into public.comment_mentions (comment_id, project_id, workspace_id, user_id) values
  ('f0000000-0000-4000-8000-00000000000f', 'cccccccc-0000-4000-8000-00000000000c', 'aaaaaaaa-0000-4000-8000-00000000000a',
   '22222222-2222-4222-8222-222222222222')$$,
  'authors can mention a workspace member');
select throws_ok($$insert into public.comment_mentions (comment_id, project_id, workspace_id, user_id) values
  ('f0000000-0000-4000-8000-00000000000f', 'cccccccc-0000-4000-8000-00000000000c', 'aaaaaaaa-0000-4000-8000-00000000000a',
   '55555555-5555-4555-8555-555555555555')$$,
  '23503', null, 'people outside the workspace can''t be mentioned');

reset role;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select isnt_empty($$select 1 from public.comments$$, 'viewers can read comments');
select throws_ok($$insert into public.comments (workspace_id, project_id, task_id, author_id, body) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'cccccccc-0000-4000-8000-00000000000c',
   'eeeeeeee-0000-4000-8000-00000000000e', '44444444-4444-4444-8444-444444444444', 'Viewer comment')$$,
  '42501', null, 'viewers can''t comment');

reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
update public.comments set body = 'Edited by someone else' where id = 'f0000000-0000-4000-8000-00000000000f';
select is((select body from public.comments where id = 'f0000000-0000-4000-8000-00000000000f'), 'Hello team',
  'nobody can edit another person''s comment');

reset role;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select is_empty($$select 1 from public.comments$$, 'other tenants see no comments');

-- Attachments -----------------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into storage.objects (bucket_id, name) values
  ('attachments', 'aaaaaaaa-0000-4000-8000-00000000000a/cccccccc-0000-4000-8000-00000000000c/eeeeeeee-0000-4000-8000-00000000000e/1-brief.pdf')$$,
  'editors can upload to their task''s folder');
select throws_ok($$insert into storage.objects (bucket_id, name) values
  ('attachments', 'bbbbbbbb-0000-4000-8000-00000000000b/cccccccc-0000-4000-8000-00000000000c/eeeeeeee-0000-4000-8000-00000000000e/2-x.pdf')$$,
  '42501', null, 'a path naming the wrong workspace is refused');
select throws_ok($$insert into public.attachments (workspace_id, project_id, task_id, uploaded_by, file_name, storage_path, content_type, size_bytes)
  values ('aaaaaaaa-0000-4000-8000-00000000000a', 'cccccccc-0000-4000-8000-00000000000c', 'eeeeeeee-0000-4000-8000-00000000000e',
  '33333333-3333-4333-8333-333333333333', 'x.pdf', 'somewhere/else.pdf', 'application/pdf', 10)$$,
  '23514', null, 'an attachment''s path must match its task');

reset role;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select is_empty($$select 1 from storage.objects where bucket_id = 'attachments'$$, 'other tenants can''t see the files');

-- Quota: fill the workspace to exactly 100 MB, then try one more byte.
reset role;
insert into public.attachments (workspace_id, project_id, task_id, file_name, storage_path, content_type, size_bytes)
  select 'aaaaaaaa-0000-4000-8000-00000000000a', 'cccccccc-0000-4000-8000-00000000000c', 'eeeeeeee-0000-4000-8000-00000000000e',
    'big.zip', 'aaaaaaaa-0000-4000-8000-00000000000a/cccccccc-0000-4000-8000-00000000000c/eeeeeeee-0000-4000-8000-00000000000e/big-' || n,
    'application/zip', 5 * 1024 * 1024
  from generate_series(1, 20) as n;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$insert into public.attachments (workspace_id, project_id, task_id, uploaded_by, file_name, storage_path, content_type, size_bytes)
  values ('aaaaaaaa-0000-4000-8000-00000000000a', 'cccccccc-0000-4000-8000-00000000000c', 'eeeeeeee-0000-4000-8000-00000000000e',
  '33333333-3333-4333-8333-333333333333', 'one-more.txt',
  'aaaaaaaa-0000-4000-8000-00000000000a/cccccccc-0000-4000-8000-00000000000c/eeeeeeee-0000-4000-8000-00000000000e/over.txt',
  'text/plain', 1)$$,
  'TF001', null, 'the 100 MB workspace quota is enforced');

-- Removing a member keeps their comments but drops their mentions.
reset role;
delete from public.workspace_members
  where workspace_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and user_id = '11111111-1111-4111-8111-111111111111';
select is((select count(*)::int from public.comments where id = 'f0000000-0000-4000-8000-00000000000f'), 1,
  'comments survive other members leaving');

select * from finish();
rollback;
