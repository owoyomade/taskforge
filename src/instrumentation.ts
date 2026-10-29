import type { Instrumentation } from "next";

/**
 * Runs whenever a page, Server Action or route handler throws on the
 * server. It writes one line of JSON per error, which Vercel's log viewer
 * (and any log drain) can search and alert on.
 *
 * Privacy: it logs the route *pattern* ("/invite/[token]"), never the real
 * URL, because real URLs can contain invite tokens or search text, and it
 * never logs request bodies or headers.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const details = error instanceof Error ? error : new Error(String(error));
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;

  console.error(
    JSON.stringify({
      level: "error",
      context: "request",
      route: context.routePath,
      routeType: context.routeType,
      method: request.method,
      name: details.name,
      message: details.message.slice(0, 500),
      // The same id the user sees on the error page, to match reports to logs.
      digest,
    }),
  );
};
