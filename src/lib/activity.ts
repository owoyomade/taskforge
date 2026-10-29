import "server-only";

import { describeActivity } from "@/lib/activity-text";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();
  let query = supabase
    .from("audit_events")
    .select("id, actor_id, event_type, summary, project_id, task_id, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (projectId) query = query.eq("project_id", projectId);

  const [{ data, error }, members] = await Promise.all([query, listWorkspaceMembers(workspaceId)]);
  if (error) {
    throw new Error("Could not load activity.");
  }

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
