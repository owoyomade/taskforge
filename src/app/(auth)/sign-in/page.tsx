import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { SignInForm } from "../auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next, error } = await searchParams;
  const nextPath = typeof next === "string" ? safeRedirectPath(next) : undefined;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">Welcome back. Pick up where your team left off.</p>
      </div>
      {error === "link" ? (
        <Alert variant="destructive">
          <AlertDescription>That link is invalid or has expired. Sign in, or request a new link.</AlertDescription>
        </Alert>
      ) : null}
      <SignInForm next={nextPath} />
      <p className="text-sm text-muted-foreground">
        New to Taskforge?{" "}
        <Link href="/sign-up" className="font-medium text-foreground underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
