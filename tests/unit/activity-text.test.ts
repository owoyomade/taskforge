import { describe, expect, it } from "vitest";

import { describeActivity } from "@/lib/activity-text";
import { describeNotification, timeAgo } from "@/lib/notification-text";

const names: Record<string, string> = { u1: "Ada", u2: "Ben" };
const nameOf = (id: string) => names[id] ?? "a former member";
const describe_ = (eventType: string, summary: Record<string, unknown>, actorId: string | null = "u1") =>
  describeActivity({ eventType, actorId, summary }, nameOf);

describe("describeActivity", () => {
  it("describes task changes in plain words", () => {
    expect(describe_("task.created", { title: "Write brief" })).toBe("added Write brief");
    expect(describe_("task.moved", { title: "Write brief", from: "To do", to: "Done" })).toBe("moved Write brief from To do to Done");
    expect(describe_("task.due_changed", { title: "Brief", to: "2026-11-03" })).toBe("set Brief to be due Nov 3");
    expect(describe_("task.due_changed", { title: "Brief", to: null })).toBe("removed the due date from Brief");
    expect(describe_("task.priority_changed", { title: "Brief", to: "urgent" })).toBe("set Brief to urgent priority");
  });

  it("names the people involved, and notices when someone acts on themselves", () => {
    expect(describe_("task.assigned", { title: "Brief", user_id: "u2" })).toBe("assigned Ben to Brief");
    expect(describe_("task.assigned", { title: "Brief", user_id: "u1" })).toBe("took on Brief");
    expect(describe_("member.removed", { user_id: "u1" })).toBe("left the workspace");
    expect(describe_("member.role_changed", { user_id: "u2", from: "member", to: "admin" })).toBe("made Ben an admin");
    expect(describe_("member.removed", { user_id: "gone" })).toBe("removed a former member from the workspace");
  });

  it("copes with unexpected or missing values instead of failing", () => {
    expect(describe_("task.priority_changed", { title: "Brief", to: "__proto__" })).toBe("set Brief to a new priority");
    expect(describe_("task.moved", {})).toBe("moved a task from a column to a column");
    expect(describe_("something.new", {})).toBe("made a change");
  });
});

describe("notifications", () => {
  it("reads as one sentence per kind", () => {
    expect(describeNotification({ kind: "assigned", actorName: "Ada", taskTitle: "Brief" })).toBe("Ada assigned you to Brief");
    expect(describeNotification({ kind: "mentioned", actorName: "Ada", taskTitle: "Brief" })).toBe("Ada mentioned you in Brief");
    expect(describeNotification({ kind: "commented", actorName: "Ada", taskTitle: "Brief" })).toBe("Ada commented on Brief");
  });

  it("shows friendly relative times", () => {
    const now = new Date("2026-11-02T12:00:00Z");
    expect(timeAgo("2026-11-02T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-11-02T11:55:00Z", now)).toBe("5 minutes ago");
    expect(timeAgo("2026-11-02T09:00:00Z", now)).toBe("3 hours ago");
    expect(timeAgo("2026-10-31T12:00:00Z", now)).toBe("2 days ago");
    expect(timeAgo("2026-10-01T12:00:00Z", now)).toBe("Oct 1");
  });
});
