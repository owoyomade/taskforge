import { PRIORITY_RANK, type TaskPriority } from "@/lib/project-constants";
import type { TaskFilters } from "@/lib/task-filters";

type SortableTask = {
  title: string;
  columnId: string;
  position: number;
  priority: TaskPriority;
  dueDate: string | null;
  updatedAt: string;
};

/**
 * Orders tasks for the list view. "Board order" follows the columns left to
 * right, then each column's own order. Tasks without a due date go last
 * when sorting by date.
 */
export function sortTasks<T extends SortableTask>(tasks: T[], sort: TaskFilters["sort"], columnOrder: string[]): T[] {
  const columnRank = new Map(columnOrder.map((id, index) => [id, index]));
  const boardOrder = (a: T, b: T) =>
    (columnRank.get(a.columnId) ?? 0) - (columnRank.get(b.columnId) ?? 0) || a.position - b.position;

  const comparators: Record<TaskFilters["sort"], (a: T, b: T) => number> = {
    position: boardOrder,
    title: (a, b) => a.title.localeCompare(b.title),
    priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || boardOrder(a, b),
    due: (a, b) => {
      if (a.dueDate === b.dueDate) return boardOrder(a, b);
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    },
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  };

  return [...tasks].sort(comparators[sort]);
}
