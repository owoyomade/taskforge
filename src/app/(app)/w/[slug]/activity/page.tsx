import type { Metadata } from "next";
import { DownloadIcon } from "lucide-react";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { buttonVariants } from "@/components/ui/button";
import { listActivity } from "@/lib/activity";
import { can } from "@/lib/permissions";
import { getWorkspaceForUser } from "@/lib/workspaces";

export const metadata: Metadata = { title: "Activity" };

export default async function WorkspaceActivityPage({ params }: PageProps<"/w/[slug]/activity">) {
  const { slug } = await params;
  const workspace = await getWorkspaceForUser(slug);
  const items = await listActivity(workspace.id, { limit: 150 });
  const isAdmin = can(workspace.role, "manageMembers");

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-3xl font-bold">Activity</h1>
          <p className="text-muted-foreground">
            {isAdmin
              ? "Everything that has happened in this workspace, including membership changes."
              : "What's been happening in the projects you can see."}
          </p>
        </div>
        {isAdmin ? (
          // A plain link, not a fetch: the browser downloads the file directly.
          <a href={`/w/${workspace.slug}/activity/export`} className={buttonVariants({ variant: "outline" })}>
            <DownloadIcon />
            Export as CSV
          </a>
        ) : null}
      </div>
      <ActivityFeed
        items={items}
        emptyText="Nothing has happened yet."
        taskHref={(item) =>
          item.projectId && item.taskId && item.eventType !== "task.deleted" && item.eventType !== "project.deleted"
            ? `/w/${workspace.slug}/p/${item.projectId}?task=${item.taskId}`
            : null
        }
      />
    </div>
  );
}
