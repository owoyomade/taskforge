"use client";

import { useId, useRef, useTransition } from "react";
import { FileIcon, PaperclipIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { deleteAttachment, uploadAttachment } from "@/app/(app)/collaboration-actions";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/file-type";
import type { AttachmentView } from "@/lib/projects";

type TaskAttachmentsProps = {
  taskId: string;
  attachments: AttachmentView[];
  currentUserId: string;
  canUpload: boolean;
  canModerate: boolean;
};

const ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.csv,.docx,.xlsx,.pptx,.zip";

export function TaskAttachments({ taskId, attachments, currentUserId, canUpload, canModerate }: TaskAttachmentsProps) {
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const inputId = useId();

  function upload(file: File) {
    const formData = new FormData();
    formData.set("taskId", taskId);
    formData.set("file", file);
    startTransition(async () => {
      const result = await uploadAttachment(formData);
      if (result.ok) toast.success(`${file.name} attached.`);
      else toast.error(result.message);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <section aria-labelledby={headingId} className="grid gap-2 border-t pt-4">
      <h3 id={headingId} className="text-sm font-semibold">
        Attachments{attachments.length > 0 ? ` (${attachments.length})` : ""}
      </h3>
      {attachments.length === 0 ? <p className="text-sm text-muted-foreground">No files attached.</p> : null}
      <ul className="grid gap-1">
        {attachments.map((attachment) => {
          const canDelete = canModerate || (canUpload && attachment.uploadedById === currentUserId);
          return (
            <li key={attachment.id} className="flex items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-muted">
              <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {/* A route handler checks access, then hands out a 60-second download link. */}
              <a href={`/attachments/${attachment.id}`} className="min-w-0 flex-1 truncate underline-offset-4 hover:underline">
                {attachment.fileName}
              </a>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatBytes(attachment.sizeBytes)}
                {attachment.uploadedBy ? `, ${attachment.uploadedBy.name}` : ""}
              </span>
              {canDelete ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Delete ${attachment.fileName}`}
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteAttachment(attachment.id);
                      if (result.ok) toast.success(`${attachment.fileName} deleted.`);
                      else toast.error(result.message);
                    })
                  }
                >
                  <XIcon />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canUpload ? (
        <div className="grid gap-1">
          <label htmlFor={inputId} className="sr-only">
            Attach a file
          </label>
          <input
            id={inputId}
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            disabled={isPending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
          >
            <PaperclipIcon />
            {isPending ? "Uploading…" : "Attach a file"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Images, PDFs, text, CSV and Office files up to 5 MB. Each workspace has 100 MB in total.
          </p>
        </div>
      ) : null}
    </section>
  );
}
