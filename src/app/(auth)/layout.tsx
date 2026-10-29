import type { ReactNode } from "react";

import { Brand } from "@/components/brand";

// A sketch of a board in progress, shown beside the auth forms on wide screens.
const BOARD = [
  { column: "Up next", cards: ["Write launch brief", "Collect client logos"] },
  { column: "In progress", cards: ["Homepage copy review", "Pricing table"] },
  { column: "Done", cards: ["Kickoff call"] },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <main className="flex flex-col px-4 py-6 sm:px-10">
        <Brand />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </main>

      <aside aria-hidden="true" className="relative hidden overflow-hidden bg-primary lg:block">
        <div className="absolute inset-y-0 left-16 flex items-center gap-4">
          {BOARD.map(({ column, cards }, columnIndex) => (
            <div
              key={column}
              className="w-56 rounded-xl bg-primary-foreground/10 p-3"
              style={{ transform: `translateY(${(columnIndex - 1) * 28}px)` }}
            >
              <p className="mb-3 px-1 text-sm font-medium text-primary-foreground">{column}</p>
              <div className="grid gap-2">
                {cards.map((card) => (
                  <div key={card} className="rounded-lg bg-card px-3 py-3 text-sm text-card-foreground shadow-sm">
                    {card}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
