import { z } from "zod";

// Public settings are inlined into the browser bundle at build time, so they
// must be read with literal `process.env.NEXT_PUBLIC_*` expressions (a dynamic
// lookup like process.env[name] would be undefined in the browser).
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
});

const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

if (!parsed.success) {
  // Fail loudly at startup rather than with confusing auth errors later.
  const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Missing or invalid environment variables: ${missing}. See .env.example.`);
}

export const publicEnv = parsed.data;
