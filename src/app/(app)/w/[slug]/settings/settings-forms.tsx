"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { fieldErrors, FormField, FormMessage, previousValue } from "@/components/form-field";
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
import { initialFormState } from "@/lib/form-state";
import type { WorkspaceSummary } from "@/lib/workspaces";
import { deleteWorkspace, renameWorkspace, setWeeklyCapacity } from "../../../workspace-actions";

export function RenameWorkspaceForm({ workspace }: { workspace: WorkspaceSummary }) {
  const [state, formAction, isPending] = useActionState(renameWorkspace, initialFormState);

  // A toast confirms the save without moving the page layout around.
  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    }
  }, [state]);

  return (
    <form action={formAction} className="grid max-w-md gap-4" noValidate>
      {state.status === "error" ? <FormMessage state={state} /> : null}
      <input type="hidden" name="workspaceId" value={workspace.id} />
      <FormField
        label="Workspace name"
        name="name"
        required
        maxLength={60}
        defaultValue={previousValue(state, "name") ?? workspace.name}
        errors={fieldErrors(state, "name")}
      />
      <Button type="submit" className="justify-self-start" disabled={isPending}>
        {isPending ? "Saving…" : "Save name"}
      </Button>
    </form>
  );
}

export function CapacityForm({ workspace, capacity }: { workspace: WorkspaceSummary; capacity: number }) {
  const [state, formAction, isPending] = useActionState(setWeeklyCapacity, initialFormState);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    }
  }, [state]);

  return (
    <form action={formAction} className="grid max-w-md gap-4" noValidate>
      {state.status === "error" && !state.fieldErrors ? <FormMessage state={state} /> : null}
      <input type="hidden" name="workspaceId" value={workspace.id} />
      <FormField
        label="Tasks per person per week"
        name="capacity"
        type="number"
        inputMode="numeric"
        min={1}
        max={50}
        required
        className="max-w-28"
        hint="The workload radar marks anyone with more open tasks due in a week than this."
        defaultValue={previousValue(state, "capacity") ?? String(capacity)}
        errors={fieldErrors(state, "capacity")}
      />
      <Button type="submit" className="justify-self-start" disabled={isPending}>
        {isPending ? "Saving…" : "Save capacity"}
      </Button>
    </form>
  );
}

export function DeleteWorkspaceDialog({ workspace }: { workspace: WorkspaceSummary }) {
  const [state, formAction, isPending] = useActionState(deleteWorkspace, initialFormState);

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="destructive" />}>Delete workspace</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {workspace.name}?</DialogTitle>
          <DialogDescription>
            This permanently deletes the workspace and everything in it for every member. It can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4" noValidate>
          {state.status === "error" && !state.fieldErrors ? <FormMessage state={state} /> : null}
          <input type="hidden" name="workspaceId" value={workspace.id} />
          <FormField
            label={`Type ${workspace.name} to confirm`}
            name="confirmName"
            autoComplete="off"
            required
            errors={fieldErrors(state, "confirmName")}
          />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? "Deleting…" : "Delete workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
