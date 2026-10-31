import "server-only";

import { addDays } from "@/lib/dates";
import { asCurrentUser } from "@/lib/db";
import { buildRadar, RADAR_WEEKS, weekStart, type Radar, type RadarTask } from "@/lib/workload";
import { listWorkspaceMembers, type WorkspaceSummary } from "@/lib/workspaces";

export type WorkspaceRadar = Radar & { capacity: number };

/**
 * Loads what the workload radar needs and applies its rules (workload.ts).
 *
 * Every query runs as the signed-in user, so Row Level Security decides
 * what's counted: someone who can't see a private project doesn't see its
 * tasks here either, and its load isn't revealed through the totals.
 */
export async function getWorkspaceRadar(workspace: WorkspaceSummary, today: string): Promise<WorkspaceRadar> {
  // Only open, dated tasks due before the radar's last day can count or be at risk.
  const horizonEnd = addDays(weekStart(today), RADAR_WEEKS * 7 - 1);

  const [members, [settings], taskRows, projectRows] = await Promise.all([
    listWorkspaceMembers(workspace.id),
    asCurrentUser((db) =>
      db.query<{ weekly_capacity: number }>("select weekly_capacity from public.workspaces where id = $1", [workspace.id]),
    ),
    asCurrentUser((db) =>
      db.query<{
        id: string;
        title: string;
        project_id: string;
        project_name: string;
        due_date: string;
        in_first_column: boolean;
        assignee_ids: string[];
        last_activity_at: string;
      }>(
        `select t.id, t.title, t.project_id, p.name as project_name, t.due_date,
           c.position = (select min(c2.position) from public.board_columns c2 where c2.project_id = t.project_id)
             as in_first_column,
           coalesce(array_agg(a.user_id::text) filter (where a.user_id is not null), '{}') as assignee_ids,
           greatest(t.updated_at, (select max(e.created_at) from public.audit_events e where e.task_id = t.id))
             as last_activity_at
         from public.tasks t
         join public.projects p on p.id = t.project_id
         join public.board_columns c on c.id = t.column_id
         left join public.task_assignees a on a.task_id = t.id
         where t.workspace_id = $1 and t.parent_task_id is null
           and t.archived_at is null and t.deleted_at is null and p.archived_at is null
           and not c.is_done and t.due_date is not null and t.due_date <= $2
         group by t.id, p.name, c.position`,
        [workspace.id, horizonEnd],
      ),
    ),
    asCurrentUser((db) =>
      db.query<{ id: string; visibility: "workspace" | "private"; owner_id: string | null; member_ids: string[] }>(
        `select p.id, p.visibility, p.owner_id,
           coalesce(array_agg(pm.user_id::text) filter (where pm.user_id is not null), '{}') as member_ids
         from public.projects p
         left join public.project_members pm on pm.project_id = p.id
         where p.workspace_id = $1 and p.archived_at is null
         group by p.id`,
        [workspace.id],
      ),
    ),
  ]);

  // Who can be given a project's tasks: the same rule as listAssignablePeople.
  const nonViewers = members.filter((member) => member.role !== "viewer");
  const assignableByProject = new Map(
    projectRows.map((project) => [
      project.id,
      nonViewers
        .filter(
          (member) =>
            project.visibility === "workspace" ||
            member.role === "owner" ||
            member.role === "admin" ||
            member.userId === project.owner_id ||
            project.member_ids.includes(member.userId),
        )
        .map((member) => member.userId),
    ]),
  );

  const tasks: RadarTask[] = taskRows.map((row) => ({
    id: row.id,
    title: row.title,
    projectId: row.project_id,
    projectName: row.project_name,
    dueDate: row.due_date,
    isDone: false,
    inFirstColumn: row.in_first_column,
    assigneeIds: row.assignee_ids,
    lastActivityOn: row.last_activity_at.slice(0, 10),
    assignableIds: assignableByProject.get(row.project_id) ?? [],
  }));

  const capacity = settings?.weekly_capacity ?? 5;
  const radar = buildRadar({
    tasks,
    people: nonViewers.map((member) => ({ id: member.userId, name: member.fullName })),
    everyone: members.map((member) => ({ id: member.userId, name: member.fullName })),
    capacity,
    today,
  });
  return { ...radar, capacity };
}
