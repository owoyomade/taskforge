import type { Metadata } from "next";

import { Inbox } from "@/components/notifications/inbox";
import { listNotifications } from "@/lib/notifications";
import { getWorkspaceForUser } from "@/lib/workspaces";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({ params, searchParams }: PageProps<"/w/[slug]/inbox">) {
  const { slug } = await params;
  const unreadOnly = (await searchParams).unread === "1";
  const workspace = await getWorkspaceForUser(slug);
  const notifications = await listNotifications(workspace.id, { unreadOnly });

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl font-bold">Inbox</h1>
        <p className="text-muted-foreground">Things that need your attention in {workspace.name}.</p>
      </div>
      <Inbox workspaceId={workspace.id} workspaceSlug={workspace.slug} notifications={notifications} unreadOnly={unreadOnly} />
    </div>
  );
}
