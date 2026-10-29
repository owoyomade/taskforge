import type { Metadata } from "next";

import { LabelsManager } from "@/components/labels-manager";
import { SavedTemplatesList } from "@/components/saved-templates-list";
import { InviteForm, MembersManager, OpenInvitationsList, TransferOwnershipForm } from "@/components/members/members-manager";
import { requireUser } from "@/lib/auth";
import { listOpenInvitations } from "@/lib/invitations";
import { can } from "@/lib/permissions";
import { listLabels, listSavedTemplates } from "@/lib/projects";
import { getWorkspaceForUser, listWorkspaceMembers } from "@/lib/workspaces";
import { DeleteWorkspaceDialog, RenameWorkspaceForm } from "./settings-forms";

export const metadata: Metadata = { title: "Workspace settings" };

export default async function WorkspaceSettingsPage({ params }: PageProps<"/w/[slug]/settings">) {
  const { slug } = await params;
  const workspace = await getWorkspaceForUser(slug);
  const canManageMembers = can(workspace.role, "manageMembers");
  const [user, members, labels, invitations, savedTemplates] = await Promise.all([
    requireUser(),
    listWorkspaceMembers(workspace.id),
    listLabels(workspace.id),
    canManageMembers ? listOpenInvitations(workspace.id) : Promise.resolve([]),
    listSavedTemplates(workspace.id),
  ]);

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

      <section aria-labelledby="templates-heading" className="grid gap-4 border-t pt-6">
        <div className="grid gap-1">
          <h2 id="templates-heading" className="text-lg font-semibold">
            Saved templates
          </h2>
          <p className="text-sm text-muted-foreground">Plans your team saved from its own projects.</p>
        </div>
        <SavedTemplatesList
          workspaceId={workspace.id}
          templates={savedTemplates}
          currentUserId={user.id}
          isAdmin={canManageMembers}
        />
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
        <MembersManager workspace={workspace} members={members} currentUserId={user.id} />
      </section>

      {canManageMembers ? (
        <section aria-labelledby="invite-heading" className="grid gap-4 border-t pt-6">
          <div className="grid gap-1">
            <h2 id="invite-heading" className="text-lg font-semibold">
              Invite people
            </h2>
            <p className="text-sm text-muted-foreground">
              Invitations expire after 7 days and only work for the email address you enter.
            </p>
          </div>
          <InviteForm workspaceId={workspace.id} />
          <h3 className="text-sm font-semibold">Open invitations</h3>
          <OpenInvitationsList workspaceId={workspace.id} invitations={invitations} />
        </section>
      ) : null}

      {workspace.role === "owner" ? (
        <section aria-labelledby="transfer-heading" className="grid gap-4 border-t pt-6">
          <div className="grid gap-1">
            <h2 id="transfer-heading" className="text-lg font-semibold">
              Transfer ownership
            </h2>
            <p className="text-sm text-muted-foreground">
              The new owner gets full control and you become an admin. Workspaces can have several owners; you can
              also make someone an owner from the member list above.
            </p>
          </div>
          <TransferOwnershipForm workspace={workspace} members={members} currentUserId={user.id} />
        </section>
      ) : null}

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
