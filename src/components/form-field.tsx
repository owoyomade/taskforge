import { useId, type ComponentProps } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/form-state";

type FormFieldProps = ComponentProps<typeof Input> & {
  label: string;
  name: string;
  hint?: string;
  errors?: string[];
};

/**
 * A labelled input with its hint and validation errors wired up through
 * aria-describedby, so screen readers announce them with the field.
 */
export function FormField({ label, name, hint, errors, ...inputProps }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const hasErrors = Boolean(errors?.length);
  const describedBy = [hint ? hintId : null, hasErrors ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        aria-invalid={hasErrors || undefined}
        aria-describedby={describedBy}
        className="h-10"
        {...inputProps}
      />
      {hint && !hasErrors ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {hasErrors ? (
        <p id={errorId} className="text-xs text-destructive">
          {errors?.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

/** The message above a form after a submit: an error or a confirmation. */
export function FormMessage({ state }: { state: FormState }) {
  if (state.status === "idle") {
    return null;
  }
  return (
    <Alert variant={state.status === "error" ? "destructive" : "default"} aria-live="polite">
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

export function fieldErrors(state: FormState, field: string): string[] | undefined {
  return state.status === "error" ? state.fieldErrors?.[field] : undefined;
}

export function previousValue(state: FormState, field: string): string | undefined {
  return state.status === "error" ? state.values?.[field] : undefined;
}
