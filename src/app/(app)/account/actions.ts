"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { toUserMessage } from "@/lib/db-errors";
import { textField, validationError, type FormState } from "@/lib/form-state";
import { detectImageType, IMAGE_EXTENSIONS } from "@/lib/image-type";
import { getMyProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";
import { AVATAR_MAX_BYTES, changePasswordSchema, profileSchema } from "@/lib/validation";

export async function updateProfile(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = { fullName: textField(formData, "fullName") };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    return validationError(parsed.error, values);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.fullName }).eq("id", user.id);
  if (error) {
    return { status: "error", message: toUserMessage(error, "updateProfile"), values };
  }

  revalidatePath("/", "layout");
  return { status: "success", message: "Profile saved." };
}

export async function uploadAvatar(_previous: FormState, formData: FormData): Promise<FormState> {
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
  // avatar. The path starts with the user's id, which storage policies require.
  const path = `${user.id}/avatar-${Date.now()}.${IMAGE_EXTENSIONS[imageType]}`;
  const supabase = await createClient();

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, bytes, { contentType: imageType, upsert: false });
  if (uploadError) {
    console.error(JSON.stringify({ level: "error", context: "uploadAvatar", message: uploadError.message }));
    return { status: "error", message: "The upload failed. Please try again." };
  }

  const previousPath = (await getMyProfile()).avatarPath;
  const { error: updateError } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", user.id);
  if (updateError) {
    // Don't leave an orphaned file behind if the profile didn't change.
    await supabase.storage.from("avatars").remove([path]);
    return { status: "error", message: toUserMessage(updateError, "uploadAvatar") };
  }

  if (previousPath) {
    await supabase.storage.from("avatars").remove([previousPath]);
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

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", user.id);
  if (error) {
    return { status: "error", message: toUserMessage(error, "removeAvatar") };
  }
  await supabase.storage.from("avatars").remove([avatarPath]);

  revalidatePath("/", "layout");
  return { status: "success", message: "Photo removed." };
}

export async function changePassword(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: textField(formData, "currentPassword"),
    password: textField(formData, "password"),
    confirmPassword: textField(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const supabase = await createClient();

  // Re-checking the current password means someone who finds an unlocked,
  // signed-in laptop can't silently take over the account.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: { currentPassword: ["That isn't your current password."] },
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { status: "error", message: authErrorMessage(error) };
  }

  return { status: "success", message: "Password changed." };
}
