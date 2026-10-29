import type { Metadata } from "next";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { listActivity } from "@/lib/activity";
import { getProjectForUser } from "@/lib/projects";
import { getWorkspaceForUser } from "@/lib/workspaces";

export const metadata: Metadata = { title: "Project activity" };

// Events that point at a task that's gone (deleted) shouldn't link to it.
const NO_LINK_EVENTS = new Set(["task.deleted"]);

export default async function ProjectActivityPage({ params }: PageProps<"/w/[slug]/p/[projectId]/activity">) {
  const { slug, projectId } = await params;
  const workspace = await getWorkspaceForUser(slug);
  const project = await getProjectForUser(workspace.id, projectId);
  const items = await listActivity(workspace.id, { projectId: project.id, limit: 100 });
  const basePath = `/w/${workspace.slug}/p/${project.id}`;

  return (
    <div className="grid max-w-3xl gap-4">
      <p className="text-sm text-muted-foreground">Everything that has happened in this project, newest first.</p>
      <ActivityFeed
        items={items}
        emptyText="Nothing has happened here yet."
        taskHref={(item) => (item.taskId && !NO_LINK_EVENTS.has(item.eventType) ? `${basePath}?task=${item.taskId}` : null)}
      />
    </div>
  );
}
