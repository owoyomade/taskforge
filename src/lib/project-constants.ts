// These mirror the database's enum types; db/tests/hardening.test.sql fails
// if the two ever drift apart.
export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";
export type ProjectStatus = "planned" | "active" | "on_hold" | "completed";
export type ProjectVisibility = "workspace" | "private";

// Must match the check constraints on projects.color and labels.color.
export const COLORS = ["teal", "blue", "violet", "rose", "amber", "slate"] as const;
export type Color = (typeof COLORS)[number];

export const COLOR_LABELS: Record<Color, string> = {
  teal: "Teal",
  blue: "Blue",
  violet: "Violet",
  rose: "Rose",
  amber: "Amber",
  slate: "Slate",
};

// Full class names written out so Tailwind can find them when it scans the code.
export const COLOR_SWATCH: Record<Color, string> = {
  teal: "bg-teal-600",
  blue: "bg-blue-600",
  violet: "bg-violet-600",
  rose: "bg-rose-600",
  amber: "bg-amber-500",
  slate: "bg-slate-500",
};

export const LABEL_STYLES: Record<Color, string> = {
  teal: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200",
  blue: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  violet: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  rose: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  slate: "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-200",
};

function isColor(value: string): value is Color {
  return (COLORS as readonly string[]).includes(value);
}

/** Database colors are plain text; this narrows them, falling back to slate. */
export function asColor(value: string): Color {
  return isColor(value) ? value : "slate";
}

export const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const satisfies readonly TaskPriority[];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

// Lower sorts first: urgent work at the top.
export const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

export const PROJECT_STATUSES = ["planned", "active", "on_hold", "completed"] as const satisfies readonly ProjectStatus[];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: "Planned",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
};
