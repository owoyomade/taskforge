import { addDays } from "@/lib/dates";

/**
 * The workload & risk radar's rules, kept free of database and UI code so
 * each rule can be unit tested on its own (tests/unit/workload.test.ts).
 *
 * Everything is calculated from real tasks: who they're assigned to, their
 * due dates, which column they're in and when they last changed. Dates are
 * plain YYYY-MM-DD strings compared in UTC, like the rest of the app.
 */

/** How many weeks ahead the radar looks, starting with this week. */
export const RADAR_WEEKS = 4;
/** "Not started" only matters close to the deadline. */
const NOT_STARTED_DAYS = 3;
/** Unassigned work is flagged once it's due within a week. */
const UNASSIGNED_DAYS = 7;
/** A task that hasn't changed for this long is "gone quiet"... */
const QUIET_AFTER_DAYS = 14;
/** ...but only when it's due within this many days. */
const QUIET_DUE_WITHIN_DAYS = 14;

export type RadarPerson = { id: string; name: string };

export type RadarTask = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  dueDate: string | null;
  isDone: boolean;
  /** Still in the project's first column, so work hasn't visibly started. */
  inFirstColumn: boolean;
  assigneeIds: string[];
  /** When anything about the task last changed (YYYY-MM-DD). */
  lastActivityOn: string;
  /** Who may be assigned to it: non-viewers who can see its project. */
  assignableIds: string[];
};

export type LoadLevel = "ok" | "near" | "over";

export type RadarWeek = { start: string; end: string };

export type PersonLoad = RadarPerson & { weeks: { count: number; level: LoadLevel }[] };

export type RiskReason = "overdue" | "not_started" | "unassigned" | "quiet" | "overloaded";

/** A one-click fix: move the task from an overloaded person (or from nobody) to someone with room. */
export type Suggestion = { from: RadarPerson | null; to: RadarPerson };

export type TaskRisk = { task: RadarTask; reasons: RiskReason[]; suggestion: Suggestion | null };

export type Radar = { weeks: RadarWeek[]; people: PersonLoad[]; risks: TaskRisk[] };

const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** The Monday on or before a date. Weeks run Monday to Sunday. */
export function weekStart(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

/**
 * Which radar week an open task's work falls in: 0 is this week, and
 * overdue work counts as this week's, because it still has to be done now.
 * Null when it has no due date or is due beyond the radar.
 */
function weekIndex(dueDate: string | null, today: string, firstWeek: string): number | null {
  if (dueDate === null) return null;
  if (dueDate < today) return 0;
  const index = Math.floor(daysBetween(firstWeek, dueDate) / 7);
  return index < RADAR_WEEKS ? index : null;
}

/**
 * Close to capacity from 80% of it, and over it beyond it. With the default
 * capacity of 5 that's: up to 3 tasks fine, 4–5 near, 6 or more over.
 */
export function loadLevel(count: number, capacity: number): LoadLevel {
  if (count > capacity) return "over";
  return count >= Math.ceil(capacity * 0.8) ? "near" : "ok";
}

export function buildRadar(input: {
  tasks: RadarTask[];
  /** Workspace members who can be assigned work (non-viewers): always shown. */
  people: RadarPerson[];
  /** Every current member, so anyone with assigned work is shown by name. */
  everyone?: RadarPerson[];
  capacity: number;
  today: string;
}): Radar {
  const { capacity, today } = input;
  const firstWeek = weekStart(today);
  const weeks = Array.from({ length: RADAR_WEEKS }, (_, index) => {
    const start = addDays(firstWeek, index * 7);
    return { start, end: addDays(start, 6) };
  });
  const open = input.tasks.filter((task) => !task.isDone);

  // Count each person's open tasks per week. Someone who isn't in the people
  // list (for example a viewer who was assigned before being demoted) still
  // gets a row, so no assigned work disappears from the radar.
  const names = new Map([...(input.everyone ?? []), ...input.people].map((person) => [person.id, person.name]));
  const counts = new Map<string, number[]>(input.people.map((person) => [person.id, Array<number>(RADAR_WEEKS).fill(0)]));
  for (const task of open) {
    const week = weekIndex(task.dueDate, today, firstWeek);
    if (week === null) continue;
    for (const id of task.assigneeIds) {
      const row = counts.get(id) ?? Array<number>(RADAR_WEEKS).fill(0);
      row[week] += 1;
      counts.set(id, row);
    }
  }
  const countFor = (id: string, week: number) => counts.get(id)?.[week] ?? 0;

  const people: PersonLoad[] = [...counts.entries()]
    .map(([id, row]) => ({
      id,
      name: names.get(id) ?? "Former teammate",
      weeks: row.map((count) => ({ count, level: loadLevel(count, capacity) })),
    }))
    .sort((a, b) => total(b) - total(a) || a.name.localeCompare(b.name));

  const risks: TaskRisk[] = [];
  for (const task of open) {
    if (task.dueDate === null) continue;
    const daysLeft = daysBetween(today, task.dueDate);
    const week = weekIndex(task.dueDate, today, firstWeek);
    const overloaded = week === null ? [] : task.assigneeIds.filter((id) => countFor(id, week) > capacity);

    const reasons: RiskReason[] = [];
    if (daysLeft < 0) reasons.push("overdue");
    if (daysLeft >= 0 && daysLeft <= NOT_STARTED_DAYS && task.inFirstColumn) reasons.push("not_started");
    if (daysLeft <= UNASSIGNED_DAYS && task.assigneeIds.length === 0) reasons.push("unassigned");
    if (daysLeft <= QUIET_DUE_WITHIN_DAYS && daysBetween(task.lastActivityOn, today) >= QUIET_AFTER_DAYS) reasons.push("quiet");
    if (overloaded.length > 0) reasons.push("overloaded");
    if (reasons.length === 0) continue;

    let suggestion: Suggestion | null = null;
    const needsSomeone = overloaded.length > 0 || task.assigneeIds.length === 0;
    if (needsSomeone && week !== null) {
      const to = lightestWith(task, week, countFor, capacity, names);
      if (to) {
        const fromId = overloaded[0];
        suggestion = { from: fromId ? { id: fromId, name: names.get(fromId) ?? "Former teammate" } : null, to };
      }
    }
    risks.push({ task, reasons, suggestion });
  }
  // Most urgent first: earliest due date, then the most reasons.
  risks.sort((a, b) => (a.task.dueDate ?? "").localeCompare(b.task.dueDate ?? "") || b.reasons.length - a.reasons.length);

  return { weeks, people, risks };
}

function total(person: PersonLoad): number {
  return person.weeks.reduce((sum, week) => sum + week.count, 0);
}

/**
 * The assignable person, not already on the task, with the fewest tasks
 * that week, as long as taking this one keeps them within capacity.
 * Ties go alphabetically so the suggestion doesn't change between visits.
 */
function lightestWith(
  task: RadarTask,
  week: number,
  countFor: (id: string, week: number) => number,
  capacity: number,
  names: Map<string, string>,
): RadarPerson | null {
  const candidates = task.assignableIds
    .filter((id) => !task.assigneeIds.includes(id) && names.has(id))
    .map((id) => ({ id, name: names.get(id) ?? "", count: countFor(id, week) }))
    .filter((candidate) => candidate.count + 1 <= capacity)
    .sort((a, b) => a.count - b.count || a.name.localeCompare(b.name));
  const best = candidates[0];
  return best ? { id: best.id, name: best.name } : null;
}

export const REASON_TEXT: Record<RiskReason, string> = {
  overdue: "Overdue",
  not_started: "Not started, due within 3 days",
  unassigned: "Nobody is on it",
  quiet: "No changes for 2 weeks",
  overloaded: "Assigned to someone over capacity that week",
};
