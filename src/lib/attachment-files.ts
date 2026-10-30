import "server-only";

import { asCurrentUser } from "@/lib/db";
import { deleteFiles } from "@/lib/file-storage";

/**
 * Deleting a project or workspace removes its attachment *records*
 * automatically (ON DELETE CASCADE), but the files live outside the
 * database. So the caller notes the file paths first, deletes the project
 * or workspace, and only then removes the files: if the delete fails,
 * nothing is lost.
 */
export async function attachmentPathsIn(scope: { projectId: string } | { workspaceId: string }): Promise<string[]> {
  const rows = await asCurrentUser((db) =>
    "projectId" in scope
      ? db.query<{ storage_path: string }>("select storage_path from public.attachments where project_id = $1", [scope.projectId])
      : db.query<{ storage_path: string }>("select storage_path from public.attachments where workspace_id = $1", [scope.workspaceId]),
  );
  return rows.map((row) => row.storage_path);
}

// Vercel Blob deletes at most 1,000 files per call.
const BATCH_SIZE = 1000;

/** Removes stored files after their records are gone. Failures are logged; the records are already deleted. */
export async function removeStoredAttachments(paths: string[]): Promise<void> {
  for (let start = 0; start < paths.length; start += BATCH_SIZE) {
    try {
      await deleteFiles("attachments", paths.slice(start, start + BATCH_SIZE));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ level: "error", context: "removeStoredAttachments", message }));
    }
  }
}
