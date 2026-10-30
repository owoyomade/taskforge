"use server";

import { isAPIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireUser } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { auth } from "@/lib/better-auth";
import { attemptAsCurrentUser } from "@/lib/db";
import { toUserMessage } from "@/lib/db-errors";
import { deleteFiles, saveFile } from "@/lib/file-storage";
import { DEMO_BLOCKED, isDemoSession } from "@/lib/demo";
import { textField, validationError, type FormState } from "@/lib/form-state";
import { detectImageType, IMAGE_EXTENSIONS } from "@/lib/image-type";
import { getMyProfile } from "@/lib/profiles";
import { AVATAR_MAX_BYTES, changePasswordSchema, profileSchema } from "@/lib/validation";

export async function updateProfile(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = { fullName: textField(formData, "fullName") };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    return validationError(parsed.error, values);
  }

  const result = await attemptAsCurrentUser((db) =>
    db.query("update public.profiles set full_name = $2 where id = $1", [user.id, parsed.data.fullName]),
  );
  if (!result.ok) {
    return { status: "error", message: toUserMessage(result.error, "updateProfile"), values };
  }

  revalidatePath("/", "layout");
  return { status: "success", message: "Profile saved." };
}

export async function uploadAvatar(_previous: FormState, formData: FormData): Promise<FormState> {
  if (await isDemoSession()) return { status: "error", message: DEMO_BLOCKED };
  const user = await requireUser();
  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choose an image to upload." };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { status: "error", message: "Images must be 2 MB or smaller." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const imageType = detectImageType(bytes);
  if (!imageType) {
    return { status: "error", message: "Upload a PNG, JPEG or WebP image." };
  }

  // A new file name on every upload means browsers never show a stale cached
  // avatar. The path starts with the user's id: the profiles table only
  // accepts paths in your own folder, and can_view_avatar() reads it.
  const path = `${user.id}/avatar-${Date.now()}.${IMAGE_EXTENSIONS[imageType]}`;
  const previousPath = (await getMyProfile()).avatarPath;

  // The profile change and the upload succeed or fail together.
  const result = await attemptAsCurrentUser(async (db) => {
    await db.query("update public.profiles set avatar_path = $2 where id = $1", [user.id, path]);
    await saveFile("avatars", path, bytes, imageType);
  });
  if (!result.ok) {
    if (!result.error.code) {
      console.error(JSON.stringify({ level: "error", context: "uploadAvatar", message: result.error.message }));
      return { status: "error", message: "The upload failed. Please try again." };
    }
    return { status: "error", message: toUserMessage(result.error, "uploadAvatar") };
  }

  if (previousPath) {
    await deleteFiles("avatars", [previousPath]).catch(() => {});
  }

  revalidatePath("/", "layout");
  return { status: "success", message: "Photo updated." };
}

export async function removeAvatar(): Promise<FormState> {
  const user = await requireUser();
  const { avatarPath } = await getMyProfile();
  if (!avatarPath) {
    return { status: "success", message: "Photo removed." };
  }

  const result = await attemptAsCurrentUser((db) => db.query("update public.profiles set avatar_path = null where id = $1", [user.id]));
  if (!result.ok) {
    return { status: "error", message: toUserMessage(result.error, "removeAvatar") };
  }
  // The profile no longer points at it, so a failed delete only leaves an unreachable file.
  await deleteFiles("avatars", [avatarPath]).catch(() => {});

  revalidatePath("/", "layout");
  return { status: "success", message: "Photo removed." };
}

export async function changePassword(_previous: FormState, formData: FormData): Promise<FormState> {
  if (await isDemoSession()) return { status: "error", message: DEMO_BLOCKED };
  await requireUser();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: textField(formData, "currentPassword"),
    password: textField(formData, "password"),
    confirmPassword: textField(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  // Better Auth re-checks the current password, so someone who finds an
  // unlocked, signed-in laptop can't silently take over the account. Other
  // signed-in browsers are signed out.
  try {
    await auth.api.changePassword({
      body: { currentPassword: parsed.data.currentPassword, newPassword: parsed.data.password, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (error) {
    if (isAPIError(error) && error.body?.code === "INVALID_PASSWORD") {
      return {
        status: "error",
        message: "Please fix the highlighted fields.",
        fieldErrors: { currentPassword: ["That isn't your current password."] },
      };
    }
    return { status: "error", message: authErrorMessage(error) };
  }

  return { status: "success", message: "Password changed." };
}
