import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "../auth-forms";

export const metadata: Metadata = { title: "Choose a new password" };

/**
 * Where the emailed reset link ends up. Better Auth checks the link first
 * and sends people here with ?token=... (or ?error=... if it was expired or
 * already used).
 */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token, error } = await searchParams;

  if (typeof token !== "string" || token.length === 0 || error) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold">This reset link has expired</h1>
        <p className="text-muted-foreground">Reset links work once and expire after an hour. Request a new one to continue.</p>
        <Link href="/forgot-password" className="font-medium underline-offset-4 hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">You&apos;ll sign in with it straight afterwards.</p>
      </div>
      <ResetPasswordForm token={token} />
    </div>
  );
}
