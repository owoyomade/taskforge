import type { Metadata } from "next";
import Link from "next/link";

import { redirect } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { TryDemoButton } from "@/components/try-demo-button";
import { getCurrentUser } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { SignInForm } from "../auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next, error, reset, demo } = await searchParams;
  const nextPath = typeof next === "string" ? safeRedirectPath(next) : undefined;

  // Checked here, against the real session, rather than in the proxy: an
  // expired cookie would otherwise bounce between this page and the app.
  if (await getCurrentUser()) {
    redirect(nextPath ?? "/dashboard");
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">Welcome back. Pick up where your team left off.</p>
      </div>
      {reset === "done" ? (
        <Alert>
          <AlertDescription>Your password has been changed. Sign in with the new one.</AlertDescription>
        </Alert>
      ) : null}
      {demo === "unavailable" ? (
        <Alert variant="destructive">
          <AlertDescription>The demo isn&apos;t available right now. Try again in a minute, or create a free account.</AlertDescription>
        </Alert>
      ) : null}
      {error === "link" ? (
        <Alert variant="destructive">
          <AlertDescription>That link is invalid or has expired. Sign in, or request a new link.</AlertDescription>
        </Alert>
      ) : null}
      <SignInForm next={nextPath} />
      <div className="grid gap-2 rounded-xl border border-dashed p-4">
        <p className="text-sm text-muted-foreground">Just looking around? Explore a sample workspace without signing up.</p>
        <TryDemoButton className="justify-self-start" />
      </div>
      <p className="text-sm text-muted-foreground">
        New to Taskforge?{" "}
        <Link href="/sign-up" className="font-medium text-foreground underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
