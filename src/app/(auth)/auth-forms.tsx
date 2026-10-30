"use client";

import Link from "next/link";
import { useActionState } from "react";

import { fieldErrors, FormField, FormMessage, previousValue } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { initialFormState } from "@/lib/form-state";
import { requestPasswordReset, resetPassword, signIn, signUp } from "./actions";

export function SignInForm({ next }: { next?: string }) {
  const [state, formAction, isPending] = useActionState(signIn, initialFormState);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={previousValue(state, "email")}
        errors={fieldErrors(state, "email")}
      />
      <div className="grid gap-1.5">
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          errors={fieldErrors(state, "password")}
        />
        <Link href="/forgot-password" className="justify-self-end text-sm text-muted-foreground underline-offset-4 hover:underline">
          Forgot your password?
        </Link>
      </div>
      <Button type="submit" size="lg" className="h-10" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function SignUpForm() {
  const [state, formAction, isPending] = useActionState(signUp, initialFormState);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <FormField
        label="Your name"
        name="fullName"
        autoComplete="name"
        required
        defaultValue={previousValue(state, "fullName")}
        errors={fieldErrors(state, "fullName")}
      />
      <FormField
        label="Work email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={previousValue(state, "email")}
        errors={fieldErrors(state, "email")}
      />
      <FormField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters, with a letter and a number."
        errors={fieldErrors(state, "password")}
      />
      <Button type="submit" size="lg" className="h-10" disabled={isPending}>
        {isPending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, initialFormState);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={previousValue(state, "email")}
        errors={fieldErrors(state, "email")}
      />
      <Button type="submit" size="lg" className="h-10" disabled={isPending}>
        {isPending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(resetPassword, initialFormState);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      {/* The one-time token from the emailed link; Better Auth checks it again on save. */}
      <input type="hidden" name="token" value={token} />
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
      <Button type="submit" size="lg" className="h-10" disabled={isPending}>
        {isPending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
