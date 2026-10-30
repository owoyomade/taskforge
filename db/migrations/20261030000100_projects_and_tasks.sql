-- Phase 2: projects, board columns, tasks, labels and checklists.
--
-- Two ideas carry most of the security weight here:
--
-- 1. Composite foreign keys. Every child row stores workspace_id (and
--    project_id where relevant), and the foreign key covers *both* the
--    parent id and that workspace/project id. So a task can't point at a
--    column from another project, a label from another workspace can't be
--    attached, and only actual workspace members can be assigned, even if
--    application code has a bug.
--
-- 2. One access function. project_access() answers "what may the current
--    user do in this project?" and every policy below asks it.

create type public.project_visibility as enum ('workspace', 'private');
create type public.project_status as enum ('planned', 'active', 'on_hold', 'completed');
create type public.task_priority as enum ('none', 'low', 'medium', 'high', 'urgent');

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  owner_id uuid,
  -- 'workspace': every workspace member can see it.
  -- 'private': only project members, the project owner, and workspace owners/admins.
  visibility public.project_visibility not null default 'workspace',
  status public.project_status not null default 'active',
  color text not null default 'teal' check (color in ('teal', 'blue', 'violet', 'rose', 'amber', 'slate')),
  start_date date,
  target_date date,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  check (target_date is null or start_date is null or target_date >= start_date),
  -- The owner must be a member of the workspace. If they leave, the
  -- project keeps going without an owner (only owner_id is cleared).
  foreign key (workspace_id, owner_id)
    references public.workspace_members (workspace_id, user_id)
    on delete set null (owner_id)
);

create index projects_workspace_id_idx on public.projects (workspace_id);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- Explicit membership, used for private projects.
create table public.project_members (
  project_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  -- Leaving the workspace removes you from all its projects automatically.
  foreign key (workspace_id, user_id)
    references public.workspace_members (workspace_id, user_id)
    on delete cascade
);

create index project_members_user_id_idx on public.project_members (user_id);

-- ---------------------------------------------------------------------------
-- Project access
--
-- Returns 'manage', 'edit', 'view', or null (no access at all):
--   manage: workspace owners/admins and the project owner: settings, archive, delete
--   edit:   other non-viewer members who can see the project: tasks and columns
--   view:   workspace viewers, and everyone while a project is archived
-- ---------------------------------------------------------------------------

create function public.project_access(target_project uuid)
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
      p.owner_id = (select auth.uid()) as is_project_owner,
      p.visibility = 'workspace'
        or m.role in ('owner', 'admin')
        or p.owner_id = (select auth.uid())
        or exists (
          select 1 from public.project_members pm
          where pm.project_id = p.id and pm.user_id = (select auth.uid())
        ) as can_see
    from public.projects p
    join public.workspace_members m
      on m.workspace_id = p.workspace_id and m.user_id = (select auth.uid())
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

create function public.can_view_project(target_project uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.project_access(target_project) is not null;
$$;

-- Managers can still edit an archived project (so they can tidy up or
-- unarchive it); everyone else gets read-only access until it's restored.
create function public.can_edit_project(target_project uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.project_access(target_project) in ('edit', 'manage'), false);
$$;

create function public.can_manage_project(target_project uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.project_access(target_project) = 'manage', false);
$$;

-- ---------------------------------------------------------------------------
-- Board columns
-- ---------------------------------------------------------------------------

create table public.board_columns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 40),
  -- Fractional ordering: moving a column between two others gives it the
  -- midpoint of their positions, so only the moved row changes.
  position double precision not null,
  -- Tasks in a "done" column count as complete in progress figures.
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);

create index board_columns_project_position_idx on public.board_columns (project_id, position);

create trigger board_columns_set_updated_at
  before update on public.board_columns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tasks (and subtasks)
--
-- A top-level task always sits in a board column. A subtask has a parent
-- task instead of a column and is marked complete with completed_at.
-- ---------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  column_id uuid,
  parent_task_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 200),
  -- Plain text. It's rendered as text (never as HTML), so it can't inject markup.
  description text not null default '' check (char_length(description) <= 10000),
  priority public.task_priority not null default 'none',
  start_date date,
  due_date date,
  position double precision not null default 0,
  completed_at timestamptz,
  archived_at timestamptz,
  -- Soft delete: hidden everywhere but restorable. Permanent purging is a
  -- retention job for a later phase.
  deleted_at timestamptz,
  -- Bumped whenever the task's content changes, so a save based on a stale
  -- copy can be detected instead of silently overwriting someone's edit.
  version integer not null default 1,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id),
  check (due_date is null or start_date is null or due_date >= start_date),
  check ((parent_task_id is null) = (column_id is not null)),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (column_id, project_id) references public.board_columns (id, project_id),
  foreign key (parent_task_id, project_id) references public.tasks (id, project_id) on delete cascade
);

create index tasks_project_id_idx on public.tasks (project_id);
create index tasks_column_position_idx on public.tasks (column_id, position) where parent_task_id is null;
create index tasks_parent_task_id_idx on public.tasks (parent_task_id) where parent_task_id is not null;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create function public.bump_task_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version = old.version + 1;
  return new;
end;
$$;

-- Only content edits bump the version. Moving a task between columns
-- shouldn't make someone else's open edit form fail to save.
create trigger tasks_bump_version
  before update on public.tasks
  for each row
  when (
    old.title is distinct from new.title
    or old.description is distinct from new.description
    or old.priority is distinct from new.priority
    or old.start_date is distinct from new.start_date
    or old.due_date is distinct from new.due_date
  )
  execute function public.bump_task_version();

-- Subtasks are one level deep: a subtask can't have subtasks of its own.
create function public.enforce_subtask_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_task_id is not null and exists (
    select 1 from public.tasks where id = new.parent_task_id and parent_task_id is not null
  ) then
    raise exception 'Subtasks can''t have their own subtasks.' using errcode = 'TF001';
  end if;
  return new;
end;
$$;

create trigger tasks_enforce_subtask_depth
  before insert or update of parent_task_id on public.tasks
  for each row execute function public.enforce_subtask_depth();

create table public.task_assignees (
  task_id uuid not null,
  project_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id),
  foreign key (task_id, project_id) references public.tasks (id, project_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  -- Only workspace members can be assigned; leaving the workspace unassigns you.
  foreign key (workspace_id, user_id)
    references public.workspace_members (workspace_id, user_id)
    on delete cascade
);

create index task_assignees_user_id_idx on public.task_assignees (user_id);

-- ---------------------------------------------------------------------------
-- Labels (shared across a workspace's projects)
-- ---------------------------------------------------------------------------

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 30),
  color text not null default 'slate' check (color in ('teal', 'blue', 'violet', 'rose', 'amber', 'slate')),
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create unique index labels_workspace_name_idx on public.labels (workspace_id, lower(name));

create table public.task_labels (
  task_id uuid not null,
  label_id uuid not null,
  project_id uuid not null,
  workspace_id uuid not null,
  primary key (task_id, label_id),
  foreign key (task_id, project_id) references public.tasks (id, project_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  -- The label must come from the same workspace as the task.
  foreign key (label_id, workspace_id) references public.labels (id, workspace_id) on delete cascade
);

create index task_labels_label_id_idx on public.task_labels (label_id);

-- ---------------------------------------------------------------------------
-- Checklists
-- ---------------------------------------------------------------------------

create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  workspace_id uuid not null,
  title text not null default 'Checklist' check (char_length(trim(title)) between 1 and 80),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  unique (id, task_id),
  foreign key (task_id, project_id) references public.tasks (id, project_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);

create index checklists_task_id_idx on public.checklists (task_id);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  workspace_id uuid not null,
  content text not null check (char_length(trim(content)) between 1 and 300),
  is_done boolean not null default false,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  foreign key (checklist_id, task_id) references public.checklists (id, task_id) on delete cascade,
  foreign key (task_id, project_id) references public.tasks (id, project_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);

create index checklist_items_checklist_id_idx on public.checklist_items (checklist_id);

-- ---------------------------------------------------------------------------
-- Creating a project
--
-- Creates the project, makes the caller its owner and member, and adds a
-- starter board, all in one transaction.
-- ---------------------------------------------------------------------------

create function public.create_project(
  target_workspace uuid,
  project_name text,
  project_description text,
  project_visibility public.project_visibility,
  project_color text
)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  created public.projects;
begin
  if not public.has_workspace_role(target_workspace, array['owner', 'admin', 'member']::public.workspace_role[]) then
    raise exception 'You don''t have permission to create projects in this workspace.' using errcode = '42501';
  end if;

  -- Free-tier abuse guard; raise it with paid plans.
  if (select count(*) from public.projects where workspace_id = target_workspace) >= 200 then
    raise exception 'This workspace has reached its limit of 200 projects.' using errcode = 'TF001';
  end if;

  insert into public.projects (workspace_id, name, description, owner_id, visibility, color, created_by)
  values (target_workspace, trim(project_name), trim(project_description), caller, project_visibility, project_color, caller)
  returning * into created;

  insert into public.project_members (project_id, workspace_id, user_id)
  values (created.id, target_workspace, caller);

  insert into public.board_columns (workspace_id, project_id, name, position, is_done) values
    (target_workspace, created.id, 'To do', 1000, false),
    (target_workspace, created.id, 'In progress', 2000, false),
    (target_workspace, created.id, 'Done', 3000, true);

  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- Duplicating a task
--
-- SECURITY INVOKER (the default): it runs with the caller's own permissions,
-- so RLS applies to every row it reads and writes. Wrapping it in a function
-- just makes the copy all-or-nothing.
-- ---------------------------------------------------------------------------

create function public.duplicate_task(source_task uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  source public.tasks;
  next_position double precision;
  copy_id uuid;
  source_checklist public.checklists;
  checklist_copy_id uuid;
begin
  select * into source from public.tasks
  where id = source_task and parent_task_id is null and deleted_at is null;

  if not found then
    raise exception 'That task no longer exists.' using errcode = 'TF001';
  end if;

  -- Place the copy directly below the original.
  select coalesce(min(position), source.position + 2000) into next_position
  from public.tasks
  where column_id = source.column_id and parent_task_id is null and position > source.position;

  insert into public.tasks (
    workspace_id, project_id, column_id, title, description, priority,
    start_date, due_date, position, created_by
  )
  values (
    source.workspace_id, source.project_id, source.column_id,
    left(source.title || ' (copy)', 200), source.description, source.priority,
    source.start_date, source.due_date, (source.position + next_position) / 2, auth.uid()
  )
  returning id into copy_id;

  insert into public.task_assignees (task_id, project_id, workspace_id, user_id)
  select copy_id, project_id, workspace_id, user_id from public.task_assignees where task_id = source.id;

  insert into public.task_labels (task_id, label_id, project_id, workspace_id)
  select copy_id, label_id, project_id, workspace_id from public.task_labels where task_id = source.id;

  for source_checklist in select * from public.checklists where task_id = source.id order by position loop
    insert into public.checklists (task_id, project_id, workspace_id, title, position)
    values (copy_id, source.project_id, source.workspace_id, source_checklist.title, source_checklist.position)
    returning id into checklist_copy_id;

    -- Copies start unticked: a duplicated task is new work.
    insert into public.checklist_items (checklist_id, task_id, project_id, workspace_id, content, position)
    select checklist_copy_id, copy_id, project_id, workspace_id, content, position
    from public.checklist_items where checklist_id = source_checklist.id;
  end loop;

  return copy_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on
  public.projects, public.project_members, public.board_columns, public.tasks,
  public.task_assignees, public.labels, public.task_labels, public.checklists, public.checklist_items
from anon, authenticated;

grant select on
  public.projects, public.project_members, public.board_columns, public.tasks,
  public.task_assignees, public.labels, public.task_labels, public.checklists, public.checklist_items
to authenticated;

grant update (name, description, owner_id, visibility, status, color, start_date, target_date, archived_at)
  on public.projects to authenticated;
grant delete on public.projects to authenticated;

grant insert, delete on public.project_members to authenticated;

grant insert, delete on public.board_columns to authenticated;
grant update (name, position, is_done) on public.board_columns to authenticated;

grant insert on public.tasks to authenticated;
grant update (
  column_id, title, description, priority, start_date, due_date, position,
  completed_at, archived_at, deleted_at
) on public.tasks to authenticated;
-- No DELETE grant on tasks: users soft-delete by setting deleted_at.

grant insert, delete on public.task_assignees, public.task_labels to authenticated;

grant insert, delete on public.labels to authenticated;
grant update (name, color) on public.labels to authenticated;

grant insert, delete on public.checklists to authenticated;
grant update (title, position) on public.checklists to authenticated;

grant insert, delete on public.checklist_items to authenticated;
grant update (content, is_done, position) on public.checklist_items to authenticated;

revoke execute on function
  public.project_access(uuid),
  public.can_view_project(uuid),
  public.can_edit_project(uuid),
  public.can_manage_project(uuid),
  public.create_project(uuid, text, text, public.project_visibility, text),
  public.duplicate_task(uuid)
from public, anon;

grant execute on function
  public.project_access(uuid),
  public.can_view_project(uuid),
  public.can_edit_project(uuid),
  public.can_manage_project(uuid),
  public.create_project(uuid, text, text, public.project_visibility, text),
  public.duplicate_task(uuid)
to authenticated;

revoke execute on function public.bump_task_version(), public.enforce_subtask_depth()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.board_columns enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.labels enable row level security;
alter table public.task_labels enable row level security;
alter table public.checklists enable row level security;
alter table public.checklist_items enable row level security;

create policy "projects: visible to those with access"
  on public.projects for select to authenticated
  using (public.can_view_project(id));

create policy "projects: managers can update"
  on public.projects for update to authenticated
  using (public.can_manage_project(id))
  with check (public.can_manage_project(id));

create policy "projects: managers can delete"
  on public.projects for delete to authenticated
  using (public.can_manage_project(id));

create policy "project_members: visible with the project"
  on public.project_members for select to authenticated
  using (public.can_view_project(project_id));

create policy "project_members: managers add members"
  on public.project_members for insert to authenticated
  with check (public.can_manage_project(project_id));

create policy "project_members: managers remove members"
  on public.project_members for delete to authenticated
  using (public.can_manage_project(project_id));

-- Board columns, tasks and everything hanging off a task share one rule:
-- read if you can see the project, write if you can edit it.

create policy "board_columns: read" on public.board_columns for select to authenticated
  using (public.can_view_project(project_id));
create policy "board_columns: insert" on public.board_columns for insert to authenticated
  with check (public.can_edit_project(project_id));
create policy "board_columns: update" on public.board_columns for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy "board_columns: delete" on public.board_columns for delete to authenticated
  using (public.can_edit_project(project_id));

create policy "tasks: read" on public.tasks for select to authenticated
  using (public.can_view_project(project_id));
create policy "tasks: insert" on public.tasks for insert to authenticated
  with check (public.can_edit_project(project_id) and created_by = (select auth.uid()));
create policy "tasks: update" on public.tasks for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

create policy "task_assignees: read" on public.task_assignees for select to authenticated
  using (public.can_view_project(project_id));
create policy "task_assignees: insert" on public.task_assignees for insert to authenticated
  with check (public.can_edit_project(project_id));
create policy "task_assignees: delete" on public.task_assignees for delete to authenticated
  using (public.can_edit_project(project_id));

create policy "task_labels: read" on public.task_labels for select to authenticated
  using (public.can_view_project(project_id));
create policy "task_labels: insert" on public.task_labels for insert to authenticated
  with check (public.can_edit_project(project_id));
create policy "task_labels: delete" on public.task_labels for delete to authenticated
  using (public.can_edit_project(project_id));

create policy "checklists: read" on public.checklists for select to authenticated
  using (public.can_view_project(project_id));
create policy "checklists: insert" on public.checklists for insert to authenticated
  with check (public.can_edit_project(project_id));
create policy "checklists: update" on public.checklists for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy "checklists: delete" on public.checklists for delete to authenticated
  using (public.can_edit_project(project_id));

create policy "checklist_items: read" on public.checklist_items for select to authenticated
  using (public.can_view_project(project_id));
create policy "checklist_items: insert" on public.checklist_items for insert to authenticated
  with check (public.can_edit_project(project_id));
create policy "checklist_items: update" on public.checklist_items for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy "checklist_items: delete" on public.checklist_items for delete to authenticated
  using (public.can_edit_project(project_id));

-- Labels are workspace-wide: any member can read them, non-viewers manage them.
create policy "labels: members read" on public.labels for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy "labels: non-viewers insert" on public.labels for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));
create policy "labels: non-viewers update" on public.labels for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));
create policy "labels: non-viewers delete" on public.labels for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));
