import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string };

/**
 * The signed-in user for this request, or null.
 *
 * getClaims() verifies the session token's signature instead of trusting
 * the cookie blindly. React's cache() means calling this from a layout, a
 * page and several components still verifies only once per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) {
    return null;
  }
  return { id: claims.sub, email: claims.email ?? "" };
});

/** Like getCurrentUser, but sends signed-out visitors to the sign-in page. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }
  return user;
}
