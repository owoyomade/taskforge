import { describe, expect, it } from "vitest";

import { buildRadar, loadLevel, weekStart, type RadarTask } from "@/lib/workload";

// Wednesday 4 November 2026: this week runs Monday 2 to Sunday 8 November.
const TODAY = "2026-11-04";
const ALEX = { id: "alex", name: "Alex" };
const SAM = { id: "sam", name: "Sam" };
const PRIYA = { id: "priya", name: "Priya" };
const PEOPLE = [ALEX, SAM, PRIYA];

let nextId = 0;
function task(overrides: Partial<RadarTask>): RadarTask {
  nextId += 1;
  return {
    id: `t${nextId}`,
    title: `Task ${nextId}`,
    projectId: "p1",
    projectName: "Launch",
    dueDate: "2026-11-20",
    isDone: false,
    inFirstColumn: false,
    assigneeIds: [],
    lastActivityOn: TODAY,
    assignableIds: ["alex", "sam", "priya"],
    ...overrides,
  };
}

const radar = (tasks: RadarTask[], capacity = 5) => buildRadar({ tasks, people: PEOPLE, capacity, today: TODAY });
const reasonsOf = (result: ReturnType<typeof radar>, id: string) => result.risks.find((risk) => risk.task.id === id)?.reasons;

describe("weekStart", () => {
  it("finds the Monday on or before a date", () => {
    expect(weekStart("2026-11-02")).toBe("2026-11-02");
    expect(weekStart("2026-11-04")).toBe("2026-11-02");
    expect(weekStart("2026-11-08")).toBe("2026-11-02"); // Sunday ends the week
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
  });
});

describe("loadLevel", () => {
  it("is near from 80% of capacity and over beyond it", () => {
    expect(loadLevel(3, 5)).toBe("ok");
    expect(loadLevel(4, 5)).toBe("near");
    expect(loadLevel(5, 5)).toBe("near");
    expect(loadLevel(6, 5)).toBe("over");
    expect(loadLevel(0, 1)).toBe("ok");
    expect(loadLevel(1, 1)).toBe("near");
  });
});

describe("weekly load", () => {
  it("counts open tasks per person in the week they're due, for four weeks", () => {
    const result = radar([
      task({ assigneeIds: ["sam"], dueDate: "2026-11-05" }),
      task({ assigneeIds: ["sam", "alex"], dueDate: "2026-11-08" }),
      task({ assigneeIds: ["sam"], dueDate: "2026-11-12" }),
      task({ assigneeIds: ["sam"], dueDate: "2026-11-29" }), // last day of week 4
      task({ assigneeIds: ["sam"], dueDate: "2026-11-30" }), // beyond the radar
    ]);
    expect(result.weeks.map((week) => week.start)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]);
    expect(result.people[0]).toMatchObject({ id: "sam", weeks: [{ count: 2 }, { count: 1 }, { count: 0 }, { count: 1 }] });
    expect(result.people.find((person) => person.id === "alex")?.weeks[0].count).toBe(1);
  });

  it("counts overdue work as this week's and ignores done and undated tasks", () => {
    const result = radar([
      task({ assigneeIds: ["alex"], dueDate: "2026-10-20" }),
      task({ assigneeIds: ["alex"], dueDate: "2026-11-03", isDone: true }),
      task({ assigneeIds: ["alex"], dueDate: null }),
    ]);
    expect(result.people.find((person) => person.id === "alex")?.weeks.map((week) => week.count)).toEqual([1, 0, 0, 0]);
  });

  it("lists everyone, busiest first, and keeps a row for someone no longer in the team", () => {
    const result = radar([
      task({ assigneeIds: ["priya"], dueDate: "2026-11-05" }),
      task({ assigneeIds: ["gone"], dueDate: "2026-11-05" }),
      task({ assigneeIds: ["gone"], dueDate: "2026-11-06" }),
    ]);
    expect(result.people.map((person) => person.name)).toEqual(["Former teammate", "Priya", "Alex", "Sam"]);
  });

  it("names a current member who can't take new work but still has some (a viewer)", () => {
    const result = buildRadar({
      tasks: [task({ assigneeIds: ["vera"], dueDate: "2026-11-05" })],
      people: PEOPLE,
      everyone: [...PEOPLE, { id: "vera", name: "Vera" }],
      capacity: 5,
      today: TODAY,
    });
    expect(result.people[0]).toMatchObject({ id: "vera", name: "Vera" });
  });
});

describe("risk reasons", () => {
  it("flags overdue tasks", () => {
    const late = task({ assigneeIds: ["alex"], dueDate: "2026-11-03" });
    expect(reasonsOf(radar([late]), late.id)).toEqual(["overdue"]);
  });

  it("flags tasks due within 3 days that are still in the first column", () => {
    const soon = task({ assigneeIds: ["alex"], dueDate: "2026-11-07", inFirstColumn: true });
    const later = task({ assigneeIds: ["alex"], dueDate: "2026-11-08", inFirstColumn: true });
    const result = radar([soon, later]);
    expect(reasonsOf(result, soon.id)).toEqual(["not_started"]);
    expect(reasonsOf(result, later.id)).toBeUndefined();
  });

  it("flags unassigned tasks due within a week", () => {
    const soon = task({ dueDate: "2026-11-11" });
    const later = task({ dueDate: "2026-11-12" });
    const result = radar([soon, later]);
    expect(reasonsOf(result, soon.id)).toEqual(["unassigned"]);
    expect(reasonsOf(result, later.id)).toBeUndefined();
  });

  it("flags tasks due within 2 weeks that haven't changed for 2 weeks", () => {
    const quiet = task({ assigneeIds: ["alex"], dueDate: "2026-11-18", lastActivityOn: "2026-10-21" });
    const recent = task({ assigneeIds: ["alex"], dueDate: "2026-11-18", lastActivityOn: "2026-10-22" });
    const farOff = task({ assigneeIds: ["alex"], dueDate: "2026-11-19", lastActivityOn: "2026-09-01" });
    const result = radar([quiet, recent, farOff]);
    expect(reasonsOf(result, quiet.id)).toEqual(["quiet"]);
    expect(reasonsOf(result, recent.id)).toBeUndefined();
    expect(reasonsOf(result, farOff.id)).toBeUndefined();
  });

  it("never flags done tasks or tasks without a due date", () => {
    const result = radar([task({ dueDate: "2026-10-01", isDone: true }), task({ dueDate: null, inFirstColumn: true })]);
    expect(result.risks).toEqual([]);
  });

  it("puts the most urgent first", () => {
    const later = task({ dueDate: "2026-11-10" });
    const late = task({ assigneeIds: ["alex"], dueDate: "2026-11-01" });
    expect(radar([later, late]).risks.map((risk) => risk.task.id)).toEqual([late.id, later.id]);
  });
});

describe("overload and suggestions", () => {
  const samsWeek = (extra: Partial<RadarTask> = {}) =>
    Array.from({ length: 6 }, (_, index) => task({ assigneeIds: ["sam"], dueDate: `2026-11-1${index}`, ...extra }));

  it("flags every task of a person over capacity that week and suggests the lightest teammate", () => {
    const tasks = [...samsWeek(), task({ assigneeIds: ["alex"], dueDate: "2026-11-12" })];
    const result = radar(tasks);
    const samsRisks = result.risks.filter((risk) => risk.task.assigneeIds.includes("sam"));
    expect(samsRisks).toHaveLength(6);
    expect(samsRisks.every((risk) => risk.reasons.includes("overloaded"))).toBe(true);
    // Priya has nothing that week; Alex has one.
    expect(samsRisks[0].suggestion).toEqual({ from: SAM, to: PRIYA });
  });

  it("doesn't flag someone exactly at capacity", () => {
    const tasks = samsWeek().slice(0, 5);
    expect(radar(tasks).risks).toEqual([]);
  });

  it("only suggests people who can be assigned in that project and who have room", () => {
    const tasks = [
      ...samsWeek({ assignableIds: ["sam", "alex"] }),
      ...Array.from({ length: 5 }, () => task({ assigneeIds: ["alex"], dueDate: "2026-11-13" })),
    ];
    // Priya can't be assigned there, and Alex would go over capacity.
    expect(radar(tasks).risks.find((risk) => risk.task.assigneeIds.includes("sam"))?.suggestion).toBeNull();
  });

  it("suggests someone for unassigned work too", () => {
    const loose = task({ dueDate: "2026-11-05" });
    const result = radar([loose, task({ assigneeIds: ["alex"], dueDate: "2026-11-05" })]);
    expect(result.risks[0].suggestion).toEqual({ from: null, to: PRIYA });
  });

  it("follows the workspace's capacity", () => {
    const tasks = [task({ assigneeIds: ["sam"], dueDate: "2026-11-05" }), task({ assigneeIds: ["sam"], dueDate: "2026-11-06" })];
    expect(radar(tasks, 1).risks.every((risk) => risk.reasons.includes("overloaded"))).toBe(true);
    expect(radar(tasks, 2).risks).toEqual([]);
  });
});
