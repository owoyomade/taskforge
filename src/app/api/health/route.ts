import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

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
  const supabase = createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await supabase.rpc("health_check").abortSignal(AbortSignal.timeout(3000));
  const healthy = !error && data === true;
  if (!healthy) {
    console.error(JSON.stringify({ level: "error", context: "health", code: error?.code, message: error?.message }));
  }

  return Response.json(
    { status: healthy ? "ok" : "unavailable", database: healthy ? "ok" : "unavailable", responseMs: Date.now() - startedAt },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
