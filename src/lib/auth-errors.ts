type AuthErrorLike = { code?: string; message: string };

/**
 * Plain-language messages for Supabase Auth errors.
 * Unknown errors get a generic message so internal details never reach the UI.
 */
export function authErrorMessage(error: AuthErrorLike): string {
  switch (error.code) {
    case "invalid_credentials":
      return "That email and password don't match an account.";
    case "email_not_confirmed":
      return "Confirm your email first. Check your inbox for the link we sent.";
    case "weak_password":
      return "Choose a stronger password.";
    case "same_password":
      return "Your new password must be different from the current one.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Wait a few minutes and try again.";
    case "otp_expired":
      return "That link has expired. Request a new one.";
    default:
      console.error(JSON.stringify({ level: "error", context: "auth", code: error.code, message: error.message }));
      return "Something went wrong. Please try again.";
  }
}
