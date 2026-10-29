import { formatDate } from "@/lib/dates";
import { PRIORITY_LABELS, PROJECT_STATUS_LABELS } from "@/lib/project-constants";

export type ActivityEvent = {
  eventType: string;
  actorId: string | null;
  summary: Record<string, unknown>;
};

const text = (value: unknown, fallback = "something") => (typeof value === "string" && value.trim() ? value : fallback);
const ROLE_WORDS: Record<string, string> = { owner: "an owner", admin: "an admin", member: "a member", viewer: "a viewer" };

/** Looks a stored value up in a label map, without trusting it to be a valid key. */
function labelFrom(labels: Record<string, string>, value: unknown, fallback: string): string {
  return typeof value === "string" && Object.hasOwn(labels, value) ? labels[value] : fallback;
}

/**
 * Turns an audit event into the part of a sentence after the person's
 * name: "moved Write brief from To do to Done". `nameOf` looks up people
 * mentioned in the event (assignees, members) by id.
 */
export function describeActivity(event: ActivityEvent, nameOf: (userId: string) => string): string {
  const s = event.summary;
  const title = text(s.title, "a task");
  const name = text(s.name, "a project");
  const person = typeof s.user_id === "string" ? nameOf(s.user_id) : "someone";

  switch (event.eventType) {
    case "task.created":
      return `added ${title}`;
    case "task.moved":
      return `moved ${title} from ${text(s.from, "a column")} to ${text(s.to, "a column")}`;
    case "task.renamed":
      return `renamed ${text(s.from)} to ${text(s.to)}`;
    case "task.due_changed":
      return typeof s.to === "string" ? `set ${title} to be due ${formatDate(s.to)}` : `removed the due date from ${title}`;
    case "task.priority_changed":
      return `set ${title} to ${labelFrom(PRIORITY_LABELS, s.to, "a new").toLowerCase()} priority`;
    case "task.archived":
      return `archived ${title}`;
    case "task.unarchived":
      return `brought back ${title} from the archive`;
    case "task.deleted":
      return `deleted ${title}`;
    case "task.restored":
      return `restored ${title}`;
    case "task.assigned":
      return event.actorId && s.user_id === event.actorId ? `took on ${title}` : `assigned ${person} to ${title}`;
    case "task.unassigned":
      return `removed ${person} from ${title}`;
    case "comment.added":
      return `commented on ${title}`;
    case "attachment.added":
      return `attached ${text(s.file_name, "a file")}`;
    case "attachment.removed":
      return `removed the file ${text(s.file_name, "a file")}`;
    case "phase.created":
      return `added the phase ${name}`;
    case "phase.updated":
      return `updated the phase ${name}`;
    case "phase.deleted":
      return `removed the phase ${name}`;
    case "project.created":
      return `created the project ${name}`;
    case "project.renamed":
      return `renamed the project ${text(s.from)} to ${text(s.to)}`;
    case "project.status_changed":
      return `marked ${name} as ${labelFrom(PROJECT_STATUS_LABELS, s.to, "changed").toLowerCase()}`;
    case "project.archived":
      return `archived the project ${name}`;
    case "project.unarchived":
      return `restored the project ${name}`;
    case "project.visibility_changed":
      return s.to === "private" ? `made ${name} private` : `shared ${name} with the whole workspace`;
    case "project.owner_changed":
      return typeof s.user_id === "string" ? `made ${person} the owner of ${name}` : `removed the owner of ${name}`;
    case "project.deleted":
      return `deleted the project ${name}`;
    case "member.joined":
      return event.actorId && s.user_id === event.actorId
        ? `joined as ${labelFrom(ROLE_WORDS, s.role, "a member")}`
        : `added ${person} as ${labelFrom(ROLE_WORDS, s.role, "a member")}`;
    case "member.role_changed":
      return `made ${person} ${labelFrom(ROLE_WORDS, s.to, "a member")}`;
    case "member.removed":
      return event.actorId && s.user_id === event.actorId ? "left the workspace" : `removed ${person} from the workspace`;
    case "invitation.sent":
      return `invited ${text(s.email, "someone")} as ${labelFrom(ROLE_WORDS, s.role, "a member")}`;
    case "invitation.revoked":
      return `cancelled the invitation for ${text(s.email, "someone")}`;
    case "invitation.declined":
      return `${text(s.email, "Someone")} declined their invitation`;
    default:
      return "made a change";
  }
}
