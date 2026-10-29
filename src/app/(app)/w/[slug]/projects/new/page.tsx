import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NewProjectWizard, type WizardTemplate } from "@/components/projects/new-project-wizard";
import { createClient } from "@/lib/supabase/server";
import { dateRange } from "@/lib/task-filters";
import { templateDefinitionSchema } from "@/lib/templates/schema";
import { getWorkspaceForUser } from "@/lib/workspaces";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage({ params }: PageProps<"/w/[slug]/projects/new">) {
  const { slug } = await params;
  const workspace = await getWorkspaceForUser(slug);
  if (workspace.role === "viewer") {
    notFound();
  }

  // The team's own templates, shown first. Any that no longer pass
  // validation are skipped rather than breaking the page.
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_templates")
    .select("id, name, description, definition")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false });
  const savedTemplates: WizardTemplate[] = (data ?? []).flatMap((row) => {
    const parsed = templateDefinitionSchema.safeParse(row.definition);
    return parsed.success
      ? [
          {
            ref: `saved:${row.id}`,
            name: row.name,
            category: "Your team's templates",
            summary: row.description || "Saved from one of your projects.",
            durationDays: 30,
            color: "teal" as const,
            definition: parsed.data,
          },
        ]
      : [];
  });

  return (
    <div className="mx-auto max-w-6xl">
      <NewProjectWizard workspaceId={workspace.id} today={dateRange(0).today} savedTemplates={savedTemplates} />
    </div>
  );
}
