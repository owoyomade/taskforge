"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { moveTaskToColumnEnd, setTaskDone } from "@/app/(app)/task-actions";
import { ColorDot } from "@/components/color-picker";
import { dueState, formatDate, type DueState } from "@/lib/dates";
import type { MyTask } from "@/lib/projects";
import { cn } from "@/lib/utils";

type Group = { key: string; title: string; tasks: MyTask[] };

/** Buckets tasks into the groups people think in: late, today, soon, later. */
function groupTasks(tasks: MyTask[], today: string): Group[] {
  const buckets: Record<DueState | "none", MyTask[]> = { overdue: [], today: [], soon: [], later: [], none: [] };
  for (const task of tasks) buckets[task.dueDate ? dueState(task.dueDate, today) : "none"].push(task);
  return [
    { key: "overdue", title: "Overdue", tasks: buckets.overdue },
    { key: "today", title: "Today", tasks: buckets.today },
    { key: "soon", title: "Next few days", tasks: buckets.soon },
    { key: "later", title: "Later", tasks: buckets.later },
    { key: "none", title: "No date", tasks: buckets.none },
  ].filter((group) => group.tasks.length > 0);
}

export function DoNext({ tasks, today, workspaceSlug }: { tasks: MyTask[]; today: string; workspaceSlug: string }) {
  const [, startTransition] = useTransition();
  // Ticked tasks disappear straight away; the server refresh confirms it.
  const [hidden, hide] = useOptimistic(new Set<string>(), (current, id: string) => new Set(current).add(id));
  const visible = tasks.filter((task) => !hidden.has(task.id));
  const groups = groupTasks(visible, today);

  if (visible.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center">
        <p className="font-semibold">You&apos;re all caught up</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Tasks assigned to you show up here, most urgent first. Open a project and assign yourself something, or start
          a new project from a template.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`do-next-${group.key}`} className="grid gap-1.5">
          <h3
            id={`do-next-${group.key}`}
            className={cn("text-sm font-semibold", group.key === "overdue" ? "text-ember" : "text-muted-foreground")}
          >
            {group.title} <span className="font-normal">({group.tasks.length})</span>
          </h3>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {group.tasks.map((task) => (
              <li key={task.id} className="flex items-center gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label={`Mark ${task.title} as done`}
                  className="size-5 shrink-0 cursor-pointer rounded-full accent-leaf"
                  onChange={() =>
                    startTransition(async () => {
                      hide(task.id);
                      const result = await setTaskDone(task.id, true);
                      if (result.ok) {
                        toast.success(`Done: ${task.title}`, {
                          // Undo puts it back in the exact column it came from.
                          action: { label: "Undo", onClick: () => void moveTaskToColumnEnd(task.id, task.columnId) },
                        });
                      } else {
                        toast.error(result.message);
                      }
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/w/${workspaceSlug}/p/${task.projectId}?task=${task.id}`}
                    className="block truncate font-medium underline-offset-4 hover:underline"
                  >
                    {task.title}
                  </Link>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ColorDot color={task.projectColor} />
                    <span className="truncate">{task.projectName}</span>
                  </span>
                </div>
                {task.dueDate ? (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                      group.key === "overdue" && "bg-ember/10 text-ember",
                      group.key === "today" && "bg-sun text-sun-foreground",
                      (group.key === "soon" || group.key === "later") && "bg-muted text-muted-foreground",
                    )}
                  >
                    {group.key === "today" ? "Today" : formatDate(task.dueDate)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
