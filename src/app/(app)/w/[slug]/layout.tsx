import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { getMyProfile } from "@/lib/profiles";
import { listProjects } from "@/lib/projects";
import { getWorkspaceForUser, listMyWorkspaces } from "@/lib/workspaces";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[slug]">) {
  const { slug } = await params;

  // getWorkspaceForUser 404s for anyone who isn't a member, so nothing below
  // renders for them. Pages repeat the call (it's cached per request) rather
  // than trusting that the layout ran.
  const [workspace, workspaces, profile] = await Promise.all([
    getWorkspaceForUser(slug),
    listMyWorkspaces(),
    getMyProfile(),
  ]);
  const projects = await listProjects(workspace.id);

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <AppSidebar workspace={workspace} workspaces={workspaces} profile={profile} projects={projects} />
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-12">{children}</main>
    </div>
  );
}
