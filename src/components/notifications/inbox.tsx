"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { AtSignIcon, MessageSquareIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";

import { markAllNotificationsRead, markNotificationRead } from "@/app/(app)/notification-actions";
import { Button } from "@/components/ui/button";
import type { NotificationView } from "@/lib/notifications";
import { describeNotification, timeAgo } from "@/lib/notification-text";
import { cn } from "@/lib/utils";

const ICONS = { assigned: UserPlusIcon, mentioned: AtSignIcon, commented: MessageSquareIcon };

type InboxProps = {
  workspaceId: string;
  workspaceSlug: string;
  notifications: NotificationView[];
  unreadOnly: boolean;
};

export function Inbox({ workspaceId, workspaceSlug, notifications, unreadOnly }: InboxProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const unread = notifications.filter((notification) => !notification.isRead).length;

  function open(notification: NotificationView) {
    const href = `/w/${workspaceSlug}/p/${notification.projectId}?task=${notification.taskId}`;
    startTransition(async () => {
      if (!notification.isRead) await markNotificationRead(notification.id);
      router.push(href);
    });
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Show" className="flex gap-1 rounded-full border p-1">
          <Link
            href={`/w/${workspaceSlug}/inbox`}
            aria-current={!unreadOnly ? "page" : undefined}
            className="rounded-full px-3 py-1 text-sm aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
          >
            All
          </Link>
          <Link
            href={`/w/${workspaceSlug}/inbox?unread=1`}
            aria-current={unreadOnly ? "page" : undefined}
            className="rounded-full px-3 py-1 text-sm aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
          >
            Unread
          </Link>
        </div>
        {unread > 0 ? (
          <Button
            variant="ghost"
            className="ml-auto"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await markAllNotificationsRead(workspaceId);
                if (!result.ok) toast.error(result.message);
              })
            }
          >
            Mark all as read
          </Button>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center">
          <p className="font-semibold">{unreadOnly ? "Nothing unread" : "No notifications yet"}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            You&apos;ll hear here when someone assigns you a task, mentions you, or comments on a task you&apos;re part of.
          </p>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {notifications.map((notification) => {
            const Icon = ICONS[notification.kind];
            return (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => open(notification)}
                  disabled={isPending}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted",
                    !notification.isRead && "bg-accent/30",
                  )}
                >
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground" aria-hidden="true">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !notification.isRead && "font-semibold")}>
                      {describeNotification(notification)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {notification.projectName}, <span suppressHydrationWarning>{timeAgo(notification.createdAt)}</span>
                    </span>
                  </span>
                  {!notification.isRead ? (
                    <span className="mt-2 size-2.5 shrink-0 rounded-full bg-primary">
                      <span className="sr-only">Unread</span>
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
