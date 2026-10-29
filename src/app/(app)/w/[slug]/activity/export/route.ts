import { NextResponse, type NextRequest } from "next/server";

import { listActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listMyWorkspaces } from "@/lib/workspaces";

/** Quotes a value for CSV and neutralises spreadsheet formulas (e.g. "=HYPERLINK(...)"). */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/**
 * Downloads the workspace's audit history (up to the latest 5,000 events)
 * as CSV, for owners and admins. Useful for records or before deleting a
 * workspace, since history is deleted with it.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/w/[slug]/activity/export">) {
  const { slug } = await params;
  if (!(await getCurrentUser())) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const workspace = (await listMyWorkspaces()).find((candidate) => candidate.slug === slug);
  if (!workspace || !can(workspace.role, "manageMembers")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const items = await listActivity(workspace.id, { limit: 5000 });
  const rows = [
    ["When (UTC)", "Who", "What happened", "Event type", "Project id", "Task id"],
    ...items.map((item) => [
      item.createdAt,
      item.actorName,
      `${item.actorName} ${item.sentence}`,
      item.eventType,
      item.projectId ?? "",
      item.taskId ?? "",
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${workspace.slug}-activity.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
