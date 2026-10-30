import type { NextRequest } from "next/server";

import { contentSecurityPolicy, createNonce } from "@/lib/security-headers";
import { routeBySession } from "@/lib/session-proxy";

export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = contentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV === "development",
  });

  // Next.js reads the nonce from the request's CSP header and adds it to its
  // own script tags; the response header is what the browser enforces.
  const response = routeBySession(request, { "Content-Security-Policy": csp, "x-nonce": nonce });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Skip static assets, images and the health check.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
