import type { Metadata } from "next";
import Link from "next/link";

import { Brand } from "@/components/brand";
import { InvitationCard } from "@/components/members/my-invitations";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getInvitationPreview } from "@/lib/invitations";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Invitation" };

const CLOSED_MESSAGES = {
  accepted: "This invitation has already been accepted.",
  declined: "This invitation was declined.",
  revoked: "This invitation was cancelled. Ask the person who invited you for a new one.",
  expired: "This invitation has expired. Ask the person who invited you for a new one.",
} as const;

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = await getCurrentUser();
  const nextPath = `/invite/${token}`;

  return (
    <main className="flex flex-1 flex-col px-4 py-6 sm:px-10">
      <Brand />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 py-10">
        {user ? <SignedInView token={token} email={user.email} /> : <SignedOutView nextPath={nextPath} />}
      </div>
    </main>
  );
}

// The preview needs a signed-in user, so visitors first sign in or sign up
// and come straight back here.
function SignedOutView({ nextPath }: { nextPath: string }) {
  return (
    <>
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold">You&apos;ve been invited to Taskforge</h1>
        <p className="text-muted-foreground">
          Sign in, or create an account with the email address the invitation was sent to, to see and accept it.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/sign-in?next=${encodeURIComponent(nextPath)}`} className={buttonVariants({ size: "lg" })}>
          Sign in
        </Link>
        <Link href="/sign-up" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
          Create an account
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        After creating an account and confirming your email, open this link again, or find the invitation on your
        welcome page.
      </p>
    </>
  );
}

async function SignedInView({ token, email }: { token: string; email: string }) {
  const invitation = await getInvitationPreview(token);

  if (!invitation) {
    return (
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold">Invitation not found</h1>
        <p className="text-muted-foreground">Check that you copied the whole link, or ask for a new invitation.</p>
      </div>
    );
  }

  if (invitation.status !== "pending") {
    return (
      <div className="grid gap-3">
        <h1 className="text-2xl font-semibold">{invitation.workspaceName}</h1>
        <p className="text-muted-foreground">{CLOSED_MESSAGES[invitation.status]}</p>
        <Link href="/dashboard" className={cn(buttonVariants(), "justify-self-start")}>
          Go to your workspaces
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Join {invitation.workspaceName}</h1>
      <InvitationCard
        invitationId={invitation.id}
        workspaceName={invitation.workspaceName}
        detail={`${invitation.inviterName} invited ${invitation.emailHint} to join as ${ROLE_LABELS[invitation.role].toLowerCase()}.`}
      />
      <p className="text-sm text-muted-foreground">
        You&apos;re signed in as {email}. If the invitation was sent to a different address, sign out and sign in
        with that one.
      </p>
    </div>
  );
}
