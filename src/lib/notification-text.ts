type NotificationText = { kind: "assigned" | "mentioned" | "commented"; actorName: string; taskTitle: string };

/** One plain sentence per notification, e.g. "Dave assigned you to Design pricing page". */
export function describeNotification({ kind, actorName, taskTitle }: NotificationText): string {
  switch (kind) {
    case "assigned":
      return `${actorName} assigned you to ${taskTitle}`;
    case "mentioned":
      return `${actorName} mentioned you in ${taskTitle}`;
    case "commented":
      return `${actorName} commented on ${taskTitle}`;
  }
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago", or a date. */
export function timeAgo(iso: string, now = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso));
}
