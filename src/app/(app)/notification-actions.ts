"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { attemptAsCurrentUser } from "@/lib/db";
import { toUserMessage } from "@/lib/db-errors";
import type { FormState } from "@/lib/form-state";
import { NO_PERMISSION, type ActionResult } from "@/lib/project-access";

function refresh() {
  revalidatePath("/w/[slug]", "layout");
}

export async function markNotificationRead(notificationId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(notificationId).success) return NO_PERMISSION;
  // RLS only lets the recipient update their own notification.
  const result = await attemptAsCurrentUser((db) =>
    db.query("update public.notifications set read_at = now() where id = $1 and read_at is null", [notificationId]),
  );
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "markNotificationRead") };

  refresh();
  return { ok: true };
}

export async function markAllNotificationsRead(workspaceId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(workspaceId).success) return NO_PERMISSION;
  const user = await requireUser();
  const result = await attemptAsCurrentUser((db) =>
    db.query("update public.notifications set read_at = now() where workspace_id = $1 and recipient_id = $2 and read_at is null", [
      workspaceId,
      user.id,
    ]),
  );
  if (!result.ok) return { ok: false, message: toUserMessage(result.error, "markAllNotificationsRead") };

  refresh();
  return { ok: true };
}

export async function updateNotificationPreferences(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  // Checkboxes only send a value when ticked.
  const preferences = {
    assigned: formData.get("assigned") === "on",
    mentioned: formData.get("mentioned") === "on",
    commented: formData.get("commented") === "on",
  };

  const result = await attemptAsCurrentUser((db) =>
    db.query(
      `insert into public.notification_preferences (user_id, assigned, mentioned, commented) values ($1, $2, $3, $4)
       on conflict (user_id) do update set assigned = excluded.assigned, mentioned = excluded.mentioned, commented = excluded.commented`,
      [user.id, preferences.assigned, preferences.mentioned, preferences.commented],
    ),
  );
  if (!result.ok) return { status: "error", message: toUserMessage(result.error, "updateNotificationPreferences") };

  return { status: "success", message: "Notification settings saved." };
}
