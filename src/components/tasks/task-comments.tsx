"use client";

import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { addComment, deleteComment, editComment } from "@/app/(app)/collaboration-actions";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import { decodeMentions, encodeMentions, toSegments } from "@/lib/mentions";
import type { CommentView, Person } from "@/lib/projects";

type TaskCommentsProps = {
  taskId: string;
  comments: CommentView[];
  people: Person[];
  currentUserId: string;
  canComment: boolean;
  canModerate: boolean;
};

export function TaskComments({ taskId, comments, people, currentUserId, canComment, canModerate }: TaskCommentsProps) {
  const headingId = useId();
  const peopleById = new Map(people.map((person) => [person.id, person]));

  return (
    <section aria-labelledby={headingId} className="grid gap-3 border-t pt-4">
      <h3 id={headingId} className="text-sm font-semibold">
        Comments{comments.length > 0 ? ` (${comments.length})` : ""}
      </h3>
      {comments.length === 0 ? <p className="text-sm text-muted-foreground">No comments yet.</p> : null}
      <ol className="grid gap-4">
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            people={people}
            peopleById={peopleById}
            canEdit={canComment && comment.authorId === currentUserId}
            canDelete={(canComment && comment.authorId === currentUserId) || canModerate}
          />
        ))}
      </ol>
      {canComment ? <CommentComposer people={people} onSubmit={(body) => addComment(taskId, body)} submitLabel="Comment" /> : null}
    </section>
  );
}

function CommentItem({
  comment,
  people,
  peopleById,
  canEdit,
  canDelete,
}: {
  comment: CommentView;
  people: Person[];
  peopleById: Map<string, Person>;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const author = comment.author;
  const validMentions = new Set(comment.mentionIds);

  return (
    <li className="flex gap-3">
      <UserAvatar name={author?.name ?? "Former member"} email={author?.email ?? ""} avatarUrl={author?.avatarUrl ?? null} className="size-7" />
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{author?.name ?? "Former member"}</span>{" "}
          {/* Formatted in the viewer's own timezone, so server and browser may differ. */}
          <time dateTime={comment.createdAt} suppressHydrationWarning>
            {new Date(comment.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </time>
          {comment.editedAt ? " (edited)" : ""}
        </p>
        {isEditing ? (
          <CommentComposer
            people={people}
            initialBody={comment.body}
            submitLabel="Save"
            onCancel={() => setIsEditing(false)}
            onSubmit={async (body) => {
              const result = await editComment(comment.id, body);
              if (result.ok) setIsEditing(false);
              return result;
            }}
          />
        ) : (
          <p className="text-sm break-words whitespace-pre-wrap">
            {toSegments(comment.body).map((segment, index) =>
              segment.type === "text" ? (
                <span key={index}>{segment.text}</span>
              ) : validMentions.has(segment.userId) ? (
                // Show the person's current name, not the one saved in the text.
                <span key={index} className="rounded bg-accent px-1 font-medium text-accent-foreground">
                  @{peopleById.get(segment.userId)?.name ?? segment.label}
                </span>
              ) : (
                <span key={index}>@{segment.label}</span>
              ),
            )}
          </p>
        )}
        {!isEditing && (canEdit || canDelete) ? (
          <div className="flex gap-1">
            {canEdit ? (
              <Button variant="ghost" size="xs" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                variant="ghost"
                size="xs"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteComment(comment.id);
                    if (!result.ok) toast.error(result.message);
                  })
                }
              >
                Delete
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * A comment box with a "Mention" picker. Picking someone inserts "@Name" at
 * the cursor; on submit those names become mention tokens.
 */
function CommentComposer({
  people,
  initialBody = "",
  submitLabel,
  onSubmit,
  onCancel,
}: {
  people: Person[];
  initialBody?: string;
  submitLabel: string;
  onSubmit: (body: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  onCancel?: () => void;
}) {
  const initial = decodeMentions(initialBody);
  const [text, setText] = useState(initial.text);
  const [mentioned, setMentioned] = useState<{ id: string; name: string }[]>(initial.people);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ids = { body: useId(), mention: useId() };

  function insertMention(personId: string) {
    const person = people.find((candidate) => candidate.id === personId);
    const textarea = textareaRef.current;
    if (!person || !textarea) return;

    const start = textarea.selectionStart;
    const before = text.slice(0, start);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const insertion = `${needsSpace ? " " : ""}@${person.name} `;
    const next = before + insertion + text.slice(textarea.selectionEnd);
    setText(next);
    setMentioned((current) => (current.some((item) => item.id === person.id) ? current : [...current, { id: person.id, name: person.name }]));

    // Put the cursor after the inserted name once React has updated the box.
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + insertion.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await onSubmit(encodeMentions(text, mentioned));
          if (result.ok) {
            setText("");
            setMentioned([]);
          } else {
            toast.error(result.message);
          }
        });
      }}
    >
      <label htmlFor={ids.body} className="sr-only">
        {submitLabel === "Save" ? "Edit comment" : "Write a comment"}
      </label>
      <Textarea
        id={ids.body}
        ref={textareaRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={5000}
        rows={3}
        placeholder="Write a comment"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={ids.mention} className="sr-only">
          Mention someone
        </label>
        <NativeSelect
          id={ids.mention}
          className="w-44"
          value=""
          onChange={(event) => insertMention(event.target.value)}
        >
          <option value="">Mention someone…</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </NativeSelect>
        <div className="ml-auto flex gap-2">
          {onCancel ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" size="sm" disabled={isPending || !text.trim()}>
            {isPending ? "Posting…" : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
