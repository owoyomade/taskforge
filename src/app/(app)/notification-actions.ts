"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { toUserMessage } from "@/lib/db-errors";
import type { FormState } from "@/lib/form-state";
import { NO_PERMISSION, type ActionResult } from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/w/[slug]", "layout");
}

export async function markNotificationRead(notificationId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(notificationId).success) return NO_PERMISSION;
  const supabase = await createClient();
  // RLS only lets the recipient update their own notification.
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .is("read_at", null);
  if (error) return { ok: false, message: toUserMessage(error, "markNotificationRead") };

  refresh();
  return { ok: true };
}

export async function markAllNotificationsRead(workspaceId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(workspaceId).success) return NO_PERMISSION;
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("recipient_id", user.id)
    .is("read_at", null);
  if (error) return { ok: false, message: toUserMessage(error, "markAllNotificationsRead") };

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

  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: user.id, ...preferences }, { onConflict: "user_id" });
  if (error) return { status: "error", message: toUserMessage(error, "updateNotificationPreferences") };

  return { status: "success", message: "Notification settings saved." };
}
