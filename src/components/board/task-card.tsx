import Link from "next/link";
import type { AriaAttributes } from "react";
import { CalendarIcon, CheckSquareIcon, ListTreeIcon } from "lucide-react";

import { UserAvatar } from "@/components/user-avatar";
import { dueState, formatDate } from "@/lib/dates";
import { LABEL_STYLES, PRIORITY_LABELS, type TaskPriority } from "@/lib/project-constants";
import type { TaskCard } from "@/lib/projects";
import { cn } from "@/lib/utils";

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  urgent: "text-rose-700 dark:text-rose-300",
  high: "text-amber-700 dark:text-amber-300",
  medium: "text-muted-foreground",
  low: "text-muted-foreground",
  none: "",
};

const DUE_STYLES = {
  overdue: "text-destructive font-medium",
  today: "text-amber-700 dark:text-amber-300 font-medium",
  soon: "text-foreground",
  later: "text-muted-foreground",
};

type TaskCardContentProps = {
  task: TaskCard;
  href: string;
  today: string;
  isDoneColumn: boolean;
  /** Drag-and-drop hints for screen readers, attached to the focusable link. */
  dragHints?: Pick<AriaAttributes, "aria-describedby" | "aria-roledescription">;
};

/**
 * What a task looks like on the board. The title is a link that opens the
 * task; the link's ::after covers the card so the whole card is clickable
 * while other controls on it stay separately focusable.
 */
export function TaskCardContent({ task, href, today, isDoneColumn, dragHints }: TaskCardContentProps) {
  const due = task.dueDate ? (isDoneColumn ? "later" : dueState(task.dueDate, today)) : null;

  return (
    <div className="grid gap-2">
      {task.labels.length > 0 ? (
        <ul className="flex flex-wrap gap-1" aria-label="Labels">
          {task.labels.map((label) => (
            <li key={label.id} className={cn("rounded px-1.5 py-0.5 text-[0.7rem] font-medium", LABEL_STYLES[label.color])}>
              {label.name}
            </li>
          ))}
        </ul>
      ) : null}
      <Link
        href={href}
        scroll={false}
        {...dragHints}
        className="text-sm leading-snug font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
      >
        {task.title}
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {task.priority !== "none" ? (
          <span className={PRIORITY_STYLES[task.priority]}>{PRIORITY_LABELS[task.priority]}</span>
        ) : null}
        {task.dueDate && due ? (
          <span className={cn("inline-flex items-center gap-1", DUE_STYLES[due])}>
            <CalendarIcon className="size-3" aria-hidden="true" />
            <span className="sr-only">{due === "overdue" ? "Overdue, due" : "Due"}</span>
            {formatDate(task.dueDate)}
          </span>
        ) : null}
        {task.subtasks.total > 0 ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <ListTreeIcon className="size-3" aria-hidden="true" />
            <span className="sr-only">Subtasks</span>
            {task.subtasks.done}/{task.subtasks.total}
          </span>
        ) : null}
        {task.checklist.total > 0 ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <CheckSquareIcon className="size-3" aria-hidden="true" />
            <span className="sr-only">Checklist</span>
            {task.checklist.done}/{task.checklist.total}
          </span>
        ) : null}
        {task.assignees.length > 0 ? (
          <span className="ml-auto flex -space-x-1.5" aria-label={`Assigned to ${task.assignees.map((p) => p.name).join(", ")}`}>
            {task.assignees.slice(0, 3).map((person) => (
              <UserAvatar
                key={person.id}
                name={person.name}
                email={person.email}
                avatarUrl={person.avatarUrl}
                className="size-6 ring-2 ring-card"
              />
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}
