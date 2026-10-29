"use client";

import { useActionState, useId } from "react";
import { PlusIcon } from "lucide-react";

import { createProject } from "@/app/(app)/project-actions";
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
import { initialFormState } from "@/lib/form-state";
import { asColor } from "@/lib/project-constants";

export function NewProjectDialog({ workspaceId }: { workspaceId: string }) {
  const [state, formAction, isPending] = useActionState(createProject, initialFormState);
  const descriptionId = useId();
  const visibilityId = useId();

  return (
    <Dialog>
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        New project
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>It starts with a To do, In progress and Done board you can change later.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4" noValidate>
          {state.status === "error" && !state.fieldErrors ? <FormMessage state={state} /> : null}
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <FormField
            label="Project name"
            name="name"
            required
            maxLength={80}
            defaultValue={previousValue(state, "name")}
            errors={fieldErrors(state, "name")}
          />
          <div className="grid gap-1.5">
            <Label htmlFor={descriptionId}>Description (optional)</Label>
            <Textarea id={descriptionId} name="description" maxLength={2000} defaultValue={previousValue(state, "description")} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={visibilityId}>Who can see it</Label>
            <NativeSelect id={visibilityId} name="visibility" defaultValue={previousValue(state, "visibility") ?? "workspace"}>
              <option value="workspace">Everyone in the workspace</option>
              <option value="private">Only people I add (and workspace admins)</option>
            </NativeSelect>
          </div>
          <ColorPicker name="color" legend="Colour" defaultValue={asColor(previousValue(state, "color") ?? "teal")} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
