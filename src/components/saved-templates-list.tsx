"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { deleteSavedTemplate } from "@/app/(app)/template-actions";
import { Button } from "@/components/ui/button";
import type { SavedTemplate } from "@/lib/projects";

export function SavedTemplatesList({
  workspaceId,
  templates,
  currentUserId,
  isAdmin,
}: {
  workspaceId: string;
  templates: SavedTemplate[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  if (templates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        None yet. Open a project&apos;s settings and choose &quot;Save as template&quot; to reuse its plan.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {templates.map((template) => (
        <li key={template.id} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{template.name}</p>
            {template.description ? <p className="truncate text-xs text-muted-foreground">{template.description}</p> : null}
          </div>
          {isAdmin || template.createdBy === currentUserId ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteSavedTemplate(workspaceId, template.id);
                  if (result.ok) toast.success(`Template ${template.name} deleted.`);
                  else toast.error(result.message);
                })
              }
            >
              Delete
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
