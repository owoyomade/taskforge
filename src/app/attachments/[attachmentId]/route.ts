import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { readFile } from "@/lib/file-storage";

/**
 * Downloads an attachment.
 *
 * The record is looked up as the signed-in user, so Row Level Security
 * decides whether they may see it; only then is the file read from
 * private storage and passed through. The headers make the browser save
 * the file rather than open it, and forbid it from running anything in
 * it, so even a file that slipped past the type checks can't act as a page.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/attachments/[attachmentId]">) {
  const { attachmentId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  if (!z.uuid().safeParse(attachmentId).success) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [attachment] = await withUser(user.id, (db) =>
    db.query<{ storage_path: string; file_name: string; content_type: string }>(
      "select storage_path, file_name, content_type from public.attachments where id = $1",
      [attachmentId],
    ),
  );
  if (!attachment) {
    return new NextResponse("Not found", { status: 404 });
  }

  const file = await readFile("attachments", attachment.storage_path);
  if (!file) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(file.stream, {
    headers: {
      "Content-Type": attachment.content_type,
      "Content-Length": String(file.size),
      // RFC 6266: an ASCII fallback plus the exact UTF-8 name.
      "Content-Disposition": `attachment; filename="${attachment.file_name.replace(/[^\x20-\x7e]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(attachment.file_name)}`,
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, no-store",
    },
  });
}
