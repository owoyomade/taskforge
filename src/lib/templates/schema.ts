import { z } from "zod";

import { COLORS, PRIORITIES } from "@/lib/project-constants";

/**
 * The shape of a project template, shared by the built-in library, saved
 * team templates and the create_project_from_template() database function.
 *
 * Offsets are days relative to the project's finish date: -14 means "two
 * weeks before the finish date", 0 means "on the finish date". Indexes
 * ("phase", "column") point into the phases and columns arrays.
 */
export const templateDefinitionSchema = z.object({
  columns: z
    .array(z.object({ name: z.string().trim().min(1).max(40), isDone: z.boolean().optional() }))
    .min(1)
    .max(8),
  labels: z.array(z.object({ name: z.string().trim().min(1).max(30), color: z.enum(COLORS) })).max(20).optional(),
  phases: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        description: z.string().max(1000).optional(),
        offsetDays: z.number().int().min(-730).max(0),
      }),
    )
    .max(12),
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().max(10_000).optional(),
        phase: z.number().int().min(0).optional(),
        column: z.number().int().min(0).optional(),
        priority: z.enum(PRIORITIES).optional(),
        dueOffsetDays: z.number().int().min(-730).max(0).optional(),
        labels: z.array(z.string().trim().min(1).max(30)).max(5).optional(),
        checklist: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
        subtasks: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
      }),
    )
    .max(150),
});

export type TemplateDefinition = z.infer<typeof templateDefinitionSchema>;
