import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "../auth-forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="text-sm text-muted-foreground">Enter your account email and we&apos;ll send you a reset link.</p>
      </div>
      <ForgotPasswordForm />
      <Link href="/sign-in" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
