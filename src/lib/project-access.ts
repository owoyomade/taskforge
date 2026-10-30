import "server-only";

import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";

/** What non-form Server Actions (drag and drop, checkboxes) return to the browser. */
export type ActionResult = { ok: true } | { ok: false; message: string };

export const NO_PERMISSION: ActionResult = { ok: false, message: "You don't have permission to do that." };

const LEVELS = { view: 1, edit: 2, manage: 3 } as const;
type Level = keyof typeof LEVELS;

/**
 * Checks the signed-in user's access to a project before a Server Action
 * writes anything, so the user gets a clear message instead of a vague
 * failure. The database enforces the same rule again through RLS.
 */
export async function hasProjectAccess(projectId: string, needed: Level): Promise<boolean> {
  const user = await requireUser();
  const [row] = await withUser(user.id, (db) =>
    db.query<{ access: string | null }>("select public.project_access($1) as access", [projectId]),
  );
  const access = row?.access;
  return (access === "view" || access === "edit" || access === "manage") && LEVELS[access] >= LEVELS[needed];
}
