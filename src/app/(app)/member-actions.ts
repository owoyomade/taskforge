"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { toUserMessage } from "@/lib/db-errors";
import { publicEnv } from "@/lib/env";
import { textField, validationError, type FormState } from "@/lib/form-state";
import { can, grantableRoles, INVITABLE_ROLES } from "@/lib/permissions";
import { NO_PERMISSION, type ActionResult } from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";
import { listMyWorkspaces } from "@/lib/workspaces";

const idSchema = z.uuid();
const roleSchema = z.enum(["owner", "admin", "member", "viewer"]);

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address.")),
  role: z.enum(INVITABLE_ROLES),
});

/** The invite form's result: on success it carries the link to share. */
export type InviteState = FormState | { status: "invited"; message: string; link: string };

function refreshWorkspace() {
  revalidatePath("/w/[slug]", "layout");
}

async function myRoleIn(workspaceId: string) {
  return (await listMyWorkspaces()).find((workspace) => workspace.id === workspaceId);
}

export async function inviteMember(_previous: InviteState, formData: FormData): Promise<InviteState> {
  const values = { email: textField(formData, "email"), role: textField(formData, "role") };
  const parsed = inviteSchema.safeParse(values);
  if (!parsed.success) return validationError(parsed.error, values);

  const workspace = await myRoleIn(textField(formData, "workspaceId"));
  if (!workspace || (workspace.role !== "owner" && workspace.role !== "admin")) {
    return { status: "error", message: "Only owners and admins can invite people.", values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invitation", {
    target_workspace: workspace.id,
    invite_email: parsed.data.email,
    invite_role: parsed.data.role,
  });
  const created = data?.[0];
  if (error || !created) {
    return { status: "error", message: error ? toUserMessage(error, "inviteMember") : "Could not create the invitation.", values };
  }

  refreshWorkspace();
  return {
    status: "invited",
    message: `Invitation created for ${parsed.data.email}. Send them this link; it works for 7 days and only for that email address.`,
    link: `${publicEnv.NEXT_PUBLIC_SITE_URL}/invite/${created.token}`,
  };
}

export async function revokeInvitation(workspaceId: string, invitationId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(invitationId).success) return NO_PERMISSION;
  const workspace = await myRoleIn(workspaceId);
  if (!workspace) return NO_PERMISSION;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("workspace_id", workspace.id)
    .select("id");
  if (error) return { ok: false, message: toUserMessage(error, "revokeInvitation") };
  if (data.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

export async function respondToInvitation(
  invitationId: string,
  accept: boolean,
): Promise<ActionResult & { slug?: string }> {
  await requireUser();
  if (!idSchema.safeParse(invitationId).success) return { ok: false, message: "That invitation doesn't exist." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_to_invitation", { target_invitation: invitationId, accept });
  if (error) return { ok: false, message: toUserMessage(error, "respondToInvitation") };

  revalidatePath("/", "layout");
  return { ok: true, slug: data ?? undefined };
}

export async function changeMemberRole(workspaceId: string, userId: string, role: string): Promise<ActionResult> {
  const parsedRole = roleSchema.safeParse(role);
  if (!parsedRole.success || !idSchema.safeParse(userId).success) return NO_PERMISSION;

  const [user, workspace] = await Promise.all([requireUser(), myRoleIn(workspaceId)]);
  if (!workspace || userId === user.id) return NO_PERMISSION;
  if (!grantableRoles(workspace.role).includes(parsedRole.data)) return NO_PERMISSION;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .update({ role: parsedRole.data })
    .eq("workspace_id", workspace.id)
    .eq("user_id", userId)
    .select("user_id");
  // Rules like "only owners change owners" come back as TF001 with a readable message.
  if (error) return { ok: false, message: toUserMessage(error, "changeMemberRole") };
  if (data.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

export async function removeMember(workspaceId: string, userId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(userId).success) return NO_PERMISSION;
  const [user, workspace] = await Promise.all([requireUser(), myRoleIn(workspaceId)]);
  // Whether this particular member may be removed (e.g. admins can't remove
  // owners) is decided by the database trigger, which explains any refusal.
  if (!workspace || userId === user.id || !can(workspace.role, "manageMembers")) return NO_PERMISSION;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspace.id)
    .eq("user_id", userId)
    .select("user_id");
  if (error) return { ok: false, message: toUserMessage(error, "removeMember") };
  if (data.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

export async function leaveWorkspace(workspaceId: string): Promise<ActionResult> {
  const [user, workspace] = await Promise.all([requireUser(), myRoleIn(workspaceId)]);
  if (!workspace) return NO_PERMISSION;

  const supabase = await createClient();
  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspace.id)
    .eq("user_id", user.id);
  // The last owner gets the database's "make someone else an owner first" message.
  if (error) return { ok: false, message: toUserMessage(error, "leaveWorkspace") };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function transferOwnership(_previous: FormState, formData: FormData): Promise<FormState> {
  const newOwnerId = textField(formData, "newOwnerId");
  if (!idSchema.safeParse(newOwnerId).success) {
    return { status: "error", message: "Choose who should become the owner.", fieldErrors: { newOwnerId: ["Choose a member."] } };
  }

  const workspace = await myRoleIn(textField(formData, "workspaceId"));
  if (!workspace || workspace.role !== "owner") {
    return { status: "error", message: "Only an owner can transfer ownership." };
  }
  if (textField(formData, "confirmName").trim() !== workspace.name) {
    return {
      status: "error",
      message: "The name you typed doesn't match.",
      fieldErrors: { confirmName: [`Type ${workspace.name} to confirm.`] },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_ownership", { target_workspace: workspace.id, new_owner: newOwnerId });
  if (error) return { status: "error", message: toUserMessage(error, "transferOwnership") };

  refreshWorkspace();
  return { status: "success", message: "Ownership transferred. You're now an admin." };
}
