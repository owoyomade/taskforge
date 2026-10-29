"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Tab = { href: string; label: string };

/** Tab-style navigation between a project's views; each view is its own URL. */
export function ProjectTabs({ basePath, showSettings }: { basePath: string; showSettings: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Keep search and filters when switching between the board and the list.
  const filterQuery = new URLSearchParams(searchParams);
  filterQuery.delete("task");
  const keepFilters = filterQuery.size > 0 ? `?${filterQuery.toString()}` : "";

  const tabs: Tab[] = [
    { href: basePath, label: "Plan" },
    { href: `${basePath}/board`, label: "Board" },
    { href: `${basePath}/list`, label: "List" },
    { href: `${basePath}/overview`, label: "Overview" },
    ...(showSettings ? [{ href: `${basePath}/settings`, label: "Settings" }] : []),
  ];

  return (
    <nav aria-label="Project views" className="-mb-px flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        const withFilters = tab.label === "Board" || tab.label === "List";
        return (
          <Link
            key={tab.href}
            href={withFilters ? `${tab.href}${keepFilters}` : tab.href}
            aria-current={isActive ? "page" : undefined}
            className="shrink-0 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:border-primary aria-[current=page]:font-medium aria-[current=page]:text-foreground"
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
