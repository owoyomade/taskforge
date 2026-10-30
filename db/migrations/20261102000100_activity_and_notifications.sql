-- Phase 4b: audit history ("activity") and in-app notifications.
--
-- Both are written by database triggers, in the same transaction as the
-- change they describe, so they can't drift out of step with the data or
-- be skipped by a buggy client. Neither stores passwords, tokens, file
-- contents, task descriptions or comment text: just ids, names and the
-- minimal before/after values.

-- ---------------------------------------------------------------------------
-- Project access for any user (not just the signed-in one)
--
-- Notifications need to ask "can the *recipient* see this project?", so
-- the access rules move into project_access_for(user, project), and
-- project_access(project) becomes a thin wrapper for the current user.
-- ---------------------------------------------------------------------------

create function public.project_access_for(target_user uuid, target_project uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with context as (
    select
      p.archived_at,
      m.role,
      p.owner_id = target_user as is_project_owner,
      p.visibility = 'workspace'
        or m.role in ('owner', 'admin')
        or p.owner_id = target_user
        or exists (
          select 1 from public.project_members pm
          where pm.project_id = p.id and pm.user_id = target_user
        ) as can_see
    from public.projects p
    join public.workspace_members m
      on m.workspace_id = p.workspace_id and m.user_id = target_user
    where p.id = target_project
  )
  select case
    when not can_see then null
    when role = 'viewer' then 'view'
    when role in ('owner', 'admin') or is_project_owner then 'manage'
    when archived_at is not null then 'view'
    else 'edit'
  end
  from context;
$$;

create or replace function public.project_access(target_project uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.project_access_for((select auth.uid()), target_project);
$$;

revoke execute on function public.project_access_for(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit events
-- ---------------------------------------------------------------------------

create table public.audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Plain ids, not foreign keys: the history of a deleted project or task
  -- must survive it. Names are copied into `summary` for the same reason.
  project_id uuid,
  task_id uuid,
  actor_id uuid references public.profiles (id) on delete set null,
  event_type text not null check (event_type ~ '^[a-z_]+\.[a-z_]+$'),
  summary jsonb not null default '{}' check (jsonb_typeof(summary) = 'object' and pg_column_size(summary) < 4000),
  created_at timestamptz not null default now()
);

create index audit_events_workspace_created_idx on public.audit_events (workspace_id, created_at desc);
create index audit_events_project_created_idx on public.audit_events (project_id, created_at desc) where project_id is not null;

/**
 * Appends one audit event. Called only from triggers.
 *
 * Skips events while their workspace (or, for project events, their
 * project) is itself being deleted: the cascade deletes rows whose parent
 * is already gone, and those per-row events would add nothing to the
 * single "project deleted" event.
 */
create function public.record_audit(
  target_workspace uuid,
  target_project uuid,
  target_task uuid,
  event text,
  details jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.workspaces where id = target_workspace) then
    return;
  end if;
  if target_project is not null and event <> 'project.deleted'
     and not exists (select 1 from public.projects where id = target_project) then
    return;
  end if;

  insert into public.audit_events (workspace_id, project_id, task_id, actor_id, event_type, summary)
  values (target_workspace, target_project, target_task, auth.uid(), event, coalesce(details, '{}'::jsonb));
end;
$$;

-- Tasks: creation, moves, renames, dates, priority, archive and delete.
-- Subtasks are left out to keep the history readable.
create function public.audit_task_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  from_name text;
  to_name text;
begin
  if new.parent_task_id is not null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public.record_audit(new.workspace_id, new.project_id, new.id, 'task.created', jsonb_build_object('title', new.title));
    return new;
  end if;

  if old.column_id is distinct from new.column_id then
    select name into from_name from public.board_columns where id = old.column_id;
    select name into to_name from public.board_columns where id = new.column_id;
    perform public.record_audit(new.workspace_id, new.project_id, new.id, 'task.moved',
      jsonb_build_object('title', new.title, 'from', from_name, 'to', to_name));
  end if;
  if old.title is distinct from new.title then
    perform public.record_audit(new.workspace_id, new.project_id, new.id, 'task.renamed',
      jsonb_build_object('from', old.title, 'to', new.title));
  end if;
  if old.due_date is distinct from new.due_date then
    perform public.record_audit(new.workspace_id, new.project_id, new.id, 'task.due_changed',
      jsonb_build_object('title', new.title, 'from', old.due_date, 'to', new.due_date));
  end if;
  if old.priority is distinct from new.priority then
    perform public.record_audit(new.workspace_id, new.project_id, new.id, 'task.priority_changed',
      jsonb_build_object('title', new.title, 'from', old.priority, 'to', new.priority));
  end if;
  if old.archived_at is distinct from new.archived_at then
    perform public.record_audit(new.workspace_id, new.project_id, new.id,
      case when new.archived_at is null then 'task.unarchived' else 'task.archived' end,
      jsonb_build_object('title', new.title));
  end if;
  if old.deleted_at is distinct from new.deleted_at then
    perform public.record_audit(new.workspace_id, new.project_id, new.id,
      case when new.deleted_at is null then 'task.restored' else 'task.deleted' end,
      jsonb_build_object('title', new.title));
  end if;
  return new;
end;
$$;

create trigger tasks_audit
  after insert or update on public.tasks
  for each row execute function public.audit_task_changes();

create function public.audit_assignment_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data public.task_assignees := case when tg_op = 'DELETE' then old else new end;
  task_title text;
begin
  select title into task_title from public.tasks where id = row_data.task_id;
  perform public.record_audit(row_data.workspace_id, row_data.project_id, row_data.task_id,
    case when tg_op = 'DELETE' then 'task.unassigned' else 'task.assigned' end,
    jsonb_build_object('title', task_title, 'user_id', row_data.user_id));
  return null;
end;
$$;

create trigger task_assignees_audit
  after insert or delete on public.task_assignees
  for each row execute function public.audit_assignment_changes();

create function public.audit_project_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_audit(new.workspace_id, new.id, null, 'project.created', jsonb_build_object('name', new.name));
    return null;
  end if;
  if tg_op = 'DELETE' then
    perform public.record_audit(old.workspace_id, old.id, null, 'project.deleted', jsonb_build_object('name', old.name));
    return null;
  end if;

  if old.name is distinct from new.name then
    perform public.record_audit(new.workspace_id, new.id, null, 'project.renamed', jsonb_build_object('from', old.name, 'to', new.name));
  end if;
  if old.status is distinct from new.status then
    perform public.record_audit(new.workspace_id, new.id, null, 'project.status_changed',
      jsonb_build_object('name', new.name, 'from', old.status, 'to', new.status));
  end if;
  if old.archived_at is distinct from new.archived_at then
    perform public.record_audit(new.workspace_id, new.id, null,
      case when new.archived_at is null then 'project.unarchived' else 'project.archived' end,
      jsonb_build_object('name', new.name));
  end if;
  if old.visibility is distinct from new.visibility then
    perform public.record_audit(new.workspace_id, new.id, null, 'project.visibility_changed',
      jsonb_build_object('name', new.name, 'to', new.visibility));
  end if;
  if old.owner_id is distinct from new.owner_id then
    perform public.record_audit(new.workspace_id, new.id, null, 'project.owner_changed',
      jsonb_build_object('name', new.name, 'user_id', new.owner_id));
  end if;
  return null;
end;
$$;

create trigger projects_audit
  after insert or update or delete on public.projects
  for each row execute function public.audit_project_changes();

create function public.audit_phase_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_audit(new.workspace_id, new.project_id, null, 'phase.created', jsonb_build_object('name', new.name));
  elsif tg_op = 'DELETE' then
    perform public.record_audit(old.workspace_id, old.project_id, null, 'phase.deleted', jsonb_build_object('name', old.name));
  elsif old.name is distinct from new.name or old.target_date is distinct from new.target_date then
    perform public.record_audit(new.workspace_id, new.project_id, null, 'phase.updated',
      jsonb_build_object('name', new.name, 'from_date', old.target_date, 'to_date', new.target_date));
  end if;
  return null;
end;
$$;

create trigger milestones_audit
  after insert or update or delete on public.milestones
  for each row execute function public.audit_phase_changes();

create function public.audit_attachment_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data public.attachments := case when tg_op = 'DELETE' then old else new end;
begin
  -- The file name only; never anything from inside the file.
  perform public.record_audit(row_data.workspace_id, row_data.project_id, row_data.task_id,
    case when tg_op = 'DELETE' then 'attachment.removed' else 'attachment.added' end,
    jsonb_build_object('file_name', row_data.file_name));
  return null;
end;
$$;

create trigger attachments_audit
  after insert or delete on public.attachments
  for each row execute function public.audit_attachment_changes();

create function public.audit_comment_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Comment text stays out of the log; the task title says where it was.
  perform public.record_audit(new.workspace_id, new.project_id, new.task_id, 'comment.added',
    jsonb_build_object('title', (select title from public.tasks where id = new.task_id)));
  return null;
end;
$$;

create trigger comments_audit
  after insert on public.comments
  for each row execute function public.audit_comment_added();

create function public.audit_membership_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_audit(new.workspace_id, null, null, 'member.joined', jsonb_build_object('user_id', new.user_id, 'role', new.role));
  elsif tg_op = 'DELETE' then
    perform public.record_audit(old.workspace_id, null, null, 'member.removed', jsonb_build_object('user_id', old.user_id, 'role', old.role));
  elsif old.role is distinct from new.role then
    perform public.record_audit(new.workspace_id, null, null, 'member.role_changed',
      jsonb_build_object('user_id', new.user_id, 'from', old.role, 'to', new.role));
  end if;
  return null;
end;
$$;

create trigger workspace_members_audit
  after insert or update or delete on public.workspace_members
  for each row execute function public.audit_membership_changes();

create function public.audit_invitation_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_audit(new.workspace_id, null, null, 'invitation.sent', jsonb_build_object('email', new.email, 'role', new.role));
  elsif old.revoked_at is null and new.revoked_at is not null then
    perform public.record_audit(new.workspace_id, null, null, 'invitation.revoked', jsonb_build_object('email', new.email));
  elsif old.declined_at is null and new.declined_at is not null then
    perform public.record_audit(new.workspace_id, null, null, 'invitation.declined', jsonb_build_object('email', new.email));
  end if;
  return null;
end;
$$;

create trigger workspace_invitations_audit
  after insert or update on public.workspace_invitations
  for each row execute function public.audit_invitation_changes();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

create type public.notification_type as enum ('assigned', 'mentioned', 'commented');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  comment_id uuid,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  type public.notification_type not null,
  -- A copy of the task title at the time, so the inbox reads well. It's
  -- only ever shown to someone who can (still) see the project; see RLS.
  task_title text not null,
  -- Makes notification creation idempotent: the same event can't notify
  -- the same person twice, even if a trigger runs again.
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, dedupe_key),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (task_id, project_id) references public.tasks (id, project_id) on delete cascade
);

create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  assigned boolean not null default true,
  mentioned boolean not null default true,
  commented boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

/**
 * Creates one notification, unless the recipient caused it themselves,
 * turned that kind off, or can't see the project (so private work never
 * leaks through a notification).
 */
create function public.notify(
  recipient uuid,
  kind public.notification_type,
  target_task uuid,
  target_comment uuid,
  dedupe text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_row public.tasks;
  wants boolean;
begin
  if recipient is null or recipient = auth.uid() then
    return;
  end if;

  select * into task_row from public.tasks where id = target_task;
  if not found or task_row.deleted_at is not null then
    return;
  end if;
  if public.project_access_for(recipient, task_row.project_id) is null then
    return;
  end if;

  select case kind
           when 'assigned' then assigned
           when 'mentioned' then mentioned
           when 'commented' then commented
         end
  into wants
  from public.notification_preferences where user_id = recipient;
  if wants is false then
    return;
  end if;

  insert into public.notifications (workspace_id, project_id, task_id, comment_id, recipient_id, actor_id, type, task_title, dedupe_key)
  values (task_row.workspace_id, task_row.project_id, task_row.id, target_comment, recipient, auth.uid(), kind,
          left(task_row.title, 200), dedupe)
  on conflict (recipient_id, dedupe_key) do nothing;
end;
$$;

create function public.notify_on_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify(new.user_id, 'assigned', new.task_id, null,
    'assigned:' || new.task_id || ':' || extract(epoch from new.created_at));
  return null;
end;
$$;

create trigger task_assignees_notify
  after insert on public.task_assignees
  for each row execute function public.notify_on_assignment();

-- A new comment notifies the task's assignees and the person who created it.
create function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
begin
  for person in
    select user_id from public.task_assignees where task_id = new.task_id
    union
    select created_by from public.tasks where id = new.task_id and created_by is not null
  loop
    perform public.notify(person, 'commented', new.task_id, new.id, 'comment:' || new.id);
  end loop;
  return null;
end;
$$;

create trigger comments_notify
  after insert on public.comments
  for each row execute function public.notify_on_comment();

-- A mention is more specific than "commented", so it replaces it.
create function public.notify_on_mention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  comment_row public.comments;
begin
  select * into comment_row from public.comments where id = new.comment_id;
  delete from public.notifications
  where recipient_id = new.user_id and comment_id = new.comment_id and type = 'commented';
  perform public.notify(new.user_id, 'mentioned', comment_row.task_id, new.comment_id, 'mention:' || new.comment_id);
  return null;
end;
$$;

create trigger comment_mentions_notify
  after insert on public.comment_mentions
  for each row execute function public.notify_on_mention();

-- ---------------------------------------------------------------------------
-- Privileges and Row Level Security
-- ---------------------------------------------------------------------------

revoke all on public.audit_events, public.notifications, public.notification_preferences from anon, authenticated;

-- Audit history is append-only for everyone using the API: read, never write.
grant select on public.audit_events to authenticated;

grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert on public.notification_preferences to authenticated;
-- user_id is included because saving uses an upsert, which rewrites every
-- column it sends; the RLS policy still pins it to the signed-in user.
grant update (user_id, assigned, mentioned, commented) on public.notification_preferences to authenticated;

revoke execute on function
  public.record_audit(uuid, uuid, uuid, text, jsonb),
  public.notify(uuid, public.notification_type, uuid, uuid, text),
  public.audit_task_changes(),
  public.audit_assignment_changes(),
  public.audit_project_changes(),
  public.audit_phase_changes(),
  public.audit_attachment_changes(),
  public.audit_comment_added(),
  public.audit_membership_changes(),
  public.audit_invitation_changes(),
  public.notify_on_assignment(),
  public.notify_on_comment(),
  public.notify_on_mention()
from public, anon, authenticated;

alter table public.audit_events enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

-- Owners and admins see everything in their workspace (including member
-- and invitation events and deleted projects). Everyone else sees the
-- history of projects they can currently see.
create policy "audit_events: admins, or anyone who can see the project"
  on public.audit_events for select to authenticated
  using (
    public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[])
    or (project_id is not null and public.can_view_project(project_id))
  );

create policy "notifications: recipients read their own while they can see the project"
  on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()) and public.can_view_project(project_id));

create policy "notifications: recipients mark their own as read"
  on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create policy "notifications: recipients delete their own"
  on public.notifications for delete to authenticated
  using (recipient_id = (select auth.uid()));

create policy "notification_preferences: own row"
  on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notification_preferences: create own row"
  on public.notification_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "notification_preferences: update own row"
  on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
