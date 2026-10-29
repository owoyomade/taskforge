"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { respondToInvitation } from "@/app/(app)/member-actions";
import { Button } from "@/components/ui/button";
import type { MyInvitation } from "@/lib/invitations";
import { ROLE_LABELS } from "@/lib/permissions";

/** Invitations waiting for the signed-in user, with accept and decline. */
export function MyInvitations({ invitations }: { invitations: MyInvitation[] }) {
  if (invitations.length === 0) return null;

  return (
    <section aria-labelledby="my-invitations-heading" className="grid gap-3">
      <h2 id="my-invitations-heading" className="text-lg font-semibold">
        {invitations.length === 1 ? "You have an invitation" : `You have ${invitations.length} invitations`}
      </h2>
      <ul className="grid gap-2">
        {invitations.map((invitation) => (
          <li key={invitation.id}>
            <InvitationCard
              invitationId={invitation.id}
              workspaceName={invitation.workspaceName}
              detail={`${invitation.inviterName} invited you to join as ${ROLE_LABELS[invitation.role].toLowerCase()}.`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function InvitationCard({
  invitationId,
  workspaceName,
  detail,
}: {
  invitationId: string;
  workspaceName: string;
  detail: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function respond(accept: boolean) {
    startTransition(async () => {
      const result = await respondToInvitation(invitationId, accept);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (accept && result.slug) {
        toast.success(`Welcome to ${workspaceName}.`);
        router.push(`/w/${result.slug}`);
      } else {
        toast.success("Invitation declined.");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
      <div className="min-w-0 flex-1">
        <p className="font-heading font-semibold">{workspaceName}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" disabled={isPending} onClick={() => respond(false)}>
          Decline
        </Button>
        <Button disabled={isPending} onClick={() => respond(true)}>
          {isPending ? "Joining…" : "Accept and join"}
        </Button>
      </div>
    </div>
  );
}
