import "server-only";

import { z } from "zod";

// Server secrets. "server-only" makes the build fail if browser code ever
// imports this file, and none of these names start with NEXT_PUBLIC_, so
// Next.js never copies them into the browser bundle either.
const serverEnvSchema = z.object({
  // The app's own login (taskforge_app): no table access until it names the signed-in user.
  DATABASE_URL: z.url(),
  // The sign-in library's login (taskforge_auth): the auth tables only.
  DATABASE_AUTH_URL: z.url(),
  // Signs session cookies. At least 32 random characters; see .env.example.
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  // Outgoing email. Locally this is Mailpit (no login); in production, Gmail or another SMTP service.
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().min(3),
  // DEMO_PASSWORD (16+ characters) turns on the "Try the demo" button; it's read in demo.ts.
  // Raises the per-address sign-in limits (see sign-in-limits.ts). Leave unset in production.
  AUTH_IP_LIMIT_MULTIPLIER: z.coerce.number().int().min(1).max(100).default(1),
});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Names only, never values: this message ends up in logs.
  const problems = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Missing or invalid server settings: ${problems}. See .env.example.`);
}

export const serverEnv = parsed.data;
