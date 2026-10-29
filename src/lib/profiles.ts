import "server-only";

import { cache } from "react";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const AVATAR_URL_TTL_SECONDS = 60 * 60;

export type ProfileView = {
  id: string;
  email: string;
  fullName: string;
  avatarPath: string | null;
  avatarUrl: string | null;
};

/**
 * Exchanges private avatar paths for short-lived signed URLs.
 * Storage policies decide which paths the current user may sign; any path
 * they may not see simply comes back without a URL.
 */
export async function signAvatarPaths(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) {
    return new Map();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("avatars").createSignedUrls(unique, AVATAR_URL_TTL_SECONDS);
  if (error || !data) {
    // A missing avatar falls back to initials, so this isn't worth failing the page over.
    return new Map();
  }

  const urls = new Map<string, string>();
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) {
      urls.set(item.path, item.signedUrl);
    }
  }
  return urls;
}

export const getMyProfile = cache(async (): Promise<ProfileView> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_path")
    .eq("id", user.id)
    .single();

  if (error) {
    throw new Error("Could not load your profile.");
  }

  const urls = data.avatar_path ? await signAvatarPaths([data.avatar_path]) : new Map<string, string>();

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    avatarPath: data.avatar_path,
    avatarUrl: data.avatar_path ? (urls.get(data.avatar_path) ?? null) : null,
  };
});
