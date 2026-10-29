-- Phase 5: make Row Level Security checks cost the same for 10 rows or 10,000.
--
-- The read policies were written as `using (can_view_project(project_id))`.
-- That's correct, but Postgres runs the function once *per row*, and each
-- call is a small query of its own. Loading a workspace's 200 tasks meant
-- 200 extra permission lookups; under load, workspace-wide queries hit the
-- 8-second statement timeout.
--
-- The fix keeps the same rules but asks the question once per query:
-- "which projects can I see?" returns a list, and each row is checked
-- against that list. Postgres runs an uncorrelated `in (select ...)` a single
-- time and keeps the result in a hash table.
--
-- The existing pgTAP tests (cross-tenant reads, private projects, viewers)
-- check that nobody can see anything they couldn't see before.

/**
 * Ids of every project a user can see, in all their workspaces. Same rule
 * as project_access_for(): you must be a workspace member, and the project
 * is either workspace-visible, or you're an owner/admin, its owner, or one
 * of its members. A pgTAP test checks the two always agree.
 */
create function public.visible_project_ids_for(target_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.projects p
  join public.workspace_members m
    on m.workspace_id = p.workspace_id and m.user_id = target_user
  where p.visibility = 'workspace'
     or m.role in ('owner', 'admin')
     or p.owner_id = target_user
     or exists (
       select 1 from public.project_members pm
       where pm.project_id = p.id and pm.user_id = target_user
     );
$$;

-- Asking about other people is for the database only.
revoke execute on function public.visible_project_ids_for(uuid) from public, anon, authenticated;

/** The signed-in user's visible projects; what the read policies use. */
create function public.visible_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select public.visible_project_ids_for((select auth.uid()));
$$;

/** Ids of the workspaces the signed-in user belongs to. */
create function public.my_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select workspace_id from public.workspace_members where user_id = (select auth.uid());
$$;

revoke execute on function public.visible_project_ids(), public.my_workspace_ids() from public, anon;
grant execute on function public.visible_project_ids(), public.my_workspace_ids() to authenticated;

-- Project-scoped tables -------------------------------------------------------------------

alter policy "projects: visible to those with access" on public.projects
  using (id in (select public.visible_project_ids()));

alter policy "project_members: visible with the project" on public.project_members
  using (project_id in (select public.visible_project_ids()));

alter policy "board_columns: read" on public.board_columns
  using (project_id in (select public.visible_project_ids()));

alter policy "tasks: read" on public.tasks
  using (project_id in (select public.visible_project_ids()));

alter policy "task_assignees: read" on public.task_assignees
  using (project_id in (select public.visible_project_ids()));

alter policy "task_labels: read" on public.task_labels
  using (project_id in (select public.visible_project_ids()));

alter policy "checklists: read" on public.checklists
  using (project_id in (select public.visible_project_ids()));

alter policy "checklist_items: read" on public.checklist_items
  using (project_id in (select public.visible_project_ids()));

alter policy "milestones: read" on public.milestones
  using (project_id in (select public.visible_project_ids()));

alter policy "milestone_tasks: read" on public.milestone_tasks
  using (project_id in (select public.visible_project_ids()));

alter policy "comments: read with the task" on public.comments
  using (project_id in (select public.visible_project_ids()));

alter policy "comment_mentions: read with the task" on public.comment_mentions
  using (project_id in (select public.visible_project_ids()));

alter policy "attachments: read with the task" on public.attachments
  using (project_id in (select public.visible_project_ids()));

alter policy "notifications: recipients read their own while they can see the" on public.notifications
  using (recipient_id = (select auth.uid()) and project_id in (select public.visible_project_ids()));

alter policy "audit_events: admins, or anyone who can see the project" on public.audit_events
  using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = (select auth.uid()) and role in ('owner', 'admin')
    )
    or project_id in (select public.visible_project_ids())
  );

-- Workspace-scoped tables -----------------------------------------------------------------

alter policy "workspaces: members can read" on public.workspaces
  using (id in (select public.my_workspace_ids()));

alter policy "workspace_members: members can read their workspace roster" on public.workspace_members
  using (workspace_id in (select public.my_workspace_ids()));

alter policy "labels: members read" on public.labels
  using (workspace_id in (select public.my_workspace_ids()));

alter policy "project_templates: members read" on public.project_templates
  using (workspace_id in (select public.my_workspace_ids()));
