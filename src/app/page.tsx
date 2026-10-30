import Link from "next/link";

import { Brand } from "@/components/brand";
import { TryDemoButton } from "@/components/try-demo-button";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

const COLUMNS = [
  { name: "Up next", tasks: ["Draft Q3 roadmap", "Interview two vendors"] },
  { name: "In progress", tasks: ["Rebuild onboarding emails", "Client review: Harbor Co."] },
  { name: "Done", tasks: ["Ship pricing page"] },
];

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
        <Brand />
        <nav className="flex items-center gap-2">
          {user ? (
            <Link href="/dashboard" className={buttonVariants()}>Open Taskforge</Link>
          ) : (
            <>
              <Link href="/sign-in" className={buttonVariants({ variant: "ghost" })}>
                Sign in
              </Link>
              <Link href="/sign-up" className={buttonVariants()}>Get started</Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 content-center gap-12 px-4 py-12 sm:px-8 lg:grid-cols-[1fr_1.15fr] lg:items-center">
        <div className="grid gap-6">
          <h1 className="max-w-xl text-4xl font-semibold sm:text-5xl">Every project, from first idea to done.</h1>
          <p className="max-w-lg text-lg text-muted-foreground">
            Taskforge gives small teams one place for boards, tasks and deadlines, with separate workspaces for
            each team or client.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={user ? "/dashboard" : "/sign-up"} className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}>
              {user ? "Open your workspace" : "Create a free account"}
            </Link>
            {user ? null : <TryDemoButton size="lg" className="h-11 px-5" />}
          </div>
        </div>

        <div aria-hidden="true" className="grid grid-cols-3 gap-3 rounded-2xl bg-accent p-4 sm:p-6">
          {COLUMNS.map((column) => (
            <div key={column.name} className="grid content-start gap-2 rounded-xl bg-background/70 p-2 sm:p-3">
              <p className="px-1 text-xs font-semibold text-accent-foreground sm:text-sm">{column.name}</p>
              {column.tasks.map((task) => (
                <div key={task} className="rounded-lg border bg-card px-2 py-2 text-xs text-card-foreground sm:px-3 sm:text-sm">
                  {task}
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
