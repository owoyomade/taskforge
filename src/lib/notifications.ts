import "server-only";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaceMembers } from "@/lib/workspaces";

export type NotificationKind = "assigned" | "mentioned" | "commented";

export type NotificationView = {
  id: string;
  kind: NotificationKind;
  actorName: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  taskId: string;
  createdAt: string;
  isRead: boolean;
};

export type NotificationPreferences = Record<NotificationKind, boolean>;

/** Unread notifications for the sidebar badge (RLS limits it to the signed-in user). */
export async function countUnreadNotifications(workspaceId: string): Promise<number> {
  const user = await requireUser();
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("recipient_id", user.id)
    .is("read_at", null);
  return count ?? 0;
}

export async function listNotifications(
  workspaceId: string,
  { unreadOnly = false } = {},
): Promise<NotificationView[]> {
  const user = await requireUser();
  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("id, type, actor_id, task_title, project_id, task_id, created_at, read_at")
    .eq("workspace_id", workspaceId)
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (unreadOnly) query = query.is("read_at", null);

  const [{ data, error }, members, { data: projects }] = await Promise.all([
    query,
    listWorkspaceMembers(workspaceId),
    supabase.from("projects").select("id, name").eq("workspace_id", workspaceId),
  ]);
  if (error) {
    throw new Error("Could not load notifications.");
  }

  const names = new Map(members.map((member) => [member.userId, member.fullName || member.email]));
  const projectNames = new Map((projects ?? []).map((project) => [project.id, project.name]));

  return data.map((row) => ({
    id: row.id,
    kind: row.type,
    actorName: (row.actor_id && names.get(row.actor_id)) || "Someone",
    taskTitle: row.task_title,
    projectId: row.project_id,
    projectName: projectNames.get(row.project_id) ?? "",
    taskId: row.task_id,
    createdAt: row.created_at,
    isRead: row.read_at !== null,
  }));
}

/** The user's choices, defaulting to "on" for anything they haven't set. */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification_preferences")
    .select("assigned, mentioned, commented")
    .eq("user_id", user.id)
    .maybeSingle();
  return { assigned: data?.assigned ?? true, mentioned: data?.mentioned ?? true, commented: data?.commented ?? true };
}
