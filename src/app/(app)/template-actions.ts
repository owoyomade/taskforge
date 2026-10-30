"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { asCurrentUser, attemptAsCurrentUser } from "@/lib/db";
import { toUserMessage } from "@/lib/db-errors";
import { textField, validationError, type FormState } from "@/lib/form-state";
import { hasProjectAccess, NO_PERMISSION, type ActionResult } from "@/lib/project-access";
import { asColor, COLORS, type TaskPriority } from "@/lib/project-constants";
import { getProjectForUser, listColumns, listPhases } from "@/lib/projects";
import { findTemplate } from "@/lib/templates/library";
import { templateDefinitionSchema, type TemplateDefinition } from "@/lib/templates/schema";
import { listMyWorkspaces } from "@/lib/workspaces";

const newProjectSchema = z.object({
  name: z.string().trim().min(1, "Give your project a name.").max(80, "Use 80 characters or fewer."),
  finishDate: z
    .string()
    .trim()
    .transform((value) => value || null)
    .pipe(z.iso.date("Choose a valid date.").nullable()),
  visibility: z.enum(["workspace", "private"]),
  color: z.enum(COLORS),
});

/** Loads a template's definition: "builtin:<id>" from code, "saved:<uuid>" from the database. */
async function loadDefinition(workspaceId: string, templateRef: string): Promise<TemplateDefinition | null> {
  const [kind, id] = templateRef.split(":");
  if (kind === "builtin") {
    return findTemplate(id)?.definition ?? null;
  }
  if (kind === "saved" && z.uuid().safeParse(id).success) {
    const [data] = await asCurrentUser((db) =>
      db.query<{ definition: unknown }>("select definition from public.project_templates where id = $1 and workspace_id = $2", [id, workspaceId]),
    );
    // Saved definitions are re-validated in case they were edited outside the app.
    const parsed = templateDefinitionSchema.safeParse(data?.definition);
    return parsed.success ? parsed.data : null;
  }
  return null;
}

export async function createProjectFromTemplate(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = {
    name: textField(formData, "name"),
    finishDate: textField(formData, "finishDate"),
    visibility: textField(formData, "visibility"),
    color: textField(formData, "color"),
  };
  const parsed = newProjectSchema.safeParse(values);
  if (!parsed.success) return validationError(parsed.error, values);

  const workspaceId = textField(formData, "workspaceId");
  const workspace = (await listMyWorkspaces()).find((candidate) => candidate.id === workspaceId);
  if (!workspace || workspace.role === "viewer") {
    return { status: "error", message: "You don't have permission to create projects here.", values };
  }

  const definition = await loadDefinition(workspace.id, textField(formData, "templateRef"));
  if (!definition) {
    return { status: "error", message: "That template couldn't be found. Pick another one.", values };
  }

  const result = await attemptAsCurrentUser((db) =>
    db.query<{ id: string }>(
      `select (public.create_project_from_template(
         target_workspace => $1, project_name => $2, project_description => '', project_visibility => $3,
         project_color => $4, finish_date => $5, template => $6::jsonb
       )).id`,
      [workspace.id, parsed.data.name, parsed.data.visibility, parsed.data.color, parsed.data.finishDate ?? null, JSON.stringify(definition)],
    ),
  );
  if (!result.ok) return { status: "error", message: toUserMessage(result.error, "createProjectFromTemplate"), values };

  revalidatePath("/w/[slug]", "layout");
  redirect(`/w/${workspace.slug}/p/${result.value[0].id}`);
}

const saveTemplateSchema = z.object({
  name: z.string().trim().min(1, "Give the template a name.").max(80),
  description: z.string().trim().max(300, "Keep the description under 300 characters."),
});

/**
 * Saves a project's current structure (columns, phases, tasks, checklists
 * and subtasks, but not people, comments or files) as a reusable template.
 * Dates are stored relative to the project's finish date so the template
 * works for any future finish date.
 */
export async function saveProjectAsTemplate(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = { name: textField(formData, "name"), description: textField(formData, "description") };
  const parsed = saveTemplateSchema.safeParse(values);
  if (!parsed.success) return validationError(parsed.error, values);

  const projectId = textField(formData, "projectId");
  if (!z.uuid().safeParse(projectId).success || !(await hasProjectAccess(projectId, "edit"))) {
    return { status: "error", message: "You don't have permission to do that.", values };
  }

  const [projectRow] = await asCurrentUser((db) =>
    db.query<{ workspace_id: string }>("select workspace_id from public.projects where id = $1", [projectId]),
  );
  if (!projectRow) return { status: "error", message: "That project no longer exists.", values };

  const project = await getProjectForUser(projectRow.workspace_id, projectId);
  const [columns, phasesByProject, rows] = await Promise.all([
    listColumns(project.id),
    listPhases(project.workspaceId, project.id),
    asCurrentUser(async (db) => ({
      tasks: await db.query<{
        id: string;
        title: string;
        description: string;
        priority: TaskPriority;
        due_date: string | null;
        column_id: string | null;
        parent_task_id: string | null;
      }>(
        `select id, title, description, priority, due_date, column_id, parent_task_id from public.tasks
         where project_id = $1 and archived_at is null and deleted_at is null order by position limit 400`,
        [project.id],
      ),
      labelLinks: await db.query<{ task_id: string; label_id: string }>("select task_id, label_id from public.task_labels where project_id = $1", [project.id]),
      labels: await db.query<{ id: string; name: string; color: string }>("select id, name, color from public.labels where workspace_id = $1", [project.workspaceId]),
      checklistItems: await db.query<{ task_id: string; content: string }>(
        "select task_id, content from public.checklist_items where project_id = $1 order by position",
        [project.id],
      ),
    })),
  ]);
  const { tasks, labelLinks, labels, checklistItems } = rows;

  const phases = phasesByProject.get(project.id) ?? [];
  const anchor = project.targetDate;
  const offsetFrom = (date: string | null) =>
    anchor && date ? Math.min(0, Math.round((Date.parse(date) - Date.parse(anchor)) / 86_400_000)) : undefined;
  const phaseOfTask = new Map(phases.flatMap((phase, index) => phase.taskIds.map((id) => [id, index] as const)));
  const labelById = new Map(labels.map((label) => [label.id, label]));
  const topLevel = tasks.filter((task) => !task.parent_task_id);
  const usedLabelIds = new Set(labelLinks.map((link) => link.label_id));

  const definition: TemplateDefinition = {
    columns: columns.map((column) => ({ name: column.name, isDone: column.isDone })),
    labels: [...usedLabelIds].flatMap((id) => {
      const label = labelById.get(id);
      return label ? [{ name: label.name, color: asColor(label.color) }] : [];
    }),
    phases: phases.map((phase) => ({ name: phase.name, description: phase.description || undefined, offsetDays: offsetFrom(phase.targetDate) ?? 0 })),
    tasks: topLevel.slice(0, 150).map((task) => ({
      title: task.title,
      description: task.description || undefined,
      phase: phaseOfTask.get(task.id),
      column: Math.max(0, columns.findIndex((column) => column.id === task.column_id)),
      priority: task.priority,
      dueOffsetDays: offsetFrom(task.due_date),
      labels: labelLinks.filter((link) => link.task_id === task.id).flatMap((link) => labelById.get(link.label_id)?.name ?? []),
      checklist: checklistItems.filter((item) => item.task_id === task.id).map((item) => item.content).slice(0, 30),
      subtasks: tasks.filter((sub) => sub.parent_task_id === task.id).map((sub) => sub.title).slice(0, 30),
    })),
  };

  const checked = templateDefinitionSchema.safeParse(definition);
  if (!checked.success) {
    return { status: "error", message: "This project is too large to save as a template (150 tasks at most).", values };
  }

  const user = await requireUser();
  const result = await attemptAsCurrentUser((db) =>
    db.query("insert into public.project_templates (workspace_id, name, description, definition, created_by) values ($1, $2, $3, $4::jsonb, $5)", [
      project.workspaceId,
      parsed.data.name,
      parsed.data.description,
      JSON.stringify(checked.data),
      user.id,
    ]),
  );
  if (!result.ok) return { status: "error", message: toUserMessage(result.error, "saveProjectAsTemplate"), values };

  revalidatePath("/w/[slug]", "layout");
  return { status: "success", message: "Saved. It now appears under \"Your team's templates\" when creating a project." };
}

export async function deleteSavedTemplate(workspaceId: string, templateId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(templateId).success) return NO_PERMISSION;
  const result = await attemptAsCurrentUser((db) =>
    db.query("delete from public.project_templates where id = $1 and workspace_id = $2 returning id", [templateId, workspaceId]),
  );
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "deleteSavedTemplate") };
  if (result.value.length === 0) return { ok: false, message: "Only the person who saved a template, or an admin, can delete it." };

  revalidatePath("/w/[slug]", "layout");
  return { ok: true };
}
