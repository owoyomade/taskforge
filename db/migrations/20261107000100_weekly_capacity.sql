-- Workload radar: how many open tasks one person can reasonably have due in
-- a week. The radar compares each person's weekly load against it.
--
-- It lives on the workspace (not per person) to keep the setting simple: one
-- number the team agrees on. Members read it through the existing "members
-- can read" policy; only owners and admins can change it, through the
-- existing "owners and admins can rename" update policy plus the column
-- grant below. Like every update grant here, it's per column, so the grant
-- doesn't widen what else an update can touch.
alter table public.workspaces
  add column weekly_capacity smallint not null default 5
  check (weekly_capacity between 1 and 50);

grant update (weekly_capacity) on public.workspaces to authenticated;
