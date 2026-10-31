"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActivityIcon, GaugeIcon, HomeIcon, InboxIcon, MenuIcon, PlusIcon, SettingsIcon } from "lucide-react";

import { Brand } from "@/components/brand";
import { ColorDot } from "@/components/color-picker";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { ProfileView } from "@/lib/profiles";
import type { ProjectSummary } from "@/lib/projects";
import type { WorkspaceSummary } from "@/lib/workspaces";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";

type AppSidebarProps = {
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  profile: ProfileView;
  projects: ProjectSummary[];
  unreadCount: number;
};

/**
 * Workspace navigation: a fixed sidebar on large screens, and a top bar with
 * a slide-out panel on smaller ones. Both render the same SidebarContents.
 */
export function AppSidebar(props: AppSidebarProps) {
  // Re-keying the mobile sheet on navigation closes it after a link is tapped.
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
        <SidebarContents {...props} />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur lg:hidden">
        <Sheet key={pathname}>
          <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open navigation" />}>
            <MenuIcon />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-sidebar p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarContents {...props} />
          </SheetContent>
        </Sheet>
        <Brand href="/dashboard" />
      </header>
    </>
  );
}

// Shared look for links on the dark sidebar.
const NAV_LINK =
  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/70 outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/60 aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-semibold aria-[current=page]:text-sidebar-accent-foreground";

function SidebarContents({ workspace, workspaces, profile, projects, unreadCount }: AppSidebarProps) {
  const pathname = usePathname();
  const base = `/w/${workspace.slug}`;
  const links = [
    { href: base, label: "Home", icon: HomeIcon },
    { href: `${base}/inbox`, label: "Inbox", icon: InboxIcon, badge: unreadCount },
    { href: `${base}/radar`, label: "Workload radar", icon: GaugeIcon },
    { href: `${base}/activity`, label: "Activity", icon: ActivityIcon },
    { href: `${base}/settings`, label: "Team and settings", icon: SettingsIcon },
  ];

  return (
    <div className="flex h-full flex-col gap-5 p-3">
      <WorkspaceSwitcher current={workspace} workspaces={workspaces} />
      {workspace.role !== "viewer" ? (
        <Link
          href={`${base}/projects/new`}
          className="flex items-center justify-center gap-2 rounded-lg bg-sidebar-primary px-3 py-2.5 text-sm font-semibold text-sidebar-primary-foreground outline-none hover:brightness-105 focus-visible:ring-3 focus-visible:ring-sidebar-ring/60"
        >
          <PlusIcon className="size-4" aria-hidden="true" />
          New project
        </Link>
      ) : null}
      <nav aria-label="Workspace" className="grid gap-0.5">
        {links.map(({ href, label, icon: Icon, badge }) => (
          <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={NAV_LINK}>
            <Icon className="size-4" aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {badge ? (
              <span className="rounded-full bg-sidebar-primary px-2 py-0.5 text-xs font-bold text-sidebar-primary-foreground">
                {badge > 99 ? "99+" : badge}
                <span className="sr-only"> unread</span>
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
      <div className="grid min-h-0 gap-1">
        <h2 className="px-2.5 text-xs font-semibold text-sidebar-foreground/70">Projects</h2>
        {projects.length === 0 ? (
          <p className="px-2.5 py-1 text-sm text-sidebar-foreground/75">No projects yet</p>
        ) : (
          <ul className="grid max-h-[50vh] gap-0.5 overflow-y-auto">
            {projects.map((project) => {
              const href = `${base}/p/${project.id}`;
              const isActive = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={project.id}>
                  <Link href={href} aria-current={isActive ? "page" : undefined} className={NAV_LINK}>
                    <ColorDot color={project.color} />
                    <span className="truncate">{project.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="mt-auto">
        <UserMenu profile={profile} />
      </div>
    </div>
  );
}
