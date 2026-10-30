import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { SignUpForm } from "../auth-forms";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage() {
  if (await getCurrentUser()) {
    redirect("/dashboard");
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="text-sm text-muted-foreground">Free for small teams. You&apos;ll set up your first workspace next.</p>
      </div>
      <SignUpForm />
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
