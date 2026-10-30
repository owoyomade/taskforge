import Link from "next/link";
import { LockIcon } from "lucide-react";

import { ColorDot } from "@/components/color-picker";
import { JourneyStrip } from "@/components/journey/journey-strip";
import { formatDate } from "@/lib/dates";
import { journeySummary, type PhaseState } from "@/lib/phase-progress";
import type { ProjectSummary } from "@/lib/projects";

type ProjectCardProps = {
  href: string;
  project: ProjectSummary;
  phases: PhaseState[];
  counts: { open: number; done: number; overdue: number };
};

export function ProjectCard({ href, project, phases, counts }: ProjectCardProps) {
  const total = counts.open + counts.done;

  return (
    <Link
      href={href}
      className="grid h-full grid-cols-1 content-start gap-4 rounded-2xl border bg-card p-5 outline-none hover:border-primary/40 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex items-center gap-2">
        <ColorDot color={project.color} className="size-3" />
        <span className="min-w-0 flex-1 truncate text-base font-semibold">{project.name}</span>
        {project.visibility === "private" ? <LockIcon className="size-3.5 text-muted-foreground" aria-label="Private project" /> : null}
      </div>

      {phases.length > 0 ? (
        <div className="grid gap-2">
          <JourneyStrip phases={phases} compact />
          <p className="text-sm text-muted-foreground">{journeySummary(phases)}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {total === 0 ? "No tasks yet" : `${counts.done} of ${total} ${total === 1 ? "task" : "tasks"} done`}
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {counts.overdue > 0 ? <span className="font-medium text-ember">{counts.overdue} overdue</span> : null}
        {counts.open > 0 ? <span>{counts.open} to do</span> : null}
        {project.targetDate ? <span>Finish {formatDate(project.targetDate)}</span> : null}
      </div>
    </Link>
  );
}
