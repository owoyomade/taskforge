import Link from "next/link";

import { addDays, formatDate } from "@/lib/dates";
import type { Timeline } from "@/lib/timeline";
import { ScrollToToday } from "./scroll-to-today";
import { cn } from "@/lib/utils";

const DAY_WIDTH = 28; // px per day
const LABEL_WIDTH = 220; // px for the row names

type TimelineViewProps = {
  timeline: Timeline;
  doneTaskIds: Set<string>;
  today: string;
  taskHref: (taskId: string) => string;
};

/**
 * A simple Gantt-style chart: phases as bands, tasks as bars on a day
 * grid, and a line for today. It scrolls sideways inside its own box on
 * small screens. Every bar also carries its dates as text for screen readers.
 */
export function TimelineView({ timeline, doneTaskIds, today, taskHref }: TimelineViewProps) {
  const chartWidth = timeline.days * DAY_WIDTH;
  const left = (index: number) => index * DAY_WIDTH;
  const width = (start: number, end: number) => Math.max(1, end - start + 1) * DAY_WIDTH;

  if (timeline.rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed px-6 py-10 text-center">
        <p className="font-semibold">Nothing to show on the timeline yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Give phases a finish date, or give tasks a start or due date, and they&apos;ll appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <ScrollToToday offset={timeline.todayIndex === null ? null : left(timeline.todayIndex)}>
        <div className="relative" style={{ width: LABEL_WIDTH + chartWidth }}>
          {/* Month header */}
          <div className="sticky top-0 flex h-9 border-b bg-card text-xs font-semibold text-muted-foreground" aria-hidden="true">
            <div className="sticky left-0 z-20 shrink-0 border-r bg-card" style={{ width: LABEL_WIDTH }} />
            <div className="relative" style={{ width: chartWidth }}>
              {timeline.months.map((month) => (
                <span key={month.index} className="absolute top-2.5 border-l pl-1.5" style={{ left: left(month.index) }}>
                  {month.label}
                </span>
              ))}
            </div>
          </div>

          <ol aria-label="Timeline">
            {timeline.rows.map((row) => {
              const isPhase = row.kind === "phase";
              const isDone = row.kind === "task" && doneTaskIds.has(row.id);
              const isOverdue = row.kind === "task" && !isDone && row.dueDate !== null && row.dueDate < today;
              const startDate = addDays(timeline.start, row.start);
              const endDate = addDays(timeline.start, row.end);
              const dates = startDate === endDate ? formatDate(endDate) : `${formatDate(startDate)} to ${formatDate(endDate)}`;
              const label = row.kind === "phase" ? row.name : row.title;

              return (
                <li key={`${row.kind}-${row.id}`} className={cn("flex border-b last:border-b-0", isPhase ? "h-10 bg-muted/50" : "h-9")}>
                  <div
                    className={cn(
                      "sticky left-0 z-10 flex shrink-0 items-center truncate border-r px-3 text-sm",
                      isPhase ? "bg-muted font-semibold" : "bg-card pl-6",
                    )}
                    style={{ width: LABEL_WIDTH }}
                  >
                    {row.kind === "task" ? (
                      <Link href={taskHref(row.id)} scroll={false} className="truncate underline-offset-4 hover:underline">
                        {label}
                      </Link>
                    ) : (
                      <span className="truncate">{label}</span>
                    )}
                  </div>
                  <div className="relative" style={{ width: chartWidth }}>
                    <span
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 rounded-full",
                        isPhase ? "h-4 bg-primary/25" : "h-3",
                        !isPhase && (isDone ? "bg-leaf" : isOverdue ? "bg-ember" : "bg-primary"),
                      )}
                      style={{ left: left(row.start), width: width(row.start, row.end) }}
                    >
                      <span className="sr-only">
                        {label}: {dates}
                        {isDone ? ", done" : isOverdue ? ", overdue" : ""}
                      </span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>

          {timeline.todayIndex !== null ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-sun"
              style={{ left: LABEL_WIDTH + left(timeline.todayIndex) + DAY_WIDTH / 2 }}
            >
              <span className="absolute top-1 -translate-x-1/2 rounded-full bg-sun px-1.5 text-[0.65rem] font-bold text-sun-foreground">
                Today
              </span>
            </div>
          ) : null}
        </div>
      </ScrollToToday>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-primary" aria-hidden="true" />To do</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-leaf" aria-hidden="true" />Done</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-ember" aria-hidden="true" />Overdue</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-full bg-primary/25" aria-hidden="true" />Phase</span>
      </p>

      {timeline.undated.length > 0 ? (
        <section aria-labelledby="undated-heading" className="grid gap-2">
          <h2 id="undated-heading" className="text-sm font-semibold">
            Not scheduled yet ({timeline.undated.length})
          </h2>
          <ul className="flex flex-wrap gap-2">
            {timeline.undated.map((task) => (
              <li key={task.id}>
                <Link href={taskHref(task.id)} scroll={false} className="inline-block rounded-full border px-3 py-1 text-sm hover:bg-muted">
                  {task.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
