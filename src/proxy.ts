import type { NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";
import { contentSecurityPolicy, createNonce } from "@/lib/security-headers";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const csp = contentSecurityPolicy({
    nonce: createNonce(),
    isDev: process.env.NODE_ENV === "development",
    supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  });

  // Next.js reads the nonce from the request's CSP header and adds it to its
  // own script tags; the response header is what the browser enforces.
  const response = await updateSession(request, { "Content-Security-Policy": csp });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Skip static assets, images and the health check; everything else gets a fresh session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
