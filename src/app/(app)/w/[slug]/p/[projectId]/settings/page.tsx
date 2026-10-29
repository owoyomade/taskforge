import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  ArchiveProjectButton,
  DeleteProjectDialog,
  ProjectDetailsForm,
  ProjectMembersList,
  RemovedTasksList,
} from "@/components/projects/project-settings-forms";
import { getProjectForUser, listAssignablePeople, listProjectMemberIds, listRemovedTasks, type Person } from "@/lib/projects";
import { getWorkspaceForUser, listWorkspaceMembers } from "@/lib/workspaces";

export const metadata: Metadata = { title: "Project settings" };

export default async function ProjectSettingsPage({ params }: PageProps<"/w/[slug]/p/[projectId]/settings">) {
  const { slug, projectId } = await params;
  const workspace = await getWorkspaceForUser(slug);
  const project = await getProjectForUser(workspace.id, projectId);

  // Settings are for managers only; everyone else gets the same 404 as a
  // missing page rather than a form that would fail on save.
  if (project.access !== "manage") {
    notFound();
  }

  const [members, memberIds, removedTasks, assignable] = await Promise.all([
    listWorkspaceMembers(workspace.id),
    listProjectMemberIds(project.id),
    listRemovedTasks(project.id),
    listAssignablePeople(project),
  ]);

  const toPerson = (member: (typeof members)[number]): Person => ({
    id: member.userId,
    name: member.fullName || member.email,
    email: member.email,
    avatarUrl: member.avatarUrl,
  });
  const nonViewers = members.filter((member) => member.role !== "viewer").map(toPerson);

  return (
    <div className="grid max-w-3xl gap-10">
      <section aria-labelledby="details-heading" className="grid gap-4">
        <h2 id="details-heading" className="text-lg font-semibold">
          Details
        </h2>
        <ProjectDetailsForm project={project} owners={project.visibility === "private" ? assignable : nonViewers} />
      </section>

      {project.visibility === "private" ? (
        <section aria-labelledby="members-heading" className="grid gap-4 border-t pt-6">
          <div className="grid gap-1">
            <h2 id="members-heading" className="text-lg font-semibold">
              Project members
            </h2>
            <p className="text-sm text-muted-foreground">
              Only these people (plus workspace owners and admins) can see this private project.
            </p>
          </div>
          <ProjectMembersList projectId={project.id} people={nonViewers} memberIds={memberIds} ownerId={project.ownerId} />
        </section>
      ) : null}

      <section aria-labelledby="removed-heading" className="grid gap-4 border-t pt-6">
        <div className="grid gap-1">
          <h2 id="removed-heading" className="text-lg font-semibold">
            Archived and deleted tasks
          </h2>
          <p className="text-sm text-muted-foreground">Restoring a task puts it back on the board in its old column.</p>
        </div>
        <RemovedTasksList tasks={removedTasks} />
      </section>

      <section aria-labelledby="archive-heading" className="grid gap-4 border-t pt-6">
        <div className="grid gap-1">
          <h2 id="archive-heading" className="text-lg font-semibold">
            {project.archivedAt ? "Restore project" : "Archive project"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {project.archivedAt
              ? "Restoring makes the project editable again and returns it to the project list."
              : "Archiving hides the project from the list and makes it read-only. Nothing is deleted."}
          </p>
        </div>
        <div>
          <ArchiveProjectButton project={project} />
        </div>
      </section>

      <section aria-labelledby="delete-heading" className="grid gap-4 border-t pt-6">
        <div className="grid gap-1">
          <h2 id="delete-heading" className="text-lg font-semibold">
            Delete project
          </h2>
          <p className="text-sm text-muted-foreground">Permanently removes the project and all of its tasks.</p>
        </div>
        <div>
          <DeleteProjectDialog project={project} />
        </div>
      </section>
    </div>
  );
}
