"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { asCurrentUser, attemptAsCurrentUser, type Db } from "@/lib/db";
import { toUserMessage } from "@/lib/db-errors";
import { textField, validationError, type FormState } from "@/lib/form-state";
import { evenPositions, needsRebalance, positionBetween } from "@/lib/ordering";
import { hasProjectAccess, NO_PERMISSION, type ActionResult } from "@/lib/project-access";
import { getProjectForUser, listAssignablePeople } from "@/lib/projects";
import { checklistItemSchema, taskTitleSchema, taskUpdateSchema } from "@/lib/validation";

const idSchema = z.uuid();
const ids = (...values: unknown[]) => values.every((value) => idSchema.safeParse(value).success);

function refreshWorkspace() {
  revalidatePath("/w/[slug]", "layout");
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check what you entered.";
}

type TaskRef = { id: string; project_id: string; workspace_id: string; column_id: string | null; parent_task_id: string | null };

/**
 * Loads the ids a task's child rows need (they repeat the task's project
 * and workspace so the composite foreign keys can check them). RLS means
 * this returns null for tasks the user can't see.
 */
async function loadTask(taskId: string): Promise<TaskRef | null> {
  const [task] = await asCurrentUser((db) =>
    db.query<TaskRef>("select id, project_id, workspace_id, column_id, parent_task_id from public.tasks where id = $1", [taskId]),
  );
  return task ?? null;
}

export async function createTask(
  projectId: string,
  columnId: string,
  title: string,
): Promise<ActionResult & { taskId?: string }> {
  const parsedTitle = taskTitleSchema.safeParse(title);
  if (!parsedTitle.success) return { ok: false, message: firstIssue(parsedTitle.error) };
  if (!ids(projectId, columnId) || !(await hasProjectAccess(projectId, "edit"))) return NO_PERMISSION;
  const user = await requireUser();

  const result = await attemptAsCurrentUser(async (db) => {
    const [column] = await db.query<{ workspace_id: string }>(
      "select workspace_id from public.board_columns where id = $1 and project_id = $2",
      [columnId, projectId],
    );
    if (!column) return null;
    const [last] = await db.query<{ position: number }>(
      "select position from public.tasks where column_id = $1 and parent_task_id is null order by position desc limit 1",
      [columnId],
    );
    const [created] = await db.query<{ id: string }>(
      `insert into public.tasks (workspace_id, project_id, column_id, title, position, created_by)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [column.workspace_id, projectId, columnId, parsedTitle.data, positionBetween(last?.position, undefined), user.id],
    );
    return created.id;
  });
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "createTask") };
  if (!result.value) return { ok: false, message: "That column no longer exists." };

  refreshWorkspace();
  return { ok: true, taskId: result.value };
}

export async function updateTask(_previous: FormState, formData: FormData): Promise<FormState> {
  const taskId = textField(formData, "taskId");
  const values = {
    title: textField(formData, "title"),
    description: textField(formData, "description"),
    priority: textField(formData, "priority"),
    startDate: textField(formData, "startDate"),
    dueDate: textField(formData, "dueDate"),
    version: textField(formData, "version"),
  };
  const parsed = taskUpdateSchema.safeParse(values);
  if (!parsed.success) return validationError(parsed.error, values);
  if (!ids(taskId)) return { status: "error", message: "That task no longer exists.", values };

  // Only save if nobody else has changed the task since this form loaded.
  const result = await attemptAsCurrentUser((db) =>
    db.query<{ id: string }>(
      `update public.tasks set title = $2, description = $3, priority = $4, start_date = $5, due_date = $6
       where id = $1 and version = $7 returning id`,
      [taskId, parsed.data.title, parsed.data.description, parsed.data.priority, parsed.data.startDate, parsed.data.dueDate, parsed.data.version],
    ),
  );
  if (!result.ok) return { status: "error", message: toUserMessage(result.error, "updateTask"), values };

  if (result.value.length === 0) {
    const task = await loadTask(taskId);
    const canEdit = task ? await hasProjectAccess(task.project_id, "edit") : false;
    return {
      status: "error",
      message: canEdit
        ? "Someone else changed this task while you were editing. Close and reopen it to see their changes, then try again."
        : "You don't have permission to edit this task.",
      values,
    };
  }

  refreshWorkspace();
  return { status: "success", message: "Task saved." };
}

/**
 * Moves a task into `columnId`, between the tasks `beforeId` and `afterId`
 * (either may be null at the ends of the column). Positions are worked out
 * here from the database's current values, not trusted from the browser,
 * and the whole move (including any renumbering) is one transaction.
 */
export async function moveTask(
  taskId: string,
  columnId: string,
  beforeId: string | null,
  afterId: string | null,
): Promise<ActionResult> {
  if (!ids(taskId, columnId) || (beforeId && !ids(beforeId)) || (afterId && !ids(afterId))) return NO_PERMISSION;

  const task = await loadTask(taskId);
  if (!task || task.parent_task_id) return { ok: false, message: "That task no longer exists." };
  if (!(await hasProjectAccess(task.project_id, "edit"))) return NO_PERMISSION;

  const result = await attemptAsCurrentUser(async (db) => {
    const neighbours = await db.query<{ id: string; position: number }>(
      "select id, position from public.tasks where column_id = $1 and id = any($2::uuid[])",
      [columnId, [beforeId, afterId].filter((id): id is string => Boolean(id))],
    );
    const before = neighbours.find((row) => row.id === beforeId)?.position;
    const after = neighbours.find((row) => row.id === afterId)?.position;

    // If the neighbours have themselves moved meanwhile, before can end up
    // past after; fall back to the end of the column rather than misorder.
    const ordered = before === undefined || after === undefined || before < after;
    let position = ordered ? positionBetween(before, after) : positionBetween(Math.max(before, after), undefined);
    if (ordered && needsRebalance(before, after)) {
      position = await rebalanceColumn(db, columnId, taskId, beforeId);
    }

    return db.query<{ id: string }>("update public.tasks set column_id = $2, position = $3 where id = $1 returning id", [
      taskId,
      columnId,
      position,
    ]);
  });
  if (!result.ok) {
    // A column from a different project fails the composite foreign key.
    const message = result.error.code === "23503" ? "That column isn't part of this project." : toUserMessage(result.error, "moveTask");
    return { ok: false, message };
  }
  if (result.value.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

/** Moves a task to the bottom of another column (used by the task drawer's status picker). */
export async function moveTaskToColumnEnd(taskId: string, columnId: string): Promise<ActionResult> {
  if (!ids(taskId, columnId)) return NO_PERMISSION;
  const [last] = await asCurrentUser((db) =>
    db.query<{ id: string }>(
      "select id from public.tasks where column_id = $1 and parent_task_id is null and id <> $2 order by position desc limit 1",
      [columnId, taskId],
    ),
  );
  return moveTask(taskId, columnId, last?.id ?? null, null);
}

/**
 * Ticks a task off (or back on) without the person needing to know about
 * columns: done moves it to the project's first "done" column, not done
 * moves it back to the first column that isn't.
 */
export async function setTaskDone(taskId: string, done: boolean): Promise<ActionResult> {
  if (!ids(taskId)) return NO_PERMISSION;
  const task = await loadTask(taskId);
  if (!task || task.parent_task_id) return { ok: false, message: "That task no longer exists." };

  const columns = await asCurrentUser((db) =>
    db.query<{ id: string; is_done: boolean }>("select id, is_done from public.board_columns where project_id = $1 order by position", [
      task.project_id,
    ]),
  );
  const target = columns.find((column) => column.is_done === done);
  if (!target) {
    return {
      ok: false,
      message: done
        ? "This project has no column marked as done. Mark one from the board's column menu."
        : "This project has no column for unfinished work.",
    };
  }
  if (target.id === task.column_id) return { ok: true };
  return moveTaskToColumnEnd(taskId, target.id);
}

// Renumbers a crowded column (inside the move's transaction) and returns the position for the moved task.
async function rebalanceColumn(db: Db, columnId: string, movingId: string, beforeId: string | null): Promise<number> {
  const rows = await db.query<{ id: string }>(
    "select id from public.tasks where column_id = $1 and parent_task_id is null and id <> $2 order by position",
    [columnId, movingId],
  );

  const orderedIds = rows.map((row) => row.id);
  const insertAt = beforeId ? orderedIds.indexOf(beforeId) + 1 : 0;
  orderedIds.splice(insertAt, 0, movingId);
  const positions = evenPositions(orderedIds.length);

  for (const [index, id] of orderedIds.entries()) {
    if (id !== movingId) await db.query("update public.tasks set position = $2 where id = $1", [id, positions[index]]);
  }
  return positions[insertAt];
}

export async function setTaskAssignee(taskId: string, userId: string, assigned: boolean): Promise<ActionResult> {
  if (!ids(taskId, userId)) return NO_PERMISSION;
  const task = await loadTask(taskId);
  if (!task) return { ok: false, message: "That task no longer exists." };

  const result = await attemptAsCurrentUser((db) =>
    assigned
      ? db.query(
          `insert into public.task_assignees (task_id, project_id, workspace_id, user_id) values ($1, $2, $3, $4)
           on conflict (task_id, user_id) do nothing`,
          [taskId, task.project_id, task.workspace_id, userId],
        )
      : db.query("delete from public.task_assignees where task_id = $1 and user_id = $2", [taskId, userId]),
  );
  if (!result.ok) {
    const message = result.error.code === "23503" ? "Only workspace members can be assigned." : toUserMessage(result.error, "setTaskAssignee");
    return { ok: false, message };
  }
  refreshWorkspace();
  return { ok: true };
}

/**
 * The radar's one-click fix: hands a task from an overloaded person (or
 * from nobody) to someone with room. Removing and adding happen in one
 * transaction, so the task is never left half-moved.
 */
export async function reassignTask(taskId: string, fromUserId: string | null, toUserId: string): Promise<ActionResult> {
  if (!ids(taskId, toUserId) || (fromUserId !== null && !ids(fromUserId))) return NO_PERMISSION;
  const task = await loadTask(taskId);
  if (!task) return { ok: false, message: "That task no longer exists." };
  if (!(await hasProjectAccess(task.project_id, "edit"))) return NO_PERMISSION;

  // The same rule as the task drawer's assignee list: no viewers, and only
  // people who can see a private project.
  const project = await getProjectForUser(task.workspace_id, task.project_id);
  const assignable = await listAssignablePeople(project);
  if (!assignable.some((person) => person.id === toUserId)) {
    return { ok: false, message: "That person can't be assigned to this project's tasks." };
  }

  const result = await attemptAsCurrentUser(async (db) => {
    if (fromUserId) {
      await db.query("delete from public.task_assignees where task_id = $1 and user_id = $2", [taskId, fromUserId]);
    }
    await db.query(
      `insert into public.task_assignees (task_id, project_id, workspace_id, user_id) values ($1, $2, $3, $4)
       on conflict (task_id, user_id) do nothing`,
      [taskId, task.project_id, task.workspace_id, toUserId],
    );
  });
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "reassignTask") };
  refreshWorkspace();
  return { ok: true };
}

export async function setTaskLabel(taskId: string, labelId: string, attached: boolean): Promise<ActionResult> {
  if (!ids(taskId, labelId)) return NO_PERMISSION;
  const task = await loadTask(taskId);
  if (!task) return { ok: false, message: "That task no longer exists." };

  const result = await attemptAsCurrentUser((db) =>
    attached
      ? db.query(
          `insert into public.task_labels (task_id, label_id, project_id, workspace_id) values ($1, $2, $3, $4)
           on conflict (task_id, label_id) do nothing`,
          [taskId, labelId, task.project_id, task.workspace_id],
        )
      : db.query("delete from public.task_labels where task_id = $1 and label_id = $2", [taskId, labelId]),
  );
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "setTaskLabel") };
  refreshWorkspace();
  return { ok: true };
}

export async function duplicateTask(taskId: string): Promise<ActionResult & { taskId?: string }> {
  if (!ids(taskId)) return NO_PERMISSION;
  const result = await attemptAsCurrentUser((db) => db.query<{ id: string }>("select public.duplicate_task($1) as id", [taskId]));
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "duplicateTask") };

  refreshWorkspace();
  return { ok: true, taskId: result.value[0]?.id };
}

/**
 * Archive hides a finished task from the board; delete puts it in the
 * project's "Recently removed" list. Both can be undone from project settings.
 */
export async function setTaskRemoved(
  taskId: string,
  change: "archive" | "unarchive" | "delete" | "restore",
): Promise<ActionResult> {
  if (!ids(taskId)) return NO_PERMISSION;
  // Fixed statements per change; nothing from the browser goes into the SQL text.
  const statement = {
    archive: "update public.tasks set archived_at = now() where id = $1 returning id",
    unarchive: "update public.tasks set archived_at = null where id = $1 returning id",
    delete: "update public.tasks set deleted_at = now() where id = $1 returning id",
    restore: "update public.tasks set deleted_at = null, archived_at = null where id = $1 returning id",
  }[change];

  const result = await attemptAsCurrentUser((db) => db.query<{ id: string }>(statement, [taskId]));
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "setTaskRemoved") };
  if (result.value.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------------

export async function addSubtask(parentId: string, title: string): Promise<ActionResult> {
  const parsedTitle = taskTitleSchema.safeParse(title);
  if (!parsedTitle.success) return { ok: false, message: firstIssue(parsedTitle.error) };
  if (!ids(parentId)) return NO_PERMISSION;

  const parent = await loadTask(parentId);
  if (!parent) return { ok: false, message: "That task no longer exists." };
  const user = await requireUser();

  const result = await attemptAsCurrentUser(async (db) => {
    const [last] = await db.query<{ position: number }>(
      "select position from public.tasks where parent_task_id = $1 order by position desc limit 1",
      [parentId],
    );
    await db.query(
      `insert into public.tasks (workspace_id, project_id, parent_task_id, title, position, created_by)
       values ($1, $2, $3, $4, $5, $6)`,
      [parent.workspace_id, parent.project_id, parentId, parsedTitle.data, positionBetween(last?.position, undefined), user.id],
    );
  });
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "addSubtask") };

  refreshWorkspace();
  return { ok: true };
}

export async function setSubtaskCompleted(subtaskId: string, completed: boolean): Promise<ActionResult> {
  if (!ids(subtaskId)) return NO_PERMISSION;
  const result = await attemptAsCurrentUser((db) =>
    db.query<{ id: string }>(
      `update public.tasks set completed_at = case when $2 then now() else null end
       where id = $1 and parent_task_id is not null returning id`,
      [subtaskId, completed],
    ),
  );
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "setSubtaskCompleted") };
  if (result.value.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Checklists
// ---------------------------------------------------------------------------

export async function addChecklist(taskId: string): Promise<ActionResult> {
  if (!ids(taskId)) return NO_PERMISSION;
  const task = await loadTask(taskId);
  if (!task) return { ok: false, message: "That task no longer exists." };

  const result = await attemptAsCurrentUser((db) =>
    db.query("insert into public.checklists (task_id, project_id, workspace_id, position) values ($1, $2, $3, $4)", [
      taskId,
      task.project_id,
      task.workspace_id,
      Date.now(),
    ]),
  );
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "addChecklist") };

  refreshWorkspace();
  return { ok: true };
}

export async function deleteChecklist(checklistId: string): Promise<ActionResult> {
  if (!ids(checklistId)) return NO_PERMISSION;
  const result = await attemptAsCurrentUser((db) =>
    db.query<{ id: string }>("delete from public.checklists where id = $1 returning id", [checklistId]),
  );
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "deleteChecklist") };
  if (result.value.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

export async function addChecklistItem(checklistId: string, content: string): Promise<ActionResult> {
  const parsedContent = checklistItemSchema.safeParse(content);
  if (!parsedContent.success) return { ok: false, message: firstIssue(parsedContent.error) };
  if (!ids(checklistId)) return NO_PERMISSION;

  const result = await attemptAsCurrentUser(async (db) => {
    const [checklist] = await db.query<{ task_id: string; project_id: string; workspace_id: string }>(
      "select task_id, project_id, workspace_id from public.checklists where id = $1",
      [checklistId],
    );
    if (!checklist) return false;
    await db.query(
      `insert into public.checklist_items (checklist_id, task_id, project_id, workspace_id, content, position)
       values ($1, $2, $3, $4, $5, $6)`,
      [checklistId, checklist.task_id, checklist.project_id, checklist.workspace_id, parsedContent.data, Date.now()],
    );
    return true;
  });
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "addChecklistItem") };
  if (!result.value) return { ok: false, message: "That checklist no longer exists." };

  refreshWorkspace();
  return { ok: true };
}

export async function setChecklistItemDone(itemId: string, isDone: boolean): Promise<ActionResult> {
  if (!ids(itemId)) return NO_PERMISSION;
  const result = await attemptAsCurrentUser((db) =>
    db.query<{ id: string }>("update public.checklist_items set is_done = $2 where id = $1 returning id", [itemId, isDone]),
  );
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "setChecklistItemDone") };
  if (result.value.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

export async function deleteChecklistItem(itemId: string): Promise<ActionResult> {
  if (!ids(itemId)) return NO_PERMISSION;
  const result = await attemptAsCurrentUser((db) =>
    db.query<{ id: string }>("delete from public.checklist_items where id = $1 returning id", [itemId]),
  );
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "deleteChecklistItem") };
  if (result.value.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}
