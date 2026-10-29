import { z } from "zod";

import { COLORS, PRIORITIES, PROJECT_STATUSES } from "@/lib/project-constants";

// Shared input rules. Server Actions validate every submission with these;
// the browser may run them too, but only the server's check counts.

// Trim and lowercase first, then check the format, so " Ana@Example.com "
// is accepted and stored as "ana@example.com".
const email = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address."));

// Matches the Supabase Auth settings in supabase/config.toml. 72 is bcrypt's
// input limit: anything longer would be silently truncated.
export const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use 72 characters or fewer.")
  .regex(/[a-zA-Z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

const fullName = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(80, "Use 80 characters or fewer.");

export const signUpSchema = z.object({ fullName, email, password });

// Sign-in deliberately doesn't apply the password rules: an old account might
// predate them, and the error should come from Supabase, not from us.
export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(72),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(72),
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export const profileSchema = z.object({ fullName });

// Same limits as the check constraint on public.workspaces.name.
export const workspaceNameSchema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters.").max(60, "Use 60 characters or fewer."),
});

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Projects and tasks (Phase 2). Limits mirror the database check constraints.
// ---------------------------------------------------------------------------

/** An optional date from an <input type="date">: "" becomes null. */
const optionalDate = z
  .string()
  .trim()
  .transform((value) => value || null)
  .pipe(z.iso.date("Enter a valid date.").nullable());

const colorSchema = z.enum(COLORS);

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1, "Enter a project name.").max(80, "Use 80 characters or fewer."),
  description: z.string().trim().max(2000, "Use 2,000 characters or fewer."),
  visibility: z.enum(["workspace", "private"]),
  color: colorSchema,
});

export const projectUpdateSchema = projectCreateSchema
  .extend({
    status: z.enum(PROJECT_STATUSES),
    startDate: optionalDate,
    targetDate: optionalDate,
    ownerId: z.union([z.literal(""), z.uuid()]).transform((value) => value || null),
  })
  .refine((data) => !data.startDate || !data.targetDate || data.targetDate >= data.startDate, {
    message: "The target date can't be before the start date.",
    path: ["targetDate"],
  });

export const columnNameSchema = z.string().trim().min(1, "Enter a column name.").max(40, "Use 40 characters or fewer.");

export const taskTitleSchema = z.string().trim().min(1, "Enter a task title.").max(200, "Use 200 characters or fewer.");

export const taskUpdateSchema = z
  .object({
    title: taskTitleSchema,
    description: z.string().max(10_000, "Use 10,000 characters or fewer."),
    priority: z.enum(PRIORITIES),
    startDate: optionalDate,
    dueDate: optionalDate,
    version: z.coerce.number().int().positive(),
  })
  .refine((data) => !data.startDate || !data.dueDate || data.dueDate >= data.startDate, {
    message: "The due date can't be before the start date.",
    path: ["dueDate"],
  });

export const labelSchema = z.object({
  name: z.string().trim().min(1, "Enter a label name.").max(30, "Use 30 characters or fewer."),
  color: colorSchema,
});

export const checklistItemSchema = z.string().trim().min(1, "Enter an item.").max(300, "Use 300 characters or fewer.");
