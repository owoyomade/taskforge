"use client";

import { useActionState, useEffect, useId, useTransition } from "react";
import { toast } from "sonner";

import { deleteProject, setProjectArchived, setProjectMember, updateProject } from "@/app/(app)/project-actions";
import { setTaskRemoved } from "@/app/(app)/task-actions";
import { saveProjectAsTemplate } from "@/app/(app)/template-actions";
import { ColorPicker } from "@/components/color-picker";
import { fieldErrors, FormField, FormMessage, previousValue } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import { initialFormState } from "@/lib/form-state";
import type { ActionResult } from "@/lib/project-access";
import { asColor, PROJECT_STATUS_LABELS, PROJECT_STATUSES } from "@/lib/project-constants";
import type { Person, ProjectDetail, RemovedTask } from "@/lib/projects";

/** Runs a non-form Server Action and reports the outcome as a toast. */
export function useActionToast() {
  const [isPending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(successMessage);
      else toast.error(result.message);
    });
  }
  return { isPending, run };
}

export function ProjectDetailsForm({ project, owners }: { project: ProjectDetail; owners: Person[] }) {
  const [state, formAction, isPending] = useActionState(updateProject, initialFormState);
  const ids = { description: useId(), status: useId(), visibility: useId(), owner: useId() };

  useEffect(() => {
    if (state.status === "success") toast.success(state.message);
  }, [state]);

  const value = (field: string, fallback: string) => previousValue(state, field) ?? fallback;

  return (
    <form action={formAction} className="grid max-w-xl gap-4" noValidate>
      {state.status === "error" ? <FormMessage state={state} /> : null}
      <input type="hidden" name="projectId" value={project.id} />
      <FormField
        label="Project name"
        name="name"
        required
        maxLength={80}
        defaultValue={value("name", project.name)}
        errors={fieldErrors(state, "name")}
      />
      <div className="grid gap-1.5">
        <Label htmlFor={ids.description}>Description</Label>
        <Textarea id={ids.description} name="description" maxLength={2000} defaultValue={value("description", project.description)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={ids.status}>Status</Label>
          <NativeSelect id={ids.status} name="status" defaultValue={value("status", project.status)}>
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PROJECT_STATUS_LABELS[status]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={ids.owner}>Owner</Label>
          <NativeSelect id={ids.owner} name="ownerId" defaultValue={value("ownerId", project.ownerId ?? "")}>
            <option value="">No owner</option>
            {owners.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <FormField
          label="Start date"
          name="startDate"
          type="date"
          defaultValue={value("startDate", project.startDate ?? "")}
          errors={fieldErrors(state, "startDate")}
        />
        <FormField
          label="Target date"
          name="targetDate"
          type="date"
          defaultValue={value("targetDate", project.targetDate ?? "")}
          errors={fieldErrors(state, "targetDate")}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={ids.visibility}>Who can see it</Label>
        <NativeSelect id={ids.visibility} name="visibility" defaultValue={value("visibility", project.visibility)}>
          <option value="workspace">Everyone in the workspace</option>
          <option value="private">Only project members (and workspace admins)</option>
        </NativeSelect>
      </div>
      <ColorPicker name="color" legend="Colour" defaultValue={asColor(value("color", project.color))} />
      <Button type="submit" className="justify-self-start" disabled={isPending}>
        {isPending ? "Saving…" : "Save project"}
      </Button>
    </form>
  );
}

export function ProjectMembersList({
  projectId,
  people,
  memberIds,
  ownerId,
}: {
  projectId: string;
  people: Person[];
  memberIds: string[];
  ownerId: string | null;
}) {
  const { isPending, run } = useActionToast();
  const members = new Set(memberIds);

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {people.map((person) => {
        const isMember = members.has(person.id) || person.id === ownerId;
        return (
          <li key={person.id} className="flex items-center gap-3 px-4 py-3">
            <UserAvatar name={person.name} email={person.email} avatarUrl={person.avatarUrl} className="size-8" />
            <span className="min-w-0 flex-1 truncate text-sm">{person.name}</span>
            {person.id === ownerId ? (
              <span className="text-xs text-muted-foreground">Project owner</span>
            ) : (
              <Button
                variant={isMember ? "outline" : "secondary"}
                size="sm"
                disabled={isPending}
                onClick={() =>
                  run(
                    () => setProjectMember(projectId, person.id, !isMember),
                    isMember ? `${person.name} removed from the project.` : `${person.name} added to the project.`,
                  )
                }
              >
                {isMember ? "Remove" : "Add"}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function RemovedTasksList({ tasks }: { tasks: RemovedTask[] }) {
  const { isPending, run } = useActionToast();

  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing archived or deleted.</p>;
  }

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-center gap-3 px-4 py-3">
          <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
          <span className="text-xs text-muted-foreground">{task.deletedAt ? "Deleted" : "Archived"}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => run(() => setTaskRemoved(task.id, "restore"), "Task restored to the board.")}
          >
            Restore
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function ArchiveProjectButton({ project }: { project: ProjectDetail }) {
  const { isPending, run } = useActionToast();
  const archived = Boolean(project.archivedAt);

  return (
    <Button
      variant="outline"
      disabled={isPending}
      onClick={() =>
        run(() => setProjectArchived(project.id, !archived), archived ? "Project restored." : "Project archived.")
      }
    >
      {archived ? "Restore project" : "Archive project"}
    </Button>
  );
}

export function DeleteProjectDialog({ project }: { project: ProjectDetail }) {
  const [state, formAction, isPending] = useActionState(deleteProject, initialFormState);

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="destructive" />}>Delete project</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {project.name}?</DialogTitle>
          <DialogDescription>
            This permanently deletes the project, its board and all of its tasks. It can&apos;t be undone. To keep
            the history, archive the project instead.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4" noValidate>
          {state.status === "error" && !state.fieldErrors ? <FormMessage state={state} /> : null}
          <input type="hidden" name="projectId" value={project.id} />
          <FormField
            label={`Type ${project.name} to confirm`}
            name="confirmName"
            autoComplete="off"
            required
            errors={fieldErrors(state, "confirmName")}
          />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? "Deleting…" : "Delete project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SaveAsTemplateForm({ project }: { project: ProjectDetail }) {
  const [state, formAction, isPending] = useActionState(saveProjectAsTemplate, initialFormState);
  const descriptionId = useId();

  useEffect(() => {
    if (state.status === "success") toast.success(state.message);
  }, [state]);

  return (
    <form action={formAction} className="grid max-w-xl gap-4" noValidate>
      {state.status === "error" && !state.fieldErrors ? <FormMessage state={state} /> : null}
      <input type="hidden" name="projectId" value={project.id} />
      <FormField
        label="Template name"
        name="name"
        required
        maxLength={80}
        defaultValue={previousValue(state, "name") ?? project.name}
        errors={fieldErrors(state, "name")}
      />
      <div className="grid gap-1.5">
        <Label htmlFor={descriptionId}>What is it for? (optional)</Label>
        <Textarea id={descriptionId} name="description" maxLength={300} rows={2} defaultValue={previousValue(state, "description")} />
      </div>
      <Button type="submit" variant="outline" className="justify-self-start" disabled={isPending}>
        {isPending ? "Saving…" : "Save as template"}
      </Button>
    </form>
  );
}
