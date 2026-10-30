"use client";

import { useActionState, useId, useOptimistic, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArchiveIcon, CopyIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";

import {
  addChecklist,
  addChecklistItem,
  addSubtask,
  deleteChecklist,
  deleteChecklistItem,
  duplicateTask,
  moveTaskToColumnEnd,
  setChecklistItemDone,
  setSubtaskCompleted,
  setTaskAssignee,
  setTaskLabel,
  setTaskRemoved,
  updateTask,
} from "@/app/(app)/task-actions";
import { setTaskPhase } from "@/app/(app)/phase-actions";
import { fieldErrors, FormField, FormMessage, previousValue } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import { TaskAttachments } from "./task-attachments";
import { TaskComments } from "./task-comments";
import { formatDate } from "@/lib/dates";
import { initialFormState, type FormState } from "@/lib/form-state";
import type { ActionResult } from "@/lib/project-access";
import { LABEL_STYLES, PRIORITIES, PRIORITY_LABELS } from "@/lib/project-constants";
import type { BoardColumn, LabelView, Person, TaskDetail } from "@/lib/projects";
import { cn } from "@/lib/utils";

type TaskDrawerProps = {
  task: TaskDetail | null;
  columns: BoardColumn[];
  people: Person[];
  labels: LabelView[];
  canEdit: boolean;
  /** Project managers can delete anyone's comments and files. */
  canModerate: boolean;
  currentUserId: string;
  phases: { id: string; name: string }[];
  currentPhaseId: string | null;
};

/**
 * Task details in a side panel. It's driven by the ?task= URL parameter, so
 * a task can be linked to directly and the back button closes it.
 */
export function TaskDrawer({
  task,
  columns,
  people,
  labels,
  canEdit,
  canModerate,
  currentUserId,
  phases,
  currentPhaseId,
}: TaskDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function close() {
    const next = new URLSearchParams(searchParams);
    next.delete("task");
    router.push(next.size > 0 ? `${pathname}?${next.toString()}` : pathname, { scroll: false });
  }

  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {task ? (
          <TaskDetailBody key={`${task.id}:${task.version}`} task={task} {...{ columns, people, labels, canEdit, canModerate, currentUserId, phases, currentPhaseId }} onClose={close} />
        ) : (
          <SheetHeader className="p-6">
            <SheetTitle>Task not found</SheetTitle>
            <SheetDescription>It may have been deleted, or you may no longer have access to it.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}

function useRunAction() {
  const [isPending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult>, success?: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.message);
      else if (success) toast.success(success);
    });
  }
  return { isPending, run };
}

/**
 * Checkboxes that flip the moment they're clicked. The saved value arrives
 * when the server refreshes the page; until then (or if the save fails,
 * when React drops the optimistic value) the box shows the guess.
 */
function useOptimisticToggles(saved: Record<string, boolean>) {
  const [, startTransition] = useTransition();
  const [values, setValue] = useOptimistic(saved, (current, change: { id: string; value: boolean }) => ({
    ...current,
    [change.id]: change.value,
  }));

  function toggle(id: string, value: boolean, action: () => Promise<ActionResult>) {
    startTransition(async () => {
      setValue({ id, value });
      const result = await action();
      if (!result.ok) toast.error(result.message);
    });
  }
  return { values, toggle };
}

function TaskDetailBody({ task, columns, people, labels, canEdit, canModerate, currentUserId, phases, currentPhaseId, onClose }: TaskDrawerProps & { task: TaskDetail; onClose: () => void }) {
  const { isPending, run } = useRunAction();
  const router = useRouter();
  const pathname = usePathname();
  const statusId = useId();
  const phaseId = useId();
  const currentColumn = columns.find((column) => column.id === task.columnId);

  return (
    <div className="grid gap-6 p-6">
      <SheetHeader className="p-0 pr-8">
        <SheetDescription>
          {currentColumn?.name ?? "Task"}
          {task.createdBy ? `, created by ${task.createdBy.name}` : ""}
        </SheetDescription>
        <SheetTitle className="text-xl">{task.title}</SheetTitle>
      </SheetHeader>

      {canEdit ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-40 flex-1 gap-1">
            <Label htmlFor={statusId} className="text-xs text-muted-foreground">
              Status
            </Label>
            <NativeSelect
              id={statusId}
              defaultValue={task.columnId}
              disabled={isPending}
              onChange={(event) => run(() => moveTaskToColumnEnd(task.id, event.target.value), "Task moved.")}
            >
              {columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          {phases.length > 0 ? (
            <div className="grid min-w-40 flex-1 gap-1">
              <Label htmlFor={phaseId} className="text-xs text-muted-foreground">
                Phase
              </Label>
              <NativeSelect
                id={phaseId}
                defaultValue={currentPhaseId ?? ""}
                disabled={isPending}
                onChange={(event) => run(() => setTaskPhase(task.id, event.target.value || null), "Phase updated.")}
              >
                <option value="">No phase</option>
                {phases.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          <Button
            variant="outline"
            className="h-10"
            disabled={isPending}
            onClick={() =>
              run(async () => {
                const result = await duplicateTask(task.id);
                if (result.ok && result.taskId) {
                  router.push(`${pathname}?task=${result.taskId}`, { scroll: false });
                  toast.success("Task duplicated. You're now viewing the copy.");
                }
                return result;
              })
            }
          >
            <CopyIcon />
            Duplicate
          </Button>
          <Button
            variant="outline"
            className="h-10"
            disabled={isPending}
            onClick={() =>
              run(async () => {
                const result = await setTaskRemoved(task.id, "archive");
                if (result.ok) {
                  onClose();
                  toast.success("Task archived.", {
                    action: { label: "Undo", onClick: () => void setTaskRemoved(task.id, "unarchive") },
                  });
                }
                return result;
              })
            }
          >
            <ArchiveIcon />
            Archive
          </Button>
          <Button
            variant="destructive"
            className="h-10"
            disabled={isPending}
            onClick={() =>
              run(async () => {
                const result = await setTaskRemoved(task.id, "delete");
                if (result.ok) {
                  onClose();
                  toast.success("Task deleted.", {
                    action: { label: "Undo", onClick: () => void setTaskRemoved(task.id, "restore") },
                  });
                }
                return result;
              })
            }
          >
            <Trash2Icon />
            Delete
          </Button>
        </div>
      ) : null}

      {canEdit ? <TaskEditForm task={task} /> : <TaskReadOnly task={task} />}

      <PeopleSection task={task} people={people} canEdit={canEdit} />
      <LabelSection task={task} labels={labels} canEdit={canEdit} />
      <SubtaskSection task={task} canEdit={canEdit} />
      <ChecklistSection task={task} canEdit={canEdit} />
      <TaskAttachments
        taskId={task.id}
        attachments={task.attachments}
        currentUserId={currentUserId}
        canUpload={canEdit}
        canModerate={canModerate}
      />
      <TaskComments
        taskId={task.id}
        comments={task.comments}
        people={people}
        currentUserId={currentUserId}
        canComment={canEdit}
        canModerate={canModerate}
      />

      <p className="text-xs text-muted-foreground">Created {formatDate(task.createdAt.slice(0, 10))}</p>
    </div>
  );
}

function TaskEditForm({ task }: { task: TaskDetail }) {
  // The toast is shown straight from the action's result: a successful save
  // bumps the task's version, which remounts this form before an effect
  // watching the state would get the chance to run.
  const [state, formAction, isPending] = useActionState(async (previous: FormState, formData: FormData) => {
    const result = await updateTask(previous, formData);
    if (result.status === "success") toast.success(result.message);
    return result;
  }, initialFormState);
  const ids = { description: useId(), priority: useId() };

  const value = (field: string, fallback: string) => previousValue(state, field) ?? fallback;

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      {state.status === "error" ? <FormMessage state={state} /> : null}
      <input type="hidden" name="taskId" value={task.id} />
      <input type="hidden" name="version" value={task.version} />
      <FormField label="Title" name="title" required maxLength={200} defaultValue={value("title", task.title)} errors={fieldErrors(state, "title")} />
      <div className="grid gap-1.5">
        <Label htmlFor={ids.description}>Description</Label>
        <Textarea
          id={ids.description}
          name="description"
          maxLength={10_000}
          rows={5}
          defaultValue={value("description", task.description)}
          placeholder="Add details, links or acceptance criteria"
        />
      </div>
      {/* Dates get a row of their own: three columns left the date fields too
          narrow to show a full date in the drawer. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
          <Label htmlFor={ids.priority}>Priority</Label>
          <NativeSelect id={ids.priority} name="priority" defaultValue={value("priority", task.priority)}>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <FormField label="Start date" name="startDate" type="date" defaultValue={value("startDate", task.startDate ?? "")} errors={fieldErrors(state, "startDate")} />
        <FormField label="Due date" name="dueDate" type="date" defaultValue={value("dueDate", task.dueDate ?? "")} errors={fieldErrors(state, "dueDate")} />
      </div>
      <Button type="submit" className="justify-self-start" disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

function TaskReadOnly({ task }: { task: TaskDetail }) {
  return (
    <dl className="grid gap-3 text-sm">
      <div>
        <dt className="font-medium">Description</dt>
        {/* whitespace-pre-wrap keeps the author's line breaks; the text is never parsed as HTML. */}
        <dd className="whitespace-pre-wrap text-muted-foreground">{task.description || "No description."}</dd>
      </div>
      <div className="flex flex-wrap gap-6">
        <div>
          <dt className="font-medium">Priority</dt>
          <dd className="text-muted-foreground">{PRIORITY_LABELS[task.priority]}</dd>
        </div>
        <div>
          <dt className="font-medium">Start</dt>
          <dd className="text-muted-foreground">{task.startDate ? formatDate(task.startDate) : "None"}</dd>
        </div>
        <div>
          <dt className="font-medium">Due</dt>
          <dd className="text-muted-foreground">{task.dueDate ? formatDate(task.dueDate) : "None"}</dd>
        </div>
      </div>
    </dl>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="grid gap-2 border-t pt-4">
      <h3 id={headingId} className="text-sm font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

function PeopleSection({ task, people, canEdit }: { task: TaskDetail; people: Person[]; canEdit: boolean }) {
  const assigned = new Set(task.assignees.map((person) => person.id));
  const { values, toggle } = useOptimisticToggles(Object.fromEntries(people.map((person) => [person.id, assigned.has(person.id)])));

  if (!canEdit) {
    return (
      <Section title="Assignees">
        {task.assignees.length === 0 ? <p className="text-sm text-muted-foreground">Nobody yet.</p> : <PersonList people={task.assignees} />}
      </Section>
    );
  }

  return (
    <Section title="Assignees">
      <ul className="grid gap-1">
        {people.map((person) => (
          <li key={person.id}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-muted">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={values[person.id] ?? false}
                onChange={(event) => {
                  const checked = event.target.checked;
                  toggle(person.id, checked, () => setTaskAssignee(task.id, person.id, checked));
                }}
              />
              <UserAvatar name={person.name} email={person.email} avatarUrl={person.avatarUrl} className="size-6" />
              {person.name}
            </label>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function PersonList({ people }: { people: Person[] }) {
  return (
    <ul className="grid gap-1.5">
      {people.map((person) => (
        <li key={person.id} className="flex items-center gap-2.5 text-sm">
          <UserAvatar name={person.name} email={person.email} avatarUrl={person.avatarUrl} className="size-6" />
          {person.name}
        </li>
      ))}
    </ul>
  );
}

function LabelSection({ task, labels, canEdit }: { task: TaskDetail; labels: LabelView[]; canEdit: boolean }) {
  const shown = canEdit ? labels : task.labels;
  const attachedIds = new Set(task.labels.map((label) => label.id));
  const { values: attached, toggle } = useOptimisticToggles(Object.fromEntries(labels.map((label) => [label.id, attachedIds.has(label.id)])));

  return (
    <Section title="Labels">
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {canEdit ? "No labels in this workspace yet. Add them in workspace settings." : "No labels."}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {shown.map((label) => (
            <li key={label.id}>
              {canEdit ? (
                <label
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                    attached[label.id] ? LABEL_STYLES[label.color] : "bg-muted text-muted-foreground",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={attached[label.id] ?? false}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      toggle(label.id, checked, () => setTaskLabel(task.id, label.id, checked));
                    }}
                  />
                  {attached[label.id] ? "✓ " : ""}
                  {label.name}
                </label>
              ) : (
                <span className={cn("rounded-md px-2 py-1 text-xs font-medium", LABEL_STYLES[label.color])}>{label.name}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function SubtaskSection({ task, canEdit }: { task: TaskDetail; canEdit: boolean }) {
  const { isPending, run } = useRunAction();
  const { values: completed, toggle } = useOptimisticToggles(
    Object.fromEntries(task.subtaskItems.map((subtask) => [subtask.id, subtask.completed])),
  );

  return (
    <Section title={`Subtasks${task.subtaskItems.length ? ` (${task.subtasks.done}/${task.subtasks.total})` : ""}`}>
      {task.subtaskItems.length === 0 && !canEdit ? <p className="text-sm text-muted-foreground">None.</p> : null}
      <ul className="grid gap-1">
        {task.subtaskItems.map((subtask) => (
          <li key={subtask.id} className="group flex items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-muted">
            <input
              type="checkbox"
              id={`subtask-${subtask.id}`}
              className="size-4 accent-primary"
              checked={completed[subtask.id] ?? false}
              disabled={!canEdit}
              onChange={(event) => {
                const checked = event.target.checked;
                toggle(subtask.id, checked, () => setSubtaskCompleted(subtask.id, checked));
              }}
            />
            <label htmlFor={`subtask-${subtask.id}`} className={cn("flex-1", completed[subtask.id] && "text-muted-foreground line-through")}>
              {subtask.title}
            </label>
            {canEdit ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove subtask ${subtask.title}`}
                disabled={isPending}
                onClick={() => run(() => setTaskRemoved(subtask.id, "delete"))}
              >
                <XIcon />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? <InlineAdd label="Add a subtask" placeholder="Subtask title" onAdd={(title) => addSubtask(task.id, title)} /> : null}
    </Section>
  );
}

function ChecklistSection({ task, canEdit }: { task: TaskDetail; canEdit: boolean }) {
  const { isPending, run } = useRunAction();
  const { values: doneItems, toggle } = useOptimisticToggles(
    Object.fromEntries(task.checklists.flatMap((checklist) => checklist.items.map((item) => [item.id, item.isDone]))),
  );

  return (
    <Section title="Checklists">
      {task.checklists.length === 0 ? <p className="text-sm text-muted-foreground">No checklists.</p> : null}
      {task.checklists.map((checklist) => {
        const done = checklist.items.filter((item) => doneItems[item.id]).length;
        return (
          <div key={checklist.id} className="grid gap-1 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm font-medium">
                {checklist.title}{" "}
                <span className="font-normal text-muted-foreground">
                  {done}/{checklist.items.length}
                </span>
              </p>
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={isPending}
                  onClick={() => run(() => deleteChecklist(checklist.id), "Checklist removed.")}
                >
                  Remove
                </Button>
              ) : null}
            </div>
            <ul className="grid gap-1">
              {checklist.items.map((item) => (
                <li key={item.id} className="flex items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    id={`item-${item.id}`}
                    className="size-4 accent-primary"
                    checked={doneItems[item.id] ?? false}
                    disabled={!canEdit}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      toggle(item.id, checked, () => setChecklistItemDone(item.id, checked));
                    }}
                  />
                  <label htmlFor={`item-${item.id}`} className={cn("flex-1", doneItems[item.id] && "text-muted-foreground line-through")}>
                    {item.content}
                  </label>
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${item.content}`}
                      disabled={isPending}
                      onClick={() => run(() => deleteChecklistItem(item.id))}
                    >
                      <XIcon />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            {canEdit ? (
              <InlineAdd label={`Add an item to ${checklist.title}`} placeholder="Item" onAdd={(content) => addChecklistItem(checklist.id, content)} />
            ) : null}
          </div>
        );
      })}
      {canEdit ? (
        <Button variant="outline" size="sm" className="justify-self-start" disabled={isPending} onClick={() => run(() => addChecklist(task.id))}>
          <PlusIcon />
          Add checklist
        </Button>
      ) : null}
    </Section>
  );
}

/** A one-line "type and press Enter" form for subtasks and checklist items. */
function InlineAdd({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (text: string) => Promise<ActionResult> }) {
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputId = useId();

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await onAdd(text);
          if (result.ok) setText("");
          else toast.error(result.message);
        });
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <Input id={inputId} value={text} onChange={(event) => setText(event.target.value)} placeholder={placeholder} maxLength={300} className="h-9" />
      <Button type="submit" size="sm" variant="secondary" className="h-9" disabled={isPending || !text.trim()}>
        Add
      </Button>
    </form>
  );
}
