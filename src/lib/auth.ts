import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/better-auth";

export type CurrentUser = { id: string; email: string };

/**
 * The signed-in user for this request, or null.
 *
 * Better Auth looks the session cookie up in auth.sessions, so a forged or
 * expired cookie gets null. React's cache() means calling this from a
 * layout, a page and several components still checks only once per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return null;
  }
  return { id: session.user.id, email: session.user.email };
});

/** Like getCurrentUser, but sends signed-out visitors to the sign-in page. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }
  return user;
}
