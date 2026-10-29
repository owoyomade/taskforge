import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Downloads an attachment.
 *
 * Files are in a private bucket, so this looks the attachment up as the
 * signed-in user (RLS decides whether they may see it), then redirects to
 * a signed URL that works for 60 seconds. The "download" option makes the
 * browser save the file instead of opening it, so even a file that slipped
 * past the type checks can't run in the page.
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

  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from("attachments")
    .select("storage_path, file_name")
    .eq("id", attachmentId)
    .maybeSingle();
  if (!attachment) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(attachment.storage_path, 60, { download: attachment.file_name });
  if (error || !data) {
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}
