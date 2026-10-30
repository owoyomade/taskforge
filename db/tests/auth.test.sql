-- Sign-in groundwork: who is signed in, profiles, verified email, attempt limits.
-- Run with: npm run test:db

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- auth.uid() ----------------------------------------------------------------------

select is(auth.uid(), null, 'nobody is signed in by default');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111"}', true);
select is(auth.uid(), '11111111-1111-4111-8111-111111111111'::uuid, 'auth.uid() reads the signed-in user from the request');
select set_config('request.jwt.claims', '', true);

-- Accounts and profiles -------------------------------------------------------------

insert into auth.users (id, email, name) values
  ('11111111-1111-4111-8111-111111111111', 'new.person@test.local', 'New Person');
select is((select full_name from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 'New Person',
  'creating an account creates its profile with the name given at sign-up');

update auth.users set email = 'renamed@test.local' where id = '11111111-1111-4111-8111-111111111111';
select is((select email from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 'renamed@test.local',
  'a changed account email is copied to the profile');

select throws_ok($$insert into auth.users (email) values ('Mixed@Test.local')$$, '23514', null,
  'account emails are stored in lowercase');

-- Invitations only trust a verified email ------------------------------------------

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111"}', true);
select is(public.current_user_email(), null, 'an unverified email isn''t trusted');
update auth.users set email_verified = true where id = '11111111-1111-4111-8111-111111111111';
select is(public.current_user_email(), 'renamed@test.local', 'a verified email is');

-- Attempt limits ----------------------------------------------------------------------

select ok(auth.attempts_allowed('test:key', 2, 60), 'a new key is allowed');
select auth.record_attempt('test:key', 60);
select auth.record_attempt('test:key', 60);
select ok(not auth.attempts_allowed('test:key', 2, 60), 'reaching the limit blocks further attempts');

update auth.attempts set window_started_at = now() - interval '2 minutes' where key = 'test:key';
select ok(auth.attempts_allowed('test:key', 2, 60), 'the block lifts once the window has passed');
select auth.record_attempt('test:key', 60);
select is((select count from auth.attempts where key = 'test:key'), 1, 'an expired window starts counting again from one');

set local role authenticated;
select throws_ok($$select auth.record_attempt('test:key', 60)$$, '42501', null,
  'signed-in users can''t touch the attempt counters');
reset role;

select * from finish();
rollback;
