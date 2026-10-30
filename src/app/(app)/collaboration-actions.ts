"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { asCurrentUser, attemptAsCurrentUser, type Db } from "@/lib/db";
import { toUserMessage } from "@/lib/db-errors";
import { deleteFiles, saveFile } from "@/lib/file-storage";
import { ATTACHMENT_MAX_BYTES, detectAttachmentType, safeFileName } from "@/lib/file-type";
import { extractMentionIds, stripDisallowedMentions } from "@/lib/mentions";
import { hasProjectAccess, NO_PERMISSION, type ActionResult } from "@/lib/project-access";
import { getProjectForUser, listAssignablePeople } from "@/lib/projects";

const idSchema = z.uuid();
const commentBodySchema = z.string().trim().min(1, "Write a comment first.").max(5000, "Keep comments under 5,000 characters.");

function refreshWorkspace() {
  revalidatePath("/w/[slug]", "layout");
}

async function loadTask(taskId: string) {
  const [task] = await asCurrentUser((db) =>
    db.query<{ id: string; project_id: string; workspace_id: string }>("select id, project_id, workspace_id from public.tasks where id = $1", [taskId]),
  );
  return task ?? null;
}

async function insertMentions(db: Db, commentId: string, projectId: string, workspaceId: string, userIds: string[]) {
  for (const userId of userIds) {
    await db.query("insert into public.comment_mentions (comment_id, project_id, workspace_id, user_id) values ($1, $2, $3, $4)", [
      commentId,
      projectId,
      workspaceId,
      userId,
    ]);
  }
}

/**
 * Keeps only mentions of people who can see this project (so a private
 * project's comments can't ping outsiders) and returns the cleaned body
 * with the ids that remain.
 */
async function sanitizeMentions(workspaceId: string, projectId: string, body: string) {
  const project = await getProjectForUser(workspaceId, projectId);
  const allowed = new Set((await listAssignablePeople(project)).map((person) => person.id));
  const cleaned = stripDisallowedMentions(body, allowed);
  return { body: cleaned, mentionIds: extractMentionIds(cleaned) };
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function addComment(taskId: string, rawBody: string): Promise<ActionResult> {
  const parsed = commentBodySchema.safeParse(rawBody);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Write a comment first." };
  if (!idSchema.safeParse(taskId).success) return NO_PERMISSION;

  const [user, task] = await Promise.all([requireUser(), loadTask(taskId)]);
  if (!task) return { ok: false, message: "That task no longer exists." };
  if (!(await hasProjectAccess(task.project_id, "edit"))) return NO_PERMISSION;

  const { body, mentionIds } = await sanitizeMentions(task.workspace_id, task.project_id, parsed.data);
  const created = await attemptAsCurrentUser((db) =>
    db.query<{ id: string }>(
      "insert into public.comments (workspace_id, project_id, task_id, author_id, body) values ($1, $2, $3, $4, $5) returning id",
      [task.workspace_id, task.project_id, taskId, user.id, body],
    ),
  );
  if (!created.ok) return { ok: false, message: toUserMessage(created.error, "addComment") };

  if (mentionIds.length > 0) {
    // Saved separately: the comment is already safe, and a failed mention only loses the highlight.
    const mentions = await attemptAsCurrentUser((db) => insertMentions(db, created.value[0].id, task.project_id, task.workspace_id, mentionIds));
    if (!mentions.ok) {
      console.error(JSON.stringify({ level: "error", context: "addComment.mentions", code: mentions.error.code }));
    }
  }

  refreshWorkspace();
  return { ok: true };
}

export async function editComment(commentId: string, rawBody: string): Promise<ActionResult> {
  const parsed = commentBodySchema.safeParse(rawBody);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Write a comment first." };
  if (!idSchema.safeParse(commentId).success) return NO_PERMISSION;

  const [existing] = await asCurrentUser((db) =>
    db.query<{ id: string; project_id: string; workspace_id: string }>("select id, project_id, workspace_id from public.comments where id = $1", [commentId]),
  );
  if (!existing) return { ok: false, message: "That comment no longer exists." };

  const { body, mentionIds } = await sanitizeMentions(existing.workspace_id, existing.project_id, parsed.data);
  // RLS only lets authors edit their own comments; anyone else updates 0 rows.
  // The text and its mention list change together.
  const result = await attemptAsCurrentUser(async (db) => {
    const updated = await db.query("update public.comments set body = $2, edited_at = now() where id = $1 returning id", [commentId, body]);
    if (updated.length === 0) return false;
    await db.query("delete from public.comment_mentions where comment_id = $1", [commentId]);
    await insertMentions(db, commentId, existing.project_id, existing.workspace_id, mentionIds);
    return true;
  });
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "editComment") };
  if (!result.value) return { ok: false, message: "You can only edit your own comments." };

  refreshWorkspace();
  return { ok: true };
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(commentId).success) return NO_PERMISSION;
  const result = await attemptAsCurrentUser((db) => db.query("delete from public.comments where id = $1 returning id", [commentId]));
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "deleteComment") };
  if (result.value.length === 0) return { ok: false, message: "You can only delete your own comments." };

  refreshWorkspace();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export async function uploadAttachment(formData: FormData): Promise<ActionResult> {
  const taskId = formData.get("taskId");
  const file = formData.get("file");
  if (typeof taskId !== "string" || !idSchema.safeParse(taskId).success) return NO_PERMISSION;
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a file to attach." };
  if (file.size > ATTACHMENT_MAX_BYTES) return { ok: false, message: "Files must be 5 MB or smaller." };

  const [user, task] = await Promise.all([requireUser(), loadTask(taskId)]);
  if (!task) return { ok: false, message: "That task no longer exists." };
  if (!(await hasProjectAccess(task.project_id, "edit"))) return NO_PERMISSION;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileName = safeFileName(file.name);
  const contentType = detectAttachmentType(bytes, fileName);
  if (!contentType) {
    return { ok: false, message: "That file type isn't allowed. Attach images, PDFs, text, CSV, or Office documents." };
  }

  // The random id keeps two files with the same name from overwriting each other.
  const storagePath = `${task.workspace_id}/${task.project_id}/${task.id}/${crypto.randomUUID()}-${fileName}`;

  // The record goes in first, inside a transaction: if the workspace is over
  // its storage quota the insert fails and nothing is uploaded. The file is
  // saved before the transaction commits, so a failed upload leaves no record.
  const result = await attemptAsCurrentUser(async (db) => {
    await db.query(
      `insert into public.attachments (workspace_id, project_id, task_id, uploaded_by, file_name, storage_path, content_type, size_bytes)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [task.workspace_id, task.project_id, task.id, user.id, fileName, storagePath, contentType, bytes.length],
    );
    await saveFile("attachments", storagePath, bytes, contentType);
  });
  if (!result.ok) {
    // Database refusals (like the quota) have a code; a storage failure doesn't.
    if (!result.error.code) {
      console.error(JSON.stringify({ level: "error", context: "uploadAttachment", message: result.error.message }));
      return { ok: false, message: "The upload failed. Please try again." };
    }
    return { ok: false, message: toUserMessage(result.error, "uploadAttachment") };
  }

  refreshWorkspace();
  return { ok: true };
}

export async function deleteAttachment(attachmentId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(attachmentId).success) return NO_PERMISSION;

  // RLS lets only the uploader or a project manager delete the record.
  const result = await attemptAsCurrentUser((db) =>
    db.query<{ storage_path: string }>("delete from public.attachments where id = $1 returning storage_path", [attachmentId]),
  );
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "deleteAttachment") };
  if (result.value.length === 0) return { ok: false, message: "Only the person who uploaded a file, or a project manager, can delete it." };

  await deleteFiles(
    "attachments",
    result.value.map((row) => row.storage_path),
  ).catch((error: unknown) => {
    // The record is gone, so the file is unreachable; log and move on.
    console.error(JSON.stringify({ level: "error", context: "deleteAttachment", message: error instanceof Error ? error.message : String(error) }));
  });
  refreshWorkspace();
  return { ok: true };
}
