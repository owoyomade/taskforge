-- Phase 4a: phases (milestones) and project templates.
--
-- In the app these are called "phases": the stops on a project's journey
-- (Plan, Prepare, Launch...). Each task sits in at most one phase, and a
-- phase's progress is always calculated from its tasks, never typed in.

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  target_date date,
  owner_id uuid,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (workspace_id, owner_id)
    references public.workspace_members (workspace_id, user_id)
    on delete set null (owner_id)
);

create index milestones_project_position_idx on public.milestones (project_id, position);

create trigger milestones_set_updated_at
  before update on public.milestones
  for each row execute function public.set_updated_at();

create table public.milestone_tasks (
  milestone_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  workspace_id uuid not null,
  primary key (milestone_id, task_id),
  -- One phase per task keeps the plan easy to read.
  unique (task_id),
  foreign key (milestone_id, project_id) references public.milestones (id, project_id) on delete cascade,
  foreign key (task_id, project_id) references public.tasks (id, project_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Saved templates
--
-- Built-in templates live in the app's code. These are the ones a team
-- saves from its own projects. `definition` uses the same shape the app
-- validates before calling create_project_from_template().
-- ---------------------------------------------------------------------------

create table public.project_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  definition jsonb not null check (jsonb_typeof(definition) = 'object' and pg_column_size(definition) < 200000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index project_templates_workspace_idx on public.project_templates (workspace_id);

create function public.enforce_template_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.project_templates where workspace_id = new.workspace_id) >= 50 then
    raise exception 'This workspace already has 50 saved templates. Delete one to save another.' using errcode = 'TF001';
  end if;
  return new;
end;
$$;

create trigger project_templates_enforce_limit
  before insert on public.project_templates
  for each row execute function public.enforce_template_limit();

/**
 * Builds a whole project from a template in one transaction: board
 * columns, labels, phases, tasks (with due dates counted back from
 * `finish_date`), checklists and subtasks.
 *
 * The app validates the template first; this function is still defensive
 * about sizes and values, because it can be called directly through the API.
 */
create function public.create_project_from_template(
  target_workspace uuid,
  project_name text,
  project_description text,
  project_visibility public.project_visibility,
  project_color text,
  -- No finish date means no due dates: the plan's order without a schedule.
  finish_date date default null,
  template jsonb default null
)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  created public.projects;
  column_ids uuid[] := '{}';
  phase_ids uuid[] := '{}';
  item jsonb;
  item_index bigint;
  new_row_id uuid;
  new_task_id uuid;
  new_checklist_id uuid;
  label_text text;
  found_label_id uuid;
  column_index integer;
  phase_index integer;
  offset_days integer;
begin
  if not public.has_workspace_role(target_workspace, array['owner', 'admin', 'member']::public.workspace_role[]) then
    raise exception 'You don''t have permission to create projects in this workspace.' using errcode = '42501';
  end if;

  if (select count(*) from public.projects where workspace_id = target_workspace) >= 200 then
    raise exception 'This workspace has reached its limit of 200 projects.' using errcode = 'TF001';
  end if;

  if jsonb_typeof(template -> 'columns') is distinct from 'array'
     or jsonb_array_length(template -> 'columns') not between 1 and 8 then
    raise exception 'This template needs between 1 and 8 board columns.' using errcode = 'TF001';
  end if;
  if jsonb_array_length(coalesce(template -> 'phases', '[]')) > 12
     or jsonb_array_length(coalesce(template -> 'tasks', '[]')) > 150
     or jsonb_array_length(coalesce(template -> 'labels', '[]')) > 20 then
    raise exception 'This template is too large.' using errcode = 'TF001';
  end if;

  insert into public.projects (workspace_id, name, description, owner_id, visibility, color, target_date, created_by)
  values (
    target_workspace, trim(project_name), trim(project_description), caller, project_visibility,
    project_color, finish_date, caller
  )
  returning * into created;

  insert into public.project_members (project_id, workspace_id, user_id)
  values (created.id, target_workspace, caller);

  for item, item_index in
    select value, ordinality from jsonb_array_elements(template -> 'columns') with ordinality
  loop
    insert into public.board_columns (workspace_id, project_id, name, position, is_done)
    values (
      target_workspace, created.id, left(trim(item ->> 'name'), 40), item_index * 1000,
      coalesce((item ->> 'isDone')::boolean, false)
    )
    returning id into new_row_id;
    column_ids := column_ids || new_row_id;
  end loop;

  -- Labels are shared across the workspace, so existing ones are reused.
  for item in select value from jsonb_array_elements(coalesce(template -> 'labels', '[]')) loop
    insert into public.labels (workspace_id, name, color)
    values (
      target_workspace,
      left(trim(item ->> 'name'), 30),
      case when item ->> 'color' in ('teal', 'blue', 'violet', 'rose', 'amber', 'slate') then item ->> 'color' else 'slate' end
    )
    on conflict do nothing;
  end loop;

  for item, item_index in
    select value, ordinality from jsonb_array_elements(coalesce(template -> 'phases', '[]')) with ordinality
  loop
    offset_days := (item ->> 'offsetDays')::integer;
    insert into public.milestones (workspace_id, project_id, name, description, target_date, owner_id, position)
    values (
      target_workspace, created.id, left(trim(item ->> 'name'), 80), left(coalesce(item ->> 'description', ''), 1000),
      case when finish_date is not null and offset_days is not null then finish_date + offset_days end,
      caller, item_index * 1000
    )
    returning id into new_row_id;
    phase_ids := phase_ids || new_row_id;
  end loop;

  for item, item_index in
    select value, ordinality from jsonb_array_elements(coalesce(template -> 'tasks', '[]')) with ordinality
  loop
    column_index := coalesce((item ->> 'column')::integer, 0);
    if column_index < 0 or column_index >= array_length(column_ids, 1) then
      column_index := 0;
    end if;
    offset_days := (item ->> 'dueOffsetDays')::integer;

    insert into public.tasks (workspace_id, project_id, column_id, title, description, priority, due_date, position, created_by)
    values (
      target_workspace, created.id, column_ids[column_index + 1],
      left(trim(item ->> 'title'), 200),
      left(coalesce(item ->> 'description', ''), 10000),
      case when item ->> 'priority' in ('none', 'low', 'medium', 'high', 'urgent')
        then (item ->> 'priority')::public.task_priority else 'none' end,
      case when finish_date is not null and offset_days is not null then finish_date + offset_days end,
      item_index * 1000,
      caller
    )
    returning id into new_task_id;

    phase_index := (item ->> 'phase')::integer;
    if phase_index is not null and phase_index >= 0 and phase_index < coalesce(array_length(phase_ids, 1), 0) then
      insert into public.milestone_tasks (milestone_id, task_id, project_id, workspace_id)
      values (phase_ids[phase_index + 1], new_task_id, created.id, target_workspace);
    end if;

    for label_text in select jsonb_array_elements_text(coalesce(item -> 'labels', '[]')) loop
      select id into found_label_id from public.labels
      where workspace_id = target_workspace and lower(name) = lower(trim(label_text));
      if found_label_id is not null then
        insert into public.task_labels (task_id, label_id, project_id, workspace_id)
        values (new_task_id, found_label_id, created.id, target_workspace)
        on conflict do nothing;
      end if;
    end loop;

    if jsonb_array_length(coalesce(item -> 'checklist', '[]')) > 0 then
      insert into public.checklists (task_id, project_id, workspace_id)
      values (new_task_id, created.id, target_workspace)
      returning id into new_checklist_id;

      insert into public.checklist_items (checklist_id, task_id, project_id, workspace_id, content, position)
      select new_checklist_id, new_task_id, created.id, target_workspace, left(trim(entry.value), 300), entry.ordinality * 1000
      from jsonb_array_elements_text(item -> 'checklist') with ordinality as entry
      where trim(entry.value) <> ''
      limit 30;
    end if;

    insert into public.tasks (workspace_id, project_id, parent_task_id, title, position, created_by)
    select target_workspace, created.id, new_task_id, left(trim(entry.value), 200), entry.ordinality * 1000, caller
    from jsonb_array_elements_text(coalesce(item -> 'subtasks', '[]')) with ordinality as entry
    where trim(entry.value) <> ''
    limit 30;
  end loop;

  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges and Row Level Security
-- ---------------------------------------------------------------------------

revoke all on public.milestones, public.milestone_tasks, public.project_templates from anon, authenticated;

grant select, insert, delete on public.milestones to authenticated;
grant update (name, description, target_date, owner_id, position) on public.milestones to authenticated;
grant select, insert, delete on public.milestone_tasks to authenticated;
grant select, insert, delete on public.project_templates to authenticated;

revoke execute on function
  public.create_project_from_template(uuid, text, text, public.project_visibility, text, date, jsonb)
from public, anon;
grant execute on function
  public.create_project_from_template(uuid, text, text, public.project_visibility, text, date, jsonb)
to authenticated;
revoke execute on function public.enforce_template_limit() from public, anon, authenticated;

alter table public.milestones enable row level security;
alter table public.milestone_tasks enable row level security;
alter table public.project_templates enable row level security;

create policy "milestones: read" on public.milestones for select to authenticated
  using (public.can_view_project(project_id));
create policy "milestones: insert" on public.milestones for insert to authenticated
  with check (public.can_edit_project(project_id));
create policy "milestones: update" on public.milestones for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy "milestones: delete" on public.milestones for delete to authenticated
  using (public.can_edit_project(project_id));

create policy "milestone_tasks: read" on public.milestone_tasks for select to authenticated
  using (public.can_view_project(project_id));
create policy "milestone_tasks: insert" on public.milestone_tasks for insert to authenticated
  with check (public.can_edit_project(project_id));
create policy "milestone_tasks: delete" on public.milestone_tasks for delete to authenticated
  using (public.can_edit_project(project_id));

create policy "project_templates: members read" on public.project_templates for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy "project_templates: non-viewers save as themselves" on public.project_templates for insert to authenticated
  with check (
    public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[])
    and created_by = (select auth.uid())
  );
create policy "project_templates: creator or admins delete" on public.project_templates for delete to authenticated
  using (
    created_by = (select auth.uid())
    or public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[])
  );
