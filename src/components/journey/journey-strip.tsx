import Link from "next/link";
import { CheckIcon } from "lucide-react";

import { formatDate } from "@/lib/dates";
import type { PhaseState } from "@/lib/phase-progress";
import { cn } from "@/lib/utils";

type JourneyStripProps = {
  phases: PhaseState[];
  /** Small version for project cards: dots and line only. */
  compact?: boolean;
  /** When set, each stop links to its section on the Plan view. */
  planHref?: string;
};

/**
 * A project's phases drawn like stops on a train line: filled stops are
 * finished, the highlighted stop is "you are here", hollow stops are still
 * ahead. It's an ordered list underneath, so screen readers hear each stop
 * with its status and progress.
 */
export function JourneyStrip({ phases, compact = false, planHref }: JourneyStripProps) {
  if (phases.length === 0) return null;
  const finished = phases.filter((phase) => phase.status === "done").length;

  return (
    <ol
      aria-label={`Project journey: ${finished} of ${phases.length} phases done`}
      className={cn("grid items-start", compact ? "gap-0" : "gap-1")}
      style={{ gridTemplateColumns: `repeat(${phases.length}, minmax(0, 1fr))` }}
    >
      {phases.map((phase, index) => {
        // Read out after the name: "Build, phase 3 of 4, coming up, 0 of 1 tasks done, due Nov 20."
        const details = `, phase ${index + 1} of ${phases.length}, ${
          phase.status === "done" ? "done" : phase.status === "current" ? "you are here" : "coming up"
        }${phase.total > 0 ? `, ${phase.done} of ${phase.total} tasks done` : ", no tasks yet"}${
          phase.targetDate ? `, ${phase.isOverdue ? "overdue since" : "due"} ${formatDate(phase.targetDate)}` : ""
        }.`;
        const stop = (
          <>
            <span className="relative flex h-6 items-center" aria-hidden="true">
              {/* The line runs from this stop to the next; the last stop has none. */}
              {index < phases.length - 1 ? (
                <span
                  className={cn(
                    "absolute top-1/2 left-1/2 h-1 w-full -translate-y-1/2 rounded-full",
                    phase.status === "done" ? "bg-leaf" : "bg-border",
                  )}
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 mx-auto grid place-items-center rounded-full border-[3px]",
                  compact ? "size-3.5 border-2" : "size-6",
                  phase.status === "done" && "border-leaf bg-leaf text-white",
                  phase.status === "current" && "border-sun bg-sun shadow-[0_0_0_4px] shadow-sun/30",
                  phase.status === "upcoming" && "border-border bg-card",
                  phase.isOverdue && phase.status !== "done" && "border-ember",
                )}
              >
                {phase.status === "done" && !compact ? <CheckIcon className="size-3.5" strokeWidth={3} /> : null}
              </span>
            </span>
            {compact ? (
              <span className="sr-only">
                {phase.name}
                {details}
              </span>
            ) : (
              // The visible name is part of the spoken name; the short "1/4, Oct 22"
              // line is hidden from screen readers because the details say it in words.
              <span className="mt-1.5 grid justify-items-center gap-0.5 px-1 text-center">
                <span
                  className={cn(
                    "line-clamp-2 text-xs leading-tight font-semibold",
                    phase.status === "upcoming" && "text-muted-foreground",
                  )}
                >
                  {phase.name}
                  <span className="sr-only">{details}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn("text-[0.7rem] text-muted-foreground", phase.isOverdue && "font-medium text-ember")}
                >
                  {phase.total > 0 ? `${phase.done}/${phase.total}` : "No tasks"}
                  {phase.targetDate ? `, ${formatDate(phase.targetDate)}` : ""}
                </span>
              </span>
            )}
          </>
        );

        return (
          <li key={phase.id} className="min-w-0">
            {planHref && !compact ? (
              <Link
                href={`${planHref}#phase-${phase.id}`}
                className="block rounded-lg pb-1 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {stop}
              </Link>
            ) : (
              <div>{stop}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
