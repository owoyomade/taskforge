/**
 * Formats a calendar date ("2026-11-03") for display, e.g. "Nov 3".
 *
 * Due dates are plain dates with no time of day, so they're formatted in
 * UTC. Formatting in the viewer's own timezone could shift "Nov 3" to
 * "Nov 2" for someone west of UTC.
 */
export function formatDate(isoDate: string, today = new Date()): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const sameYear = date.getUTCFullYear() === today.getUTCFullYear();
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  }).format(date);
}

export type DueState = "overdue" | "today" | "soon" | "later";

/** How urgent a due date is relative to today (both YYYY-MM-DD). */
export function dueState(dueDate: string, today: string): DueState {
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  const days = (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return days <= 3 ? "soon" : "later";
}
