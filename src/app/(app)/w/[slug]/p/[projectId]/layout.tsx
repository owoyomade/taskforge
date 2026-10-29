import { Suspense } from "react";
import { LockIcon } from "lucide-react";

import { ColorDot } from "@/components/color-picker";
import { JourneyStrip } from "@/components/journey/journey-strip";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";
import { journeySummary, phaseStates } from "@/lib/phase-progress";
import { PROJECT_STATUS_LABELS } from "@/lib/project-constants";
import { getProjectForUser, listPhases } from "@/lib/projects";
import { dateRange } from "@/lib/task-filters";
import { getWorkspaceForUser } from "@/lib/workspaces";

export default async function ProjectLayout({ children, params }: LayoutProps<"/w/[slug]/p/[projectId]">) {
  const { slug, projectId } = await params;
  const workspace = await getWorkspaceForUser(slug);
  const project = await getProjectForUser(workspace.id, projectId);
  const basePath = `/w/${workspace.slug}/p/${project.id}`;
  const phases = phaseStates((await listPhases(workspace.id, project.id)).get(project.id) ?? [], dateRange(0).today);

  return (
    <div className="grid gap-6">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ColorDot color={project.color} className="size-3" />
          <h1 className="text-2xl font-bold sm:text-3xl">{project.name}</h1>
          <Badge variant="secondary">{PROJECT_STATUS_LABELS[project.status]}</Badge>
          {project.visibility === "private" ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <LockIcon className="size-3.5" aria-hidden="true" />
              Private
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {journeySummary(phases)}
          {project.targetDate ? `. Finish by ${formatDate(project.targetDate)}.` : "."}
        </p>
        {phases.length > 0 ? (
          <div className="rounded-2xl border bg-card px-3 pt-4 pb-2">
            <JourneyStrip phases={phases} planHref={basePath} />
          </div>
        ) : null}
        {project.archivedAt ? (
          <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
            This project is archived, so it&apos;s read-only.
            {project.access === "manage" ? " You can restore it from Settings." : ""}
          </p>
        ) : project.access === "view" ? (
          <p className="text-sm text-muted-foreground">You can view this project but not change it.</p>
        ) : null}
        {/* useSearchParams() in the tabs needs a Suspense boundary. */}
        <Suspense fallback={<div className="h-10 border-b" />}>
          <ProjectTabs basePath={basePath} showSettings={project.access === "manage"} />
        </Suspense>
      </header>
      {children}
    </div>
  );
}
