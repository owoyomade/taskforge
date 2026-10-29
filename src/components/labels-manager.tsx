"use client";

import { useActionState, useEffect, useTransition } from "react";
import { XIcon } from "lucide-react";
import { toast } from "sonner";

import { createLabel, deleteLabel } from "@/app/(app)/project-actions";
import { ColorPicker } from "@/components/color-picker";
import { fieldErrors, FormField, FormMessage, previousValue } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { initialFormState } from "@/lib/form-state";
import { asColor, LABEL_STYLES } from "@/lib/project-constants";
import type { LabelView } from "@/lib/projects";
import { cn } from "@/lib/utils";

export function LabelsManager({ workspaceId, labels, canManage }: { workspaceId: string; labels: LabelView[]; canManage: boolean }) {
  const [state, formAction, isAdding] = useActionState(createLabel, initialFormState);
  const [isDeleting, startDeleting] = useTransition();

  useEffect(() => {
    if (state.status === "success") toast.success(state.message);
  }, [state]);

  return (
    <div className="grid gap-4">
      {labels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No labels yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {labels.map((label) => (
            <li key={label.id} className={cn("inline-flex items-center gap-1 rounded-md py-1 pr-1 pl-2 text-xs font-medium", LABEL_STYLES[label.color])}>
              {label.name}
              {canManage ? (
                <button
                  type="button"
                  aria-label={`Delete label ${label.name}`}
                  disabled={isDeleting}
                  className="rounded p-0.5 outline-none hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() =>
                    startDeleting(async () => {
                      const result = await deleteLabel(workspaceId, label.id);
                      if (result.ok) toast.success(`Label ${label.name} deleted.`);
                      else toast.error(result.message);
                    })
                  }
                >
                  <XIcon className="size-3" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form action={formAction} className="grid max-w-md gap-4" noValidate>
          {state.status === "error" && !state.fieldErrors ? <FormMessage state={state} /> : null}
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <FormField label="New label" name="name" maxLength={30} required defaultValue={previousValue(state, "name")} errors={fieldErrors(state, "name")} />
          <ColorPicker name="color" legend="Label colour" defaultValue={asColor(previousValue(state, "color") ?? "slate")} />
          <Button type="submit" variant="secondary" className="justify-self-start" disabled={isAdding}>
            {isAdding ? "Adding…" : "Add label"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
