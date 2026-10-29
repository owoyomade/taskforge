"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { publicEnv } from "@/lib/env";
import { textField, validationError, type FormState } from "@/lib/form-state";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "@/lib/validation";

export async function signUp(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = { fullName: textField(formData, "fullName"), email: textField(formData, "email") };
  const parsed = signUpSchema.safeParse({ ...values, password: textField(formData, "password") });
  if (!parsed.success) {
    return validationError(parsed.error, values);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/onboarding`,
    },
  });

  if (error) {
    return { status: "error", message: authErrorMessage(error), values };
  }

  // Supabase answers the same way whether or not the email is already
  // registered, so this page can't be used to discover who has an account.
  redirect("/check-email");
}

export async function signIn(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = { email: textField(formData, "email") };
  const parsed = signInSchema.safeParse({ ...values, password: textField(formData, "password") });
  if (!parsed.success) {
    return validationError(parsed.error, values);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { status: "error", message: authErrorMessage(error), values };
  }

  redirect(safeRedirectPath(formData.get("next")));
}

export async function requestPasswordReset(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = { email: textField(formData, "email") };
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) {
    return validationError(parsed.error, values);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/reset-password`,
  });

  // Rate limits are worth reporting; anything else gets the same answer as
  // success so the form doesn't reveal which emails have accounts.
  if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") {
    return { status: "error", message: authErrorMessage(error), values };
  }

  return {
    status: "success",
    message: "If an account exists for that email, a reset link is on its way. It expires in one hour.",
  };
}

export async function resetPassword(_previous: FormState, formData: FormData): Promise<FormState> {
  // The reset link signed the user in (see /auth/confirm), so a session must exist.
  await requireUser();

  const parsed = resetPasswordSchema.safeParse({
    password: textField(formData, "password"),
    confirmPassword: textField(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { status: "error", message: authErrorMessage(error) };
  }

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
