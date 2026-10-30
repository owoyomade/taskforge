"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { toUserMessage } from "@/lib/db-errors";
import { publicEnv } from "@/lib/env";
import { attemptAsCurrentUser } from "@/lib/db";
import { DEMO_BLOCKED, isDemoSession } from "@/lib/demo";
import { textField, validationError, type FormState } from "@/lib/form-state";
import { can, grantableRoles, INVITABLE_ROLES } from "@/lib/permissions";
import { NO_PERMISSION, type ActionResult } from "@/lib/project-access";
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
  if (await isDemoSession()) return { status: "error", message: DEMO_BLOCKED };
  const values = { email: textField(formData, "email"), role: textField(formData, "role") };
  const parsed = inviteSchema.safeParse(values);
  if (!parsed.success) return validationError(parsed.error, values);

  const workspace = await myRoleIn(textField(formData, "workspaceId"));
  if (!workspace || (workspace.role !== "owner" && workspace.role !== "admin")) {
    return { status: "error", message: "Only owners and admins can invite people.", values };
  }

  const result = await attemptAsCurrentUser((db) =>
    db.query<{ invitation_id: string; token: string }>("select invitation_id, token from public.create_invitation($1, $2, $3)", [
      workspace.id,
      parsed.data.email,
      parsed.data.role,
    ]),
  );
  const created = result.ok ? result.value[0] : undefined;
  if (!result.ok || !created) {
    return { status: "error", message: result.ok ? "Could not create the invitation." : toUserMessage(result.error, "inviteMember"), values };
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

  const result = await attemptAsCurrentUser((db) =>
    db.query("update public.workspace_invitations set revoked_at = now() where id = $1 and workspace_id = $2 returning id", [
      invitationId,
      workspace.id,
    ]),
  );
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "revokeInvitation") };
  if (result.value.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

export async function respondToInvitation(
  invitationId: string,
  accept: boolean,
): Promise<ActionResult & { slug?: string }> {
  await requireUser();
  if (!idSchema.safeParse(invitationId).success) return { ok: false, message: "That invitation doesn't exist." };

  const result = await attemptAsCurrentUser((db) =>
    db.query<{ slug: string | null }>("select public.respond_to_invitation($1, $2) as slug", [invitationId, accept]),
  );
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "respondToInvitation") };

  revalidatePath("/", "layout");
  return { ok: true, slug: result.value[0]?.slug ?? undefined };
}

export async function changeMemberRole(workspaceId: string, userId: string, role: string): Promise<ActionResult> {
  const parsedRole = roleSchema.safeParse(role);
  if (!parsedRole.success || !idSchema.safeParse(userId).success) return NO_PERMISSION;

  const [user, workspace] = await Promise.all([requireUser(), myRoleIn(workspaceId)]);
  if (!workspace || userId === user.id) return NO_PERMISSION;
  if (!grantableRoles(workspace.role).includes(parsedRole.data)) return NO_PERMISSION;

  const result = await attemptAsCurrentUser((db) =>
    db.query("update public.workspace_members set role = $3 where workspace_id = $1 and user_id = $2 returning user_id", [
      workspace.id,
      userId,
      parsedRole.data,
    ]),
  );
  // Rules like "only owners change owners" come back as TF001 with a readable message.
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "changeMemberRole") };
  if (result.value.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

export async function removeMember(workspaceId: string, userId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(userId).success) return NO_PERMISSION;
  const [user, workspace] = await Promise.all([requireUser(), myRoleIn(workspaceId)]);
  // Whether this particular member may be removed (e.g. admins can't remove
  // owners) is decided by the database trigger, which explains any refusal.
  if (!workspace || userId === user.id || !can(workspace.role, "manageMembers")) return NO_PERMISSION;

  const result = await attemptAsCurrentUser((db) =>
    db.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2 returning user_id", [workspace.id, userId]),
  );
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "removeMember") };
  if (result.value.length === 0) return NO_PERMISSION;

  refreshWorkspace();
  return { ok: true };
}

export async function leaveWorkspace(workspaceId: string): Promise<ActionResult> {
  if (await isDemoSession()) return { ok: false, message: DEMO_BLOCKED };
  const [user, workspace] = await Promise.all([requireUser(), myRoleIn(workspaceId)]);
  if (!workspace) return NO_PERMISSION;

  const result = await attemptAsCurrentUser((db) =>
    db.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [workspace.id, user.id]),
  );
  // The last owner gets the database's "make someone else an owner first" message.
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "leaveWorkspace") };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function transferOwnership(_previous: FormState, formData: FormData): Promise<FormState> {
  if (await isDemoSession()) return { status: "error", message: DEMO_BLOCKED };
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

  const result = await attemptAsCurrentUser((db) => db.query("select public.transfer_ownership($1, $2)", [workspace.id, newOwnerId]));
  if (!result.ok) return { status: "error", message: toUserMessage(result.error, "transferOwnership") };

  refreshWorkspace();
  return { status: "success", message: "Ownership transferred. You're now an admin." };
}
