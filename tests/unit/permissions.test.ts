import { describe, expect, it } from "vitest";

import {
  can,
  canManageMember,
  grantableRoles,
  WORKSPACE_ROLES,
  type WorkspaceCapability,
  type WorkspaceRole,
} from "@/lib/permissions";

// The expected matrix, written out by hand so a change to permissions.ts has
// to be made deliberately in two places. It must also match the RLS policies.
const EXPECTED: Record<WorkspaceCapability, WorkspaceRole[]> = {
  renameWorkspace: ["owner", "admin"],
  deleteWorkspace: ["owner"],
  manageMembers: ["owner", "admin"],
  manageOwners: ["owner"],
};

describe("workspace permissions", () => {
  for (const [capability, allowed] of Object.entries(EXPECTED) as [WorkspaceCapability, WorkspaceRole[]][]) {
    it.each(WORKSPACE_ROLES)(`${capability}: %s`, (role) => {
      expect(can(role, capability)).toBe(allowed.includes(role));
    });
  }

  it("never lets a viewer change anything", () => {
    for (const capability of Object.keys(EXPECTED) as WorkspaceCapability[]) {
      expect(can("viewer", capability)).toBe(false);
    }
  });
});

describe("member management", () => {
  it("lets owners manage anyone and admins manage everyone except owners", () => {
    expect(canManageMember("owner", "owner")).toBe(true);
    expect(canManageMember("admin", "owner")).toBe(false);
    expect(canManageMember("admin", "admin")).toBe(true);
    expect(canManageMember("member", "viewer")).toBe(false);
  });

  it("only lets owners grant the owner role", () => {
    expect(grantableRoles("owner")).toContain("owner");
    expect(grantableRoles("admin")).toEqual(["admin", "member", "viewer"]);
    expect(grantableRoles("viewer")).toEqual([]);
  });
});
