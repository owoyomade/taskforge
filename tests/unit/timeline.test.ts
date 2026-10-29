import { describe, expect, it } from "vitest";

import { buildTimeline } from "@/lib/timeline";

const phases = [
  { id: "p1", name: "Plan", targetDate: "2026-11-10", taskIds: ["t1"] },
  { id: "p2", name: "Build", targetDate: "2026-11-20", taskIds: ["t2", "t3"] },
];
const tasks = [
  { id: "t1", title: "Brief", startDate: null, dueDate: "2026-11-08" },
  { id: "t2", title: "Build pages", startDate: "2026-11-12", dueDate: "2026-11-18" },
  { id: "t3", title: "Someday", startDate: null, dueDate: null },
  { id: "t4", title: "Loose task", startDate: null, dueDate: "2026-11-15" },
];

describe("buildTimeline", () => {
  const timeline = buildTimeline(phases, tasks, { projectStart: "2026-11-01", today: "2026-11-05" });

  it("starts a few days before the earliest date and covers the latest", () => {
    expect(timeline.start).toBe("2026-10-29");
    expect(timeline.days).toBeGreaterThanOrEqual(23 + 1);
  });

  it("runs each phase from the previous phase's end to its own date", () => {
    const [plan, , build] = timeline.rows.filter((row) => row.kind === "phase" || row.id === "t1");
    expect(plan).toMatchObject({ kind: "phase", start: 3, end: 12 });
    expect(build).toMatchObject({ kind: "phase", start: 12, end: 22 });
  });

  it("draws dated tasks under their phase and lists undated ones separately", () => {
    expect(timeline.rows.map((row) => row.id)).toEqual(["p1", "t1", "p2", "t2", "t4"]);
    expect(timeline.rows.find((row) => row.id === "t2")).toMatchObject({ start: 14, end: 20 });
    expect(timeline.undated).toEqual([{ id: "t3", title: "Someday" }]);
  });

  it("marks today and labels months", () => {
    expect(timeline.todayIndex).toBe(7);
    expect(timeline.months.map((month) => month.label)).toEqual(["Oct 2026", "Nov 2026"]);
  });

  it("still produces a usable chart for a project with no dates", () => {
    const empty = buildTimeline([], [{ id: "x", title: "X", startDate: null, dueDate: null }], { projectStart: null, today: "2026-11-05" });
    expect(empty.days).toBeGreaterThanOrEqual(14);
    expect(empty.rows).toEqual([]);
    expect(empty.undated).toHaveLength(1);
  });
});
