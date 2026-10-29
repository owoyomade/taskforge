"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useId, useOptimistic, useState, useSyncExternalStore, useTransition } from "react";
import { MoreHorizontalIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { createPhase, createTaskInPhase, deletePhase, updatePhase } from "@/app/(app)/phase-actions";
import { setTaskDone } from "@/app/(app)/task-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/user-avatar";
import { dueState, formatDate } from "@/lib/dates";
import type { PhaseState } from "@/lib/phase-progress";
import type { ActionResult } from "@/lib/project-access";
import type { BoardColumn, TaskCard } from "@/lib/projects";
import { cn } from "@/lib/utils";

type PlanViewProps = {
  projectId: string;
  phases: (PhaseState & { taskIds: string[] })[];
  tasks: TaskCard[];
  columns: BoardColumn[];
  canEdit: boolean;
  today: string;
};

const TIP_KEY = "taskforge:plan-tip-dismissed";

// The tip's "dismissed" flag lives in browser storage: a per-person
// convenience, so it's fine if storage is blocked (the tip just shows).
const tipListeners = new Set<() => void>();

function readTipDismissed(): boolean {
  try {
    return window.localStorage.getItem(TIP_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribeToTip(listener: () => void) {
  tipListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    tipListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function dismissTip() {
  try {
    window.localStorage.setItem(TIP_KEY, "1");
  } catch {
    // Storage unavailable; the tip comes back next visit.
  }
  tipListeners.forEach((listener) => listener());
}

/**
 * The project as a plan: each phase is a section with its tasks as a
 * checklist. Ticking a box is all it takes to finish a task; columns are
 * handled behind the scenes (see setTaskDone).
 */
export function PlanView({ projectId, phases, tasks, columns, canEdit, today }: PlanViewProps) {
  const doneColumns = new Set(columns.filter((column) => column.isDone).map((column) => column.id));
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const phasedIds = new Set(phases.flatMap((phase) => phase.taskIds));
  const unphased = tasks.filter((task) => !phasedIds.has(task.id));
  // The server can't see browser storage, so it renders without the tip.
  const showTip = !useSyncExternalStore(subscribeToTip, readTipDismissed, () => true);

  return (
    <div className="grid max-w-4xl gap-8">
      {showTip ? (
        <aside className="relative grid gap-1 rounded-2xl bg-accent/60 p-5 pr-12 text-sm" aria-label="How the plan works">
          <p className="font-semibold">How this works</p>
          <p className="text-accent-foreground/90">
            Your project is split into phases, the big steps from start to finish. Tick a task when it&apos;s done and
            the journey above moves along. Click any task to add details, people or files. Prefer columns? Try the
            Board tab.
          </p>
          <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label="Dismiss tip" onClick={dismissTip}>
            <XIcon />
          </Button>
        </aside>
      ) : null}

      {phases.map((phase, index) => (
        <PhaseSection
          key={phase.id}
          number={index + 1}
          phase={phase}
          tasks={phase.taskIds.flatMap((id) => tasksById.get(id) ?? [])}
          projectId={projectId}
          doneColumns={doneColumns}
          canEdit={canEdit}
          today={today}
        />
      ))}

      {unphased.length > 0 || phases.length === 0 ? (
        <TaskSection
          title={phases.length === 0 ? "Tasks" : "Not in a phase yet"}
          description={phases.length === 0 ? "Add phases to break the project into big steps." : "Open a task to put it in a phase."}
          tasks={unphased}
          projectId={projectId}
          phaseId={null}
          doneColumns={doneColumns}
          canEdit={canEdit}
          today={today}
        />
      ) : null}

      {canEdit ? <AddPhase projectId={projectId} /> : null}
    </div>
  );
}

function PhaseSection({
  number,
  phase,
  tasks,
  projectId,
  doneColumns,
  canEdit,
  today,
}: {
  number: number;
  phase: PhaseState & { taskIds: string[] };
  tasks: TaskCard[];
  projectId: string;
  doneColumns: Set<string>;
  canEdit: boolean;
  today: string;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const statusLabel = phase.status === "done" ? "Done" : phase.status === "current" ? "You are here" : "Coming up";

  return (
    <section id={`phase-${phase.id}`} aria-labelledby={`phase-${phase.id}-heading`} className="scroll-mt-6 grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold",
            phase.status === "done" && "bg-leaf text-white",
            phase.status === "current" && "bg-sun text-sun-foreground",
            phase.status === "upcoming" && "border-2 border-border text-muted-foreground",
          )}
        >
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`phase-${phase.id}-heading`} className="text-xl font-bold">
            {phase.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            <span className={cn(phase.status === "current" && "font-semibold text-foreground")}>{statusLabel}</span>
            {phase.total > 0 ? `, ${phase.done} of ${phase.total} done` : ", no tasks yet"}
            {phase.targetDate ? (
              <span className={cn(phase.isOverdue && "font-semibold text-ember")}>
                {phase.isOverdue ? `, overdue since ${formatDate(phase.targetDate)}` : `, by ${formatDate(phase.targetDate)}`}
              </span>
            ) : null}
          </p>
        </div>
        {canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Options for phase ${phase.name}`} />}>
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setEditing(true)}>Rename or change date</DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deletePhase(phase.id);
                    if (result.ok) toast.success(`Phase ${phase.name} removed. Its tasks are still in the project.`);
                    else toast.error(result.message);
                  })
                }
              >
                Remove phase
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {phase.percent !== null ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-leaf transition-[width]" style={{ width: `${phase.percent}%` }} />
        </div>
      ) : null}

      <TaskRows tasks={tasks} doneColumns={doneColumns} canEdit={canEdit} today={today} />
      {canEdit ? <QuickAdd projectId={projectId} phaseId={phase.id} label={`Add a task to ${phase.name}`} /> : null}

      <PhaseDialog
        open={editing}
        onOpenChange={setEditing}
        title="Edit phase"
        initial={{ name: phase.name, targetDate: phase.targetDate ?? "" }}
        submitLabel="Save phase"
        onSubmit={(values) => updatePhase(phase.id, values)}
      />
    </section>
  );
}

function TaskSection({
  title,
  description,
  tasks,
  projectId,
  phaseId,
  doneColumns,
  canEdit,
  today,
}: {
  title: string;
  description: string;
  tasks: TaskCard[];
  projectId: string;
  phaseId: string | null;
  doneColumns: Set<string>;
  canEdit: boolean;
  today: string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="grid gap-3">
      <div>
        <h2 id={headingId} className="text-xl font-bold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <TaskRows tasks={tasks} doneColumns={doneColumns} canEdit={canEdit} today={today} />
      {canEdit ? <QuickAdd projectId={projectId} phaseId={phaseId} label="Add a task" /> : null}
    </section>
  );
}

function TaskRows({
  tasks,
  doneColumns,
  canEdit,
  today,
}: {
  tasks: TaskCard[];
  doneColumns: Set<string>;
  canEdit: boolean;
  today: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  // Checkboxes flip instantly; the refreshed page confirms (or React rolls back on failure).
  const [doneState, setDone] = useOptimistic(
    Object.fromEntries(tasks.map((task) => [task.id, doneColumns.has(task.columnId)])),
    (current, change: { id: string; done: boolean }) => ({ ...current, [change.id]: change.done }),
  );

  if (tasks.length === 0) {
    return <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">No tasks in this phase yet.</p>;
  }

  function taskHref(taskId: string) {
    const query = new URLSearchParams(searchParams);
    query.set("task", taskId);
    return `${pathname}?${query.toString()}`;
  }

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {tasks.map((task) => {
        const isDone = doneState[task.id] ?? false;
        const due = task.dueDate && !isDone ? dueState(task.dueDate, today) : null;
        return (
          <li key={task.id} className="flex items-center gap-3 px-4 py-3">
            <input
              type="checkbox"
              aria-label={isDone ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
              className="size-5 shrink-0 cursor-pointer accent-leaf disabled:cursor-default"
              checked={isDone}
              disabled={!canEdit}
              onChange={(event) => {
                const done = event.target.checked;
                startTransition(async () => {
                  setDone({ id: task.id, done });
                  const result = await setTaskDone(task.id, done);
                  if (!result.ok) toast.error(result.message);
                });
              }}
            />
            <Link
              href={taskHref(task.id)}
              scroll={false}
              className={cn("min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline", isDone && "text-muted-foreground line-through")}
            >
              {task.title}
            </Link>
            {task.assignees.length > 0 ? (
              <span className="hidden -space-x-1.5 sm:flex" aria-label={`Assigned to ${task.assignees.map((person) => person.name).join(", ")}`}>
                {task.assignees.slice(0, 3).map((person) => (
                  <UserAvatar key={person.id} name={person.name} email={person.email} avatarUrl={person.avatarUrl} className="size-6 ring-2 ring-card" />
                ))}
              </span>
            ) : null}
            {task.dueDate && !isDone ? (
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  due === "overdue" ? "bg-ember/10 text-ember" : due === "today" ? "bg-sun text-sun-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {due === "today" ? "Today" : formatDate(task.dueDate)}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function QuickAdd({ projectId, phaseId, label }: { projectId: string; phaseId: string | null; label: string }) {
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputId = useId();

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await createTaskInPhase(projectId, phaseId, title);
          if (result.ok) setTitle("");
          else toast.error(result.message);
        });
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <Input
        id={inputId}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={200}
        placeholder={`${label}…`}
        className="h-10 rounded-xl"
      />
      <Button type="submit" variant="secondary" className="h-10" disabled={isPending || !title.trim()}>
        <PlusIcon />
        Add
      </Button>
    </form>
  );
}

function AddPhase({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="h-11 justify-self-start border-dashed" onClick={() => setOpen(true)}>
        <PlusIcon />
        Add a phase
      </Button>
      <PhaseDialog
        open={open}
        onOpenChange={setOpen}
        title="Add a phase"
        description="A phase is one big step, like Plan, Build or Launch."
        initial={{ name: "", targetDate: "" }}
        submitLabel="Add phase"
        onSubmit={(values) => createPhase(projectId, values)}
      />
    </>
  );
}

function PhaseDialog({
  open,
  onOpenChange,
  title,
  description,
  initial,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initial: { name: string; targetDate: string };
  submitLabel: string;
  onSubmit: (values: { name: string; targetDate: string }) => Promise<ActionResult>;
}) {
  const [isPending, startTransition] = useTransition();
  const ids = { name: useId(), date: useId() };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const values = { name: String(data.get("name") ?? ""), targetDate: String(data.get("targetDate") ?? "") };
            startTransition(async () => {
              const result = await onSubmit(values);
              if (result.ok) onOpenChange(false);
              else toast.error(result.message);
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor={ids.name}>Phase name</Label>
            <Input id={ids.name} name="name" defaultValue={initial.name} maxLength={80} required className="h-10" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={ids.date}>Finish this phase by (optional)</Label>
            <Input id={ids.date} name="targetDate" type="date" defaultValue={initial.targetDate} className="h-10" />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
