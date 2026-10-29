import { describe, expect, it } from "vitest";

import { formatDate, dueState } from "@/lib/dates";
import { summarizeProject } from "@/lib/project-stats";
import { sortTasks } from "@/lib/task-sort";

const columns = [
  { id: "todo", name: "To do", isDone: false },
  { id: "done", name: "Done", isDone: true },
];

const task = (id: string, columnId: string, dueDate: string | null, priority: "high" | "low" | "none" = "none") => ({
  id,
  title: id,
  columnId,
  dueDate,
  priority,
  position: Number(id.replace(/\D/g, "")) * 1000,
  updatedAt: `2026-10-${10 + Number(id.replace(/\D/g, ""))}T00:00:00Z`,
});

describe("summarizeProject", () => {
  it("reports no percentage when there are no tasks, instead of inventing 0%", () => {
    const stats = summarizeProject(columns, [], "2026-10-29", "2026-11-05");
    expect(stats.percentDone).toBeNull();
    expect(stats.total).toBe(0);
  });

  it("counts tasks in done columns as complete and ignores them for deadlines", () => {
    const tasks = [
      task("t1", "todo", "2026-10-20", "high"), // overdue
      task("t2", "todo", "2026-10-31"), // due this week
      task("t3", "done", "2026-10-01"), // done, so not overdue
      task("t4", "todo", null, "low"),
    ];
    const stats = summarizeProject(columns, tasks, "2026-10-29", "2026-11-05");

    expect(stats.done).toBe(1);
    expect(stats.percentDone).toBe(25);
    expect(stats.overdue.map((t) => t.id)).toEqual(["t1"]);
    expect(stats.dueThisWeek.map((t) => t.id)).toEqual(["t2"]);
    expect(stats.byColumn).toEqual([
      { id: "todo", name: "To do", count: 3 },
      { id: "done", name: "Done", count: 1 },
    ]);
    expect(stats.byPriority.find((p) => p.priority === "high")?.count).toBe(1);
  });
});

describe("sortTasks", () => {
  const tasks = [task("t3", "done", null, "high"), task("t1", "todo", "2026-11-02", "low"), task("t2", "todo", "2026-10-30")];
  const order = ["todo", "done"];

  it("follows the board: columns left to right, then position", () => {
    expect(sortTasks(tasks, "position", order).map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("sorts by due date with undated tasks last", () => {
    expect(sortTasks(tasks, "due", order).map((t) => t.id)).toEqual(["t2", "t1", "t3"]);
  });

  it("sorts by priority, most urgent first", () => {
    expect(sortTasks(tasks, "priority", order).map((t) => t.id)).toEqual(["t3", "t1", "t2"]);
  });

  it("sorts by most recently updated", () => {
    expect(sortTasks(tasks, "updated", order).map((t) => t.id)).toEqual(["t3", "t2", "t1"]);
  });
});

describe("dates", () => {
  it("formats plain dates without shifting them across timezones", () => {
    expect(formatDate("2026-11-03", new Date("2026-10-29T00:00:00Z"))).toBe("Nov 3");
    expect(formatDate("2027-01-15", new Date("2026-10-29T00:00:00Z"))).toBe("Jan 15, 2027");
  });

  it("classifies how close a due date is", () => {
    expect(dueState("2026-10-28", "2026-10-29")).toBe("overdue");
    expect(dueState("2026-10-29", "2026-10-29")).toBe("today");
    expect(dueState("2026-11-01", "2026-10-29")).toBe("soon");
    expect(dueState("2026-11-10", "2026-10-29")).toBe("later");
  });
});
