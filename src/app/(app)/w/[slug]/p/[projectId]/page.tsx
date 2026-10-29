import type { Metadata } from "next";
import { Suspense } from "react";

import { PlanView } from "@/components/plan/plan-view";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import { phaseStates } from "@/lib/phase-progress";
import { getProjectForUser } from "@/lib/projects";
import { loadProjectView } from "@/lib/project-view";
import { getWorkspaceForUser } from "@/lib/workspaces";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/p/[projectId]">): Promise<Metadata> {
  const { slug, projectId } = await params;
  const workspace = await getWorkspaceForUser(slug);
  const project = await getProjectForUser(workspace.id, projectId);
  return { title: project.name };
}

/** A project's default view: its phases as a checklist. */
export default async function ProjectPlanPage({ params, searchParams }: PageProps<"/w/[slug]/p/[projectId]">) {
  const { slug, projectId } = await params;
  // The plan always shows every task; filters belong to the board and list.
  const query = await searchParams;
  const view = await loadProjectView(slug, projectId, { task: query.task });
  const phases = phaseStates(view.phases, view.today).map((state, index) => ({
    ...state,
    taskIds: view.phases[index].taskIds,
  }));

  return (
    <Suspense>
      <PlanView
        projectId={view.project.id}
        phases={phases}
        tasks={view.tasks}
        columns={view.columns}
        canEdit={view.canEdit}
        today={view.today}
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
