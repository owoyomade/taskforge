"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { reassignTask } from "@/app/(app)/task-actions";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { REASON_TEXT, type TaskRisk } from "@/lib/workload";
import { cn } from "@/lib/utils";

/**
 * Tasks that may slip, most urgent first, each with the reasons spelled
 * out. Where someone has room, a button hands the task to them.
 */
export function RiskList({
  risks,
  today,
  workspaceSlug,
  canEdit,
}: {
  risks: TaskRisk[];
  today: string;
  workspaceSlug: string;
  canEdit: boolean;
}) {
  const [, startTransition] = useTransition();
  // A fixed task leaves the list straight away; the server refresh confirms it.
  const [fixed, markFixed] = useOptimistic(new Set<string>(), (current, id: string) => new Set(current).add(id));
  const visible = risks.filter((risk) => !fixed.has(risk.task.id));

  if (visible.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center">
        <p className="font-semibold">Nothing looks at risk</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Tasks show up here when they&apos;re overdue, unassigned or not started close to their date, have gone quiet,
          or belong to someone with too much on.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {visible.map(({ task, reasons, suggestion }) => {
        const overdue = task.dueDate !== null && task.dueDate < today;
        return (
          <li key={task.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="grid min-w-0 gap-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <Link
                  href={`/w/${workspaceSlug}/p/${task.projectId}?task=${task.id}`}
                  className="truncate font-medium underline-offset-4 hover:underline"
                >
                  {task.title}
                </Link>
                {task.dueDate ? (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                      overdue ? "bg-ember/10 text-ember" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {task.dueDate === today ? "Today" : formatDate(task.dueDate)}
                  </span>
                ) : null}
              </div>
              <p className="truncate text-xs text-muted-foreground">{task.projectName}</p>
              <ul className="flex flex-wrap gap-1.5" aria-label="Why it's at risk">
                {reasons.map((reason) => (
                  <li key={reason} className="rounded-md bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                    {REASON_TEXT[reason]}
                  </li>
                ))}
              </ul>
            </div>
            {canEdit && suggestion ? (
              <Button
                variant="outline"
                size="sm"
                className="justify-self-start sm:justify-self-end"
                onClick={() =>
                  startTransition(async () => {
                    markFixed(task.id);
                    const result = await reassignTask(task.id, suggestion.from?.id ?? null, suggestion.to.id);
                    if (result.ok) {
                      toast.success(`${task.title} is now with ${suggestion.to.name}.`);
                    } else {
                      toast.error(result.message);
                    }
                  })
                }
              >
                {suggestion.from ? `Move to ${suggestion.to.name}` : `Assign to ${suggestion.to.name}`}
                {/* The task's name follows the visible words, so screen readers know which task,
                    and voice control still works by saying what's on the button. */}
                <span className="sr-only">
                  : {task.title}
                  {suggestion.from ? `, from ${suggestion.from.name}` : ""}
                </span>
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
