import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import {
  asColor,
  PRIORITY_RANK,
  type Color,
  type ProjectStatus,
  type ProjectVisibility,
  type TaskPriority,
} from "@/lib/project-constants";
import { asCurrentUser } from "@/lib/db";
import { dateRange, escapeLikePattern, type TaskFilters } from "@/lib/task-filters";
import { listWorkspaceMembers, type WorkspaceMember } from "@/lib/workspaces";

export type ProjectAccess = "manage" | "edit" | "view";

export type ProjectSummary = {
  id: string;
  name: string;
  description: string;
  color: Color;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  archivedAt: string | null;
  startDate: string | null;
  targetDate: string | null;
  ownerId: string | null;
};

export type ProjectDetail = ProjectSummary & { workspaceId: string; access: ProjectAccess };

export type BoardColumn = { id: string; name: string; position: number; isDone: boolean };

export type Person = { id: string; name: string; email: string; avatarUrl: string | null };

export type LabelView = { id: string; name: string; color: Color };

export type TaskCard = {
  id: string;
  title: string;
  columnId: string;
  position: number;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  updatedAt: string;
  assignees: Person[];
  labels: LabelView[];
  subtasks: { total: number; done: number };
  checklist: { total: number; done: number };
};

export type TaskDetail = TaskCard & {
  description: string;
  version: number;
  createdAt: string;
  createdBy: Person | null;
  subtaskItems: { id: string; title: string; completed: boolean }[];
  checklists: { id: string; title: string; items: { id: string; content: string; isDone: boolean }[] }[];
  comments: CommentView[];
  attachments: AttachmentView[];
};

export type RemovedTask = { id: string; title: string; archivedAt: string | null; deletedAt: string | null };

const PROJECT_FIELDS =
  "p.id, p.workspace_id, p.name, p.description, p.color, p.status, p.visibility, p.archived_at, p.start_date, p.target_date, p.owner_id";

type ProjectRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  color: string;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  archived_at: string | null;
  start_date: string | null;
  target_date: string | null;
  owner_id: string | null;
};

function toProjectSummary(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: asColor(row.color),
    status: row.status,
    visibility: row.visibility,
    archivedAt: row.archived_at,
    startDate: row.start_date,
    targetDate: row.target_date,
    ownerId: row.owner_id,
  };
}

function toPerson(member: WorkspaceMember): Person {
  return { id: member.userId, name: member.fullName || member.email, email: member.email, avatarUrl: member.avatarUrl };
}

/** Projects in a workspace that the user can see (RLS hides the rest). */
export const listProjects = cache(
  async (workspaceId: string, { archived = false } = {}): Promise<ProjectSummary[]> => {
    const rows = await asCurrentUser((db) =>
      db.query<ProjectRow>(
        `select ${PROJECT_FIELDS} from public.projects p
         where p.workspace_id = $1 and (p.archived_at is not null) = $2
         order by p.name`,
        [workspaceId, archived],
      ),
    );
    return rows.map(toProjectSummary);
  },
);

/** Open and finished top-level task counts per project, for project cards. */
export async function countTasksByProject(
  workspaceId: string,
): Promise<Map<string, { open: number; done: number; overdue: number }>> {
  const { today } = dateRange(0);
  // A task counts as done when it sits in a "done" column.
  const rows = await asCurrentUser((db) =>
    db.query<{ project_id: string; open: number; done: number; overdue: number }>(
      `select t.project_id,
         count(*) filter (where c.is_done) as done,
         count(*) filter (where not coalesce(c.is_done, false)) as open,
         count(*) filter (where not coalesce(c.is_done, false) and t.due_date < $2) as overdue
       from public.tasks t
       left join public.board_columns c on c.id = t.column_id
       where t.workspace_id = $1 and t.parent_task_id is null and t.archived_at is null and t.deleted_at is null
       group by t.project_id`,
      [workspaceId, today],
    ),
  );
  return new Map(rows.map((row) => [row.project_id, { open: row.open, done: row.done, overdue: row.overdue }]));
}

/**
 * The project at this URL with the user's access level, or a 404.
 * As with workspaces, "no access" and "doesn't exist" look the same.
 */
export const getProjectForUser = cache(async (workspaceId: string, projectId: string): Promise<ProjectDetail> => {
  if (!z.uuid().safeParse(projectId).success) {
    notFound();
  }

  const [project] = await asCurrentUser((db) =>
    db.query<ProjectRow & { access: string | null }>(
      `select ${PROJECT_FIELDS}, public.project_access(p.id) as access
       from public.projects p where p.id = $1 and p.workspace_id = $2`,
      [projectId, workspaceId],
    ),
  );
  const access = project?.access;
  if (!project || (access !== "manage" && access !== "edit" && access !== "view")) {
    notFound();
  }

  return { ...toProjectSummary(project), workspaceId: project.workspace_id, access };
});

export const listColumns = cache(async (projectId: string): Promise<BoardColumn[]> => {
  const rows = await asCurrentUser((db) =>
    db.query<{ id: string; name: string; position: number; is_done: boolean }>(
      "select id, name, position, is_done from public.board_columns where project_id = $1 order by position",
      [projectId],
    ),
  );
  return rows.map((column) => ({ id: column.id, name: column.name, position: column.position, isDone: column.is_done }));
});

export const listLabels = cache(async (workspaceId: string): Promise<LabelView[]> => {
  const rows = await asCurrentUser((db) =>
    db.query<{ id: string; name: string; color: string }>(
      "select id, name, color from public.labels where workspace_id = $1 order by name",
      [workspaceId],
    ),
  );
  return rows.map((label) => ({ id: label.id, name: label.name, color: asColor(label.color) }));
});

/**
 * Everyone who could be assigned to this project's tasks: non-viewers who
 * can see the project. For a private project that's its members, its owner
 * and workspace owners/admins.
 */
export async function listAssignablePeople(project: ProjectDetail): Promise<Person[]> {
  const members = await listWorkspaceMembers(project.workspaceId);
  const nonViewers = members.filter((member) => member.role !== "viewer");

  if (project.visibility === "workspace") {
    return nonViewers.map(toPerson);
  }

  const projectMemberIds = new Set(await listProjectMemberIds(project.id));
  return nonViewers
    .filter(
      (member) =>
        member.role === "owner" ||
        member.role === "admin" ||
        member.userId === project.ownerId ||
        projectMemberIds.has(member.userId),
    )
    .map(toPerson);
}

export async function listProjectMemberIds(projectId: string): Promise<string[]> {
  const rows = await asCurrentUser((db) =>
    db.query<{ user_id: string }>("select user_id from public.project_members where project_id = $1", [projectId]),
  );
  return rows.map((row) => row.user_id);
}

type TaskCardRow = {
  id: string;
  title: string;
  column_id: string | null;
  position: number;
  priority: TaskPriority;
  start_date: string | null;
  due_date: string | null;
  updated_at: string;
  assignee_ids: string[];
  label_ids: string[];
  subtasks_total: number;
  subtasks_done: number;
  checklist_total: number;
  checklist_done: number;
};

/**
 * Loads the board's tasks with their assignees, labels and progress in one
 * query, applying the search, priority and date filters in the database.
 */
export async function listTaskCards(
  project: ProjectDetail,
  columns: BoardColumn[],
  filters: TaskFilters,
): Promise<TaskCard[]> {
  const { today, until } = dateRange(7);
  // Filters are added as numbered parameters, never pasted into the SQL text.
  const values: unknown[] = [project.id];
  const conditions: string[] = [];
  if (filters.q) {
    values.push(`%${escapeLikePattern(filters.q)}%`);
    conditions.push(`t.title ilike $${values.length}`);
  }
  if (filters.priority) {
    values.push(filters.priority);
    conditions.push(`t.priority = $${values.length}`);
  }
  if (filters.due === "overdue") {
    values.push(today);
    conditions.push(`t.due_date < $${values.length}`);
  }
  if (filters.due === "week") {
    values.push(today, until);
    conditions.push(`t.due_date between $${values.length - 1} and $${values.length}`);
  }
  if (filters.due === "none") conditions.push("t.due_date is null");

  const [rows, people, labels] = await Promise.all([
    asCurrentUser((db) =>
      db.query<TaskCardRow>(
        `select t.id, t.title, t.column_id, t.position, t.priority, t.start_date, t.due_date, t.updated_at,
           array(select a.user_id::text from public.task_assignees a where a.task_id = t.id) as assignee_ids,
           array(select l.label_id::text from public.task_labels l where l.task_id = t.id) as label_ids,
           (select count(*) from public.tasks s where s.parent_task_id = t.id and s.deleted_at is null) as subtasks_total,
           (select count(*) from public.tasks s where s.parent_task_id = t.id and s.deleted_at is null and s.completed_at is not null) as subtasks_done,
           (select count(*) from public.checklist_items i where i.task_id = t.id) as checklist_total,
           (select count(*) from public.checklist_items i where i.task_id = t.id and i.is_done) as checklist_done
         from public.tasks t
         where t.project_id = $1 and t.parent_task_id is null and t.archived_at is null and t.deleted_at is null
           ${conditions.map((condition) => `and ${condition}`).join(" ")}
         order by t.position`,
        values,
      ),
    ),
    listWorkspaceMembers(project.workspaceId),
    listLabels(project.workspaceId),
  ]);

  const peopleById = new Map(people.map((member) => [member.userId, toPerson(member)]));
  const labelsById = new Map(labels.map((label) => [label.id, label]));
  const doneColumns = new Set(columns.filter((column) => column.isDone).map((column) => column.id));

  const cards = rows.flatMap((row): TaskCard[] => {
    // Every top-level task has a column (enforced by a check constraint).
    if (!row.column_id) return [];
    return [
      {
        id: row.id,
        title: row.title,
        columnId: row.column_id,
        position: row.position,
        priority: row.priority,
        startDate: row.start_date,
        dueDate: row.due_date,
        updatedAt: row.updated_at,
        assignees: row.assignee_ids.flatMap((id) => peopleById.get(id) ?? []),
        labels: row.label_ids.flatMap((id) => labelsById.get(id) ?? []),
        subtasks: { total: row.subtasks_total, done: row.subtasks_done },
        checklist: { total: row.checklist_total, done: row.checklist_done },
      },
    ];
  });

  return cards.filter((card) => {
    // A task in a done column isn't overdue, whatever its date says.
    if (filters.due === "overdue" && doneColumns.has(card.columnId)) return false;
    if (filters.assignee === "none" && card.assignees.length > 0) return false;
    if (filters.assignee && filters.assignee !== "none" && !card.assignees.some((person) => person.id === filters.assignee)) {
      return false;
    }
    if (filters.label && !card.labels.some((label) => label.id === filters.label)) return false;
    return true;
  });
}

/** Full detail for the task drawer, or null if it's gone or not visible. */
export async function getTaskDetail(
  project: ProjectDetail,
  columns: BoardColumn[],
  taskId: string,
): Promise<TaskDetail | null> {
  if (!z.uuid().safeParse(taskId).success) {
    return null;
  }

  // The task-specific rows come from one transaction, so they all describe
  // the task at the same moment.
  const taskRows = asCurrentUser(async (db) => {
    const [task] = await db.query<{
      id: string;
      title: string;
      description: string;
      column_id: string | null;
      position: number;
      priority: TaskPriority;
      start_date: string | null;
      due_date: string | null;
      updated_at: string;
      version: number;
      created_at: string;
      created_by: string | null;
      assignee_ids: string[];
      label_ids: string[];
    }>(
      `select t.id, t.title, t.description, t.column_id, t.position, t.priority, t.start_date, t.due_date,
         t.updated_at, t.version, t.created_at, t.created_by,
         array(select a.user_id::text from public.task_assignees a where a.task_id = t.id) as assignee_ids,
         array(select l.label_id::text from public.task_labels l where l.task_id = t.id) as label_ids
       from public.tasks t
       where t.id = $1 and t.project_id = $2 and t.parent_task_id is null and t.deleted_at is null`,
      [taskId, project.id],
    );
    if (!task) return null;
    const subtasks = await db.query<{ id: string; title: string; completed_at: string | null }>(
      "select id, title, completed_at from public.tasks where parent_task_id = $1 and deleted_at is null order by position",
      [taskId],
    );
    const checklists = await db.query<{ id: string; title: string }>(
      "select id, title from public.checklists where task_id = $1 order by position",
      [taskId],
    );
    const items = await db.query<{ id: string; checklist_id: string; content: string; is_done: boolean }>(
      "select id, checklist_id, content, is_done from public.checklist_items where task_id = $1 order by position",
      [taskId],
    );
    return { task, subtasks, checklists, items };
  });

  const [loaded, people, labels, comments, attachments] = await Promise.all([
    taskRows,
    listWorkspaceMembers(project.workspaceId),
    listLabels(project.workspaceId),
    listComments(project, taskId),
    listAttachments(project, taskId),
  ]);

  if (!loaded || !loaded.task.column_id) {
    return null;
  }

  const peopleById = new Map(people.map((member) => [member.userId, toPerson(member)]));
  const labelsById = new Map(labels.map((label) => [label.id, label]));
  const itemsByChecklist = groupBy(loaded.items, (item) => item.checklist_id);
  const row = loaded.task;
  const subtasks = loaded.subtasks;
  const items = loaded.items;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    columnId: row.column_id ?? columns[0]?.id ?? "",
    position: row.position,
    priority: row.priority,
    startDate: row.start_date,
    dueDate: row.due_date,
    updatedAt: row.updated_at,
    version: row.version,
    createdAt: row.created_at,
    createdBy: row.created_by ? (peopleById.get(row.created_by) ?? null) : null,
    assignees: row.assignee_ids.flatMap((id) => peopleById.get(id) ?? []),
    labels: row.label_ids.flatMap((id) => labelsById.get(id) ?? []),
    subtasks: {
      total: subtasks.length,
      done: subtasks.filter((subtask) => subtask.completed_at).length,
    },
    checklist: { total: items.length, done: items.filter((item) => item.is_done).length },
    subtaskItems: subtasks.map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      completed: Boolean(subtask.completed_at),
    })),
    checklists: loaded.checklists.map((checklist) => ({
      id: checklist.id,
      title: checklist.title,
      items: (itemsByChecklist.get(checklist.id) ?? []).map((item) => ({
        id: item.id,
        content: item.content,
        isDone: item.is_done,
      })),
    })),
    comments,
    attachments,
  };
}

/** Archived and deleted tasks, newest first, for restoring from project settings. */
export async function listRemovedTasks(projectId: string): Promise<RemovedTask[]> {
  const rows = await asCurrentUser((db) =>
    db.query<{ id: string; title: string; archived_at: string | null; deleted_at: string | null }>(
      `select id, title, archived_at, deleted_at from public.tasks
       where project_id = $1 and parent_task_id is null and (archived_at is not null or deleted_at is not null)
       order by updated_at desc limit 100`,
      [projectId],
    ),
  );
  return rows.map((task) => ({ id: task.id, title: task.title, archivedAt: task.archived_at, deletedAt: task.deleted_at }));
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) group.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}

export type CommentView = {
  id: string;
  body: string;
  author: Person | null;
  authorId: string | null;
  createdAt: string;
  editedAt: string | null;
  mentionIds: string[];
};

export type AttachmentView = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: Person | null;
  uploadedById: string | null;
  createdAt: string;
};

/** A task's comments, oldest first, with the people they validly mention. */
export async function listComments(project: ProjectDetail, taskId: string): Promise<CommentView[]> {
  const [comments, people] = await Promise.all([
    asCurrentUser((db) =>
      db.query<{ id: string; body: string; author_id: string | null; created_at: string; edited_at: string | null; mention_ids: string[] }>(
        `select c.id, c.body, c.author_id, c.created_at, c.edited_at,
           array(select m.user_id::text from public.comment_mentions m where m.comment_id = c.id) as mention_ids
         from public.comments c
         where c.task_id = $1 and c.project_id = $2
         order by c.created_at limit 200`,
        [taskId, project.id],
      ),
    ),
    listWorkspaceMembers(project.workspaceId),
  ]);

  const peopleById = new Map(people.map((member) => [member.userId, toPerson(member)]));

  return comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    author: comment.author_id ? (peopleById.get(comment.author_id) ?? null) : null,
    authorId: comment.author_id,
    createdAt: comment.created_at,
    editedAt: comment.edited_at,
    mentionIds: comment.mention_ids,
  }));
}

export async function listAttachments(project: ProjectDetail, taskId: string): Promise<AttachmentView[]> {
  const [data, people] = await Promise.all([
    asCurrentUser((db) =>
      db.query<{ id: string; file_name: string; content_type: string; size_bytes: number; uploaded_by: string | null; created_at: string }>(
        `select id, file_name, content_type, size_bytes, uploaded_by, created_at
         from public.attachments where task_id = $1 and project_id = $2 order by created_at`,
        [taskId, project.id],
      ),
    ),
    listWorkspaceMembers(project.workspaceId),
  ]);

  const peopleById = new Map(people.map((member) => [member.userId, toPerson(member)]));
  return data.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by ? (peopleById.get(row.uploaded_by) ?? null) : null,
    uploadedById: row.uploaded_by,
    createdAt: row.created_at,
  }));
}

export type PhaseView = {
  id: string;
  name: string;
  description: string;
  targetDate: string | null;
  ownerId: string | null;
  position: number;
  taskIds: string[];
  total: number;
  done: number;
};

/**
 * Phases for every project in a workspace (or one project), with task counts
 * worked out from which tasks sit in "done" columns. Archived and deleted
 * tasks don't count.
 */
export async function listPhases(workspaceId: string, projectId?: string): Promise<Map<string, PhaseView[]>> {
  const { phases, links } = await asCurrentUser(async (db) => {
    // $2 is null for "every project in the workspace".
    const phases = await db.query<{
      id: string;
      project_id: string;
      name: string;
      description: string;
      target_date: string | null;
      owner_id: string | null;
      position: number;
    }>(
      `select id, project_id, name, description, target_date, owner_id, position
       from public.milestones
       where workspace_id = $1 and ($2::uuid is null or project_id = $2)
       order by position`,
      [workspaceId, projectId ?? null],
    );
    // Only live (not archived or deleted) top-level tasks count towards a phase.
    const links = await db.query<{ milestone_id: string; task_id: string; is_done: boolean }>(
      `select mt.milestone_id, mt.task_id, coalesce(c.is_done, false) as is_done
       from public.milestone_tasks mt
       join public.tasks t on t.id = mt.task_id
       left join public.board_columns c on c.id = t.column_id
       where mt.workspace_id = $1 and ($2::uuid is null or mt.project_id = $2)
         and t.parent_task_id is null and t.archived_at is null and t.deleted_at is null`,
      [workspaceId, projectId ?? null],
    );
    return { phases, links };
  });

  const linksByPhase = groupBy(links, (link) => link.milestone_id);

  const result = new Map<string, PhaseView[]>();
  for (const phase of phases) {
    const phaseLinks = linksByPhase.get(phase.id) ?? [];
    const taskIds = phaseLinks.map((link) => link.task_id);
    const done = phaseLinks.filter((link) => link.is_done).length;
    const list = result.get(phase.project_id) ?? [];
    list.push({
      id: phase.id,
      name: phase.name,
      description: phase.description,
      targetDate: phase.target_date,
      ownerId: phase.owner_id,
      position: phase.position,
      taskIds,
      total: taskIds.length,
      done,
    });
    result.set(phase.project_id, list);
  }
  return result;
}

export type MyTask = {
  id: string;
  title: string;
  columnId: string;
  dueDate: string | null;
  priority: TaskPriority;
  projectId: string;
  projectName: string;
  projectColor: Color;
};

/**
 * Open tasks assigned to the signed-in user in this workspace, most urgent
 * first: overdue, then by due date, then undated. Used for "Do next".
 */
export async function listMyOpenTasks(workspaceId: string, userId: string, limit = 25): Promise<MyTask[]> {
  const tasks = await asCurrentUser((db) =>
    db.query<{
      id: string;
      title: string;
      due_date: string | null;
      priority: TaskPriority;
      project_id: string;
      column_id: string;
      project_name: string;
      project_color: string;
    }>(
      `select t.id, t.title, t.due_date, t.priority, t.project_id, t.column_id,
         p.name as project_name, p.color as project_color
       from public.task_assignees a
       join public.tasks t on t.id = a.task_id
       join public.projects p on p.id = t.project_id
       join public.board_columns c on c.id = t.column_id
       where a.workspace_id = $1 and a.user_id = $2
         and t.parent_task_id is null and t.archived_at is null and t.deleted_at is null
         and p.archived_at is null and not c.is_done`,
      [workspaceId, userId],
    ),
  );

  return tasks
    .sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    })
    .slice(0, limit)
    .map((task) => ({
      id: task.id,
      title: task.title,
      columnId: task.column_id,
      dueDate: task.due_date,
      priority: task.priority,
      projectId: task.project_id,
      projectName: task.project_name,
      projectColor: asColor(task.project_color),
    }));
}

export type SavedTemplate = { id: string; name: string; description: string; createdBy: string | null };

export async function listSavedTemplates(workspaceId: string): Promise<SavedTemplate[]> {
  const rows = await asCurrentUser((db) =>
    db.query<{ id: string; name: string; description: string; created_by: string | null }>(
      "select id, name, description, created_by from public.project_templates where workspace_id = $1 order by created_at desc",
      [workspaceId],
    ),
  );
  return rows.map((row) => ({ id: row.id, name: row.name, description: row.description, createdBy: row.created_by }));
}

/** The team's saved templates with their full plans, newest first, for the new project wizard. */
export async function listSavedTemplateDefinitions(
  workspaceId: string,
): Promise<{ id: string; name: string; description: string; definition: unknown }[]> {
  return asCurrentUser((db) =>
    db.query<{ id: string; name: string; description: string; definition: unknown }>(
      "select id, name, description, definition from public.project_templates where workspace_id = $1 order by created_at desc",
      [workspaceId],
    ),
  );
}
