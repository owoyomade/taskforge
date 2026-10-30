"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { asCurrentUser, attemptAsCurrentUser } from "@/lib/db";
import { toUserMessage } from "@/lib/db-errors";
import { positionBetween } from "@/lib/ordering";
import { hasProjectAccess, NO_PERMISSION, type ActionResult } from "@/lib/project-access";
import { taskTitleSchema } from "@/lib/validation";

const idSchema = z.uuid();
const phaseSchema = z.object({
  name: z.string().trim().min(1, "Give the phase a name.").max(80, "Use 80 characters or fewer."),
  targetDate: z
    .string()
    .trim()
    .transform((value) => value || null)
    .pipe(z.iso.date("Choose a valid date.").nullable()),
});

function refreshWorkspace() {
  revalidatePath("/w/[slug]", "layout");
}

function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check what you entered.";
}

export async function createPhase(projectId: string, input: { name: string; targetDate: string }): Promise<ActionResult> {
  const parsed = phaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  if (!idSchema.safeParse(projectId).success || !(await hasProjectAccess(projectId, "edit"))) return NO_PERMISSION;

  const result = await attemptAsCurrentUser(async (db) => {
    const [project] = await db.query<{ workspace_id: string }>("select workspace_id from public.projects where id = $1", [projectId]);
    if (!project) return false;
    const [last] = await db.query<{ position: number }>(
      "select position from public.milestones where project_id = $1 order by position desc limit 1",
      [projectId],
    );
    await db.query(
      "insert into public.milestones (workspace_id, project_id, name, target_date, position) values ($1, $2, $3, $4, $5)",
      [project.workspace_id, projectId, parsed.data.name, parsed.data.targetDate, positionBetween(last?.position, undefined)],
    );
    return true;
  });
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "createPhase") };
  if (!result.value) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

export async function updatePhase(phaseId: string, input: { name: string; targetDate: string }): Promise<ActionResult> {
  const parsed = phaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  if (!idSchema.safeParse(phaseId).success) return NO_PERMISSION;

  const result = await attemptAsCurrentUser((db) =>
    db.query<{ id: string }>("update public.milestones set name = $2, target_date = $3 where id = $1 returning id", [
      phaseId,
      parsed.data.name,
      parsed.data.targetDate,
    ]),
  );
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "updatePhase") };
  if (result.value.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

/** Deletes a phase. Its tasks stay in the project, just without a phase. */
export async function deletePhase(phaseId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(phaseId).success) return NO_PERMISSION;
  const result = await attemptAsCurrentUser((db) =>
    db.query<{ id: string }>("delete from public.milestones where id = $1 returning id", [phaseId]),
  );
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "deletePhase") };
  if (result.value.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

/** Moves a task into a phase, or out of all phases when phaseId is null. */
export async function setTaskPhase(taskId: string, phaseId: string | null): Promise<ActionResult> {
  if (!idSchema.safeParse(taskId).success || (phaseId && !idSchema.safeParse(phaseId).success)) return NO_PERMISSION;

  const [task] = await asCurrentUser((db) =>
    db.query<{ project_id: string; workspace_id: string }>("select project_id, workspace_id from public.tasks where id = $1", [taskId]),
  );
  if (!task) return { ok: false, message: "That task no longer exists." };
  if (!(await hasProjectAccess(task.project_id, "edit"))) return NO_PERMISSION;

  // Remove and re-add together, so a failed move leaves the task where it was.
  const result = await attemptAsCurrentUser(async (db) => {
    await db.query("delete from public.milestone_tasks where task_id = $1", [taskId]);
    if (phaseId) {
      // The composite foreign key rejects a phase from a different project.
      await db.query("insert into public.milestone_tasks (milestone_id, task_id, project_id, workspace_id) values ($1, $2, $3, $4)", [
        phaseId,
        taskId,
        task.project_id,
        task.workspace_id,
      ]);
    }
  });
  if (!result.ok) {
    return { ok: false, message: result.error.code === "23503" ? "That phase isn't part of this project." : toUserMessage(result.error, "setTaskPhase") };
  }

  refreshWorkspace();
  return { ok: true };
}

/** Adds a task straight into a phase, in the project's first unfinished column. */
export async function createTaskInPhase(projectId: string, phaseId: string | null, title: string): Promise<ActionResult> {
  const parsedTitle = taskTitleSchema.safeParse(title);
  if (!parsedTitle.success) return { ok: false, message: firstIssue(parsedTitle.error) };
  if (!idSchema.safeParse(projectId).success || (phaseId && !idSchema.safeParse(phaseId).success)) return NO_PERMISSION;
  if (!(await hasProjectAccess(projectId, "edit"))) return NO_PERMISSION;
  const user = await requireUser();

  // The task and its phase link are saved together, or not at all.
  const result = await attemptAsCurrentUser(async (db) => {
    const columns = await db.query<{ id: string; workspace_id: string; is_done: boolean }>(
      "select id, workspace_id, is_done from public.board_columns where project_id = $1 order by position",
      [projectId],
    );
    const column = columns.find((candidate) => !candidate.is_done) ?? columns[0];
    if (!column) return false;
    const [phase] = phaseId
      ? await db.query<{ target_date: string | null }>("select target_date from public.milestones where id = $1 and project_id = $2", [phaseId, projectId])
      : [];
    const [last] = await db.query<{ position: number }>(
      "select position from public.tasks where column_id = $1 and parent_task_id is null order by position desc limit 1",
      [column.id],
    );
    const [task] = await db.query<{ id: string }>(
      `insert into public.tasks (workspace_id, project_id, column_id, title, due_date, position, created_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        column.workspace_id,
        projectId,
        column.id,
        parsedTitle.data,
        // New tasks in a phase default to the phase's date, so they show up in "Do next".
        phase?.target_date ?? null,
        positionBetween(last?.position, undefined),
        user.id,
      ],
    );
    if (phaseId) {
      await db.query("insert into public.milestone_tasks (milestone_id, task_id, project_id, workspace_id) values ($1, $2, $3, $4)", [
        phaseId,
        task.id,
        projectId,
        column.workspace_id,
      ]);
    }
    return true;
  });
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "createTaskInPhase") };
  if (!result.value) return { ok: false, message: "This project has no board columns." };

  refreshWorkspace();
  return { ok: true };
}
