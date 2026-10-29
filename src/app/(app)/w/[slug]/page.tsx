import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { DoNext } from "@/components/home/do-next";
import { ProjectCard } from "@/components/home/project-card";
import { MyInvitations } from "@/components/members/my-invitations";
import { requireUser } from "@/lib/auth";
import { listMyInvitations } from "@/lib/invitations";
import { phaseStates } from "@/lib/phase-progress";
import { getMyProfile } from "@/lib/profiles";
import { countTasksByProject, listMyOpenTasks, listPhases, listProjects } from "@/lib/projects";
import { dateRange } from "@/lib/task-filters";
import { getWorkspaceForUser } from "@/lib/workspaces";

export async function generateMetadata({ params }: PageProps<"/w/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await getWorkspaceForUser(slug);
  return { title: workspace.name };
}

/**
 * The workspace home: what needs you next, then every project as a
 * journey. Built so someone new can open it and know where to start.
 */
export default async function WorkspaceHomePage({ params, searchParams }: PageProps<"/w/[slug]">) {
  const { slug } = await params;
  const showArchived = (await searchParams).archived === "1";
  const [user, workspace, profile] = await Promise.all([requireUser(), getWorkspaceForUser(slug), getMyProfile()]);
  const [projects, counts, phasesByProject, myTasks, invitations] = await Promise.all([
    listProjects(workspace.id, { archived: showArchived }),
    countTasksByProject(workspace.id),
    listPhases(workspace.id),
    listMyOpenTasks(workspace.id, user.id),
    listMyInvitations(),
  ]);
  const { today } = dateRange(0);
  const firstName = profile.fullName.split(" ")[0];
  const canCreate = workspace.role !== "viewer";
  const newProjectHref = `/w/${workspace.slug}/projects/new`;

  return (
    <div className="mx-auto grid max-w-6xl gap-10">
      <header className="grid gap-1">
        <p className="text-sm font-medium text-muted-foreground">{workspace.name}</p>
        <h1 className="text-3xl font-bold sm:text-4xl">{firstName ? `Hi ${firstName}` : "Welcome back"}</h1>
        <p className="text-muted-foreground">
          {myTasks.length > 0
            ? `You have ${myTasks.length} open task${myTasks.length === 1 ? "" : "s"}. Start at the top.`
            : "Here's where your team's projects stand."}
        </p>
      </header>

      <MyInvitations invitations={invitations} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <section aria-labelledby="do-next-heading" className="grid content-start gap-4">
          <h2 id="do-next-heading" className="text-xl font-bold">
            Do next
          </h2>
          <DoNext tasks={myTasks} today={today} workspaceSlug={workspace.slug} />
        </section>

        <section aria-labelledby="projects-heading" className="grid content-start gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="projects-heading" className="text-xl font-bold">
              {showArchived ? "Archived projects" : "Projects"}
            </h2>
            <Link
              href={showArchived ? `/w/${workspace.slug}` : `/w/${workspace.slug}?archived=1`}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {showArchived ? "Show active projects" : "Show archived"}
            </Link>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {canCreate && !showArchived ? (
              <li>
                <Link
                  href={newProjectHref}
                  className="grid h-full min-h-36 place-content-center justify-items-center gap-2 rounded-2xl border-2 border-dashed border-primary/30 p-5 text-center outline-none hover:border-primary hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
                    <PlusIcon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="font-semibold">New project</span>
                  <span className="text-sm text-muted-foreground">Start from one of 30 ready-made plans</span>
                </Link>
              </li>
            ) : null}
            {projects.map((project) => (
              <li key={project.id}>
                <ProjectCard
                  href={`/w/${workspace.slug}/p/${project.id}`}
                  project={project}
                  phases={phaseStates(phasesByProject.get(project.id) ?? [], today)}
                  counts={counts.get(project.id) ?? { open: 0, done: 0, overdue: 0 }}
                />
              </li>
            ))}
          </ul>
          {projects.length === 0 && (showArchived || !canCreate) ? (
            <p className="text-sm text-muted-foreground">
              {showArchived ? "Projects you archive will appear here." : "When someone shares a project with you, it will appear here."}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
