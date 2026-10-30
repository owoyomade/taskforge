import "server-only";

import { getCurrentUser, requireUser } from "@/lib/auth";
import { asCurrentUser, withUser } from "@/lib/db";
import type { WorkspaceRole } from "@/lib/permissions";

export type OpenInvitation = {
  id: string;
  email: string;
  role: WorkspaceRole;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  isExpired: boolean;
};

export type MyInvitation = {
  id: string;
  workspaceName: string;
  inviterName: string;
  role: WorkspaceRole;
  expiresAt: string;
};

export type InvitationPreview = {
  id: string;
  workspaceName: string;
  inviterName: string;
  role: WorkspaceRole;
  emailHint: string;
  status: "pending" | "accepted" | "declined" | "revoked" | "expired";
};

/** Invitations not yet answered or revoked (owners and admins only, by RLS). */
export async function listOpenInvitations(workspaceId: string): Promise<OpenInvitation[]> {
  const data = await asCurrentUser((db) =>
    db.query<{ id: string; email: string; role: WorkspaceRole; created_at: string; expires_at: string; inviter_name: string | null; inviter_email: string | null }>(
      `select i.id, i.email, i.role, i.created_at, i.expires_at, p.full_name as inviter_name, p.email as inviter_email
       from public.workspace_invitations i
       left join public.profiles p on p.id = i.invited_by
       where i.workspace_id = $1 and i.accepted_at is null and i.declined_at is null and i.revoked_at is null
       order by i.created_at desc`,
      [workspaceId],
    ),
  );

  const now = Date.now();
  return data.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    invitedBy: row.inviter_name || row.inviter_email || "Someone",
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    isExpired: Date.parse(row.expires_at) <= now,
  }));
}

/** Open invitations addressed to the signed-in user's verified email. */
export async function listMyInvitations(): Promise<MyInvitation[]> {
  const user = await requireUser();
  const data = await withUser(user.id, (db) =>
    db.query<{ invitation_id: string; workspace_name: string; inviter_name: string; role: WorkspaceRole; expires_at: string }>(
      "select invitation_id, workspace_name, inviter_name, role, expires_at from public.list_my_invitations()",
    ),
  );
  return data.map((row) => ({
    id: row.invitation_id,
    workspaceName: row.workspace_name,
    inviterName: row.inviter_name,
    role: row.role,
    expiresAt: row.expires_at,
  }));
}

const STATUSES = ["pending", "accepted", "declined", "revoked", "expired"] as const;

/** What an invite link points at, or null for an unknown token. */
export async function getInvitationPreview(token: string): Promise<InvitationPreview | null> {
  // Tokens are 48 hex characters; anything else can't match, so skip the query.
  if (!/^[0-9a-f]{48}$/.test(token)) {
    return null;
  }

  // Only signed-in people can look up an invitation (the invite page asks
  // visitors to sign in first).
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  const [row] = await withUser(user.id, (db) =>
    db.query<{ invitation_id: string; workspace_name: string; inviter_name: string; role: WorkspaceRole; email_hint: string; status: string }>(
      "select invitation_id, workspace_name, inviter_name, role, email_hint, status from public.invitation_preview($1)",
      [token],
    ),
  );
  const status = STATUSES.find((value) => value === row?.status);
  if (!row || !status) {
    return null;
  }

  return {
    id: row.invitation_id,
    workspaceName: row.workspace_name,
    inviterName: row.inviter_name,
    role: row.role,
    emailHint: row.email_hint,
    status,
  };
}
