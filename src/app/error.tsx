"use client";

import { Button } from "@/components/ui/button";

// Shown when a page throws. The error details stay in the server logs.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold">This page didn&apos;t load</h1>
      <p className="text-muted-foreground">Check your connection and try again. If it keeps happening, sign out and back in.</p>
      <Button className="self-start" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
