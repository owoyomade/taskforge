import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (on in the template) is off on purpose: nearly every
  // screen in a multi-tenant app depends on who is signed in, so there is
  // little to prerender, and keeping it off avoids a lot of Suspense and
  // cache-scope rules while the core features are built. Revisit in Phase 5.
  cacheComponents: false,
  experimental: {
    serverActions: {
      // Avatars are capped at 2 MB; leave headroom for multipart overhead.
      bodySizeLimit: "2.5mb",
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
