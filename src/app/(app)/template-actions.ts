"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { toUserMessage } from "@/lib/db-errors";
import { textField, validationError, type FormState } from "@/lib/form-state";
import { hasProjectAccess, NO_PERMISSION, type ActionResult } from "@/lib/project-access";
import { asColor, COLORS } from "@/lib/project-constants";
import { getProjectForUser, listColumns, listPhases } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";
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
    const supabase = await createClient();
    const { data } = await supabase
      .from("project_templates")
      .select("definition")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
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

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_project_from_template", {
    target_workspace: workspace.id,
    project_name: parsed.data.name,
    project_description: "",
    project_visibility: parsed.data.visibility,
    project_color: parsed.data.color,
    finish_date: parsed.data.finishDate ?? undefined,
    template: definition,
  });
  if (error) return { status: "error", message: toUserMessage(error, "createProjectFromTemplate"), values };

  revalidatePath("/w/[slug]", "layout");
  redirect(`/w/${workspace.slug}/p/${data.id}`);
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

  const supabase = await createClient();
  const { data: projectRow } = await supabase.from("projects").select("workspace_id").eq("id", projectId).single();
  if (!projectRow) return { status: "error", message: "That project no longer exists.", values };

  const project = await getProjectForUser(projectRow.workspace_id, projectId);
  const [columns, phasesByProject, tasks, labelLinks, labels, checklistItems] = await Promise.all([
    listColumns(project.id),
    listPhases(project.workspaceId, project.id),
    supabase
      .from("tasks")
      .select("id, title, description, priority, due_date, column_id, parent_task_id, position")
      .eq("project_id", project.id)
      .is("archived_at", null)
      .is("deleted_at", null)
      .order("position")
      .limit(400),
    supabase.from("task_labels").select("task_id, label_id").eq("project_id", project.id),
    supabase.from("labels").select("id, name, color").eq("workspace_id", project.workspaceId),
    supabase.from("checklist_items").select("task_id, content, position").eq("project_id", project.id).order("position"),
  ]);
  if (tasks.error || labelLinks.error || labels.error || checklistItems.error) {
    return { status: "error", message: "Could not read the project. Please try again.", values };
  }

  const phases = phasesByProject.get(project.id) ?? [];
  const anchor = project.targetDate;
  const offsetFrom = (date: string | null) =>
    anchor && date ? Math.min(0, Math.round((Date.parse(date) - Date.parse(anchor)) / 86_400_000)) : undefined;
  const phaseOfTask = new Map(phases.flatMap((phase, index) => phase.taskIds.map((id) => [id, index] as const)));
  const labelById = new Map(labels.data.map((label) => [label.id, label]));
  const topLevel = tasks.data.filter((task) => !task.parent_task_id);
  const usedLabelIds = new Set(labelLinks.data.map((link) => link.label_id));

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
      labels: labelLinks.data.filter((link) => link.task_id === task.id).flatMap((link) => labelById.get(link.label_id)?.name ?? []),
      checklist: checklistItems.data.filter((item) => item.task_id === task.id).map((item) => item.content).slice(0, 30),
      subtasks: tasks.data.filter((sub) => sub.parent_task_id === task.id).map((sub) => sub.title).slice(0, 30),
    })),
  };

  const checked = templateDefinitionSchema.safeParse(definition);
  if (!checked.success) {
    return { status: "error", message: "This project is too large to save as a template (150 tasks at most).", values };
  }

  const { data: claims } = await supabase.auth.getClaims();
  const { error } = await supabase.from("project_templates").insert({
    workspace_id: project.workspaceId,
    name: parsed.data.name,
    description: parsed.data.description,
    definition: checked.data,
    created_by: claims?.claims.sub ?? "",
  });
  if (error) return { status: "error", message: toUserMessage(error, "saveProjectAsTemplate"), values };

  revalidatePath("/w/[slug]", "layout");
  return { status: "success", message: "Saved. It now appears under \"Your team's templates\" when creating a project." };
}

export async function deleteSavedTemplate(workspaceId: string, templateId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(templateId).success) return NO_PERMISSION;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_templates")
    .delete()
    .eq("id", templateId)
    .eq("workspace_id", workspaceId)
    .select("id");
  if (error) return { ok: false, message: toUserMessage(error, "deleteSavedTemplate") };
  if (data.length === 0) return { ok: false, message: "Only the person who saved a template, or an admin, can delete it." };

  revalidatePath("/w/[slug]", "layout");
  return { ok: true };
}
