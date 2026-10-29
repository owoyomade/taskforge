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
import { createClient } from "@/lib/supabase/server";
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
  "id, workspace_id, name, description, color, status, visibility, archived_at, start_date, target_date, owner_id" as const;

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
    const supabase = await createClient();
    let query = supabase.from("projects").select(PROJECT_FIELDS).eq("workspace_id", workspaceId);
    query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);

    const { data, error } = await query.order("name");
    if (error) {
      throw new Error("Could not load projects.");
    }
    return data.map(toProjectSummary);
  },
);

/** Open and finished top-level task counts per project, for project cards. */
export async function countTasksByProject(
  workspaceId: string,
): Promise<Map<string, { open: number; done: number; overdue: number }>> {
  const supabase = await createClient();
  const [{ data: tasks, error: taskError }, { data: columns, error: columnError }] = await Promise.all([
    supabase
      .from("tasks")
      .select("project_id, column_id, due_date")
      .eq("workspace_id", workspaceId)
      .is("parent_task_id", null)
      .is("archived_at", null)
      .is("deleted_at", null),
    supabase.from("board_columns").select("id, is_done").eq("workspace_id", workspaceId),
  ]);
  if (taskError || columnError) {
    throw new Error("Could not load task counts.");
  }

  const doneColumns = new Set(columns.filter((column) => column.is_done).map((column) => column.id));
  const { today } = dateRange(0);
  const counts = new Map<string, { open: number; done: number; overdue: number }>();

  for (const task of tasks) {
    const entry = counts.get(task.project_id) ?? { open: 0, done: 0, overdue: 0 };
    if (task.column_id && doneColumns.has(task.column_id)) {
      entry.done += 1;
    } else {
      entry.open += 1;
      if (task.due_date && task.due_date < today) entry.overdue += 1;
    }
    counts.set(task.project_id, entry);
  }
  return counts;
}

/**
 * The project at this URL with the user's access level, or a 404.
 * As with workspaces, "no access" and "doesn't exist" look the same.
 */
export const getProjectForUser = cache(async (workspaceId: string, projectId: string): Promise<ProjectDetail> => {
  if (!z.uuid().safeParse(projectId).success) {
    notFound();
  }

  const supabase = await createClient();
  const [{ data: project }, { data: access }] = await Promise.all([
    supabase.from("projects").select(PROJECT_FIELDS).eq("id", projectId).eq("workspace_id", workspaceId).maybeSingle(),
    supabase.rpc("project_access", { target_project: projectId }),
  ]);

  if (!project || (access !== "manage" && access !== "edit" && access !== "view")) {
    notFound();
  }

  return { ...toProjectSummary(project), workspaceId: project.workspace_id, access };
});

export const listColumns = cache(async (projectId: string): Promise<BoardColumn[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("board_columns")
    .select("id, name, position, is_done")
    .eq("project_id", projectId)
    .order("position");
  if (error) {
    throw new Error("Could not load the board.");
  }
  return data.map((column) => ({ id: column.id, name: column.name, position: column.position, isDone: column.is_done }));
});

export const listLabels = cache(async (workspaceId: string): Promise<LabelView[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("labels")
    .select("id, name, color")
    .eq("workspace_id", workspaceId)
    .order("name");
  if (error) {
    throw new Error("Could not load labels.");
  }
  return data.map((label) => ({ id: label.id, name: label.name, color: asColor(label.color) }));
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
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_members").select("user_id").eq("project_id", projectId);
  if (error) {
    throw new Error("Could not load project members.");
  }
  return data.map((row) => row.user_id);
}

/**
 * Loads the board's tasks with their assignees, labels and progress,
 * applying the filters in the database where possible.
 *
 * Related rows are fetched per project (not per task id) so the queries
 * stay small and fixed in number however many tasks there are.
 */
export async function listTaskCards(
  project: ProjectDetail,
  columns: BoardColumn[],
  filters: TaskFilters,
): Promise<TaskCard[]> {
  const supabase = await createClient();

  const [assigneeRows, labelRows, subtaskRows, checklistRows, people, labels] = await Promise.all([
    supabase.from("task_assignees").select("task_id, user_id").eq("project_id", project.id),
    supabase.from("task_labels").select("task_id, label_id").eq("project_id", project.id),
    supabase
      .from("tasks")
      .select("parent_task_id, completed_at")
      .eq("project_id", project.id)
      .not("parent_task_id", "is", null)
      .is("deleted_at", null),
    supabase.from("checklist_items").select("task_id, is_done").eq("project_id", project.id),
    listWorkspaceMembers(project.workspaceId),
    listLabels(project.workspaceId),
  ]);

  if (assigneeRows.error || labelRows.error || subtaskRows.error || checklistRows.error) {
    throw new Error("Could not load task details.");
  }

  let query = supabase
    .from("tasks")
    .select("id, title, column_id, position, priority, start_date, due_date, updated_at")
    .eq("project_id", project.id)
    .is("parent_task_id", null)
    .is("archived_at", null)
    .is("deleted_at", null);

  const { today, until } = dateRange(7);
  if (filters.q) query = query.ilike("title", `%${escapeLikePattern(filters.q)}%`);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.due === "overdue") query = query.lt("due_date", today);
  if (filters.due === "week") query = query.gte("due_date", today).lte("due_date", until);
  if (filters.due === "none") query = query.is("due_date", null);

  const { data: rows, error } = await query.order("position");
  if (error) {
    throw new Error("Could not load tasks.");
  }

  const peopleById = new Map(people.map((member) => [member.userId, toPerson(member)]));
  const labelsById = new Map(labels.map((label) => [label.id, label]));
  const doneColumns = new Set(columns.filter((column) => column.isDone).map((column) => column.id));

  const assigneesByTask = groupBy(assigneeRows.data, (row) => row.task_id);
  const labelsByTask = groupBy(labelRows.data, (row) => row.task_id);
  const subtasksByTask = groupBy(subtaskRows.data, (row) => row.parent_task_id ?? "");
  const checklistByTask = groupBy(checklistRows.data, (row) => row.task_id);

  const cards = rows.flatMap((row): TaskCard[] => {
    // Every top-level task has a column (enforced by a check constraint).
    if (!row.column_id) return [];
    const assigneeIds = (assigneesByTask.get(row.id) ?? []).map((assignee) => assignee.user_id);
    const subtasks = subtasksByTask.get(row.id) ?? [];
    const checklist = checklistByTask.get(row.id) ?? [];

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
        assignees: assigneeIds.flatMap((id) => peopleById.get(id) ?? []),
        labels: (labelsByTask.get(row.id) ?? []).flatMap((link) => labelsById.get(link.label_id) ?? []),
        subtasks: { total: subtasks.length, done: subtasks.filter((subtask) => subtask.completed_at).length },
        checklist: { total: checklist.length, done: checklist.filter((item) => item.is_done).length },
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

  const supabase = await createClient();
  const [task, subtasks, checklists, items, assignees, taskLabels, people, labels, comments, attachments] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, title, description, column_id, position, priority, start_date, due_date, updated_at, version, created_at, created_by",
      )
      .eq("id", taskId)
      .eq("project_id", project.id)
      .is("parent_task_id", null)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("tasks")
      .select("id, title, completed_at")
      .eq("parent_task_id", taskId)
      .is("deleted_at", null)
      .order("position"),
    supabase.from("checklists").select("id, title").eq("task_id", taskId).order("position"),
    supabase.from("checklist_items").select("id, checklist_id, content, is_done").eq("task_id", taskId).order("position"),
    supabase.from("task_assignees").select("user_id").eq("task_id", taskId),
    supabase.from("task_labels").select("label_id").eq("task_id", taskId),
    listWorkspaceMembers(project.workspaceId),
    listLabels(project.workspaceId),
    listComments(project, taskId),
    listAttachments(project, taskId),
  ]);

  if (!task.data || !task.data.column_id) {
    return null;
  }
  if (subtasks.error || checklists.error || items.error || assignees.error || taskLabels.error) {
    throw new Error("Could not load the task.");
  }

  const peopleById = new Map(people.map((member) => [member.userId, toPerson(member)]));
  const labelsById = new Map(labels.map((label) => [label.id, label]));
  const itemsByChecklist = groupBy(items.data, (item) => item.checklist_id);
  const row = task.data;

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
    assignees: assignees.data.flatMap((assignee) => peopleById.get(assignee.user_id) ?? []),
    labels: taskLabels.data.flatMap((link) => labelsById.get(link.label_id) ?? []),
    subtasks: {
      total: subtasks.data.length,
      done: subtasks.data.filter((subtask) => subtask.completed_at).length,
    },
    checklist: { total: items.data.length, done: items.data.filter((item) => item.is_done).length },
    subtaskItems: subtasks.data.map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      completed: Boolean(subtask.completed_at),
    })),
    checklists: checklists.data.map((checklist) => ({
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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, archived_at, deleted_at, updated_at")
    .eq("project_id", projectId)
    .is("parent_task_id", null)
    .or("archived_at.not.is.null,deleted_at.not.is.null")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) {
    throw new Error("Could not load archived tasks.");
  }
  return data.map((task) => ({ id: task.id, title: task.title, archivedAt: task.archived_at, deletedAt: task.deleted_at }));
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
  const supabase = await createClient();
  const [{ data: comments, error }, { data: mentions, error: mentionError }, people] = await Promise.all([
    supabase
      .from("comments")
      .select("id, body, author_id, created_at, edited_at")
      .eq("task_id", taskId)
      .order("created_at")
      .limit(200),
    supabase.from("comment_mentions").select("comment_id, user_id").eq("project_id", project.id),
    listWorkspaceMembers(project.workspaceId),
  ]);
  if (error || mentionError) {
    throw new Error("Could not load comments.");
  }

  const peopleById = new Map(people.map((member) => [member.userId, toPerson(member)]));
  const mentionsByComment = groupBy(mentions, (mention) => mention.comment_id);

  return comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    author: comment.author_id ? (peopleById.get(comment.author_id) ?? null) : null,
    authorId: comment.author_id,
    createdAt: comment.created_at,
    editedAt: comment.edited_at,
    mentionIds: (mentionsByComment.get(comment.id) ?? []).map((mention) => mention.user_id),
  }));
}

export async function listAttachments(project: ProjectDetail, taskId: string): Promise<AttachmentView[]> {
  const supabase = await createClient();
  const [{ data, error }, people] = await Promise.all([
    supabase
      .from("attachments")
      .select("id, file_name, content_type, size_bytes, uploaded_by, created_at")
      .eq("task_id", taskId)
      .order("created_at"),
    listWorkspaceMembers(project.workspaceId),
  ]);
  if (error) {
    throw new Error("Could not load attachments.");
  }

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
  const supabase = await createClient();
  let phaseQuery = supabase
    .from("milestones")
    .select("id, project_id, name, description, target_date, owner_id, position")
    .eq("workspace_id", workspaceId);
  let linkQuery = supabase.from("milestone_tasks").select("milestone_id, task_id").eq("workspace_id", workspaceId);
  let taskQuery = supabase
    .from("tasks")
    .select("id, column_id")
    .eq("workspace_id", workspaceId)
    .is("parent_task_id", null)
    .is("archived_at", null)
    .is("deleted_at", null);
  if (projectId) {
    phaseQuery = phaseQuery.eq("project_id", projectId);
    linkQuery = linkQuery.eq("project_id", projectId);
    taskQuery = taskQuery.eq("project_id", projectId);
  }

  const [phases, links, tasks, columns] = await Promise.all([
    phaseQuery.order("position"),
    linkQuery,
    taskQuery,
    supabase.from("board_columns").select("id, is_done").eq("workspace_id", workspaceId),
  ]);
  if (phases.error || links.error || tasks.error || columns.error) {
    throw new Error("Could not load phases.");
  }

  const doneColumns = new Set(columns.data.filter((column) => column.is_done).map((column) => column.id));
  const liveTasks = new Map(tasks.data.map((task) => [task.id, task.column_id]));
  const linksByPhase = groupBy(links.data, (link) => link.milestone_id);

  const result = new Map<string, PhaseView[]>();
  for (const phase of phases.data) {
    const taskIds = (linksByPhase.get(phase.id) ?? []).map((link) => link.task_id).filter((id) => liveTasks.has(id));
    const done = taskIds.filter((id) => {
      const columnId = liveTasks.get(id);
      return columnId ? doneColumns.has(columnId) : false;
    }).length;
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
  const supabase = await createClient();
  const [assigned, columns, projects] = await Promise.all([
    supabase.from("task_assignees").select("task_id").eq("workspace_id", workspaceId).eq("user_id", userId),
    supabase.from("board_columns").select("id, is_done").eq("workspace_id", workspaceId),
    supabase.from("projects").select("id, name, color, archived_at").eq("workspace_id", workspaceId),
  ]);
  if (assigned.error || columns.error || projects.error) {
    throw new Error("Could not load your tasks.");
  }

  const taskIds = assigned.data.map((row) => row.task_id);
  if (taskIds.length === 0) return [];

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, title, due_date, priority, project_id, column_id")
    .in("id", taskIds.slice(0, 500))
    .is("parent_task_id", null)
    .is("archived_at", null)
    .is("deleted_at", null);
  if (error) {
    throw new Error("Could not load your tasks.");
  }

  const doneColumns = new Set(columns.data.filter((column) => column.is_done).map((column) => column.id));
  const activeProjects = new Map(
    projects.data.filter((project) => !project.archived_at).map((project) => [project.id, project]),
  );

  return tasks
    .filter((task) => task.column_id && !doneColumns.has(task.column_id) && activeProjects.has(task.project_id))
    .sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    })
    .slice(0, limit)
    .map((task) => {
      const project = activeProjects.get(task.project_id);
      return {
        id: task.id,
        title: task.title,
        columnId: task.column_id ?? "",
        dueDate: task.due_date,
        priority: task.priority,
        projectId: task.project_id,
        projectName: project?.name ?? "",
        projectColor: asColor(project?.color ?? "slate"),
      };
    });
}

export type SavedTemplate = { id: string; name: string; description: string; createdBy: string | null };

export async function listSavedTemplates(workspaceId: string): Promise<SavedTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_templates")
    .select("id, name, description, created_by")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error("Could not load saved templates.");
  }
  return data.map((row) => ({ id: row.id, name: row.name, description: row.description, createdBy: row.created_by }));
}
