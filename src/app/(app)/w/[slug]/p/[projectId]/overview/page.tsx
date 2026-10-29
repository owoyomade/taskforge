import type { Metadata } from "next";
import Link from "next/link";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { listActivity } from "@/lib/activity";
import { formatDate } from "@/lib/dates";
import { phaseStates } from "@/lib/phase-progress";
import { PRIORITY_LABELS } from "@/lib/project-constants";
import { summarizeProject, workloadByPerson } from "@/lib/project-stats";
import { getProjectForUser, listColumns, listPhases, listTaskCards } from "@/lib/projects";
import { dateRange, parseTaskFilters } from "@/lib/task-filters";
import { getWorkspaceForUser } from "@/lib/workspaces";

export const metadata: Metadata = { title: "Project overview" };

export default async function ProjectOverviewPage({ params }: PageProps<"/w/[slug]/p/[projectId]/overview">) {
  const { slug, projectId } = await params;
  const workspace = await getWorkspaceForUser(slug);
  const project = await getProjectForUser(workspace.id, projectId);
  const columns = await listColumns(project.id);
  // The overview always covers every task, so it ignores board filters.
  const [tasks, phasesByProject, recent] = await Promise.all([
    listTaskCards(project, columns, parseTaskFilters({})),
    listPhases(workspace.id, project.id),
    listActivity(workspace.id, { projectId: project.id, limit: 6 }),
  ]);
  const { today, until } = dateRange(7);
  const phases = phaseStates(phasesByProject.get(project.id) ?? [], today);
  const doneColumnIds = new Set(columns.filter((column) => column.isDone).map((column) => column.id));
  const workload = workloadByPerson(tasks, doneColumnIds, today);
  const maxWorkload = Math.max(1, ...workload.map((row) => row.open));
  const stats = summarizeProject(columns, tasks, today, until);
  const basePath = `/w/${workspace.slug}/p/${project.id}`;
  const maxColumnCount = Math.max(1, ...stats.byColumn.map((column) => column.count));

  return (
    <div className="grid gap-8">
      {project.description ? <p className="max-w-2xl text-muted-foreground">{project.description}</p> : null}

      <dl className="grid gap-3 sm:grid-cols-4">
        <Stat label="Progress" value={stats.percentDone === null ? "No tasks" : `${stats.percentDone}%`} detail={`${stats.done} of ${stats.total} done`} />
        <Stat label="Open tasks" value={String(stats.total - stats.done)} />
        <Stat label="Overdue" value={String(stats.overdue.length)} tone={stats.overdue.length > 0 ? "warning" : undefined} />
        <Stat
          label="Target date"
          value={project.targetDate ? formatDate(project.targetDate) : "Not set"}
          detail={project.startDate ? `Started ${formatDate(project.startDate)}` : undefined}
        />
      </dl>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="columns-heading" className="grid content-start gap-3">
          <h2 id="columns-heading" className="text-lg font-semibold">
            Tasks by column
          </h2>
          <ul className="grid gap-2">
            {stats.byColumn.map((column) => (
              <li key={column.id} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-3 text-sm">
                <span className="truncate">{column.name}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(column.count / maxColumnCount) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums text-muted-foreground">{column.count}</span>
              </li>
            ))}
          </ul>
          <h3 className="mt-4 text-sm font-semibold">Open tasks by priority</h3>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {stats.byPriority.map(({ priority, count }) => (
              <li key={priority}>
                <span className="text-muted-foreground">{PRIORITY_LABELS[priority]}</span>{" "}
                <span className="font-medium tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="deadlines-heading" className="grid content-start gap-3">
          <h2 id="deadlines-heading" className="text-lg font-semibold">
            Deadlines
          </h2>
          <DeadlineList title="Overdue" tasks={stats.overdue} basePath={basePath} empty="Nothing overdue." tone="warning" />
          <DeadlineList title="Due in the next 7 days" tasks={stats.dueThisWeek} basePath={basePath} empty="Nothing due this week." />
        </section>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="phases-heading" className="grid content-start gap-3">
          <h2 id="phases-heading" className="text-lg font-semibold">
            Phases
          </h2>
          {phases.length === 0 ? (
            <p className="text-sm text-muted-foreground">This project has no phases yet. Add them from the Plan tab.</p>
          ) : (
            <ul className="grid gap-3">
              {phases.map((phase) => (
                <li key={phase.id} className="grid gap-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <Link href={`${basePath}#phase-${phase.id}`} className="font-medium underline-offset-4 hover:underline">
                      {phase.name}
                    </Link>
                    <span className={phase.isOverdue ? "font-medium text-ember" : "text-muted-foreground"}>
                      {phase.percent === null ? "No tasks" : `${phase.percent}%`}
                      {phase.targetDate ? `, ${phase.isOverdue ? "was due" : "due"} ${formatDate(phase.targetDate)}` : ""}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div className="h-full rounded-full bg-leaf" style={{ width: `${phase.percent ?? 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="workload-heading" className="grid content-start gap-3">
          <h2 id="workload-heading" className="text-lg font-semibold">
            Who&apos;s doing what
          </h2>
          {workload.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open tasks.</p>
          ) : (
            <ul className="grid gap-2">
              {workload.map((row) => (
                <li key={row.id || "unassigned"} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm">
                  <span className={row.id ? "truncate" : "truncate text-muted-foreground"}>{row.name}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${(row.open / maxWorkload) * 100}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {row.open} open{row.overdue > 0 ? <span className="text-ember">, {row.overdue} overdue</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="recent-heading" className="grid max-w-3xl gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="recent-heading" className="text-lg font-semibold">
            Recent activity
          </h2>
          <Link href={`${basePath}/activity`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            See all
          </Link>
        </div>
        <ActivityFeed items={recent} emptyText="Nothing has happened yet." />
      </section>
    </div>
  );
}

function Stat({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: "warning" }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={tone === "warning" ? "font-heading text-2xl font-semibold text-destructive" : "font-heading text-2xl font-semibold"}>
        {value}
      </dd>
      {detail ? <dd className="text-xs text-muted-foreground">{detail}</dd> : null}
    </div>
  );
}

function DeadlineList({
  title,
  tasks,
  basePath,
  empty,
  tone,
}: {
  title: string;
  tasks: { id: string; title: string; dueDate: string | null }[];
  basePath: string;
  empty: string;
  tone?: "warning";
}) {
  return (
    <div className="grid gap-1.5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Link href={`${basePath}?task=${task.id}`} className="min-w-0 flex-1 truncate underline-offset-4 hover:underline">
                {task.title}
              </Link>
              <span className={tone === "warning" ? "text-destructive" : "text-muted-foreground"}>
                {task.dueDate ? formatDate(task.dueDate) : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
