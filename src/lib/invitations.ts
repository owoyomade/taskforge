import "server-only";

import type { WorkspaceRole } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_invitations")
    .select("id, email, role, created_at, expires_at, inviter:profiles(full_name, email)")
    .eq("workspace_id", workspaceId)
    .is("accepted_at", null)
    .is("declined_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error("Could not load invitations.");
  }

  const now = Date.now();
  return data.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    invitedBy: row.inviter?.full_name || row.inviter?.email || "Someone",
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    isExpired: Date.parse(row.expires_at) <= now,
  }));
}

/** Open invitations addressed to the signed-in user's verified email. */
export async function listMyInvitations(): Promise<MyInvitation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_invitations");
  if (error) {
    throw new Error("Could not load your invitations.");
  }
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

  const supabase = await createClient();
  const { data } = await supabase.rpc("invitation_preview", { raw_token: token });
  const row = data?.[0];
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
