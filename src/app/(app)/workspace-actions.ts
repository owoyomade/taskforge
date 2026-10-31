"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { attachmentPathsIn, removeStoredAttachments } from "@/lib/attachment-files";
import { requireUser } from "@/lib/auth";
import { asDatabaseError, attemptAsCurrentUser, withUser } from "@/lib/db";
import { toUserMessage } from "@/lib/db-errors";
import { DEMO_BLOCKED, isDemoSession } from "@/lib/demo";
import { textField, validationError, type FormState } from "@/lib/form-state";
import { can, type WorkspaceCapability } from "@/lib/permissions";
import { workspaceSlug } from "@/lib/slug";
import { weeklyCapacitySchema, workspaceNameSchema } from "@/lib/validation";
import { listMyWorkspaces } from "@/lib/workspaces";

export async function createWorkspace(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const values = { name: textField(formData, "name") };
  const parsed = workspaceNameSchema.safeParse(values);
  if (!parsed.success) {
    return validationError(parsed.error, values);
  }

  // The random slug suffix makes a collision very unlikely; if one happens
  // anyway (unique violation 23505), one retry with a fresh suffix is enough.
  for (let attempt = 0; attempt < 2; attempt++) {
    const slug = workspaceSlug(parsed.data.name);
    try {
      await withUser(user.id, (db) => db.query("select public.create_workspace($1, $2)", [parsed.data.name, slug]));
    } catch (caught) {
      const error = asDatabaseError(caught);
      if (error.code === "23505") continue;
      return { status: "error", message: toUserMessage(error, "createWorkspace"), values };
    }
    redirect(`/w/${slug}`);
  }

  return { status: "error", message: "Could not create the workspace. Please try again.", values };
}

/**
 * Finds the workspace named by the form's hidden workspaceId among the
 * user's own memberships and checks the role allows the action.
 * This gives a clear message early; RLS enforces the same rule regardless.
 */
async function authorizeWorkspaceAction(formData: FormData, capability: WorkspaceCapability) {
  const workspaceId = textField(formData, "workspaceId");
  const workspace = (await listMyWorkspaces()).find((candidate) => candidate.id === workspaceId);

  if (!workspace) {
    return { ok: false as const, message: "That workspace doesn't exist or you're no longer a member." };
  }
  if (!can(workspace.role, capability)) {
    return { ok: false as const, message: "You don't have permission to do that." };
  }
  return { ok: true as const, workspace };
}

export async function renameWorkspace(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = { name: textField(formData, "name") };
  const parsed = workspaceNameSchema.safeParse(values);
  if (!parsed.success) {
    return validationError(parsed.error, values);
  }

  const auth = await authorizeWorkspaceAction(formData, "renameWorkspace");
  if (!auth.ok) {
    return { status: "error", message: auth.message, values };
  }

  const result = await attemptAsCurrentUser((db) =>
    db.query("update public.workspaces set name = $2 where id = $1 returning id", [auth.workspace.id, parsed.data.name]),
  );
  if (!result.ok) {
    return { status: "error", message: toUserMessage(result.error, "renameWorkspace"), values };
  }
  // RLS turns a forbidden update into "0 rows changed" rather than an error.
  if (result.value.length === 0) {
    return { status: "error", message: "You don't have permission to do that.", values };
  }

  revalidatePath(`/w/${auth.workspace.slug}`, "layout");
  return { status: "success", message: "Workspace renamed." };
}

export async function setWeeklyCapacity(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = { capacity: textField(formData, "capacity") };
  const parsed = weeklyCapacitySchema.safeParse(values);
  if (!parsed.success) {
    return validationError(parsed.error, values);
  }

  const auth = await authorizeWorkspaceAction(formData, "setCapacity");
  if (!auth.ok) {
    return { status: "error", message: auth.message, values };
  }

  const result = await attemptAsCurrentUser((db) =>
    db.query("update public.workspaces set weekly_capacity = $2 where id = $1 returning id", [
      auth.workspace.id,
      parsed.data.capacity,
    ]),
  );
  if (!result.ok) {
    return { status: "error", message: toUserMessage(result.error, "setWeeklyCapacity"), values };
  }
  if (result.value.length === 0) {
    return { status: "error", message: "You don't have permission to do that.", values };
  }

  revalidatePath(`/w/${auth.workspace.slug}`, "layout");
  return { status: "success", message: "Capacity saved." };
}

export async function deleteWorkspace(_previous: FormState, formData: FormData): Promise<FormState> {
  if (await isDemoSession()) return { status: "error", message: DEMO_BLOCKED };
  const auth = await authorizeWorkspaceAction(formData, "deleteWorkspace");
  if (!auth.ok) {
    return { status: "error", message: auth.message };
  }

  // Typing the name is a deliberate speed bump: deleting removes everything
  // in the workspace for every member and can't be undone.
  if (textField(formData, "confirmName").trim() !== auth.workspace.name) {
    return {
      status: "error",
      message: "The name you typed doesn't match.",
      fieldErrors: { confirmName: [`Type ${auth.workspace.name} to confirm.`] },
    };
  }

  // Note the files first: deleting the workspace removes their records.
  // Only owners can delete a workspace, and owners can see every project in it.
  const filePaths = await attachmentPathsIn({ workspaceId: auth.workspace.id });
  const result = await attemptAsCurrentUser((db) =>
    db.query("delete from public.workspaces where id = $1 returning id", [auth.workspace.id]),
  );
  if (!result.ok) {
    return { status: "error", message: toUserMessage(result.error, "deleteWorkspace") };
  }
  if (result.value.length === 0) {
    return { status: "error", message: "You don't have permission to do that." };
  }
  await removeStoredAttachments(filePaths);

  redirect("/dashboard");
}
