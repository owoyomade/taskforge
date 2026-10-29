import type { z } from "zod";

/**
 * The value every form's Server Action returns to `useActionState`.
 *
 * `fieldErrors` holds per-input messages; `message` is shown above the form.
 * `values` echoes back what the user typed (never passwords) so a failed
 * submit doesn't wipe the form.
 */
export type FormState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[] | undefined>;
      values?: Record<string, string>;
    };

export const initialFormState: FormState = { status: "idle" };

export function validationError(
  error: z.ZodError,
  values?: Record<string, string>,
): FormState {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    (fieldErrors[field] ??= []).push(issue.message);
  }
  return { status: "error", message: "Please fix the highlighted fields.", fieldErrors, values };
}

/** Reads a text field from FormData, treating missing or file values as "". */
export function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
