import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/w", "/workspaces", "/account"];

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Sends signed-out visitors to the sign-in page before a protected page
 * even starts rendering, and passes extra headers (the CSP) on to the page.
 *
 * This only checks that a session cookie exists; it doesn't validate it.
 * It's a convenience, not the security boundary: every page and action
 * still validates the session (getCurrentUser), and Row Level Security
 * checks again in the database.
 */
export function routeBySession(request: NextRequest, extraRequestHeaders: Record<string, string>): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (matchesPrefix(pathname, PROTECTED_PREFIXES) && !getSessionCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const headers = new Headers(request.headers);
  for (const [name, value] of Object.entries(extraRequestHeaders)) {
    headers.set(name, value);
  }
  return NextResponse.next({ request: { headers } });
}
