// Mirrors the database's workspace_role enum (checked in db/tests/hardening.test.sql).
export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

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
  setCapacity: ["owner", "admin"],
  deleteWorkspace: ["owner"],
  manageMembers: ["owner", "admin"],
  manageOwners: ["owner"],
} as const satisfies Record<string, readonly WorkspaceRole[]>;

export type WorkspaceCapability = keyof typeof CAPABILITIES;

export function can(role: WorkspaceRole, capability: WorkspaceCapability): boolean {
  return (CAPABILITIES[capability] as readonly WorkspaceRole[]).includes(role);
}

/**
 * Whether `actor` may change or remove a member who currently has `target`.
 * Mirrors the enforce_membership_rules trigger: only owners touch owners.
 */
export function canManageMember(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") return target !== "owner";
  return false;
}

/** The roles `actor` may hand out, most powerful first. */
export function grantableRoles(actor: WorkspaceRole): WorkspaceRole[] {
  if (actor === "owner") return ["owner", "admin", "member", "viewer"];
  if (actor === "admin") return ["admin", "member", "viewer"];
  return [];
}

/** Roles an invitation can carry. Ownership is transferred, never invited. */
export const INVITABLE_ROLES = ["admin", "member", "viewer"] as const satisfies readonly WorkspaceRole[];
