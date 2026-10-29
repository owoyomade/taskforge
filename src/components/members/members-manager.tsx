"use client";

import { useActionState, useEffect, useId, useState, useTransition } from "react";
import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

import {
  changeMemberRole,
  inviteMember,
  leaveWorkspace,
  removeMember,
  revokeInvitation,
  transferOwnership,
  type InviteState,
} from "@/app/(app)/member-actions";
import { fieldErrors, FormField, FormMessage, previousValue } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/user-avatar";
import { formatDate } from "@/lib/dates";
import { initialFormState } from "@/lib/form-state";
import type { OpenInvitation } from "@/lib/invitations";
import { canManageMember, grantableRoles, INVITABLE_ROLES, ROLE_LABELS } from "@/lib/permissions";
import type { ActionResult } from "@/lib/project-access";
import type { WorkspaceMember, WorkspaceSummary } from "@/lib/workspaces";

function useRun() {
  const [isPending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(success);
      else toast.error(result.message);
    });
  }
  return { isPending, run };
}

type MembersManagerProps = {
  workspace: WorkspaceSummary;
  members: WorkspaceMember[];
  currentUserId: string;
};

/** The member list, with role and removal controls where the viewer is allowed them. */
export function MembersManager({ workspace, members, currentUserId }: MembersManagerProps) {
  const { isPending, run } = useRun();
  const roles = grantableRoles(workspace.role);

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {members.map((member) => {
        const isMe = member.userId === currentUserId;
        const manageable = !isMe && canManageMember(workspace.role, member.role);
        const name = member.fullName || member.email;
        return (
          <li key={member.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <UserAvatar name={member.fullName} email={member.email} avatarUrl={member.avatarUrl} className="size-9" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {name}
                {isMe ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">{member.email}</p>
            </div>
            {manageable ? (
              <>
                <label className="sr-only" htmlFor={`role-${member.userId}`}>
                  Role for {name}
                </label>
                <NativeSelect
                  id={`role-${member.userId}`}
                  className="w-32"
                  value={member.role}
                  disabled={isPending}
                  onChange={(event) => {
                    const role = event.target.value;
                    const label = ROLE_LABELS[roles.find((candidate) => candidate === role) ?? member.role];
                    run(() => changeMemberRole(workspace.id, member.userId, role), `${name} is now ${label.toLowerCase()}.`);
                  }}
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </NativeSelect>
                <ConfirmButton
                  label="Remove"
                  title={`Remove ${name}?`}
                  description="They'll lose access to this workspace and its projects straight away. Their comments and tasks stay."
                  confirmLabel="Remove member"
                  disabled={isPending}
                  onConfirm={() => run(() => removeMember(workspace.id, member.userId), `${name} was removed.`)}
                />
              </>
            ) : (
              <Badge variant={member.role === "owner" ? "default" : "secondary"}>{ROLE_LABELS[member.role]}</Badge>
            )}
            {isMe ? (
              <ConfirmButton
                label="Leave"
                title={`Leave ${workspace.name}?`}
                description="You'll lose access straight away. Someone will need to invite you again to come back."
                confirmLabel="Leave workspace"
                disabled={isPending}
                onConfirm={() => run(() => leaveWorkspace(workspace.id), "You left the workspace.")}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ConfirmButton({
  label,
  title,
  description,
  confirmLabel,
  disabled,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" disabled={disabled} />}>{label}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const [state, formAction, isPending] = useActionState<InviteState, FormData>(inviteMember, initialFormState);
  const roleId = useId();
  const linkId = useId();

  return (
    <div className="grid gap-4">
      <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end" noValidate>
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <FormField
          label="Email address"
          name="email"
          type="email"
          autoComplete="off"
          required
          defaultValue={state.status === "error" ? previousValue(state, "email") : undefined}
          errors={state.status === "error" ? fieldErrors(state, "email") : undefined}
        />
        <div className="grid gap-1.5">
          <Label htmlFor={roleId}>Role</Label>
          <NativeSelect id={roleId} name="role" defaultValue="member">
            {INVITABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" className="h-10" disabled={isPending}>
          {isPending ? "Creating…" : "Create invite link"}
        </Button>
      </form>
      {state.status === "error" ? <FormMessage state={state} /> : null}
      {state.status === "invited" ? (
        <div className="grid gap-2 rounded-lg border bg-accent/40 p-3" role="status">
          <p className="text-sm">{state.message}</p>
          <div className="flex gap-2">
            <label htmlFor={linkId} className="sr-only">
              Invite link
            </label>
            <Input id={linkId} readOnly value={state.link} className="h-9 font-mono text-xs" onFocus={(event) => event.target.select()} />
            <Button
              type="button"
              variant="secondary"
              className="h-9"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.link);
                  toast.success("Link copied.");
                } catch {
                  toast.error("Couldn't copy automatically. Select the link and copy it.");
                }
              }}
            >
              <CopyIcon />
              Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Email delivery isn&apos;t set up yet, so send this link yourself. They&apos;ll also see the invitation when
            they sign in with that address.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function OpenInvitationsList({ workspaceId, invitations }: { workspaceId: string; invitations: OpenInvitation[] }) {
  const { isPending, run } = useRun();

  if (invitations.length === 0) {
    return <p className="text-sm text-muted-foreground">No open invitations.</p>;
  }

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {invitations.map((invitation) => (
        <li key={invitation.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{invitation.email}</p>
            <p className="text-xs text-muted-foreground">
              {ROLE_LABELS[invitation.role]}, invited by {invitation.invitedBy},{" "}
              {invitation.isExpired ? (
                <span className="text-destructive">expired</span>
              ) : (
                `expires ${formatDate(invitation.expiresAt.slice(0, 10))}`
              )}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => run(() => revokeInvitation(workspaceId, invitation.id), "Invitation revoked.")}
          >
            Revoke
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function TransferOwnershipForm({ workspace, members, currentUserId }: MembersManagerProps) {
  const [state, formAction, isPending] = useActionState(transferOwnership, initialFormState);
  const ownerId = useId();
  const candidates = members.filter((member) => member.userId !== currentUserId && member.role !== "viewer");

  useEffect(() => {
    if (state.status === "success") toast.success(state.message);
  }, [state]);

  if (candidates.length === 0) {
    return <p className="text-sm text-muted-foreground">Invite someone as an admin or member first; ownership can only go to an existing member.</p>;
  }

  return (
    <form action={formAction} className="grid max-w-md gap-4" noValidate>
      {state.status === "error" && !state.fieldErrors ? <FormMessage state={state} /> : null}
      <input type="hidden" name="workspaceId" value={workspace.id} />
      <div className="grid gap-1.5">
        <Label htmlFor={ownerId}>New owner</Label>
        <NativeSelect id={ownerId} name="newOwnerId" defaultValue="">
          <option value="" disabled>
            Choose a member
          </option>
          {candidates.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.fullName || member.email} ({ROLE_LABELS[member.role]})
            </option>
          ))}
        </NativeSelect>
      </div>
      <FormField
        label={`Type ${workspace.name} to confirm`}
        name="confirmName"
        autoComplete="off"
        required
        errors={fieldErrors(state, "confirmName")}
      />
      <Button type="submit" variant="outline" className="justify-self-start" disabled={isPending}>
        {isPending ? "Transferring…" : "Transfer ownership"}
      </Button>
    </form>
  );
}
