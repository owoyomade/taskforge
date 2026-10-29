import { PRIORITIES, type TaskPriority } from "@/lib/project-constants";

type StatsColumn = { id: string; name: string; isDone: boolean };
type StatsTask = { id: string; title: string; columnId: string; dueDate: string | null; priority: TaskPriority };

export type ProjectStats = {
  total: number;
  done: number;
  /** Whole-number percentage, or null when there are no tasks (nothing to measure). */
  percentDone: number | null;
  byColumn: { id: string; name: string; count: number }[];
  byPriority: { priority: TaskPriority; count: number }[];
  overdue: StatsTask[];
  dueThisWeek: StatsTask[];
};

/**
 * Progress figures for the project overview, calculated only from real
 * tasks. A task counts as done when it sits in a column marked "done".
 * Dates are compared as YYYY-MM-DD strings, which sort correctly.
 */
export function summarizeProject(
  columns: StatsColumn[],
  tasks: StatsTask[],
  today: string,
  weekEnd: string,
): ProjectStats {
  const doneColumnIds = new Set(columns.filter((column) => column.isDone).map((column) => column.id));
  const openTasks = tasks.filter((task) => !doneColumnIds.has(task.columnId));
  const done = tasks.length - openTasks.length;
  const byDueDate = (a: StatsTask, b: StatsTask) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "");

  return {
    total: tasks.length,
    done,
    percentDone: tasks.length === 0 ? null : Math.round((done / tasks.length) * 100),
    byColumn: columns.map((column) => ({
      id: column.id,
      name: column.name,
      count: tasks.filter((task) => task.columnId === column.id).length,
    })),
    byPriority: PRIORITIES.map((priority) => ({
      priority,
      count: openTasks.filter((task) => task.priority === priority).length,
    })),
    overdue: openTasks.filter((task) => task.dueDate !== null && task.dueDate < today).sort(byDueDate),
    dueThisWeek: openTasks
      .filter((task) => task.dueDate !== null && task.dueDate >= today && task.dueDate <= weekEnd)
      .sort(byDueDate),
  };
}

type WorkloadTask = { columnId: string; dueDate: string | null; assignees: { id: string; name: string }[] };

export type Workload = { id: string; name: string; open: number; overdue: number }[];

/**
 * Open tasks per person, busiest first, with an "Unassigned" row when
 * some open work has nobody on it. Tasks in done columns don't count.
 */
export function workloadByPerson(tasks: WorkloadTask[], doneColumnIds: Set<string>, today: string): Workload {
  const rows = new Map<string, { id: string; name: string; open: number; overdue: number }>();
  for (const task of tasks) {
    if (doneColumnIds.has(task.columnId)) continue;
    const overdue = task.dueDate !== null && task.dueDate < today ? 1 : 0;
    const people = task.assignees.length > 0 ? task.assignees : [{ id: "", name: "Unassigned" }];
    for (const person of people) {
      const row = rows.get(person.id) ?? { id: person.id, name: person.name, open: 0, overdue: 0 };
      row.open += 1;
      row.overdue += overdue;
      rows.set(person.id, row);
    }
  }
  return [...rows.values()].sort((a, b) => (a.id === "" ? 1 : b.id === "" ? -1 : b.open - a.open || a.name.localeCompare(b.name)));
}
