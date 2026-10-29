import "server-only";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.rpc("project_access", { target_project: projectId });
  return (data === "view" || data === "edit" || data === "manage") && LEVELS[data] >= LEVELS[needed];
}
