"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { toUserMessage } from "@/lib/db-errors";
import { ATTACHMENT_MAX_BYTES, detectAttachmentType, safeFileName } from "@/lib/file-type";
import { extractMentionIds, stripDisallowedMentions } from "@/lib/mentions";
import { hasProjectAccess, NO_PERMISSION, type ActionResult } from "@/lib/project-access";
import { getProjectForUser, listAssignablePeople } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.uuid();
const commentBodySchema = z.string().trim().min(1, "Write a comment first.").max(5000, "Keep comments under 5,000 characters.");

function refreshWorkspace() {
  revalidatePath("/w/[slug]", "layout");
}

async function loadTask(taskId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("id, project_id, workspace_id")
    .eq("id", taskId)
    .maybeSingle();
  return data;
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
  const supabase = await createClient();
  const { data: comment, error } = await supabase
    .from("comments")
    .insert({ workspace_id: task.workspace_id, project_id: task.project_id, task_id: taskId, author_id: user.id, body })
    .select("id")
    .single();
  if (error) return { ok: false, message: toUserMessage(error, "addComment") };

  if (mentionIds.length > 0) {
    const { error: mentionError } = await supabase.from("comment_mentions").insert(
      mentionIds.map((userId) => ({
        comment_id: comment.id,
        project_id: task.project_id,
        workspace_id: task.workspace_id,
        user_id: userId,
      })),
    );
    if (mentionError) {
      // The comment itself saved; a failed mention only loses the highlight.
      console.error(JSON.stringify({ level: "error", context: "addComment.mentions", code: mentionError.code }));
    }
  }

  refreshWorkspace();
  return { ok: true };
}

export async function editComment(commentId: string, rawBody: string): Promise<ActionResult> {
  const parsed = commentBodySchema.safeParse(rawBody);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Write a comment first." };
  if (!idSchema.safeParse(commentId).success) return NO_PERMISSION;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("comments")
    .select("id, project_id, workspace_id")
    .eq("id", commentId)
    .maybeSingle();
  if (!existing) return { ok: false, message: "That comment no longer exists." };

  const { body, mentionIds } = await sanitizeMentions(existing.workspace_id, existing.project_id, parsed.data);
  // RLS only lets authors edit their own comments; anyone else updates 0 rows.
  const { data, error } = await supabase
    .from("comments")
    .update({ body, edited_at: new Date().toISOString() })
    .eq("id", commentId)
    .select("id");
  if (error) return { ok: false, message: toUserMessage(error, "editComment") };
  if (data.length === 0) return { ok: false, message: "You can only edit your own comments." };

  // Replace the mention list to match the edited text.
  await supabase.from("comment_mentions").delete().eq("comment_id", commentId);
  if (mentionIds.length > 0) {
    await supabase.from("comment_mentions").insert(
      mentionIds.map((userId) => ({
        comment_id: commentId,
        project_id: existing.project_id,
        workspace_id: existing.workspace_id,
        user_id: userId,
      })),
    );
  }

  refreshWorkspace();
  return { ok: true };
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(commentId).success) return NO_PERMISSION;
  const supabase = await createClient();
  const { data, error } = await supabase.from("comments").delete().eq("id", commentId).select("id");
  if (error) return { ok: false, message: toUserMessage(error, "deleteComment") };
  if (data.length === 0) return { ok: false, message: "You can only delete your own comments." };

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
  const supabase = await createClient();

  const { error: uploadError } = await supabase.storage
    .from("attachments")
    .upload(storagePath, bytes, { contentType, upsert: false });
  if (uploadError) {
    console.error(JSON.stringify({ level: "error", context: "uploadAttachment", message: uploadError.message }));
    return { ok: false, message: "The upload failed. Please try again." };
  }

  const { error } = await supabase.from("attachments").insert({
    workspace_id: task.workspace_id,
    project_id: task.project_id,
    task_id: task.id,
    uploaded_by: user.id,
    file_name: fileName,
    storage_path: storagePath,
    content_type: contentType,
    size_bytes: bytes.length,
  });
  if (error) {
    // Don't leave a file in storage that nothing points to (e.g. over quota).
    await supabase.storage.from("attachments").remove([storagePath]);
    return { ok: false, message: toUserMessage(error, "uploadAttachment") };
  }

  refreshWorkspace();
  return { ok: true };
}

export async function deleteAttachment(attachmentId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(attachmentId).success) return NO_PERMISSION;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("attachments")
    .delete()
    .eq("id", attachmentId)
    .select("storage_path");
  if (error) return { ok: false, message: toUserMessage(error, "deleteAttachment") };
  if (data.length === 0) return { ok: false, message: "Only the person who uploaded a file, or a project manager, can delete it." };

  await supabase.storage.from("attachments").remove(data.map((row) => row.storage_path));
  refreshWorkspace();
  return { ok: true };
}
