"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toUserMessage } from "@/lib/db-errors";
import { positionBetween } from "@/lib/ordering";
import { hasProjectAccess, NO_PERMISSION, type ActionResult } from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";
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

  const supabase = await createClient();
  const [{ data: project }, { data: last }] = await Promise.all([
    supabase.from("projects").select("workspace_id").eq("id", projectId).single(),
    supabase.from("milestones").select("position").eq("project_id", projectId).order("position", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!project) return NO_PERMISSION;

  const { error } = await supabase.from("milestones").insert({
    workspace_id: project.workspace_id,
    project_id: projectId,
    name: parsed.data.name,
    target_date: parsed.data.targetDate,
    position: positionBetween(last?.position, undefined),
  });
  if (error) return { ok: false, message: toUserMessage(error, "createPhase") };

  refreshWorkspace();
  return { ok: true };
}

export async function updatePhase(phaseId: string, input: { name: string; targetDate: string }): Promise<ActionResult> {
  const parsed = phaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  if (!idSchema.safeParse(phaseId).success) return NO_PERMISSION;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("milestones")
    .update({ name: parsed.data.name, target_date: parsed.data.targetDate })
    .eq("id", phaseId)
    .select("id");
  if (error) return { ok: false, message: toUserMessage(error, "updatePhase") };
  if (data.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

/** Deletes a phase. Its tasks stay in the project, just without a phase. */
export async function deletePhase(phaseId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(phaseId).success) return NO_PERMISSION;
  const supabase = await createClient();
  const { data, error } = await supabase.from("milestones").delete().eq("id", phaseId).select("id");
  if (error) return { ok: false, message: toUserMessage(error, "deletePhase") };
  if (data.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

/** Moves a task into a phase, or out of all phases when phaseId is null. */
export async function setTaskPhase(taskId: string, phaseId: string | null): Promise<ActionResult> {
  if (!idSchema.safeParse(taskId).success || (phaseId && !idSchema.safeParse(phaseId).success)) return NO_PERMISSION;

  const supabase = await createClient();
  const { data: task } = await supabase.from("tasks").select("project_id, workspace_id").eq("id", taskId).maybeSingle();
  if (!task) return { ok: false, message: "That task no longer exists." };
  if (!(await hasProjectAccess(task.project_id, "edit"))) return NO_PERMISSION;

  const { error: removeError } = await supabase.from("milestone_tasks").delete().eq("task_id", taskId);
  if (removeError) return { ok: false, message: toUserMessage(removeError, "setTaskPhase") };

  if (phaseId) {
    // The composite foreign key rejects a phase from a different project.
    const { error } = await supabase
      .from("milestone_tasks")
      .insert({ milestone_id: phaseId, task_id: taskId, project_id: task.project_id, workspace_id: task.workspace_id });
    if (error) return { ok: false, message: error.code === "23503" ? "That phase isn't part of this project." : toUserMessage(error, "setTaskPhase") };
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

  const supabase = await createClient();
  const [{ data: columns }, { data: claims }, { data: phase }] = await Promise.all([
    supabase.from("board_columns").select("id, workspace_id, is_done").eq("project_id", projectId).order("position"),
    supabase.auth.getClaims(),
    phaseId
      ? supabase.from("milestones").select("target_date").eq("id", phaseId).eq("project_id", projectId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const column = columns?.find((candidate) => !candidate.is_done) ?? columns?.[0];
  if (!column || !claims?.claims.sub) return { ok: false, message: "This project has no board columns." };

  const { data: last } = await supabase
    .from("tasks")
    .select("position")
    .eq("column_id", column.id)
    .is("parent_task_id", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      workspace_id: column.workspace_id,
      project_id: projectId,
      column_id: column.id,
      title: parsedTitle.data,
      // New tasks in a phase default to the phase's date, so they show up in "Do next".
      due_date: phase?.target_date ?? null,
      position: positionBetween(last?.position, undefined),
      created_by: claims.claims.sub,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: toUserMessage(error, "createTaskInPhase") };

  if (phaseId) {
    const { error: linkError } = await supabase
      .from("milestone_tasks")
      .insert({ milestone_id: phaseId, task_id: task.id, project_id: projectId, workspace_id: column.workspace_id });
    if (linkError) return { ok: false, message: toUserMessage(linkError, "createTaskInPhase") };
  }

  refreshWorkspace();
  return { ok: true };
}
