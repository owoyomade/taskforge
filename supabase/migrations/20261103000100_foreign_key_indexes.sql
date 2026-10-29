-- Phase 5: indexes for foreign keys.
--
-- Postgres doesn't index the referencing side of a foreign key on its own.
-- Without these, two things get slow as data grows:
--   * deleting a project or workspace (each cascade step scans whole tables), and
--   * the app's everyday "everything in this project" queries, which filter
--     on project_id (several tables had no index on it at all).
-- Found with `supabase db advisors --local --type performance`.
--
-- A two-column index also serves lookups on its first column alone, so a few
-- older single-column indexes become redundant and are dropped.

-- Projects and their members
create index projects_workspace_owner_idx on public.projects (workspace_id, owner_id);
drop index public.projects_workspace_id_idx;
create index projects_created_by_idx on public.projects (created_by);
create index workspaces_created_by_idx on public.workspaces (created_by);
create index project_members_project_workspace_idx on public.project_members (project_id, workspace_id);
create index project_members_workspace_user_idx on public.project_members (workspace_id, user_id);
create index project_templates_created_by_idx on public.project_templates (created_by);
create index workspace_invitations_invited_by_idx on public.workspace_invitations (invited_by);

-- Board
create index board_columns_project_workspace_idx on public.board_columns (project_id, workspace_id);
create index tasks_project_workspace_idx on public.tasks (project_id, workspace_id);
drop index public.tasks_project_id_idx;
create index tasks_column_project_idx on public.tasks (column_id, project_id);
create index tasks_parent_project_idx on public.tasks (parent_task_id, project_id) where parent_task_id is not null;
drop index public.tasks_parent_task_id_idx;
create index tasks_created_by_idx on public.tasks (created_by);

create index task_assignees_project_workspace_idx on public.task_assignees (project_id, workspace_id);
create index task_assignees_task_project_idx on public.task_assignees (task_id, project_id);
create index task_assignees_workspace_user_idx on public.task_assignees (workspace_id, user_id);

create index task_labels_label_workspace_idx on public.task_labels (label_id, workspace_id);
drop index public.task_labels_label_id_idx;
create index task_labels_project_workspace_idx on public.task_labels (project_id, workspace_id);
create index task_labels_task_project_idx on public.task_labels (task_id, project_id);

create index checklists_project_workspace_idx on public.checklists (project_id, workspace_id);
create index checklists_task_project_idx on public.checklists (task_id, project_id);
drop index public.checklists_task_id_idx;
create index checklist_items_checklist_task_idx on public.checklist_items (checklist_id, task_id);
drop index public.checklist_items_checklist_id_idx;
create index checklist_items_project_workspace_idx on public.checklist_items (project_id, workspace_id);
create index checklist_items_task_project_idx on public.checklist_items (task_id, project_id);

-- Phases
create index milestones_project_workspace_idx on public.milestones (project_id, workspace_id);
create index milestones_workspace_owner_idx on public.milestones (workspace_id, owner_id);
create index milestone_tasks_milestone_project_idx on public.milestone_tasks (milestone_id, project_id);
create index milestone_tasks_project_workspace_idx on public.milestone_tasks (project_id, workspace_id);
create index milestone_tasks_task_project_idx on public.milestone_tasks (task_id, project_id);

-- Collaboration
create index comments_project_workspace_idx on public.comments (project_id, workspace_id);
create index comments_task_project_idx on public.comments (task_id, project_id);
create index comments_author_id_idx on public.comments (author_id);
create index comment_mentions_comment_project_idx on public.comment_mentions (comment_id, project_id);
create index comment_mentions_project_workspace_idx on public.comment_mentions (project_id, workspace_id);
create index comment_mentions_workspace_user_idx on public.comment_mentions (workspace_id, user_id);

create index attachments_task_project_idx on public.attachments (task_id, project_id);
drop index public.attachments_task_id_idx;
create index attachments_project_workspace_idx on public.attachments (project_id, workspace_id);
create index attachments_uploaded_by_idx on public.attachments (uploaded_by);

-- History and notifications
create index audit_events_actor_id_idx on public.audit_events (actor_id);
create index notifications_actor_id_idx on public.notifications (actor_id);
create index notifications_project_workspace_idx on public.notifications (project_id, workspace_id);
create index notifications_task_project_idx on public.notifications (task_id, project_id);
