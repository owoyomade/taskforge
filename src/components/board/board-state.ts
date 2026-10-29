/**
 * Pure helpers for the board's local state: tasks grouped by column, in
 * display order. Drag and drop and the "Move" menu both update this first
 * (so the card moves instantly), then the server is told about the move.
 */

export type ColumnGroups<T extends { id: string }> = Record<string, T[]>;

export function groupTasks<T extends { id: string; columnId: string }>(
  columnIds: string[],
  tasks: T[],
): ColumnGroups<T> {
  const groups: ColumnGroups<T> = Object.fromEntries(columnIds.map((id) => [id, [] as T[]]));
  for (const task of tasks) {
    groups[task.columnId]?.push(task);
  }
  return groups;
}

export function findColumnOf<T extends { id: string }>(groups: ColumnGroups<T>, taskId: string): string | undefined {
  return Object.keys(groups).find((columnId) => groups[columnId].some((task) => task.id === taskId));
}

/** Moves a task to `toIndex` in `toColumnId`, returning new groups (the input isn't changed). */
export function moveTaskInGroups<T extends { id: string; columnId: string }>(
  groups: ColumnGroups<T>,
  taskId: string,
  toColumnId: string,
  toIndex: number,
): ColumnGroups<T> {
  const fromColumnId = findColumnOf(groups, taskId);
  if (!fromColumnId || !groups[toColumnId]) return groups;

  const task = groups[fromColumnId].find((item) => item.id === taskId);
  if (!task) return groups;

  const next: ColumnGroups<T> = { ...groups, [fromColumnId]: groups[fromColumnId].filter((item) => item.id !== taskId) };
  const target = [...next[toColumnId]];
  const index = Math.max(0, Math.min(toIndex, target.length));
  target.splice(index, 0, { ...task, columnId: toColumnId });
  next[toColumnId] = target;
  return next;
}

/** The ids of the tasks directly above and below `taskId` in a column. */
export function neighbours<T extends { id: string }>(
  column: T[],
  taskId: string,
): { beforeId: string | null; afterId: string | null } {
  const index = column.findIndex((task) => task.id === taskId);
  return {
    beforeId: index > 0 ? column[index - 1].id : null,
    afterId: index >= 0 && index < column.length - 1 ? column[index + 1].id : null,
  };
}
