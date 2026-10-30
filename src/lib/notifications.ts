import "server-only";

import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
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
  const [row] = await withUser(user.id, (db) =>
    db.query<{ count: number }>(
      "select count(*) from public.notifications where workspace_id = $1 and recipient_id = $2 and read_at is null",
      [workspaceId, user.id],
    ),
  );
  return row?.count ?? 0;
}

export async function listNotifications(
  workspaceId: string,
  { unreadOnly = false } = {},
): Promise<NotificationView[]> {
  const user = await requireUser();
  const [data, members] = await Promise.all([
    withUser(user.id, (db) =>
      db.query<{
        id: string;
        type: NotificationKind;
        actor_id: string | null;
        task_title: string;
        project_id: string;
        project_name: string;
        task_id: string;
        created_at: string;
        read_at: string | null;
      }>(
        `select n.id, n.type, n.actor_id, n.task_title, n.project_id, p.name as project_name, n.task_id, n.created_at, n.read_at
         from public.notifications n
         join public.projects p on p.id = n.project_id
         where n.workspace_id = $1 and n.recipient_id = $2 and (not $3 or n.read_at is null)
         order by n.created_at desc limit 100`,
        [workspaceId, user.id, unreadOnly],
      ),
    ),
    listWorkspaceMembers(workspaceId),
  ]);

  const names = new Map(members.map((member) => [member.userId, member.fullName || member.email]));

  return data.map((row) => ({
    id: row.id,
    kind: row.type,
    actorName: (row.actor_id && names.get(row.actor_id)) || "Someone",
    taskTitle: row.task_title,
    projectId: row.project_id,
    projectName: row.project_name,
    taskId: row.task_id,
    createdAt: row.created_at,
    isRead: row.read_at !== null,
  }));
}

/** The user's choices, defaulting to "on" for anything they haven't set. */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const user = await requireUser();
  const [data] = await withUser(user.id, (db) =>
    db.query<NotificationPreferences>(
      "select assigned, mentioned, commented from public.notification_preferences where user_id = $1",
      [user.id],
    ),
  );
  return { assigned: data?.assigned ?? true, mentioned: data?.mentioned ?? true, commented: data?.commented ?? true };
}
