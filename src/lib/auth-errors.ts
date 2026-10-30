import { isAPIError } from "better-auth/api";

/**
 * Plain-language messages for sign-in errors from Better Auth.
 * Unknown errors get a generic message so internal details never reach the UI.
 */
export function authErrorMessage(error: unknown): string {
  const code = isAPIError(error) ? error.body?.code : undefined;
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password don't match an account.";
    case "EMAIL_NOT_VERIFIED":
      return "Confirm your email first. We've sent you a fresh link.";
    case "PASSWORD_TOO_SHORT":
    case "PASSWORD_TOO_LONG":
      return "Choose a password between 8 and 72 characters.";
    case "INVALID_PASSWORD":
      return "Your current password isn't right.";
    case "INVALID_TOKEN":
      return "That link has expired or was already used. Request a new one.";
    default:
      if (isAPIError(error) && error.status === "TOO_MANY_REQUESTS") return TOO_MANY_ATTEMPTS;
      // Code and message only; never the submitted form data.
      console.error(JSON.stringify({ level: "error", context: "auth", code, message: error instanceof Error ? error.message : String(error) }));
      return "Something went wrong. Please try again.";
  }
}

export const TOO_MANY_ATTEMPTS = "Too many attempts. Wait a few minutes and try again.";
