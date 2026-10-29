"use client";

import Link from "next/link";
import { LogOutIcon, UserIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { signOut } from "@/app/(auth)/actions";
import type { ProfileView } from "@/lib/profiles";

export function UserMenu({ profile }: { profile: ProfileView }) {
  const displayName = profile.fullName || profile.email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left text-sm outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50">
        <UserAvatar name={profile.fullName} email={profile.email} avatarUrl={profile.avatarUrl} className="size-8" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{displayName}</span>
          <span className="block truncate text-xs text-muted-foreground">{profile.email}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" className="w-56">
        {/* Base UI requires a label to live inside a group it describes. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{displayName}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/account" />}>
          <UserIcon />
          Account settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => signOut()}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
