import { describe, expect, it } from "vitest";

import { BLANK_TEMPLATE, TEMPLATE_CATEGORIES, TEMPLATES } from "@/lib/templates/library";
import { templateDefinitionSchema } from "@/lib/templates/schema";

describe("built-in template library", () => {
  it("has a broad library with every category represented", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(25);
    for (const category of TEMPLATE_CATEGORIES) {
      expect(TEMPLATES.filter((template) => template.category === category).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses unique ids", () => {
    const ids = [BLANK_TEMPLATE, ...TEMPLATES].map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each([BLANK_TEMPLATE, ...TEMPLATES].map((template) => [template.name, template] as const))(
    "%s is a valid template the database will accept",
    (_name, template) => {
      expect(() => templateDefinitionSchema.parse(template.definition)).not.toThrow();
      const { columns, phases, tasks } = template.definition;

      // Every task points at a real phase and column, and has a done column to move into.
      expect(columns.some((column) => column.isDone)).toBe(true);
      for (const task of tasks) {
        expect(task.phase ?? 0).toBeLessThan(Math.max(phases.length, 1));
        expect(task.column ?? 0).toBeLessThan(columns.length);
      }

      // Phases run in order: no phase ends before the one before it.
      const ends = phases.map((phase) => phase.offsetDays);
      expect([...ends].sort((a, b) => a - b)).toEqual(ends);

      // Labels used by tasks are defined by the template.
      const labelNames = new Set((template.definition.labels ?? []).map((label) => label.name));
      for (const task of tasks) for (const label of task.labels ?? []) expect(labelNames.has(label)).toBe(true);
    },
  );

  it("has templates people can actually start from (not empty shells)", () => {
    for (const template of TEMPLATES) {
      expect(template.definition.phases.length).toBeGreaterThanOrEqual(3);
      expect(template.definition.tasks.length).toBeGreaterThanOrEqual(6);
    }
  });
});
