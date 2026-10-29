import { addDays } from "@/lib/dates";

type TimelinePhase = { id: string; name: string; targetDate: string | null; taskIds: string[] };
type TimelineTask = { id: string; title: string; startDate: string | null; dueDate: string | null };

export type TimelineRow =
  | { kind: "phase"; id: string; name: string; start: number; end: number }
  | { kind: "task"; id: string; title: string; start: number; end: number; dueDate: string | null };

export type Timeline = {
  /** First day shown (YYYY-MM-DD) and how many days the chart spans. */
  start: string;
  days: number;
  todayIndex: number | null;
  /** Month labels: the day index where each month begins. */
  months: { index: number; label: string }[];
  rows: TimelineRow[];
  /** Tasks with no dates at all, listed separately instead of drawn. */
  undated: { id: string; title: string }[];
};

const MS_PER_DAY = 86_400_000;
const dayIndex = (from: string, date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);

/**
 * Lays a project out on a day grid. A phase runs from the end of the
 * previous phase (or the project start) to its own target date; a task is
 * a bar from its start date to its due date, or a single day if it only has
 * one of them. All positions are whole-day indexes from `start`.
 */
export function buildTimeline(
  phases: TimelinePhase[],
  tasks: TimelineTask[],
  { projectStart, today }: { projectStart: string | null; today: string },
): Timeline {
  const dates = [
    projectStart,
    today,
    ...phases.map((phase) => phase.targetDate),
    ...tasks.flatMap((task) => [task.startDate, task.dueDate]),
  ].filter((date): date is string => Boolean(date));
  const earliest = dates.reduce((min, date) => (date < min ? date : min), today);
  const latest = dates.reduce((max, date) => (date > max ? date : max), today);

  // A few days of breathing room either side.
  const start = addDays(earliest, -3);
  const days = Math.max(14, dayIndex(start, latest) + 4);

  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const phased = new Set(phases.flatMap((phase) => phase.taskIds));
  const rows: TimelineRow[] = [];
  const undated: Timeline["undated"] = [];

  const taskRow = (task: TimelineTask) => {
    const startDate = task.startDate ?? task.dueDate;
    const endDate = task.dueDate ?? task.startDate;
    if (!startDate || !endDate) {
      undated.push({ id: task.id, title: task.title });
      return;
    }
    rows.push({ kind: "task", id: task.id, title: task.title, start: dayIndex(start, startDate), end: dayIndex(start, endDate), dueDate: task.dueDate });
  };

  let previousEnd = projectStart ? dayIndex(start, projectStart) : 0;
  for (const phase of phases) {
    const end = phase.targetDate ? dayIndex(start, phase.targetDate) : previousEnd;
    rows.push({ kind: "phase", id: phase.id, name: phase.name, start: Math.min(previousEnd, end), end });
    previousEnd = end;
    for (const id of phase.taskIds) {
      const task = tasksById.get(id);
      if (task) taskRow(task);
    }
  }
  for (const task of tasks) {
    if (!phased.has(task.id)) taskRow(task);
  }

  const months: Timeline["months"] = [];
  for (let index = 0; index < days; index++) {
    const date = addDays(start, index);
    if (index === 0 || date.endsWith("-01")) {
      months.push({
        index,
        label: new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)),
      });
    }
  }

  const todayIndex = dayIndex(start, today);
  return { start, days, todayIndex: todayIndex >= 0 && todayIndex < days ? todayIndex : null, months, rows, undated };
}
