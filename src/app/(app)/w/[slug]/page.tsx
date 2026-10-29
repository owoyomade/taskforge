import type { Metadata } from "next";
import Link from "next/link";
import { LockIcon } from "lucide-react";

import { ColorDot } from "@/components/color-picker";
import { MemberList } from "@/components/member-list";
import { MyInvitations } from "@/components/members/my-invitations";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";
import { listMyInvitations } from "@/lib/invitations";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { PROJECT_STATUS_LABELS } from "@/lib/project-constants";
import { countTasksByProject, listProjects } from "@/lib/projects";
import { getWorkspaceForUser, listWorkspaceMembers } from "@/lib/workspaces";

export async function generateMetadata({ params }: PageProps<"/w/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await getWorkspaceForUser(slug);
  return { title: workspace.name };
}

export default async function WorkspaceOverviewPage({ params, searchParams }: PageProps<"/w/[slug]">) {
  const { slug } = await params;
  const showArchived = (await searchParams).archived === "1";
  const workspace = await getWorkspaceForUser(slug);
  const [members, projects, counts, invitations] = await Promise.all([
    listWorkspaceMembers(workspace.id),
    listProjects(workspace.id, { archived: showArchived }),
    countTasksByProject(workspace.id),
    listMyInvitations(),
  ]);
  const canCreate = workspace.role !== "viewer";

  return (
    <div className="mx-auto grid max-w-5xl gap-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <h1 className="text-3xl font-semibold">{workspace.name}</h1>
          <p className="text-muted-foreground">
            Your role: {ROLE_LABELS[workspace.role]}.
            {can(workspace.role, "renameWorkspace") ? (
              <>
                {" "}
                <Link href={`/w/${workspace.slug}/settings`} className="text-foreground underline-offset-4 hover:underline">
                  Manage settings
                </Link>
              </>
            ) : null}
          </p>
        </div>
        {canCreate && !showArchived ? <NewProjectDialog workspaceId={workspace.id} /> : null}
      </header>

      <MyInvitations invitations={invitations} />

      <section aria-labelledby="projects-heading" className="grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="projects-heading" className="text-lg font-semibold">
            {showArchived ? "Archived projects" : "Projects"}
          </h2>
          <Link
            href={showArchived ? `/w/${workspace.slug}` : `/w/${workspace.slug}?archived=1`}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {showArchived ? "Show active projects" : "Show archived projects"}
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-10 text-center">
            <p className="font-medium">{showArchived ? "No archived projects" : "No projects yet"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {showArchived
                ? "Projects you archive will appear here and can be restored."
                : canCreate
                  ? "Create a project to start a board and add tasks."
                  : "When someone creates a project you can see, it will appear here."}
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const count = counts.get(project.id) ?? { open: 0, done: 0, overdue: 0 };
              const total = count.open + count.done;
              const percent = total === 0 ? 0 : Math.round((count.done / total) * 100);
              return (
                <li key={project.id}>
                  <Link
                    href={`/w/${workspace.slug}/p/${project.id}`}
                    className="grid h-full gap-3 rounded-xl border bg-card p-4 outline-none hover:border-ring/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <div className="flex items-center gap-2">
                      <ColorDot color={project.color} />
                      <span className="min-w-0 flex-1 truncate font-heading font-semibold">{project.name}</span>
                      {project.visibility === "private" ? (
                        <LockIcon className="size-3.5 text-muted-foreground" aria-label="Private project" />
                      ) : null}
                    </div>
                    {project.description ? (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
                    ) : null}
                    <div className="mt-auto grid gap-2">
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-muted"
                        role="img"
                        aria-label={total === 0 ? "No tasks yet" : `${count.done} of ${total} tasks done`}
                      >
                        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <Badge variant="secondary">{PROJECT_STATUS_LABELS[project.status]}</Badge>
                        <span>{total === 0 ? "No tasks" : `${count.done}/${total} done`}</span>
                        {count.overdue > 0 ? <span className="text-destructive">{count.overdue} overdue</span> : null}
                        {project.targetDate ? <span>Target {formatDate(project.targetDate)}</span> : null}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="members-heading" className="grid gap-3">
        <h2 id="members-heading" className="text-lg font-semibold">
          Members <span className="font-normal text-muted-foreground">({members.length})</span>
        </h2>
        <MemberList members={members} />
      </section>
    </div>
  );
}
