import "server-only";

import { requireUser } from "@/lib/auth";
import {
  getProjectForUser,
  getTaskDetail,
  listAssignablePeople,
  listColumns,
  listLabels,
  listTaskCards,
} from "@/lib/projects";
import { dateRange, hasActiveFilters, parseTaskFilters } from "@/lib/task-filters";
import { getWorkspaceForUser } from "@/lib/workspaces";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Everything the board and list views need, loaded in parallel: the
 * project, its columns, the filtered tasks, filter options, and the open
 * task (when ?task= is in the URL).
 */
export async function loadProjectView(slug: string, projectId: string, searchParams: SearchParams) {
  const [user, workspace] = await Promise.all([requireUser(), getWorkspaceForUser(slug)]);
  const project = await getProjectForUser(workspace.id, projectId);
  const filters = parseTaskFilters(searchParams);
  const openTaskId = typeof searchParams.task === "string" ? searchParams.task : undefined;

  const columns = await listColumns(project.id);
  const [tasks, labels, people, openTask] = await Promise.all([
    listTaskCards(project, columns, filters),
    listLabels(workspace.id),
    listAssignablePeople(project),
    openTaskId ? getTaskDetail(project, columns, openTaskId) : Promise.resolve(undefined),
  ]);

  return {
    workspace,
    project,
    columns,
    filters,
    tasks,
    labels,
    people,
    openTaskId,
    openTask: openTask ?? null,
    isFiltered: hasActiveFilters(filters),
    canEdit: project.access === "edit" || project.access === "manage",
    canModerate: project.access === "manage",
    currentUserId: user.id,
    today: dateRange(0).today,
  };
}
