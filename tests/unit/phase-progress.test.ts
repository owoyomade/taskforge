import { describe, expect, it } from "vitest";

import { journeySummary, phaseStates } from "@/lib/phase-progress";

const phase = (id: string, done: number, total: number, targetDate: string | null = null) => ({
  id,
  name: id,
  targetDate,
  done,
  total,
});

describe("phaseStates", () => {
  it("marks finished phases done and the first unfinished one as current", () => {
    const states = phaseStates([phase("Plan", 3, 3), phase("Build", 1, 4), phase("Launch", 0, 2)], "2026-11-01");
    expect(states.map((state) => state.status)).toEqual(["done", "current", "upcoming"]);
    expect(states[1].percent).toBe(25);
  });

  it("never invents progress for an empty phase", () => {
    const [state] = phaseStates([phase("Plan", 0, 0)], "2026-11-01");
    expect(state.status).toBe("current");
    expect(state.percent).toBeNull();
  });

  it("flags unfinished phases past their date, but not finished ones", () => {
    const states = phaseStates([phase("Plan", 2, 2, "2026-10-01"), phase("Build", 1, 3, "2026-10-20")], "2026-11-01");
    expect(states.map((state) => state.isOverdue)).toEqual([false, true]);
  });

  it("shows a later finished phase as done even if an earlier one is still open", () => {
    const states = phaseStates([phase("Plan", 1, 2), phase("Build", 2, 2)], "2026-11-01");
    expect(states.map((state) => state.status)).toEqual(["current", "done"]);
  });
});

describe("journeySummary", () => {
  it("describes where the project is in plain words", () => {
    expect(journeySummary(phaseStates([phase("Plan", 2, 2), phase("Build", 1, 4)], "2026-11-01"))).toBe(
      "In Build, 1 of 4 done",
    );
    expect(journeySummary(phaseStates([phase("Plan", 2, 2)], "2026-11-01"))).toBe("All phases done");
    expect(journeySummary([])).toBe("No phases yet");
  });
});
