"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { attachmentPathsIn, removeStoredAttachments } from "@/lib/attachment-files";
import { asCurrentUser, attemptAsCurrentUser } from "@/lib/db";
import { toUserMessage } from "@/lib/db-errors";
import { textField, validationError, type FormState } from "@/lib/form-state";
import { evenPositions, positionForIndex } from "@/lib/ordering";
import { hasProjectAccess, NO_PERMISSION, type ActionResult } from "@/lib/project-access";
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

  const result = await attemptAsCurrentUser((db) =>
    db.query<{ id: string }>(
      `update public.projects set name = $2, description = $3, visibility = $4, color = $5, status = $6,
         start_date = $7, target_date = $8, owner_id = $9
       where id = $1 returning id`,
      [
        projectId,
        parsed.data.name,
        parsed.data.description,
        parsed.data.visibility,
        parsed.data.color,
        parsed.data.status,
        parsed.data.startDate,
        parsed.data.targetDate,
        parsed.data.ownerId,
      ],
    ),
  );

  if (!result.ok) {
    // 23503 here means the chosen owner isn't (or is no longer) a workspace member.
    const message =
      result.error.code === "23503" ? "The owner must be a member of this workspace." : toUserMessage(result.error, "updateProject");
    return { status: "error", message, values };
  }
  if (result.value.length === 0) {
    return { status: "error", message: "You don't have permission to do that.", values };
  }

  refreshWorkspace();
  return { status: "success", message: "Project saved." };
}

export async function setProjectArchived(projectId: string, archived: boolean): Promise<ActionResult> {
  if (!idSchema.safeParse(projectId).success || !(await hasProjectAccess(projectId, "manage"))) {
    return NO_PERMISSION;
  }

  const result = await attemptAsCurrentUser((db) =>
    db.query<{ id: string }>(
      "update public.projects set archived_at = case when $2 then now() else null end where id = $1 returning id",
      [projectId, archived],
    ),
  );
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "setProjectArchived") };
  if (result.value.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

export async function deleteProject(_previous: FormState, formData: FormData): Promise<FormState> {
  const projectId = textField(formData, "projectId");
  if (!idSchema.safeParse(projectId).success || !(await hasProjectAccess(projectId, "manage"))) {
    return { status: "error", message: "You don't have permission to do that." };
  }

  const [project] = await asCurrentUser((db) =>
    db.query<{ name: string; workspace_id: string }>("select name, workspace_id from public.projects where id = $1", [projectId]),
  );
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

  // Note the files first: deleting the project removes their records.
  const filePaths = await attachmentPathsIn({ projectId });
  const result = await attemptAsCurrentUser((db) =>
    db.query<{ id: string }>("delete from public.projects where id = $1 returning id", [projectId]),
  );
  if (!result.ok) return { status: "error", message: toUserMessage(result.error, "deleteProject") };
  if (result.value.length === 0) return { status: "error", message: "You don't have permission to do that." };
  await removeStoredAttachments(filePaths);

  const workspace = (await listMyWorkspaces()).find((candidate) => candidate.id === project.workspace_id);
  refreshWorkspace();
  redirect(workspace ? `/w/${workspace.slug}` : "/dashboard");
}

export async function setProjectMember(projectId: string, userId: string, isMember: boolean): Promise<ActionResult> {
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(userId).success) return NO_PERMISSION;
  if (!(await hasProjectAccess(projectId, "manage"))) return NO_PERMISSION;

  const result = await attemptAsCurrentUser(async (db) => {
    const [project] = await db.query<{ workspace_id: string }>("select workspace_id from public.projects where id = $1", [projectId]);
    if (!project) return false;
    await (isMember
      ? db.query(
          `insert into public.project_members (project_id, workspace_id, user_id) values ($1, $2, $3)
           on conflict (project_id, user_id) do nothing`,
          [projectId, project.workspace_id, userId],
        )
      : db.query("delete from public.project_members where project_id = $1 and user_id = $2", [projectId, userId]));
    return true;
  });
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "setProjectMember") };
  if (!result.value) return NO_PERMISSION;

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

  const result = await attemptAsCurrentUser(async (db) => {
    const [project] = await db.query<{ workspace_id: string }>("select workspace_id from public.projects where id = $1", [projectId]);
    if (!project) return false;
    const [last] = await db.query<{ position: number }>(
      "select position from public.board_columns where project_id = $1 order by position desc limit 1",
      [projectId],
    );
    await db.query("insert into public.board_columns (workspace_id, project_id, name, position) values ($1, $2, $3, $4)", [
      project.workspace_id,
      projectId,
      parsedName.data,
      (last?.position ?? 0) + 1000,
    ]);
    return true;
  });
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "createColumn") };
  if (!result.value) return NO_PERMISSION;

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

  const result = await attemptAsCurrentUser((db) =>
    db.query<{ id: string }>("update public.board_columns set name = $2, is_done = $3 where id = $1 returning id", [
      columnId,
      parsedName.data,
      changes.isDone,
    ]),
  );
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "updateColumn") };
  if (result.value.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

/** Moves a column to `targetIndex` among its project's columns, renumbering them all if they've got crowded. */
export async function moveColumn(columnId: string, targetIndex: number): Promise<ActionResult> {
  if (!idSchema.safeParse(columnId).success || !Number.isInteger(targetIndex)) return NO_PERMISSION;

  const result = await attemptAsCurrentUser(async (db) => {
    const [column] = await db.query<{ project_id: string }>("select project_id from public.board_columns where id = $1", [columnId]);
    if (!column) return "missing" as const;
    const columns = await db.query<{ id: string; position: number }>(
      "select id, position from public.board_columns where project_id = $1 order by position",
      [column.project_id],
    );

    const { position, rebalance } = positionForIndex(columns, columnId, targetIndex);
    if (!rebalance) {
      const updated = await db.query("update public.board_columns set position = $2 where id = $1 returning id", [columnId, position]);
      return updated.length === 0 ? ("denied" as const) : ("moved" as const);
    }

    const orderedIds = columns.map((item) => item.id).filter((id) => id !== columnId);
    orderedIds.splice(targetIndex, 0, columnId);
    const positions = evenPositions(orderedIds.length);
    for (const [index, id] of orderedIds.entries()) {
      await db.query("update public.board_columns set position = $2 where id = $1 and project_id = $3", [id, positions[index], column.project_id]);
    }
    return "moved" as const;
  });
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "moveColumn") };
  if (result.value === "missing") return { ok: false, message: "That column no longer exists." };
  if (result.value === "denied") return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

/**
 * Deletes a column after moving all of its tasks (including archived and
 * deleted ones, which still reference it) into another column. One
 * transaction, so tasks are never left pointing at a deleted column.
 */
export async function deleteColumn(columnId: string, destinationColumnId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(columnId).success || !idSchema.safeParse(destinationColumnId).success) return NO_PERMISSION;
  if (columnId === destinationColumnId) return { ok: false, message: "Choose a different column for the tasks." };

  const columns = await asCurrentUser((db) =>
    db.query<{ id: string; project_id: string }>("select id, project_id from public.board_columns where id = any($1::uuid[])", [
      [columnId, destinationColumnId],
    ]),
  );
  const source = columns.find((column) => column.id === columnId);
  const destination = columns.find((column) => column.id === destinationColumnId);
  if (!source || !destination || source.project_id !== destination.project_id) {
    return { ok: false, message: "That column no longer exists." };
  }
  if (!(await hasProjectAccess(source.project_id, "edit"))) return NO_PERMISSION;

  const result = await attemptAsCurrentUser(async (db) => {
    // Moved tasks go to the end of the destination column, keeping their order.
    const moving = await db.query<{ id: string }>("select id from public.tasks where column_id = $1 order by position", [columnId]);
    const [last] = await db.query<{ position: number }>(
      "select position from public.tasks where column_id = $1 order by position desc limit 1",
      [destinationColumnId],
    );
    const start = last?.position ?? 0;
    for (const [index, task] of moving.entries()) {
      await db.query("update public.tasks set column_id = $2, position = $3 where id = $1", [task.id, destinationColumnId, start + (index + 1) * 1000]);
    }
    return db.query<{ id: string }>("delete from public.board_columns where id = $1 returning id", [columnId]);
  });
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "deleteColumn") };
  if (result.value.length === 0) return NO_PERMISSION;

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

  const result = await attemptAsCurrentUser((db) =>
    db.query("insert into public.labels (workspace_id, name, color) values ($1, $2, $3)", [workspace.id, parsed.data.name, parsed.data.color]),
  );
  if (!result.ok) {
    const message = result.error.code === "23505" ? "A label with that name already exists." : toUserMessage(result.error, "createLabel");
    return { status: "error", message, values };
  }

  refreshWorkspace();
  return { status: "success", message: "Label added." };
}

export async function deleteLabel(workspaceId: string, labelId: string): Promise<ActionResult> {
  const workspace = (await listMyWorkspaces()).find((candidate) => candidate.id === workspaceId);
  if (!workspace || !idSchema.safeParse(labelId).success || workspace.role === "viewer") return NO_PERMISSION;

  const result = await attemptAsCurrentUser((db) =>
    db.query<{ id: string }>("delete from public.labels where id = $1 and workspace_id = $2 returning id", [labelId, workspace.id]),
  );
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "deleteLabel") };
  if (result.value.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}
