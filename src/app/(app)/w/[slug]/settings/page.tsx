import type { Metadata } from "next";

import { LabelsManager } from "@/components/labels-manager";
import { MemberList } from "@/components/member-list";
import { can } from "@/lib/permissions";
import { listLabels } from "@/lib/projects";
import { getWorkspaceForUser, listWorkspaceMembers } from "@/lib/workspaces";
import { DeleteWorkspaceDialog, RenameWorkspaceForm } from "./settings-forms";

export const metadata: Metadata = { title: "Workspace settings" };

export default async function WorkspaceSettingsPage({ params }: PageProps<"/w/[slug]/settings">) {
  const { slug } = await params;
  const workspace = await getWorkspaceForUser(slug);
  const [members, labels] = await Promise.all([listWorkspaceMembers(workspace.id), listLabels(workspace.id)]);

  return (
    <div className="mx-auto grid max-w-3xl gap-10">
      <h1 className="text-3xl font-semibold">Settings</h1>

      <section aria-labelledby="general-heading" className="grid gap-4 border-t pt-6">
        <h2 id="general-heading" className="text-lg font-semibold">
          General
        </h2>
        {can(workspace.role, "renameWorkspace") ? (
          <RenameWorkspaceForm workspace={workspace} />
        ) : (
          <div className="grid gap-1 text-sm">
            <p className="font-medium">Workspace name</p>
            <p>{workspace.name}</p>
            <p className="text-muted-foreground">Only owners and admins can rename the workspace.</p>
          </div>
        )}
      </section>

      <section aria-labelledby="labels-heading" className="grid gap-4 border-t pt-6">
        <div className="grid gap-1">
          <h2 id="labels-heading" className="text-lg font-semibold">
            Labels
          </h2>
          <p className="text-sm text-muted-foreground">Labels are shared by every project in this workspace.</p>
        </div>
        <LabelsManager workspaceId={workspace.id} labels={labels} canManage={workspace.role !== "viewer"} />
      </section>

      <section aria-labelledby="members-heading" className="grid gap-4 border-t pt-6">
        <div className="grid gap-1">
          <h2 id="members-heading" className="text-lg font-semibold">
            Members
          </h2>
          <p className="text-sm text-muted-foreground">
            Owners manage everything, admins manage members and settings, members do the work, and viewers can
            look but not change anything.
          </p>
        </div>
        <MemberList members={members} />
      </section>

      {can(workspace.role, "deleteWorkspace") ? (
        <section aria-labelledby="danger-heading" className="grid gap-4 border-t pt-6">
          <div className="grid gap-1">
            <h2 id="danger-heading" className="text-lg font-semibold">
              Delete workspace
            </h2>
            <p className="text-sm text-muted-foreground">
              Permanently removes this workspace, its projects and its member list.
            </p>
          </div>
          <div>
            <DeleteWorkspaceDialog workspace={workspace} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
