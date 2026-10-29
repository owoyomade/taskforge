"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { UserAvatar } from "@/components/user-avatar";
import { dueState, formatDate } from "@/lib/dates";
import { LABEL_STYLES, PRIORITY_LABELS } from "@/lib/project-constants";
import type { BoardColumn, TaskCard } from "@/lib/projects";
import { cn } from "@/lib/utils";

type TaskListProps = { tasks: TaskCard[]; columns: BoardColumn[]; today: string; isFiltered: boolean };

/** All tasks as a table. Clicking a title opens the same drawer as the board. */
export function TaskList({ tasks, columns, today, isFiltered }: TaskListProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const columnsById = new Map(columns.map((column) => [column.id, column]));

  function taskHref(taskId: string) {
    const query = new URLSearchParams(searchParams);
    query.set("task", taskId);
    return `${pathname}?${query.toString()}`;
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-10 text-center">
        <p className="font-medium">{isFiltered ? "No tasks match these filters" : "No tasks yet"}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {isFiltered ? "Try clearing a filter or searching for something else." : "Add tasks from the board."}
        </p>
      </div>
    );
  }

  return (
    // Wide tables scroll inside this box on small screens; the page itself doesn't.
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[44rem] text-sm">
        <thead className="border-b text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">Task</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Priority</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Assignees</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Due</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {tasks.map((task) => {
            const column = columnsById.get(task.columnId);
            const due = task.dueDate && !column?.isDone ? dueState(task.dueDate, today) : null;
            return (
              <tr key={task.id} className="hover:bg-muted/50">
                <td className="max-w-80 px-4 py-2.5">
                  <Link href={taskHref(task.id)} scroll={false} className="font-medium underline-offset-4 hover:underline">
                    {task.title}
                  </Link>
                  {task.labels.length > 0 ? (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {task.labels.map((label) => (
                        <span key={label.id} className={cn("rounded px-1.5 py-0.5 text-[0.7rem] font-medium", LABEL_STYLES[label.color])}>
                          {label.name}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">{column?.name}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                  {task.priority === "none" ? "—" : PRIORITY_LABELS[task.priority]}
                </td>
                <td className="px-4 py-2.5">
                  {task.assignees.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="flex -space-x-1.5" aria-label={task.assignees.map((person) => person.name).join(", ")}>
                      {task.assignees.map((person) => (
                        <UserAvatar key={person.id} name={person.name} email={person.email} avatarUrl={person.avatarUrl} className="size-6 ring-2 ring-card" />
                      ))}
                    </span>
                  )}
                </td>
                <td className={cn("px-4 py-2.5 whitespace-nowrap", due === "overdue" ? "font-medium text-destructive" : "text-muted-foreground")}>
                  {task.dueDate ? `${formatDate(task.dueDate)}${due === "overdue" ? " (overdue)" : ""}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
