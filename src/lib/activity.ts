import "server-only";

import { describeActivity } from "@/lib/activity-text";
import { asCurrentUser } from "@/lib/db";
import { listWorkspaceMembers } from "@/lib/workspaces";

export type ActivityItem = {
  id: number;
  actorName: string;
  sentence: string;
  eventType: string;
  projectId: string | null;
  taskId: string | null;
  createdAt: string;
};

/**
 * Recent history, newest first, already turned into sentences. RLS decides
 * which events come back: owners and admins see everything, others only
 * the projects they can see.
 */
export async function listActivity(
  workspaceId: string,
  { projectId, limit = 50 }: { projectId?: string; limit?: number } = {},
): Promise<ActivityItem[]> {
  const [data, members] = await Promise.all([
    asCurrentUser((db) =>
      db.query<{
        id: number;
        actor_id: string | null;
        event_type: string;
        summary: Record<string, unknown> | null;
        project_id: string | null;
        task_id: string | null;
        created_at: string;
      }>(
        `select id, actor_id, event_type, summary, project_id, task_id, created_at
         from public.audit_events
         where workspace_id = $1 and ($2::uuid is null or project_id = $2)
         order by created_at desc limit $3`,
        [workspaceId, projectId ?? null, limit],
      ),
    ),
    listWorkspaceMembers(workspaceId),
  ]);

  const names = new Map(members.map((member) => [member.userId, member.fullName || member.email]));
  const nameOf = (id: string) => names.get(id) ?? "a former member";

  return data.map((row) => {
    const summary = row.summary && typeof row.summary === "object" && !Array.isArray(row.summary) ? row.summary : {};
    return {
      id: row.id,
      actorName: row.actor_id ? nameOf(row.actor_id) : "Taskforge",
      sentence: describeActivity({ eventType: row.event_type, actorId: row.actor_id, summary }, nameOf),
      eventType: row.event_type,
      projectId: row.project_id,
      taskId: row.task_id,
      createdAt: row.created_at,
    };
  });
}
