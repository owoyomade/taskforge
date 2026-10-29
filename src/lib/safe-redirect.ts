/**
 * Returns `next` only if it is a path on this site, otherwise `fallback`.
 *
 * Sign-in links carry a `?next=` destination. Without this check an attacker
 * could send someone a real sign-in link that bounces them to a look-alike
 * site afterwards (an "open redirect").
 */
export function safeRedirectPath(next: unknown, fallback = "/dashboard"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 512) {
    return fallback;
  }

  // Must be a single-slash absolute path. "//evil.com" and "/\evil.com" are
  // treated by browsers as links to another host.
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }

  // Reject control characters (e.g. a tab or newline hidden inside "/\t/evil.com").
  for (const char of next) {
    if (char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f) {
      return fallback;
    }
  }

  return next;
}
