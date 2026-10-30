import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { readFile } from "@/lib/file-storage";

// Photos are only ever stored as these types (checked from the file's bytes on upload).
const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

/**
 * Serves a profile photo to its owner and to anyone who shares a workspace
 * with them (can_view_avatar in the database decides). Everyone else gets
 * a 404, the same as for a photo that doesn't exist.
 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/avatars/[...path]">) {
  const user = await getCurrentUser();
  const path = (await params).path.join("/");
  const type = TYPES[path.split(".").pop() ?? ""];
  if (!user || !type) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [access] = await withUser(user.id, (db) =>
    db.query<{ allowed: boolean }>("select public.can_view_avatar($1) as allowed", [path]),
  );
  const file = access?.allowed ? await readFile("avatars", path) : null;
  if (!file) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(file.stream, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(file.size),
      // Each upload gets a new file name, so a cached photo is never stale.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
