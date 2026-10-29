import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";

import { requireUser } from "@/lib/auth";
import type { WorkspaceRole } from "@/lib/permissions";
import { signAvatarPaths } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
};

export type WorkspaceMember = {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  role: WorkspaceRole;
  joinedAt: string;
};

/** Every workspace the signed-in user belongs to, with their role, A to Z. */
export const listMyWorkspaces = cache(async (): Promise<WorkspaceSummary[]> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspace:workspaces!inner(id, name, slug)")
    .eq("user_id", user.id);

  if (error) {
    throw new Error("Could not load your workspaces.");
  }

  return data
    .map(({ role, workspace }) => ({ ...workspace, role }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

/**
 * The workspace at /w/<slug>, if the user is a member; otherwise a 404.
 *
 * A 404 (rather than 403) for non-members avoids confirming that a
 * workspace with that slug exists at all.
 */
export const getWorkspaceForUser = cache(async (slug: string): Promise<WorkspaceSummary> => {
  const workspaces = await listMyWorkspaces();
  const workspace = workspaces.find((candidate) => candidate.slug === slug);
  if (!workspace) {
    notFound();
  }
  return workspace;
});

const ROLE_ORDER: Record<WorkspaceRole, number> = { owner: 0, admin: 1, member: 2, viewer: 3 };

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, created_at, profile:profiles!inner(id, full_name, email, avatar_path)")
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error("Could not load workspace members.");
  }

  const avatarUrls = await signAvatarPaths(
    data.flatMap(({ profile }) => (profile.avatar_path ? [profile.avatar_path] : [])),
  );

  return data
    .map(({ role, created_at, profile }) => ({
      userId: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      avatarUrl: profile.avatar_path ? (avatarUrls.get(profile.avatar_path) ?? null) : null,
      role,
      joinedAt: created_at,
    }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.fullName.localeCompare(b.fullName));
}
