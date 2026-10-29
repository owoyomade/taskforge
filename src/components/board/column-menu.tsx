"use client";

import { useId, useState, useTransition } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";

import { deleteColumn, moveColumn, updateColumn } from "@/app/(app)/project-actions";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BoardColumn } from "@/lib/projects";

type ColumnMenuProps = {
  column: BoardColumn;
  index: number;
  columns: BoardColumn[];
  taskCount: number;
};

/** Column actions: rename, mark as done, move left/right, delete. */
export function ColumnMenu({ column, index, columns, taskCount }: ColumnMenuProps) {
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [isPending, startTransition] = useTransition();
  const nameId = useId();
  const destinationId = useId();
  const otherColumns = columns.filter((candidate) => candidate.id !== column.id);

  function run(action: () => Promise<{ ok: true } | { ok: false; message: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        setDialog(null);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Column options for ${column.name}`} />}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => setDialog("rename")}>Rename</DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              run(
                () => updateColumn(column.id, { name: column.name, isDone: !column.isDone }),
                column.isDone ? `${column.name} no longer counts as done.` : `Tasks in ${column.name} now count as done.`,
              )
            }
          >
            {column.isDone ? "Stop counting as done" : "Count tasks here as done"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={index === 0} onClick={() => run(() => moveColumn(column.id, index - 1), "Column moved.")}>
            Move left
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index === columns.length - 1}
            onClick={() => run(() => moveColumn(column.id, index + 1), "Column moved.")}
          >
            Move right
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={otherColumns.length === 0} onClick={() => setDialog("delete")}>
            Delete column
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "rename"} onOpenChange={(open) => setDialog(open ? "rename" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename column</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const name = String(new FormData(event.currentTarget).get("name") ?? "");
              run(() => updateColumn(column.id, { name, isDone: column.isDone }), "Column renamed.");
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor={nameId}>Column name</Label>
              <Input id={nameId} name="name" defaultValue={column.name} maxLength={40} required className="h-10" />
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(open) => setDialog(open ? "delete" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {column.name}?</DialogTitle>
            <DialogDescription>
              {taskCount === 0
                ? "The column is empty. Any archived tasks from it will move to the column you choose."
                : `Its ${taskCount} task${taskCount === 1 ? "" : "s"} will move to the column you choose. No tasks are deleted.`}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const destination = String(new FormData(event.currentTarget).get("destination") ?? "");
              run(() => deleteColumn(column.id, destination), "Column deleted.");
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor={destinationId}>Move tasks to</Label>
              <NativeSelect id={destinationId} name="destination" defaultValue={otherColumns[0]?.id}>
                {otherColumns.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
              <Button type="submit" variant="destructive" disabled={isPending}>
                {isPending ? "Deleting…" : "Delete column"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
