import { z } from "zod";

import { PRIORITIES, type TaskPriority } from "@/lib/project-constants";

/**
 * Board and list filters live in the URL (?q=...&priority=high), so a
 * filtered view can be bookmarked or shared, and the server can apply the
 * filters in the database query.
 */
export type TaskFilters = {
  q?: string;
  assignee?: string; // a user id, or "none" for unassigned
  priority?: TaskPriority;
  label?: string;
  due?: "overdue" | "week" | "none";
  sort: "position" | "due" | "priority" | "title" | "updated";
};

const optionalUuid = z.uuid().optional().catch(undefined);

const filterSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  assignee: z.union([z.literal("none"), z.uuid()]).optional().catch(undefined),
  priority: z.enum(PRIORITIES).optional().catch(undefined),
  label: optionalUuid,
  due: z.enum(["overdue", "week", "none"]).optional().catch(undefined),
  sort: z.enum(["position", "due", "priority", "title", "updated"]).catch("position"),
});

/** Reads filters from search params. Anything invalid is ignored rather than erroring. */
export function parseTaskFilters(params: Record<string, string | string[] | undefined>): TaskFilters {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const parsed = filterSchema.parse({
    q: first(params.q) || undefined,
    assignee: first(params.assignee) || undefined,
    priority: first(params.priority) || undefined,
    label: first(params.label) || undefined,
    due: first(params.due) || undefined,
    sort: first(params.sort) ?? "position",
  });
  return { ...parsed, q: parsed.q || undefined };
}

export function hasActiveFilters(filters: TaskFilters): boolean {
  return Boolean(filters.q || filters.assignee || filters.priority || filters.label || filters.due);
}

/**
 * Escapes the wildcard characters of a SQL LIKE pattern so a search for
 * "50%" matches the text "50%" instead of everything starting with "50".
 */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Today's date (YYYY-MM-DD) and the date `days` later, in UTC. */
export function dateRange(days: number, now = new Date()): { today: string; until: string } {
  const today = now.toISOString().slice(0, 10);
  const until = new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  return { today, until };
}
