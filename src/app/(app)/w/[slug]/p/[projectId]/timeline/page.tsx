import type { Metadata } from "next";
import { Suspense } from "react";

import { TaskDrawer } from "@/components/tasks/task-drawer";
import { TimelineView } from "@/components/timeline/timeline-view";
import { loadProjectView } from "@/lib/project-view";
import { buildTimeline } from "@/lib/timeline";

export const metadata: Metadata = { title: "Timeline" };

export default async function ProjectTimelinePage({ params, searchParams }: PageProps<"/w/[slug]/p/[projectId]/timeline">) {
  const { slug, projectId } = await params;
  const query = await searchParams;
  const view = await loadProjectView(slug, projectId, { task: query.task });
  const doneColumns = new Set(view.columns.filter((column) => column.isDone).map((column) => column.id));
  const timeline = buildTimeline(view.phases, view.tasks, { projectStart: view.project.startDate, today: view.today });
  const basePath = `/w/${view.workspace.slug}/p/${view.project.id}/timeline`;

  return (
    <Suspense>
      <TimelineView
        timeline={timeline}
        today={view.today}
        doneTaskIds={new Set(view.tasks.filter((task) => doneColumns.has(task.columnId)).map((task) => task.id))}
        taskHref={(taskId) => `${basePath}?task=${taskId}`}
      />
      {view.openTaskId ? (
        <TaskDrawer
          task={view.openTask}
          columns={view.columns}
          people={view.people}
          labels={view.labels}
          canEdit={view.canEdit}
          canModerate={view.canModerate}
          currentUserId={view.currentUserId}
          phases={view.phases}
          currentPhaseId={view.openTaskPhaseId}
        />
      ) : null}
    </Suspense>
  );
}
