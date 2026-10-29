import { describe, expect, it } from "vitest";

import { dateRange, escapeLikePattern, hasActiveFilters, parseTaskFilters } from "@/lib/task-filters";

const USER_ID = "a1a1a1a1-0000-4000-8000-000000000001";

describe("parseTaskFilters", () => {
  it("reads valid filters from search params", () => {
    expect(parseTaskFilters({ q: " logo ", assignee: USER_ID, priority: "high", due: "week", sort: "due" })).toEqual({
      q: "logo",
      assignee: USER_ID,
      priority: "high",
      label: undefined,
      due: "week",
      sort: "due",
    });
  });

  it("ignores invalid values instead of failing the page", () => {
    const filters = parseTaskFilters({ assignee: "'; drop table tasks; --", priority: "extreme", due: "yesterday", sort: "random" });
    expect(filters).toEqual({ q: undefined, assignee: undefined, priority: undefined, label: undefined, due: undefined, sort: "position" });
  });

  it("accepts 'none' for unassigned and uses the first of repeated params", () => {
    expect(parseTaskFilters({ assignee: ["none", USER_ID] }).assignee).toBe("none");
  });

  it("treats a blank search as no search", () => {
    expect(hasActiveFilters(parseTaskFilters({ q: "   " }))).toBe(false);
    expect(hasActiveFilters(parseTaskFilters({ priority: "low" }))).toBe(true);
  });
});

describe("escapeLikePattern", () => {
  it("escapes LIKE wildcards so they match literally", () => {
    expect(escapeLikePattern("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("dateRange", () => {
  it("returns today and a later date as YYYY-MM-DD", () => {
    expect(dateRange(7, new Date("2026-10-29T23:30:00Z"))).toEqual({ today: "2026-10-29", until: "2026-11-05" });
  });
});
