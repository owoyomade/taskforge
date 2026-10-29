import type { Enums } from "@/lib/supabase/database.types";

export type WorkspaceRole = Enums<"workspace_role">;

export const WORKSPACE_ROLES: readonly WorkspaceRole[] = ["owner", "admin", "member", "viewer"];

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

/**
 * What each role may do in a workspace.
 *
 * This mirrors the database policies so the UI can hide controls a user
 * can't use and server actions can fail early with a clear message. It is
 * NOT the security boundary: RLS in the database enforces the same rules
 * even if this file is wrong or bypassed.
 */
const CAPABILITIES = {
  renameWorkspace: ["owner", "admin"],
  deleteWorkspace: ["owner"],
  manageMembers: ["owner", "admin"],
  manageOwners: ["owner"],
} as const satisfies Record<string, readonly WorkspaceRole[]>;

export type WorkspaceCapability = keyof typeof CAPABILITIES;

export function can(role: WorkspaceRole, capability: WorkspaceCapability): boolean {
  return (CAPABILITIES[capability] as readonly WorkspaceRole[]).includes(role);
}
