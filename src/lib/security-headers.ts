/**
 * The Content Security Policy sent with every page.
 *
 * A CSP tells the browser which sources it may load scripts, images and so
 * on from. The important part is script-src: only scripts carrying this
 * request's random nonce may run ('strict-dynamic' lets those scripts load
 * Next.js's own chunks). So even if an attacker managed to inject a <script>
 * tag into a page, the browser would refuse to run it.
 *
 * Styles still allow 'unsafe-inline' because React, dnd-kit and Base UI set
 * inline style attributes (positions, transforms), which nonces can't cover.
 * Injected CSS is far less dangerous than injected script.
 */
export function contentSecurityPolicy({ nonce, isDev }: { nonce: string; isDev: boolean }): string {
  const directives = [
    "default-src 'self'",
    // React uses eval() in development only, to rebuild server error stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Profile photos and attachments are served by this app's own routes.
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Nobody may show Taskforge inside a frame (prevents clickjacking).
    "frame-ancestors 'none'",
  ];
  return directives.join("; ");
}

/** A fresh, unguessable value for each request. */
export function createNonce(): string {
  return btoa(crypto.randomUUID());
}
