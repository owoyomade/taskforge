import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { countUnreadNotifications } from "@/lib/notifications";
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
  const [projects, unreadCount] = await Promise.all([
    listProjects(workspace.id),
    countUnreadNotifications(workspace.id),
  ]);

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      {/* Keyboard users would otherwise tab through the whole sidebar on
          every page. Hidden until it receives focus. */}
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-background px-3 py-2 font-medium shadow focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to main content
      </a>
      <AppSidebar
        workspace={workspace}
        workspaces={workspaces}
        profile={profile}
        projects={projects}
        unreadCount={unreadCount}
      />
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-8 outline-none sm:px-8 lg:px-12">
        {children}
      </main>
    </div>
  );
}
