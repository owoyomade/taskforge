"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authErrorMessage, TOO_MANY_ATTEMPTS } from "@/lib/auth-errors";
import { auth } from "@/lib/better-auth";
import { DEMO_EMAIL, demoEnabled, demoIsReady, isDemoEmail, resetDemo } from "@/lib/demo";
import { textField, validationError, type FormState } from "@/lib/form-state";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { passwordAttemptsAllowed, recordWrongPassword, takeAttempt } from "@/lib/sign-in-limits";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "@/lib/validation";

export async function signUp(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = { fullName: textField(formData, "fullName"), email: textField(formData, "email") };
  const parsed = signUpSchema.safeParse({ ...values, password: textField(formData, "password") });
  if (!parsed.success) {
    return validationError(parsed.error, values);
  }
  if (!(await takeAttempt("sign-up"))) {
    return { status: "error", message: TOO_MANY_ATTEMPTS, values };
  }

  try {
    await auth.api.signUpEmail({
      // After confirming, /dashboard opens their workspace, or workspace setup for a new person.
      body: { name: parsed.data.fullName, email: parsed.data.email, password: parsed.data.password, callbackURL: "/dashboard" },
      headers: await headers(),
    });
  } catch (error) {
    return { status: "error", message: authErrorMessage(error), values };
  }

  // Better Auth answers the same way whether or not the email already has an
  // account, so this page can't be used to discover who has signed up.
  redirect("/check-email");
}

export async function signIn(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = { email: textField(formData, "email") };
  const parsed = signInSchema.safeParse({ ...values, password: textField(formData, "password") });
  if (!parsed.success) {
    return validationError(parsed.error, values);
  }
  if (isDemoEmail(parsed.data.email)) {
    // The demo's password is secret, and guesses here mustn't be able to lock everyone out of it.
    return { status: "error", message: "Use the Try the demo button to explore the demo.", values };
  }
  if (!(await takeAttempt("sign-in")) || !(await passwordAttemptsAllowed(parsed.data.email))) {
    return { status: "error", message: TOO_MANY_ATTEMPTS, values };
  }

  try {
    // nextCookies() (see better-auth.ts) puts the session cookie on this response.
    // callbackURL is where a fresh confirmation link leads, if the email isn't confirmed yet.
    await auth.api.signInEmail({ body: { ...parsed.data, callbackURL: "/dashboard" }, headers: await headers() });
  } catch (error) {
    if (isAPIError(error) && error.body?.code === "INVALID_EMAIL_OR_PASSWORD") {
      await recordWrongPassword(parsed.data.email);
    }
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
  if (!(await takeAttempt("password-reset"))) {
    return { status: "error", message: TOO_MANY_ATTEMPTS, values };
  }

  try {
    // The emailed link opens /reset-password?token=... (Better Auth checks the token first).
    // The shared demo account never gets one (its address doesn't receive mail anyway).
    if (!isDemoEmail(parsed.data.email)) await auth.api.requestPasswordReset({ body: { email: parsed.data.email, redirectTo: "/reset-password" }, headers: await headers() });
  } catch (error) {
    // Logged, but the answer stays the same so the form can't reveal which emails have accounts.
    authErrorMessage(error);
  }

  return {
    status: "success",
    message: "If an account exists for that email, a reset link is on its way. It expires in one hour.",
  };
}

export async function resetPassword(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: textField(formData, "password"),
    confirmPassword: textField(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    await auth.api.resetPassword({ body: { newPassword: parsed.data.password, token: textField(formData, "token") }, headers: await headers() });
  } catch (error) {
    return { status: "error", message: authErrorMessage(error) };
  }

  // Resetting signs out every browser, so the person signs in afresh with the new password.
  redirect("/sign-in?reset=done");
}

export async function signOut(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/sign-in");
}

/**
 * "Create your own free account" in the demo banner. The sign-up page sends
 * anyone signed in to their dashboard, so the demo session ends first.
 */
export async function leaveDemoToSignUp(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/sign-up");
}

/**
 * "Try the demo": signs the visitor in to the shared demo account. The
 * password never leaves the server. The first click on a new site builds
 * the demo workspace.
 */
export async function startDemo(): Promise<void> {
  const password = process.env.DEMO_PASSWORD;
  if (!password || !demoEnabled() || !(await takeAttempt("sign-in"))) {
    redirect("/sign-in?demo=unavailable");
  }

  try {
    if (!(await demoIsReady())) await resetDemo();
    await auth.api.signInEmail({ body: { email: DEMO_EMAIL, password }, headers: await headers() });
  } catch (error) {
    authErrorMessage(error);
    redirect("/sign-in?demo=unavailable");
  }
  redirect("/dashboard");
}
