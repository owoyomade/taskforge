import { describe, expect, it } from "vitest";

import { findColumnOf, groupTasks, moveTaskInGroups, neighbours } from "@/components/board/board-state";

const tasks = [
  { id: "t1", columnId: "todo" },
  { id: "t2", columnId: "todo" },
  { id: "t3", columnId: "doing" },
];
const groups = groupTasks(["todo", "doing", "done"], tasks);

describe("groupTasks", () => {
  it("groups tasks by column, keeping order and empty columns", () => {
    expect(groups.todo.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(groups.done).toEqual([]);
  });

  it("ignores tasks whose column isn't on the board", () => {
    const result = groupTasks(["todo"], [{ id: "x", columnId: "gone" }]);
    expect(result).toEqual({ todo: [] });
  });
});

describe("moveTaskInGroups", () => {
  it("moves a task into another column at the given index and updates its columnId", () => {
    const next = moveTaskInGroups(groups, "t1", "doing", 0);
    expect(next.todo.map((t) => t.id)).toEqual(["t2"]);
    expect(next.doing.map((t) => t.id)).toEqual(["t1", "t3"]);
    expect(next.doing[0].columnId).toBe("doing");
  });

  it("reorders within a column", () => {
    const next = moveTaskInGroups(groups, "t1", "todo", 1);
    expect(next.todo.map((t) => t.id)).toEqual(["t2", "t1"]);
  });

  it("can drop into an empty column and doesn't change the original", () => {
    const next = moveTaskInGroups(groups, "t3", "done", 5);
    expect(next.done.map((t) => t.id)).toEqual(["t3"]);
    expect(groups.doing.map((t) => t.id)).toEqual(["t3"]);
  });

  it("returns the same groups for an unknown task or column", () => {
    expect(moveTaskInGroups(groups, "missing", "todo", 0)).toBe(groups);
    expect(moveTaskInGroups(groups, "t1", "missing", 0)).toBe(groups);
  });
});

describe("neighbours and findColumnOf", () => {
  it("finds the tasks either side of a task", () => {
    expect(neighbours(groups.todo, "t1")).toEqual({ beforeId: null, afterId: "t2" });
    expect(neighbours(groups.todo, "t2")).toEqual({ beforeId: "t1", afterId: null });
  });

  it("finds which column holds a task", () => {
    expect(findColumnOf(groups, "t3")).toBe("doing");
    expect(findColumnOf(groups, "nope")).toBeUndefined();
  });
});
