import { timingSafeEqual } from "node:crypto";

import { purgeExpiredRecords } from "@/lib/db";
import { demoEnabled, resetDemo } from "@/lib/demo";

/**
 * GET /api/cron/purge: the nightly maintenance. It deletes expired records
 * (see the retention migration) and, when the demo is on, rebuilds the
 * demo workspace.
 *
 * Vercel Cron calls this once a day (vercel.json) and sends the project's
 * CRON_SECRET as a bearer token. Anyone else is refused, and without a
 * secret configured the route refuses everyone.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const sent = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  // Compared in constant time so the secret can't be guessed from response timings.
  const allowed =
    Boolean(secret) && sent.length === expected.length && timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!allowed) {
    return new Response("Unauthorized", { status: 401 });
  }

  const removed = await purgeExpiredRecords();
  if (demoEnabled()) await resetDemo();
  console.log(JSON.stringify({ level: "info", context: "cron.purge", removed, demoReset: demoEnabled() }));
  return Response.json({ removed, demoReset: demoEnabled() }, { headers: { "Cache-Control": "no-store" } });
}
