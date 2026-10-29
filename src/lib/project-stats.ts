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
