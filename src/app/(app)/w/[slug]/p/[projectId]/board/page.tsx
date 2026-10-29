import type { Metadata } from "next";
import { Suspense } from "react";

import { BoardView } from "@/components/board/board-view";
import { TaskFiltersBar } from "@/components/board/task-filters-bar";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import { getProjectForUser } from "@/lib/projects";
import { loadProjectView } from "@/lib/project-view";
import { getWorkspaceForUser } from "@/lib/workspaces";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/p/[projectId]/board">): Promise<Metadata> {
  const { slug, projectId } = await params;
  const workspace = await getWorkspaceForUser(slug);
  const project = await getProjectForUser(workspace.id, projectId);
  return { title: `${project.name} board` };
}

export default async function ProjectBoardPage({ params, searchParams }: PageProps<"/w/[slug]/p/[projectId]/board">) {
  const { slug, projectId } = await params;
  const view = await loadProjectView(slug, projectId, await searchParams);

  // The client components below read the URL (useSearchParams), which
  // Next.js requires to be inside a Suspense boundary.
  return (
    <Suspense>
      <div className="grid gap-4">
        <TaskFiltersBar people={view.people} labels={view.labels} resultCount={view.tasks.length} />
        <BoardView
          projectId={view.project.id}
          columns={view.columns}
          tasks={view.tasks}
          canEdit={view.canEdit}
          today={view.today}
          isFiltered={view.isFiltered}
        />
      </div>
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
