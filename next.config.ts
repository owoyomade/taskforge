import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (on in the template) is off on purpose: nearly every
  // screen in a multi-tenant app depends on who is signed in, so there is
  // little to prerender, and keeping it off avoids a lot of Suspense and
  // cache-scope rules while the core features are built. Revisit in Phase 5.
  cacheComponents: false,
  // Don't advertise the framework in an X-Powered-By header.
  poweredByHeader: false,
  // Browser hardening for every response. The Content Security Policy needs a
  // fresh nonce per request, so it's set in src/proxy.ts instead.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Only ever talk to this site over HTTPS (ignored on http://localhost).
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Don't guess file types; a text file must never run as a script.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Older browsers that ignore CSP frame-ancestors.
          { key: "X-Frame-Options", value: "DENY" },
          // Other sites see only our origin, never full URLs (invite links contain tokens).
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Attachments are capped at 5 MB (avatars at 2 MB); leave headroom for multipart overhead.
      bodySizeLimit: "5.5mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
