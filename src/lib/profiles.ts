import "server-only";

import { cache } from "react";

import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";

export type ProfileView = {
  id: string;
  email: string;
  fullName: string;
  avatarPath: string | null;
  avatarUrl: string | null;
};

/**
 * The address a profile photo is shown from. The /avatars route checks
 * can_view_avatar() in the database before sending the file, so the
 * address is useless to anyone who doesn't share a workspace with the person.
 */
export function avatarUrl(path: string | null): string | null {
  return path ? `/avatars/${path}` : null;
}

export const getMyProfile = cache(async (): Promise<ProfileView> => {
  const user = await requireUser();
  const [data] = await withUser(user.id, (db) =>
    db.query<{ id: string; email: string; full_name: string; avatar_path: string | null }>(
      "select id, email, full_name, avatar_path from public.profiles where id = $1",
      [user.id],
    ),
  );
  if (!data) {
    throw new Error("Could not load your profile.");
  }

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    avatarPath: data.avatar_path,
    avatarUrl: avatarUrl(data.avatar_path),
  };
});
