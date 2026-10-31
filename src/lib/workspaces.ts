import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";

import { requireUser } from "@/lib/auth";
import { asCurrentUser, withUser } from "@/lib/db";
import type { WorkspaceRole } from "@/lib/permissions";
import { avatarUrl } from "@/lib/profiles";

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
  const rows = await withUser(user.id, (db) =>
    db.query<WorkspaceSummary>(
      `select w.id, w.name, w.slug, m.role
       from public.workspace_members m
       join public.workspaces w on w.id = m.workspace_id
       where m.user_id = $1`,
      [user.id],
    ),
  );
  return rows.sort((a, b) => a.name.localeCompare(b.name));
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

/** The workload radar's capacity (open tasks per person per week). */
export async function getWeeklyCapacity(workspaceId: string): Promise<number> {
  const [row] = await asCurrentUser((db) =>
    db.query<{ weekly_capacity: number }>("select weekly_capacity from public.workspaces where id = $1", [workspaceId]),
  );
  return row?.weekly_capacity ?? 5;
}

const ROLE_ORDER: Record<WorkspaceRole, number> = { owner: 0, admin: 1, member: 2, viewer: 3 };

// Cached per request: the board, the task drawer, comments and attachments all need it.
export const listWorkspaceMembers = cache(async (workspaceId: string): Promise<WorkspaceMember[]> => {
  const rows = await asCurrentUser((db) =>
    db.query<{ role: WorkspaceRole; joined_at: string; id: string; full_name: string; email: string; avatar_path: string | null }>(
      `select m.role, m.created_at as joined_at, p.id, p.full_name, p.email, p.avatar_path
       from public.workspace_members m
       join public.profiles p on p.id = m.user_id
       where m.workspace_id = $1`,
      [workspaceId],
    ),
  );

  return rows
    .map((row) => ({
      userId: row.id,
      fullName: row.full_name,
      email: row.email,
      avatarUrl: avatarUrl(row.avatar_path),
      role: row.role,
      joinedAt: row.joined_at,
    }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.fullName.localeCompare(b.fullName));
});
