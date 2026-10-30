"use client";

import Link from "next/link";
import { LogOutIcon, UserIcon } from "lucide-react";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { signOut } from "@/app/(auth)/actions";
import type { ProfileView } from "@/lib/profiles";

const APPEARANCE = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Match my computer" },
];

export function UserMenu({ profile }: { profile: ProfileView }) {
  const displayName = profile.fullName || profile.email;
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left text-sm text-sidebar-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/60">
        <UserAvatar name={profile.fullName} email={profile.email} avatarUrl={profile.avatarUrl} className="size-8" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{displayName}</span>
          <span className="block truncate text-xs text-sidebar-foreground/75">{profile.email}</span>
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
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme ?? "light"} onValueChange={(value: string) => setTheme(value)}>
            {APPEARANCE.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
