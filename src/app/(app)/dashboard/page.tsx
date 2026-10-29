import { redirect } from "next/navigation";

import { listMyWorkspaces } from "@/lib/workspaces";

// The "home" link after signing in: open a workspace, or set one up first.
export default async function DashboardPage() {
  const [first] = await listMyWorkspaces();
  redirect(first ? `/w/${first.slug}` : "/onboarding");
}
