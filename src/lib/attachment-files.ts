import "server-only";

import { createClient } from "@/lib/supabase/server";

// The API returns at most 1,000 rows per request, and Storage removes at
// most 1,000 files per call, so work in pages of that size.
const PAGE_SIZE = 1000;

/**
 * Deletes the stored files for every attachment in a project or workspace
 * that's about to be deleted.
 *
 * Deleting a project removes its attachment *records* automatically
 * (ON DELETE CASCADE), but the database can't reach into Storage, so the
 * files themselves would be left behind, using up the storage quota with
 * nothing pointing at them. This has to run *before* the delete: the
 * storage policies check the project, and once it's gone nobody is
 * allowed to remove its files.
 *
 * Runs as the signed-in user; callers have already checked they manage
 * everything being deleted. Returns false if any file couldn't be removed.
 */
export async function removeAttachmentFiles(scope: { projectId: string } | { workspaceId: string }): Promise<boolean> {
  const supabase = await createClient();
  let succeeded = true;

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from("attachments").select("storage_path");
    query = "projectId" in scope ? query.eq("project_id", scope.projectId) : query.eq("workspace_id", scope.workspaceId);
    const { data, error } = await query.order("storage_path").range(from, from + PAGE_SIZE - 1);
    if (error) return false;
    if (data.length === 0) break;

    const { error: removeError } = await supabase.storage.from("attachments").remove(data.map((row) => row.storage_path));
    if (removeError) {
      succeeded = false;
      console.error(JSON.stringify({ level: "error", context: "removeAttachmentFiles", message: removeError.message }));
    }
    if (data.length < PAGE_SIZE) break;
  }
  return succeeded;
}
