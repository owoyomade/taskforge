import "server-only";

import { headers } from "next/headers";

import { authPool } from "@/lib/better-auth";
import { serverEnv } from "@/lib/server-env";

/**
 * Limits on the sign-in forms, counted in the database (auth.attempts) so
 * every server instance shares the same count:
 *
 * - per internet address, every attempt counts: this slows down someone
 *   trying many accounts or creating accounts in bulk;
 * - per email address, only wrong passwords count: this stops password
 *   guessing against one account without locking out its owner when
 *   someone else's attempts come from the same network.
 *
 * AUTH_IP_LIMIT_MULTIPLIER only raises the per-address numbers (the
 * browser tests sign in far more often than any person would); it can't
 * switch the limits off.
 */
const LIMITS = {
  "sign-in": { max: 30, windowSeconds: 5 * 60 },
  "sign-up": { max: 10, windowSeconds: 60 * 60 },
  "password-reset": { max: 10, windowSeconds: 60 * 60 },
} as const;
const WRONG_PASSWORDS = { max: 10, windowSeconds: 15 * 60 };

export type LimitedAction = keyof typeof LIMITS;

/** The visitor's address. Vercel sets x-forwarded-for itself, so its first entry is trustworthy there. */
async function clientAddress(): Promise<string> {
  const requestHeaders = await headers();
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown";
}

async function allowed(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { rows } = await authPool.query<{ allowed: boolean }>("select auth.attempts_allowed($1, $2, $3) as allowed", [key, max, windowSeconds]);
  const ok = rows[0]?.allowed ?? false;
  if (!ok) {
    // Which kind of limit, never the address or email in the key.
    console.warn(JSON.stringify({ level: "warn", context: "sign-in-limits", limit: key.split(":").slice(0, 2).join(":"), max }));
  }
  return ok;
}

async function record(key: string, windowSeconds: number): Promise<void> {
  await authPool.query("select auth.record_attempt($1, $2)", [key, windowSeconds]);
}

/** Counts this attempt from the visitor's address; false means "too many, wait a bit". */
export async function takeAttempt(action: LimitedAction): Promise<boolean> {
  const { max, windowSeconds } = LIMITS[action];
  const key = `${action}:ip:${await clientAddress()}`;
  if (!(await allowed(key, max * serverEnv.AUTH_IP_LIMIT_MULTIPLIER, windowSeconds))) return false;
  await record(key, windowSeconds);
  return true;
}

/** False once an account has had too many wrong passwords recently. */
export function passwordAttemptsAllowed(email: string): Promise<boolean> {
  return allowed(`sign-in:email:${email.toLowerCase()}`, WRONG_PASSWORDS.max, WRONG_PASSWORDS.windowSeconds);
}

export function recordWrongPassword(email: string): Promise<void> {
  return record(`sign-in:email:${email.toLowerCase()}`, WRONG_PASSWORDS.windowSeconds);
}
