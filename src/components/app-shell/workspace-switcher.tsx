"use client";

import Link from "next/link";
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkspaceSummary } from "@/lib/workspaces";

type WorkspaceSwitcherProps = {
  current: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
};

export function WorkspaceSwitcher({ current, workspaces }: WorkspaceSwitcherProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Current workspace: ${current.name}. Switch workspace`}
        className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left text-sidebar-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/60"
      >
        <WorkspaceMark name={current.name} />
        <span className="min-w-0 flex-1 truncate font-heading font-semibold">{current.name}</span>
        <ChevronsUpDownIcon className="size-4 text-sidebar-foreground/60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Your workspaces</DropdownMenuLabel>
          {workspaces.map((workspace) => (
            <DropdownMenuItem key={workspace.id} render={<Link href={`/w/${workspace.slug}`} />}>
              <WorkspaceMark name={workspace.name} small />
              <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
              {workspace.id === current.id ? <CheckIcon aria-label="Current workspace" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/workspaces/new" />}>
          <PlusIcon />
          Create workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorkspaceMark({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-md bg-sidebar-primary font-heading font-semibold text-sidebar-primary-foreground ${small ? "size-5 text-[0.65rem]" : "size-8 text-sm"}`}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
