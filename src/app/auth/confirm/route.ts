import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeRedirectPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES: EmailOtpType[] = ["email", "signup", "recovery", "email_change"];

/**
 * Landing point for links in auth emails (see supabase/templates).
 *
 * The link carries a one-time token_hash. Verifying it here, on the server,
 * signs the user in and stores the session in a cookie. Then we send them
 * on to `next` (onboarding after sign-up, the reset form after a recovery).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = ALLOWED_TYPES.find((allowed) => allowed === searchParams.get("type"));
  const next = safeRedirectPath(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/sign-in?error=link", request.url));
}
