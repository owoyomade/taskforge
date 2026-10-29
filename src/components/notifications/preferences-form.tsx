"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { updateNotificationPreferences } from "@/app/(app)/notification-actions";
import { FormMessage } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { initialFormState } from "@/lib/form-state";
import type { NotificationPreferences } from "@/lib/notifications";

const OPTIONS = [
  { name: "assigned", label: "Someone assigns me a task" },
  { name: "mentioned", label: "Someone mentions me in a comment" },
  { name: "commented", label: "Someone comments on a task I'm assigned to or created" },
] as const;

export function NotificationPreferencesForm({ preferences }: { preferences: NotificationPreferences }) {
  const [state, formAction, isPending] = useActionState(updateNotificationPreferences, initialFormState);

  useEffect(() => {
    if (state.status === "success") toast.success(state.message);
  }, [state]);

  return (
    <form action={formAction} className="grid max-w-md gap-4">
      {state.status === "error" ? <FormMessage state={state} /> : null}
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Tell me in my inbox when…</legend>
        {OPTIONS.map((option) => (
          <label key={option.name} className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" name={option.name} defaultChecked={preferences[option.name]} className="size-4 accent-primary" />
            {option.label}
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Notifications appear in each workspace&apos;s Inbox. Email notifications need an email provider and will come later.
      </p>
      <Button type="submit" className="justify-self-start" disabled={isPending}>
        {isPending ? "Saving…" : "Save notification settings"}
      </Button>
    </form>
  );
}
