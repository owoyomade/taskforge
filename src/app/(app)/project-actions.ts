"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { toUserMessage } from "@/lib/db-errors";
import { textField, validationError, type FormState } from "@/lib/form-state";
import { evenPositions, positionForIndex } from "@/lib/ordering";
import { hasProjectAccess, NO_PERMISSION, type ActionResult } from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";
import { columnNameSchema, labelSchema, projectUpdateSchema } from "@/lib/validation";
import { listMyWorkspaces } from "@/lib/workspaces";

// Revalidating the workspace layout refreshes the sidebar's project list
// and every board in it after a change.
function refreshWorkspace() {
  revalidatePath("/w/[slug]", "layout");
}

const idSchema = z.uuid();

async function workspaceFromForm(formData: FormData) {
  const workspaceId = textField(formData, "workspaceId");
  return (await listMyWorkspaces()).find((workspace) => workspace.id === workspaceId);
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function updateProject(_previous: FormState, formData: FormData): Promise<FormState> {
  const projectId = textField(formData, "projectId");
  const values = {
    name: textField(formData, "name"),
    description: textField(formData, "description"),
    visibility: textField(formData, "visibility"),
    color: textField(formData, "color"),
    status: textField(formData, "status"),
    startDate: textField(formData, "startDate"),
    targetDate: textField(formData, "targetDate"),
    ownerId: textField(formData, "ownerId"),
  };
  const parsed = projectUpdateSchema.safeParse(values);
  if (!parsed.success) {
    return validationError(parsed.error, values);
  }
  if (!idSchema.safeParse(projectId).success || !(await hasProjectAccess(projectId, "manage"))) {
    return { status: "error", message: "Only the project owner or a workspace admin can change these settings.", values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      visibility: parsed.data.visibility,
      color: parsed.data.color,
      status: parsed.data.status,
      start_date: parsed.data.startDate,
      target_date: parsed.data.targetDate,
      owner_id: parsed.data.ownerId,
    })
    .eq("id", projectId)
    .select("id");

  if (error) {
    // 23503 here means the chosen owner isn't (or is no longer) a workspace member.
    const message =
      error.code === "23503" ? "The owner must be a member of this workspace." : toUserMessage(error, "updateProject");
    return { status: "error", message, values };
  }
  if (data.length === 0) {
    return { status: "error", message: "You don't have permission to do that.", values };
  }

  refreshWorkspace();
  return { status: "success", message: "Project saved." };
}

export async function setProjectArchived(projectId: string, archived: boolean): Promise<ActionResult> {
  if (!idSchema.safeParse(projectId).success || !(await hasProjectAccess(projectId, "manage"))) {
    return NO_PERMISSION;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", projectId)
    .select("id");
  if (error) return { ok: false, message: toUserMessage(error, "setProjectArchived") };
  if (data.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

export async function deleteProject(_previous: FormState, formData: FormData): Promise<FormState> {
  const projectId = textField(formData, "projectId");
  if (!idSchema.safeParse(projectId).success || !(await hasProjectAccess(projectId, "manage"))) {
    return { status: "error", message: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("name, workspace_id").eq("id", projectId).single();
  if (!project) {
    return { status: "error", message: "That project no longer exists." };
  }
  if (textField(formData, "confirmName").trim() !== project.name) {
    return {
      status: "error",
      message: "The name you typed doesn't match.",
      fieldErrors: { confirmName: [`Type ${project.name} to confirm.`] },
    };
  }

  const { data, error } = await supabase.from("projects").delete().eq("id", projectId).select("id");
  if (error) return { status: "error", message: toUserMessage(error, "deleteProject") };
  if (data.length === 0) return { status: "error", message: "You don't have permission to do that." };

  const workspace = (await listMyWorkspaces()).find((candidate) => candidate.id === project.workspace_id);
  refreshWorkspace();
  redirect(workspace ? `/w/${workspace.slug}` : "/dashboard");
}

export async function setProjectMember(projectId: string, userId: string, isMember: boolean): Promise<ActionResult> {
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(userId).success) return NO_PERMISSION;
  if (!(await hasProjectAccess(projectId, "manage"))) return NO_PERMISSION;

  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", projectId).single();
  if (!project) return NO_PERMISSION;

  const { error } = isMember
    ? await supabase
        .from("project_members")
        .upsert(
          { project_id: projectId, workspace_id: project.workspace_id, user_id: userId },
          { onConflict: "project_id,user_id", ignoreDuplicates: true },
        )
    : await supabase.from("project_members").delete().eq("project_id", projectId).eq("user_id", userId);
  if (error) return { ok: false, message: toUserMessage(error, "setProjectMember") };

  refreshWorkspace();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Board columns
// ---------------------------------------------------------------------------

export async function createColumn(projectId: string, name: string): Promise<ActionResult> {
  const parsedName = columnNameSchema.safeParse(name);
  if (!parsedName.success) return { ok: false, message: parsedName.error.issues[0]?.message ?? "Enter a name." };
  if (!idSchema.safeParse(projectId).success || !(await hasProjectAccess(projectId, "edit"))) return NO_PERMISSION;

  const supabase = await createClient();
  const [{ data: project }, { data: last }] = await Promise.all([
    supabase.from("projects").select("workspace_id").eq("id", projectId).single(),
    supabase
      .from("board_columns")
      .select("position")
      .eq("project_id", projectId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!project) return NO_PERMISSION;

  const { error } = await supabase.from("board_columns").insert({
    workspace_id: project.workspace_id,
    project_id: projectId,
    name: parsedName.data,
    position: (last?.position ?? 0) + 1000,
  });
  if (error) return { ok: false, message: toUserMessage(error, "createColumn") };

  refreshWorkspace();
  return { ok: true };
}

export async function updateColumn(
  columnId: string,
  changes: { name: string; isDone: boolean },
): Promise<ActionResult> {
  const parsedName = columnNameSchema.safeParse(changes.name);
  if (!parsedName.success) return { ok: false, message: parsedName.error.issues[0]?.message ?? "Enter a name." };
  if (!idSchema.safeParse(columnId).success) return NO_PERMISSION;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("board_columns")
    .update({ name: parsedName.data, is_done: changes.isDone })
    .eq("id", columnId)
    .select("id");
  if (error) return { ok: false, message: toUserMessage(error, "updateColumn") };
  if (data.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

/** Moves a column to `targetIndex` among its project's columns. */
export async function moveColumn(columnId: string, targetIndex: number): Promise<ActionResult> {
  if (!idSchema.safeParse(columnId).success || !Number.isInteger(targetIndex)) return NO_PERMISSION;

  const supabase = await createClient();
  const { data: column } = await supabase.from("board_columns").select("project_id").eq("id", columnId).maybeSingle();
  if (!column) return { ok: false, message: "That column no longer exists." };

  const { data: columns, error: listError } = await supabase
    .from("board_columns")
    .select("id, position")
    .eq("project_id", column.project_id)
    .order("position");
  if (listError) return { ok: false, message: toUserMessage(listError, "moveColumn") };

  const { position, rebalance } = positionForIndex(columns, columnId, targetIndex);
  if (rebalance) {
    await rebalanceColumns(column.project_id, columns.map((item) => item.id), columnId, targetIndex);
  } else {
    const { data, error } = await supabase.from("board_columns").update({ position }).eq("id", columnId).select("id");
    if (error) return { ok: false, message: toUserMessage(error, "moveColumn") };
    if (data.length === 0) return NO_PERMISSION;
  }

  refreshWorkspace();
  return { ok: true };
}

// Renumbers every column evenly, with the moved one at its new index.
async function rebalanceColumns(projectId: string, orderedIds: string[], movedId: string, targetIndex: number) {
  const supabase = await createClient();
  const ids = orderedIds.filter((id) => id !== movedId);
  ids.splice(targetIndex, 0, movedId);
  const positions = evenPositions(ids.length);
  await Promise.all(
    ids.map((id, index) =>
      supabase.from("board_columns").update({ position: positions[index] }).eq("id", id).eq("project_id", projectId),
    ),
  );
}

/**
 * Deletes a column after moving all of its tasks (including archived and
 * deleted ones, which still reference it) into another column.
 */
export async function deleteColumn(columnId: string, destinationColumnId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(columnId).success || !idSchema.safeParse(destinationColumnId).success) return NO_PERMISSION;
  if (columnId === destinationColumnId) return { ok: false, message: "Choose a different column for the tasks." };

  const supabase = await createClient();
  const { data: columns } = await supabase
    .from("board_columns")
    .select("id, project_id")
    .in("id", [columnId, destinationColumnId]);
  const source = columns?.find((column) => column.id === columnId);
  const destination = columns?.find((column) => column.id === destinationColumnId);
  if (!source || !destination || source.project_id !== destination.project_id) {
    return { ok: false, message: "That column no longer exists." };
  }
  if (!(await hasProjectAccess(source.project_id, "edit"))) return NO_PERMISSION;

  // Moved tasks go to the end of the destination column, keeping their order.
  const [{ data: moving }, { data: last }] = await Promise.all([
    supabase.from("tasks").select("id").eq("column_id", columnId).order("position"),
    supabase
      .from("tasks")
      .select("position")
      .eq("column_id", destinationColumnId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const start = last?.position ?? 0;
  for (const [index, task] of (moving ?? []).entries()) {
    const { error } = await supabase
      .from("tasks")
      .update({ column_id: destinationColumnId, position: start + (index + 1) * 1000 })
      .eq("id", task.id);
    if (error) return { ok: false, message: toUserMessage(error, "deleteColumn") };
  }

  const { data, error } = await supabase.from("board_columns").delete().eq("id", columnId).select("id");
  if (error) return { ok: false, message: toUserMessage(error, "deleteColumn") };
  if (data.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Labels (workspace-wide)
// ---------------------------------------------------------------------------

export async function createLabel(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = { name: textField(formData, "name"), color: textField(formData, "color") };
  const parsed = labelSchema.safeParse(values);
  if (!parsed.success) return validationError(parsed.error, values);

  const workspace = await workspaceFromForm(formData);
  if (!workspace || workspace.role === "viewer") {
    return { status: "error", message: "You don't have permission to manage labels.", values };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("labels")
    .insert({ workspace_id: workspace.id, name: parsed.data.name, color: parsed.data.color });
  if (error) {
    const message = error.code === "23505" ? "A label with that name already exists." : toUserMessage(error, "createLabel");
    return { status: "error", message, values };
  }

  refreshWorkspace();
  return { status: "success", message: "Label added." };
}

export async function deleteLabel(workspaceId: string, labelId: string): Promise<ActionResult> {
  const workspace = (await listMyWorkspaces()).find((candidate) => candidate.id === workspaceId);
  if (!workspace || !idSchema.safeParse(labelId).success || workspace.role === "viewer") return NO_PERMISSION;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("labels")
    .delete()
    .eq("id", labelId)
    .eq("workspace_id", workspace.id)
    .select("id");
  if (error) return { ok: false, message: toUserMessage(error, "deleteLabel") };
  if (data.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

