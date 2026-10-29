"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { removeAttachmentFiles } from "@/lib/attachment-files";
import { requireUser } from "@/lib/auth";
import { toUserMessage } from "@/lib/db-errors";
import { textField, validationError, type FormState } from "@/lib/form-state";
import { can, type WorkspaceCapability } from "@/lib/permissions";
import { workspaceSlug } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";
import { workspaceNameSchema } from "@/lib/validation";
import { listMyWorkspaces } from "@/lib/workspaces";

export async function createWorkspace(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireUser();

  const values = { name: textField(formData, "name") };
  const parsed = workspaceNameSchema.safeParse(values);
  if (!parsed.success) {
    return validationError(parsed.error, values);
  }

  const supabase = await createClient();

  // The random slug suffix makes a collision very unlikely; if one happens
  // anyway (unique violation 23505), one retry with a fresh suffix is enough.
  for (let attempt = 0; attempt < 2; attempt++) {
    const slug = workspaceSlug(parsed.data.name);
    const { error } = await supabase.rpc("create_workspace", {
      workspace_name: parsed.data.name,
      workspace_slug: slug,
    });

    if (!error) {
      redirect(`/w/${slug}`);
    }
    if (error.code !== "23505") {
      return { status: "error", message: toUserMessage(error, "createWorkspace"), values };
    }
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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .update({ name: parsed.data.name })
    .eq("id", auth.workspace.id)
    .select("id");

  if (error) {
    return { status: "error", message: toUserMessage(error, "renameWorkspace"), values };
  }
  // RLS turns a forbidden update into "0 rows changed" rather than an error.
  if (data.length === 0) {
    return { status: "error", message: "You don't have permission to do that.", values };
  }

  revalidatePath(`/w/${auth.workspace.slug}`, "layout");
  return { status: "success", message: "Workspace renamed." };
}

export async function deleteWorkspace(_previous: FormState, formData: FormData): Promise<FormState> {
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

  // Only owners can delete a workspace, and owners manage every project in
  // it, so they're allowed to remove all of its files.
  if (!(await removeAttachmentFiles({ workspaceId: auth.workspace.id }))) {
    return { status: "error", message: "Some attached files couldn't be deleted, so the workspace was kept. Try again." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("workspaces").delete().eq("id", auth.workspace.id).select("id");

  if (error) {
    return { status: "error", message: toUserMessage(error, "deleteWorkspace") };
  }
  if (data.length === 0) {
    return { status: "error", message: "You don't have permission to do that." };
  }

  redirect("/dashboard");
}
