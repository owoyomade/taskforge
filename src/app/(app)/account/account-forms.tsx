"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";

import { fieldErrors, FormField, FormMessage, previousValue } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { initialFormState, type FormState } from "@/lib/form-state";
import type { ProfileView } from "@/lib/profiles";
import { changePassword, removeAvatar, updateProfile, uploadAvatar } from "./actions";

/** Shows a toast once per successful submit. */
function useSuccessToast(state: FormState) {
  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    }
  }, [state]);
}

export function ProfileForm({ profile }: { profile: ProfileView }) {
  const [state, formAction, isPending] = useActionState(updateProfile, initialFormState);
  useSuccessToast(state);

  return (
    <form action={formAction} className="grid max-w-md gap-4" noValidate>
      {state.status === "error" ? <FormMessage state={state} /> : null}
      <FormField
        label="Name"
        name="fullName"
        autoComplete="name"
        required
        maxLength={80}
        defaultValue={previousValue(state, "fullName") ?? profile.fullName}
        errors={fieldErrors(state, "fullName")}
      />
      <div className="grid gap-1 text-sm">
        <p className="font-medium">Email</p>
        <p className="text-muted-foreground">{profile.email}</p>
      </div>
      <Button type="submit" className="justify-self-start" disabled={isPending}>
        {isPending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}

export function AvatarForm({ profile }: { profile: ProfileView }) {
  const [state, formAction, isUploading] = useActionState(uploadAvatar, initialFormState);
  const [isRemoving, startRemoving] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  useSuccessToast(state);

  function handleRemove() {
    startRemoving(async () => {
      const result = await removeAvatar();
      if (result.status === "success") toast.success(result.message);
      if (result.status === "error") toast.error(result.message);
    });
  }

  return (
    <form ref={formRef} action={formAction} className="grid gap-4">
      {state.status === "error" ? <FormMessage state={state} /> : null}
      <div className="flex flex-wrap items-center gap-4">
        <UserAvatar name={profile.fullName} email={profile.email} avatarUrl={profile.avatarUrl} className="size-16" />
        {/* Choosing a file submits straight away; there's nothing else to fill in. */}
        <label className="cursor-pointer">
          <span className="sr-only">Upload a new photo</span>
          <input
            type="file"
            name="avatar"
            accept="image/png,image/jpeg,image/webp"
            className="peer sr-only"
            disabled={isUploading}
            onChange={() => formRef.current?.requestSubmit()}
          />
          <span
            aria-hidden="true"
            className="inline-flex h-8 items-center rounded-lg border bg-background px-2.5 text-sm font-medium hover:bg-muted peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
          >
            {isUploading ? "Uploading…" : "Upload photo"}
          </span>
        </label>
        {profile.avatarPath ? (
          <Button type="button" variant="ghost" onClick={handleRemove} disabled={isRemoving}>
            {isRemoving ? "Removing…" : "Remove photo"}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 2 MB. Visible to people in your workspaces.</p>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(changePassword, initialFormState);
  useSuccessToast(state);

  return (
    <form action={formAction} className="grid max-w-md gap-4" noValidate>
      {state.status === "error" ? <FormMessage state={state} /> : null}
      <FormField
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        errors={fieldErrors(state, "currentPassword")}
      />
      <FormField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters, with a letter and a number."
        errors={fieldErrors(state, "password")}
      />
      <FormField
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        errors={fieldErrors(state, "confirmPassword")}
      />
      <Button type="submit" className="justify-self-start" disabled={isPending}>
        {isPending ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}
