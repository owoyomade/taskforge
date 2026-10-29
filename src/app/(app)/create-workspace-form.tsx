"use client";

import { useActionState } from "react";

import { fieldErrors, FormField, FormMessage, previousValue } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { initialFormState } from "@/lib/form-state";
import { createWorkspace } from "./workspace-actions";

export function CreateWorkspaceForm() {
  const [state, formAction, isPending] = useActionState(createWorkspace, initialFormState);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <FormField
        label="Workspace name"
        name="name"
        required
        maxLength={60}
        placeholder="e.g. Northwind Design"
        hint="Usually your team or company name. You can change it later."
        defaultValue={previousValue(state, "name")}
        errors={fieldErrors(state, "name")}
      />
      <Button type="submit" size="lg" className="h-10" disabled={isPending}>
        {isPending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
