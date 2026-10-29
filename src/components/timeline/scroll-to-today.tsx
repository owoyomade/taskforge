"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A horizontal scroll box that opens with "today" about a third of the way
 * across, so the work ahead is visible without scrolling.
 */
export function ScrollToToday({ offset, children }: { offset: number | null; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  // Syncing scroll position with the DOM is exactly what effects are for.
  useEffect(() => {
    const box = ref.current;
    if (box && offset !== null) {
      box.scrollLeft = Math.max(0, offset - box.clientWidth / 3);
    }
  }, [offset]);

  return (
    <div ref={ref} className="overflow-x-auto rounded-2xl border bg-card">
      {children}
    </div>
  );
}
