import type { Metadata } from "next";

import { Brand } from "@/components/brand";
import { MyInvitations } from "@/components/members/my-invitations";
import { listMyInvitations } from "@/lib/invitations";
import { getMyProfile } from "@/lib/profiles";
import { CreateWorkspaceForm } from "../create-workspace-form";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const [profile, invitations] = await Promise.all([getMyProfile(), listMyInvitations()]);
  const firstName = profile.fullName.split(" ")[0];

  return (
    <main className="flex flex-1 flex-col px-4 py-6 sm:px-10">
      <Brand href="/dashboard" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 py-10">
        <div className="grid gap-2">
          <h1 className="text-3xl font-semibold">{firstName ? `Welcome, ${firstName}` : "Welcome"}</h1>
          <p className="text-muted-foreground">
            A workspace holds your team&apos;s projects, boards and members. Start with one; you can create more
            and switch between them any time.
          </p>
        </div>
        <MyInvitations invitations={invitations} />
        {invitations.length > 0 ? <h2 className="text-lg font-semibold">Or start your own workspace</h2> : null}
        <CreateWorkspaceForm />
      </div>
    </main>
  );
}
