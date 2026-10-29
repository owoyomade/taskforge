import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { CreateWorkspaceForm } from "../../create-workspace-form";

export const metadata: Metadata = { title: "Create a workspace" };

export default function NewWorkspacePage() {
  return (
    <main className="flex flex-1 flex-col px-4 py-6 sm:px-10">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        Back
      </Link>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 py-10">
        <div className="grid gap-2">
          <h1 className="text-3xl font-semibold">Create a workspace</h1>
          <p className="text-muted-foreground">
            Each workspace is separate: its projects and members are never visible from your other workspaces.
          </p>
        </div>
        <CreateWorkspaceForm />
      </div>
    </main>
  );
}
