import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">
        This page doesn&apos;t exist, or it belongs to a workspace you&apos;re not a member of.
      </p>
      <Link href="/dashboard" className={cn(buttonVariants(), "justify-self-start self-start")}>
        Go to your workspace
      </Link>
    </main>
  );
}
