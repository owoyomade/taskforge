"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toUserMessage } from "@/lib/db-errors";
import { textField, validationError, type FormState } from "@/lib/form-state";
import { evenPositions, needsRebalance, positionBetween } from "@/lib/ordering";
import { hasProjectAccess, NO_PERMISSION, type ActionResult } from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";
import { checklistItemSchema, taskTitleSchema, taskUpdateSchema } from "@/lib/validation";

const idSchema = z.uuid();
const ids = (...values: unknown[]) => values.every((value) => idSchema.safeParse(value).success);

function refreshWorkspace() {
  revalidatePath("/w/[slug]", "layout");
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check what you entered.";
}

/**
 * Loads the ids a task's child rows need (they repeat the task's project
 * and workspace so the composite foreign keys can check them). RLS means
 * this returns null for tasks the user can't see.
 */
async function loadTask(taskId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("id, project_id, workspace_id, column_id, parent_task_id")
    .eq("id", taskId)
    .maybeSingle();
  return data;
}

export async function createTask(
  projectId: string,
  columnId: string,
  title: string,
): Promise<ActionResult & { taskId?: string }> {
  const parsedTitle = taskTitleSchema.safeParse(title);
  if (!parsedTitle.success) return { ok: false, message: firstIssue(parsedTitle.error) };
  if (!ids(projectId, columnId) || !(await hasProjectAccess(projectId, "edit"))) return NO_PERMISSION;

  const supabase = await createClient();
  const [{ data: column }, { data: last }, { data: claims }] = await Promise.all([
    supabase.from("board_columns").select("workspace_id").eq("id", columnId).eq("project_id", projectId).maybeSingle(),
    supabase
      .from("tasks")
      .select("position")
      .eq("column_id", columnId)
      .is("parent_task_id", null)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.auth.getClaims(),
  ]);
  if (!column || !claims?.claims.sub) return { ok: false, message: "That column no longer exists." };

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      workspace_id: column.workspace_id,
      project_id: projectId,
      column_id: columnId,
      title: parsedTitle.data,
      position: positionBetween(last?.position, undefined),
      created_by: claims.claims.sub,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: toUserMessage(error, "createTask") };

  refreshWorkspace();
  return { ok: true, taskId: data.id };
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

  const supabase = await createClient();
  // Only save if nobody else has changed the task since this form loaded.
  const { data, error } = await supabase
    .from("tasks")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      start_date: parsed.data.startDate,
      due_date: parsed.data.dueDate,
    })
    .eq("id", taskId)
    .eq("version", parsed.data.version)
    .select("id");

  if (error) return { status: "error", message: toUserMessage(error, "updateTask"), values };

  if (data.length === 0) {
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
 * here from the database's current values, not trusted from the browser.
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

  const supabase = await createClient();
  const { data: neighbours } = await supabase
    .from("tasks")
    .select("id, position")
    .eq("column_id", columnId)
    .in("id", [beforeId, afterId].filter((id): id is string => Boolean(id)));

  const before = neighbours?.find((row) => row.id === beforeId)?.position;
  const after = neighbours?.find((row) => row.id === afterId)?.position;

  // If the neighbours have themselves moved meanwhile, before can end up
  // past after; fall back to the end of the column rather than misorder.
  const ordered = before === undefined || after === undefined || before < after;
  let position = ordered ? positionBetween(before, after) : positionBetween(Math.max(before, after), undefined);

  if (ordered && needsRebalance(before, after)) {
    position = await rebalanceColumn(columnId, taskId, beforeId);
  }

  const { data, error } = await supabase
    .from("tasks")
    .update({ column_id: columnId, position })
    .eq("id", taskId)
    .select("id");
  if (error) {
    // A column from a different project fails the composite foreign key.
    const message = error.code === "23503" ? "That column isn't part of this project." : toUserMessage(error, "moveTask");
    return { ok: false, message };
  }
  if (data.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

/** Moves a task to the bottom of another column (used by the task drawer's status picker). */
export async function moveTaskToColumnEnd(taskId: string, columnId: string): Promise<ActionResult> {
  if (!ids(taskId, columnId)) return NO_PERMISSION;
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("tasks")
    .select("id")
    .eq("column_id", columnId)
    .is("parent_task_id", null)
    .neq("id", taskId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
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

  const supabase = await createClient();
  const { data: columns } = await supabase
    .from("board_columns")
    .select("id, is_done")
    .eq("project_id", task.project_id)
    .order("position");
  const target = columns?.find((column) => column.is_done === done);
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

// Renumbers a crowded column and returns the position for the moved task.
async function rebalanceColumn(columnId: string, movingId: string, beforeId: string | null): Promise<number> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("tasks")
    .select("id")
    .eq("column_id", columnId)
    .is("parent_task_id", null)
    .neq("id", movingId)
    .order("position");

  const orderedIds = (rows ?? []).map((row) => row.id);
  const insertAt = beforeId ? orderedIds.indexOf(beforeId) + 1 : 0;
  orderedIds.splice(insertAt, 0, movingId);
  const positions = evenPositions(orderedIds.length);

  await Promise.all(
    orderedIds
      .filter((id) => id !== movingId)
      .map((id) => supabase.from("tasks").update({ position: positions[orderedIds.indexOf(id)] }).eq("id", id)),
  );
  return positions[insertAt];
}

export async function setTaskAssignee(taskId: string, userId: string, assigned: boolean): Promise<ActionResult> {
  if (!ids(taskId, userId)) return NO_PERMISSION;
  const task = await loadTask(taskId);
  if (!task) return { ok: false, message: "That task no longer exists." };

  const supabase = await createClient();
  const { error } = assigned
    ? await supabase.from("task_assignees").upsert(
        { task_id: taskId, project_id: task.project_id, workspace_id: task.workspace_id, user_id: userId },
        { onConflict: "task_id,user_id", ignoreDuplicates: true },
      )
    : await supabase.from("task_assignees").delete().eq("task_id", taskId).eq("user_id", userId);

  if (error) {
    const message = error.code === "23503" ? "Only workspace members can be assigned." : toUserMessage(error, "setTaskAssignee");
    return { ok: false, message };
  }
  refreshWorkspace();
  return { ok: true };
}

export async function setTaskLabel(taskId: string, labelId: string, attached: boolean): Promise<ActionResult> {
  if (!ids(taskId, labelId)) return NO_PERMISSION;
  const task = await loadTask(taskId);
  if (!task) return { ok: false, message: "That task no longer exists." };

  const supabase = await createClient();
  const { error } = attached
    ? await supabase.from("task_labels").upsert(
        { task_id: taskId, label_id: labelId, project_id: task.project_id, workspace_id: task.workspace_id },
        { onConflict: "task_id,label_id", ignoreDuplicates: true },
      )
    : await supabase.from("task_labels").delete().eq("task_id", taskId).eq("label_id", labelId);

  if (error) return { ok: false, message: toUserMessage(error, "setTaskLabel") };
  refreshWorkspace();
  return { ok: true };
}

export async function duplicateTask(taskId: string): Promise<ActionResult & { taskId?: string }> {
  if (!ids(taskId)) return NO_PERMISSION;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_task", { source_task: taskId });
  if (error) return { ok: false, message: toUserMessage(error, "duplicateTask") };

  refreshWorkspace();
  return { ok: true, taskId: data };
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
  const now = new Date().toISOString();
  const update = {
    archive: { archived_at: now },
    unarchive: { archived_at: null },
    delete: { deleted_at: now },
    restore: { deleted_at: null, archived_at: null },
  }[change];

  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").update(update).eq("id", taskId).select("id");
  if (error) return { ok: false, message: toUserMessage(error, "setTaskRemoved") };
  if (data.length === 0) return NO_PERMISSION;

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

  const supabase = await createClient();
  const [{ data: last }, { data: claims }] = await Promise.all([
    supabase
      .from("tasks")
      .select("position")
      .eq("parent_task_id", parentId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.auth.getClaims(),
  ]);
  if (!claims?.claims.sub) return NO_PERMISSION;

  const { error } = await supabase.from("tasks").insert({
    workspace_id: parent.workspace_id,
    project_id: parent.project_id,
    parent_task_id: parentId,
    title: parsedTitle.data,
    position: positionBetween(last?.position, undefined),
    created_by: claims.claims.sub,
  });
  if (error) return { ok: false, message: toUserMessage(error, "addSubtask") };

  refreshWorkspace();
  return { ok: true };
}

export async function setSubtaskCompleted(subtaskId: string, completed: boolean): Promise<ActionResult> {
  if (!ids(subtaskId)) return NO_PERMISSION;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", subtaskId)
    .not("parent_task_id", "is", null)
    .select("id");
  if (error) return { ok: false, message: toUserMessage(error, "setSubtaskCompleted") };
  if (data.length === 0) return NO_PERMISSION;

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

  const supabase = await createClient();
  const { error } = await supabase
    .from("checklists")
    .insert({ task_id: taskId, project_id: task.project_id, workspace_id: task.workspace_id, position: Date.now() });
  if (error) return { ok: false, message: toUserMessage(error, "addChecklist") };

  refreshWorkspace();
  return { ok: true };
}

export async function deleteChecklist(checklistId: string): Promise<ActionResult> {
  if (!ids(checklistId)) return NO_PERMISSION;
  const supabase = await createClient();
  const { data, error } = await supabase.from("checklists").delete().eq("id", checklistId).select("id");
  if (error) return { ok: false, message: toUserMessage(error, "deleteChecklist") };
  if (data.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

export async function addChecklistItem(checklistId: string, content: string): Promise<ActionResult> {
  const parsedContent = checklistItemSchema.safeParse(content);
  if (!parsedContent.success) return { ok: false, message: firstIssue(parsedContent.error) };
  if (!ids(checklistId)) return NO_PERMISSION;

  const supabase = await createClient();
  const { data: checklist } = await supabase
    .from("checklists")
    .select("task_id, project_id, workspace_id")
    .eq("id", checklistId)
    .maybeSingle();
  if (!checklist) return { ok: false, message: "That checklist no longer exists." };

  const { error } = await supabase.from("checklist_items").insert({
    checklist_id: checklistId,
    task_id: checklist.task_id,
    project_id: checklist.project_id,
    workspace_id: checklist.workspace_id,
    content: parsedContent.data,
    position: Date.now(),
  });
  if (error) return { ok: false, message: toUserMessage(error, "addChecklistItem") };

  refreshWorkspace();
  return { ok: true };
}

export async function setChecklistItemDone(itemId: string, isDone: boolean): Promise<ActionResult> {
  if (!ids(itemId)) return NO_PERMISSION;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("checklist_items")
    .update({ is_done: isDone })
    .eq("id", itemId)
    .select("id");
  if (error) return { ok: false, message: toUserMessage(error, "setChecklistItemDone") };
  if (data.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

export async function deleteChecklistItem(itemId: string): Promise<ActionResult> {
  if (!ids(itemId)) return NO_PERMISSION;
  const supabase = await createClient();
  const { data, error } = await supabase.from("checklist_items").delete().eq("id", itemId).select("id");
  if (error) return { ok: false, message: toUserMessage(error, "deleteChecklistItem") };
  if (data.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}
