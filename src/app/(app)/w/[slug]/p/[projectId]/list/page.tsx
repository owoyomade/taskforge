import type { Metadata } from "next";
import { Suspense } from "react";

import { TaskFiltersBar } from "@/components/board/task-filters-bar";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import { TaskList } from "@/components/tasks/task-list";
import { loadProjectView } from "@/lib/project-view";
import { sortTasks } from "@/lib/task-sort";

export const metadata: Metadata = { title: "Task list" };

export default async function ProjectListPage({ params, searchParams }: PageProps<"/w/[slug]/p/[projectId]/list">) {
  const { slug, projectId } = await params;
  const view = await loadProjectView(slug, projectId, await searchParams);
  const tasks = sortTasks(
    view.tasks,
    view.filters.sort,
    view.columns.map((column) => column.id),
  );

  return (
    <Suspense>
      <div className="grid gap-4">
        <TaskFiltersBar people={view.people} labels={view.labels} resultCount={tasks.length} showSort />
        <TaskList tasks={tasks} columns={view.columns} today={view.today} isFiltered={view.isFiltered} />
      </div>
      {view.openTaskId ? (
        <TaskDrawer task={view.openTask} columns={view.columns} people={view.people} labels={view.labels} canEdit={view.canEdit} />
      ) : null}
    </Suspense>
  );
}
