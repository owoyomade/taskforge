import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth";
import { ResetPasswordForm } from "../auth-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  // The emailed reset link signs the user in before sending them here.
  // Without that session there's nothing to reset.
  const user = await getCurrentUser();

  if (!user) {
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
        <p className="text-sm text-muted-foreground">For {user.email}</p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
