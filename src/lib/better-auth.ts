import "server-only";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

import { confirmEmailMessage, resetPasswordMessage, sendEmail } from "@/lib/email";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";

/**
 * Sign-in for Taskforge, powered by Better Auth (an open-source library that
 * runs inside the app). It owns the tables in the "auth" schema: accounts,
 * password hashes, sessions and one-time email links.
 *
 * It connects as taskforge_auth, which can reach those tables and nothing
 * else, so a mistake here can never read or change project data. That
 * login's default search_path is "auth" (set in db/migrations), so the
 * library's unqualified table names resolve there.
 */
export const authPool = new Pool({ connectionString: serverEnv.DATABASE_AUTH_URL, max: 3 });
// On Vercel, closes idle connections before a function is paused (no effect locally).
attachDatabasePool(authPool);

// The emailed links point at the site's public address. Locally the browser
// tests run their own server on port 3100, so it's trusted too.
const siteUrl = publicEnv.NEXT_PUBLIC_SITE_URL;
const isLocalSite = new URL(siteUrl).hostname === "localhost";

export const auth = betterAuth({
  appName: "Taskforge",
  baseURL: siteUrl,
  secret: serverEnv.BETTER_AUTH_SECRET,
  trustedOrigins: isLocalSite ? [siteUrl, "http://localhost:3100"] : [siteUrl],
  database: authPool,

  // Our tables use snake_case column names; these map Better Auth's names onto them.
  user: {
    modelName: "users",
    fields: { emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" },
  },
  session: {
    modelName: "sessions",
    fields: {
      userId: "user_id",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    // Signed in for a week, extended at most once a day while in use.
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  account: {
    modelName: "accounts",
    fields: {
      userId: "user_id",
      accountId: "account_id",
      providerId: "provider_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "verifications",
    fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
  },
  advanced: {
    // Postgres fills in ids (gen_random_uuid()), so every id is a real UUID.
    database: { generateId: false },
  },

  emailAndPassword: {
    enabled: true,
    // Nobody can sign in until they've clicked the link in their email.
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 72,
    resetPasswordTokenExpiresIn: 60 * 60,
    // After a reset, every other signed-in browser is signed out.
    revokeSessionsOnPasswordReset: true,
    // Emails are sent after the response, so how long a send takes can't
    // reveal whether an address has an account.
    sendResetPassword: async ({ user, url }) => {
      after(() => sendEmail(resetPasswordMessage(user.email, url)));
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    // Signing in before confirming sends a fresh link.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      after(() => sendEmail(confirmEmailMessage(user.email, url)));
    },
  },

  // Limits repeated requests to the sign-in library's own web endpoints
  // (/api/auth/...). Counted in the database so every server instance
  // shares one count. The app's forms have their own limits (sign-in-limits.ts).
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "rate_limits",
    fields: { lastRequest: "last_request" },
  },

  // Must stay last: lets Server Actions set the session cookie.
  plugins: [nextCookies()],
});
