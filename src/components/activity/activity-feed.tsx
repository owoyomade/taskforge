import Link from "next/link";

import type { ActivityItem } from "@/lib/activity";
import { timeAgo } from "@/lib/notification-text";

type ActivityFeedProps = {
  items: ActivityItem[];
  /** Builds a link to the task an event is about, when it still makes sense to link. */
  taskHref?: (item: ActivityItem) => string | null;
  emptyText: string;
};

/** History as a timeline of plain sentences, newest first. */
export function ActivityFeed({ items, taskHref, emptyText }: ActivityFeedProps) {
  if (items.length === 0) {
    return <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <ol className="relative grid gap-4 border-l-2 border-border pl-5">
      {items.map((item) => {
        const href = taskHref?.(item) ?? null;
        return (
          <li key={item.id} className="relative">
            <span aria-hidden="true" className="absolute top-1.5 -left-[1.6rem] size-3 rounded-full border-2 border-card bg-primary" />
            <p className="text-sm">
              <span className="font-semibold">{item.actorName}</span>{" "}
              {href ? (
                <Link href={href} className="underline-offset-4 hover:underline">
                  {item.sentence}
                </Link>
              ) : (
                item.sentence
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              <time dateTime={item.createdAt} suppressHydrationWarning>
                {timeAgo(item.createdAt)}
              </time>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
