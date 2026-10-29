/**
 * Where each phase of a project stands, for the journey strip.
 *
 * Everything is derived from real task counts:
 *   done      every task in the phase is in a "done" column (and it has tasks)
 *   current   the first phase that isn't done: "you are here"
 *   upcoming  later phases
 * A phase past its target date that isn't done is also flagged overdue.
 */

export type PhaseInput = {
  id: string;
  name: string;
  targetDate: string | null;
  total: number;
  done: number;
};

export type PhaseState = PhaseInput & {
  status: "done" | "current" | "upcoming";
  isOverdue: boolean;
  /** Whole-number percentage, or null for a phase with no tasks yet. */
  percent: number | null;
};

export function phaseStates(phases: PhaseInput[], today: string): PhaseState[] {
  let currentFound = false;
  return phases.map((phase) => {
    const isDone = phase.total > 0 && phase.done === phase.total;
    let status: PhaseState["status"];
    if (isDone && !currentFound) {
      status = "done";
    } else if (!currentFound) {
      status = "current";
      currentFound = true;
    } else {
      status = isDone ? "done" : "upcoming";
    }
    return {
      ...phase,
      status,
      isOverdue: !isDone && phase.targetDate !== null && phase.targetDate < today,
      percent: phase.total === 0 ? null : Math.round((phase.done / phase.total) * 100),
    };
  });
}

/** A short, plain description of where a project is, e.g. "In Build, 2 of 5 done". */
export function journeySummary(states: PhaseState[]): string {
  if (states.length === 0) return "No phases yet";
  if (states.every((state) => state.status === "done")) return "All phases done";
  const current = states.find((state) => state.status === "current");
  if (!current) return "No phases yet";
  if (current.total === 0) return `In ${current.name}, no tasks yet`;
  return `In ${current.name}, ${current.done} of ${current.total} done`;
}
