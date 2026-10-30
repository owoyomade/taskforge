import { timingSafeEqual } from "node:crypto";

import { purgeExpiredRecords } from "@/lib/db";

/**
 * GET /api/cron/purge: the daily data clean-up (see the retention migration).
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
  console.log(JSON.stringify({ level: "info", context: "cron.purge", removed }));
  return Response.json({ removed }, { headers: { "Cache-Control": "no-store" } });
}
