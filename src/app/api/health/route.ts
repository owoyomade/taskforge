import { asSignedOut } from "@/lib/db";

/**
 * GET /api/health: for uptime monitors and deploy checks.
 *
 * Returns 200 when the app is running and the database answers within 3
 * seconds, otherwise 503. It deliberately says nothing about *why* it
 * failed, since anyone on the internet can call it; details go to the
 * server log instead.
 */
export async function GET() {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Database didn't answer within 3 seconds")), 3000);
  });

  let healthy = false;
  try {
    const [row] = await Promise.race([
      asSignedOut((db) => db.query<{ ok: boolean }>("select public.health_check() as ok")),
      timeout,
    ]);
    healthy = row?.ok === true;
  } catch (error) {
    console.error(JSON.stringify({ level: "error", context: "health", message: error instanceof Error ? error.message : String(error) }));
  } finally {
    clearTimeout(timer);
  }

  return Response.json(
    { status: healthy ? "ok" : "unavailable", database: healthy ? "ok" : "unavailable", responseMs: Date.now() - startedAt },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
