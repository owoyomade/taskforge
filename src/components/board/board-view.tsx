"use client";

import { useEffect, useId, useRef, useState, useTransition, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { createColumn, moveColumn } from "@/app/(app)/project-actions";
import { createTask, moveTask } from "@/app/(app)/task-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { BoardColumn, TaskCard } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { findColumnOf, groupTasks, moveTaskInGroups, neighbours, type ColumnGroups } from "./board-state";
import { ColumnMenu } from "./column-menu";
import { TaskCardContent } from "./task-card";

type BoardViewProps = {
  projectId: string;
  columns: BoardColumn[];
  tasks: TaskCard[];
  canEdit: boolean;
  today: string;
  isFiltered: boolean;
};

type Groups = ColumnGroups<TaskCard>;

// Column sortable ids are prefixed so they can't collide with task ids.
const columnKey = (id: string) => `column:${id}`;
const dropKey = (id: string) => `drop:${id}`;

/**
 * The Kanban board.
 *
 * Moves are optimistic: the card moves on screen immediately, then the
 * server is told. If the server refuses (no permission, the task was
 * deleted, a network error) the board snaps back and explains why.
 */
export function BoardView({ projectId, columns, tasks, canEdit, today, isFiltered }: BoardViewProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [groups, setGroups] = useState<Groups>(() => groupTasks(columns.map((c) => c.id), tasks));
  const [columnOrder, setColumnOrder] = useState(columns);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const dragStart = useRef<Groups | null>(null);
  // Keyboard moving: the card being moved and the board as it was before.
  const [keyboardMove, setKeyboardMove] = useState<{ taskId: string; original: Groups } | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  // A stable id keeps dnd-kit's generated ids the same on server and client.
  const dndId = useId();

  // When the server sends fresh data (after any change, ours or a page
  // refresh), replace local state with it. This is React's recommended way
  // to reset state from props without an effect.
  const [source, setSource] = useState({ columns, tasks });
  if (source.columns !== columns || source.tasks !== tasks) {
    setSource({ columns, tasks });
    setGroups(groupTasks(columns.map((c) => c.id), tasks));
    setColumnOrder(columns);
  }

  const sensors = useSensors(
    // A small movement threshold lets a plain click open the task.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // On touch screens a short press-and-hold starts a drag, so a normal
    // swipe still scrolls the page.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    // Keyboard moving is handled by handleCardKeyDown below rather than
    // dnd-kit's keyboard sensor, which scrolls the board instead of moving
    // the card when the next column is off to the side.
  );

  const allTasks = Object.values(groups).flat();
  const taskTitle = (id: string | number) => allTasks.find((task) => task.id === id)?.title ?? "task";
  const columnName = (id: string) => columnOrder.find((column) => column.id === id)?.name ?? "column";

  function taskHref(taskId: string) {
    const query = new URLSearchParams(searchParams);
    query.set("task", taskId);
    return `${pathname}?${query.toString()}`;
  }

  /** Applies a task move locally, then saves it, rolling back on failure. */
  function commitTaskMove(previous: Groups, next: Groups, taskId: string) {
    setGroups(next);
    const fromColumn = findColumnOf(previous, taskId);
    const toColumn = findColumnOf(next, taskId);
    if (!toColumn) return;

    const before = fromColumn ? neighbours(previous[fromColumn], taskId) : null;
    const after = neighbours(next[toColumn], taskId);
    if (fromColumn === toColumn && before?.beforeId === after.beforeId && before?.afterId === after.afterId) {
      return; // Dropped where it started.
    }

    startTransition(async () => {
      const result = await moveTask(taskId, toColumn, after.beforeId, after.afterId);
      if (!result.ok) {
        setGroups(previous);
        toast.error(result.message);
      }
    });
  }

  function handleDragStart({ active }: DragStartEvent) {
    if (active.data.current?.type === "task") {
      setActiveTaskId(String(active.id));
      dragStart.current = groups;
    }
  }

  /** Which column (and index) the pointer or keyboard is currently over. */
  function dropTarget(over: DragOverEvent["over"], current: Groups) {
    if (!over) return null;
    const type = over.data.current?.type;
    if (type === "task") {
      const columnId = findColumnOf(current, String(over.id));
      if (!columnId) return null;
      return { columnId, index: current[columnId].findIndex((task) => task.id === over.id) };
    }
    if (type === "drop" || type === "column") {
      const columnId = String(over.data.current?.columnId);
      return current[columnId] ? { columnId, index: current[columnId].length } : null;
    }
    return null;
  }

  // While dragging across columns, move the card into the new column right
  // away so the others make room for it.
  function handleDragOver({ active, over }: DragOverEvent) {
    if (active.data.current?.type !== "task") return;
    const taskId = String(active.id);
    const target = dropTarget(over, groups);
    const fromColumn = findColumnOf(groups, taskId);
    if (target && fromColumn && target.columnId !== fromColumn) {
      setGroups(moveTaskInGroups(groups, taskId, target.columnId, target.index));
    }
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveTaskId(null);

    if (active.data.current?.type === "column") {
      const fromIndex = columnOrder.findIndex((column) => columnKey(column.id) === active.id);
      const toIndex = columnOrder.findIndex((column) => columnKey(column.id) === over?.id);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

      const previous = columnOrder;
      const columnId = previous[fromIndex].id;
      setColumnOrder(arrayMove(previous, fromIndex, toIndex));
      startTransition(async () => {
        const result = await moveColumn(columnId, toIndex);
        if (!result.ok) {
          setColumnOrder(previous);
          toast.error(result.message);
        }
      });
      return;
    }

    const start = dragStart.current ?? groups;
    dragStart.current = null;
    const taskId = String(active.id);
    const target = dropTarget(over, groups);
    const next = target ? moveTaskInGroups(groups, taskId, target.columnId, target.index) : groups;
    commitTaskMove(start, next, taskId);
  }

  function handleDragCancel() {
    setActiveTaskId(null);
    if (dragStart.current) setGroups(dragStart.current);
    dragStart.current = null;
  }

  /** Keyboard-free alternative to dragging, used by each card's menu. */
  function moveWithMenu(taskId: string, columnId: string, index: number) {
    commitTaskMove(groups, moveTaskInGroups(groups, taskId, columnId, index), taskId);
  }

  // After a keyboard move re-renders the card (possibly in another column),
  // put focus back on it so the next arrow key keeps moving it.
  useEffect(() => {
    if (!keyboardMove) return;
    document.querySelector<HTMLElement>(`[data-task-id="${keyboardMove.taskId}"] a`)?.focus();
  }, [keyboardMove, groups]);

  /**
   * Keyboard moving: Space picks a card up, arrow keys move it between and
   * within columns, Space or Enter drops it, Escape puts it back.
   */
  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>, taskId: string) {
    if (!canEdit) return;

    if (!keyboardMove) {
      if (event.key === " ") {
        event.preventDefault();
        setKeyboardMove({ taskId, original: groups });
        setLiveMessage(`Picked up ${taskTitle(taskId)}. Use the arrow keys to move it, Space to drop, Escape to cancel.`);
      }
      return;
    }
    if (keyboardMove.taskId !== taskId) return;

    const columnId = findColumnOf(groups, taskId);
    if (!columnId) return;
    const columnIndex = columnOrder.findIndex((column) => column.id === columnId);
    const index = groups[columnId].findIndex((task) => task.id === taskId);

    const moveTo = (targetColumnId: string, targetIndex: number) => {
      const next = moveTaskInGroups(groups, taskId, targetColumnId, targetIndex);
      setGroups(next);
      const position = next[targetColumnId].findIndex((task) => task.id === taskId) + 1;
      setLiveMessage(`${columnName(targetColumnId)}, position ${position} of ${next[targetColumnId].length}.`);
    };

    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        if (index > 0) moveTo(columnId, index - 1);
        break;
      case "ArrowDown":
        event.preventDefault();
        if (index < groups[columnId].length - 1) moveTo(columnId, index + 1);
        break;
      case "ArrowLeft":
      case "ArrowRight": {
        event.preventDefault();
        const target = columnOrder[columnIndex + (event.key === "ArrowLeft" ? -1 : 1)];
        if (target) moveTo(target.id, Math.min(index, groups[target.id].length));
        break;
      }
      case " ":
      case "Enter":
        event.preventDefault();
        setKeyboardMove(null);
        setLiveMessage(`Dropped ${taskTitle(taskId)} in ${columnName(columnId)}.`);
        commitTaskMove(keyboardMove.original, groups, taskId);
        break;
      case "Escape":
        event.preventDefault();
        setGroups(keyboardMove.original);
        setKeyboardMove(null);
        setLiveMessage(`Cancelled. ${taskTitle(taskId)} went back to where it was.`);
        break;
      case "Tab":
        // Moving focus away puts the card back rather than leaving it in limbo.
        setGroups(keyboardMove.original);
        setKeyboardMove(null);
        break;
    }
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      active.data.current?.type === "column"
        ? `Picked up column ${columnName(String(active.id).replace("column:", ""))}.`
        : `Picked up ${taskTitle(active.id)}. Use the arrow keys to move it, Space to drop, Escape to cancel.`,
    onDragOver: ({ active, over }) => {
      if (!over || active.data.current?.type === "column") return undefined;
      const columnId = findColumnOf(groups, String(active.id));
      return columnId ? `${taskTitle(active.id)} is over ${columnName(columnId)}.` : undefined;
    },
    onDragEnd: ({ active }) => {
      if (active.data.current?.type === "column") return "Column moved.";
      const columnId = findColumnOf(groups, String(active.id));
      return columnId ? `Dropped ${taskTitle(active.id)} in ${columnName(columnId)}.` : undefined;
    },
    onDragCancel: ({ active }) => `Cancelled. ${taskTitle(active.id)} went back to where it was.`,
  };

  const activeTask = activeTaskId ? allTasks.find((task) => task.id === activeTaskId) : undefined;
  const doneColumnIds = new Set(columnOrder.filter((column) => column.isDone).map((column) => column.id));

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: canEdit
            ? "Press Enter to open this task. To move it, press Space, use the arrow keys, then press Space again."
            : "Press Enter to open this task.",
        },
      }}
    >
      <p aria-live="assertive" className="sr-only">
        {liveMessage}
      </p>
      {/* The board scrolls sideways inside itself so the page never does. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
        <SortableContext items={columnOrder.map((column) => columnKey(column.id))} strategy={horizontalListSortingStrategy}>
          <ol className="flex items-start gap-4" aria-label="Board columns">
            {columnOrder.map((column, index) => (
              <SortableColumn
                key={column.id}
                column={column}
                index={index}
                columns={columnOrder}
                tasks={groups[column.id] ?? []}
                canEdit={canEdit}
                isFiltered={isFiltered}
                projectId={projectId}
              >
                {(groups[column.id] ?? []).map((task, taskIndex) => (
                  <SortableTaskCard
                    key={task.id}
                    task={task}
                    href={taskHref(task.id)}
                    today={today}
                    isDoneColumn={doneColumnIds.has(column.id)}
                    canEdit={canEdit}
                    columns={columnOrder}
                    columnIndex={index}
                    taskIndex={taskIndex}
                    columnSize={(groups[column.id] ?? []).length}
                    onMove={(columnId, targetIndex) => moveWithMenu(task.id, columnId, targetIndex)}
                    groups={groups}
                    isKeyboardMoving={keyboardMove?.taskId === task.id}
                    onKeyDown={(event) => handleCardKeyDown(event, task.id)}
                  />
                ))}
              </SortableColumn>
            ))}
            {canEdit ? <AddColumn projectId={projectId} /> : null}
          </ol>
        </SortableContext>
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="relative w-72 rotate-2 rounded-lg border bg-card p-3 shadow-lg">
            <TaskCardContent
              task={activeTask}
              href={taskHref(activeTask.id)}
              today={today}
              isDoneColumn={doneColumnIds.has(activeTask.columnId)}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

type SortableColumnProps = {
  column: BoardColumn;
  index: number;
  columns: BoardColumn[];
  tasks: TaskCard[];
  canEdit: boolean;
  isFiltered: boolean;
  projectId: string;
  children: ReactNode;
};

function SortableColumn({ column, index, columns, tasks, canEdit, isFiltered, projectId, children }: SortableColumnProps) {
  const { listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: columnKey(column.id),
    data: { type: "column", columnId: column.id },
    disabled: !canEdit,
  });
  // Lets an empty column accept a dropped card.
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dropKey(column.id),
    data: { type: "drop", columnId: column.id },
    disabled: !canEdit,
  });
  const headingId = useId();

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      aria-labelledby={headingId}
      className={cn("flex w-72 shrink-0 flex-col rounded-xl bg-muted/70 p-2", isDragging && "opacity-60")}
    >
      <div className="flex items-center gap-1 px-1 pb-2">
        {canEdit ? (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...listeners}
            // Pointer-only handle: keyboard users move columns with the
            // column menu's "Move left" and "Move right".
            tabIndex={-1}
            aria-hidden="true"
            className="cursor-grab rounded p-1 text-muted-foreground outline-none hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <GripVerticalIcon className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        <h2 id={headingId} className="min-w-0 flex-1 truncate text-sm font-semibold">
          {column.name}
        </h2>
        <span className="rounded-full bg-background px-2 text-xs text-muted-foreground" aria-label={`${tasks.length} tasks`}>
          {tasks.length}
        </span>
        {canEdit ? <ColumnMenu column={column} index={index} columns={columns} taskCount={tasks.length} /> : null}
      </div>

      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <ol
          ref={setDropRef}
          className={cn("grid min-h-12 content-start gap-2 rounded-lg p-0.5", isOver && "bg-accent/60")}
          aria-label={`Tasks in ${column.name}`}
        >
          {children}
          {tasks.length === 0 ? (
            <li className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              {isFiltered ? "No matching tasks" : "No tasks"}
            </li>
          ) : null}
        </ol>
      </SortableContext>

      {canEdit ? <QuickAddTask projectId={projectId} columnId={column.id} columnName={column.name} /> : null}
    </li>
  );
}

type SortableTaskCardProps = {
  task: TaskCard;
  href: string;
  today: string;
  isDoneColumn: boolean;
  canEdit: boolean;
  columns: BoardColumn[];
  columnIndex: number;
  taskIndex: number;
  columnSize: number;
  groups: Groups;
  onMove: (columnId: string, index: number) => void;
  isKeyboardMoving: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

function SortableTaskCard({
  task,
  href,
  today,
  isDoneColumn,
  canEdit,
  columns,
  columnIndex,
  taskIndex,
  columnSize,
  groups,
  onMove,
  isKeyboardMoving,
  onKeyDown,
}: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task" },
    disabled: !canEdit,
  });

  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  const currentColumn = columns[columnIndex];

  return (
    <li
      ref={setNodeRef}
      style={style}
      // Drag listeners sit on the card; the focusable element inside is the
      // title link, so the card doesn't add a second tab stop.
      {...(canEdit ? listeners : {})}
      data-task-id={task.id}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative rounded-lg border bg-card p-3 shadow-xs hover:border-ring/50",
        canEdit && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
        isKeyboardMoving && "border-primary ring-3 ring-primary/30",
      )}
    >
      <TaskCardContent
        task={task}
        href={href}
        today={today}
        isDoneColumn={isDoneColumn}
        dragHints={
          canEdit
            ? { "aria-describedby": attributes["aria-describedby"], "aria-roledescription": "draggable task" }
            : undefined
        }
      />
      {canEdit ? (
        <div
          // Keep the menu's own clicks and key presses from starting a drag.
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          className="absolute top-1.5 right-1.5 z-10 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 has-[[aria-expanded=true]]:opacity-100 max-lg:opacity-100"
        >
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`Move ${task.title}`} />}>
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem disabled={taskIndex === 0} onClick={() => onMove(currentColumn.id, taskIndex - 1)}>
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={taskIndex === columnSize - 1} onClick={() => onMove(currentColumn.id, taskIndex + 1)}>
                Move down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Move to column</DropdownMenuLabel>
                {columns
                  .filter((column) => column.id !== currentColumn.id)
                  .map((column) => (
                    <DropdownMenuItem key={column.id} onClick={() => onMove(column.id, (groups[column.id] ?? []).length)}>
                      {column.name}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </li>
  );
}

function QuickAddTask({ projectId, columnId, columnName }: { projectId: string; columnId: string; columnName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputId = useId();

  if (!isOpen) {
    return (
      <Button variant="ghost" size="sm" className="mt-2 justify-start text-muted-foreground" onClick={() => setIsOpen(true)}>
        <PlusIcon />
        Add task
      </Button>
    );
  }

  return (
    <form
      className="mt-2 grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const title = String(new FormData(form).get("title") ?? "");
        startTransition(async () => {
          const result = await createTask(projectId, columnId, title);
          if (result.ok) {
            form.reset();
            form.querySelector("input")?.focus(); // ready for the next task
          } else {
            toast.error(result.message);
          }
        });
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        New task title in {columnName}
      </label>
      <Input
        id={inputId}
        name="title"
        autoFocus
        required
        maxLength={200}
        placeholder="Task title"
        className="h-9 bg-card"
        onKeyDown={(event) => {
          if (event.key === "Escape") setIsOpen(false);
        }}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Adding…" : "Add"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setIsOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AddColumn({ projectId }: { projectId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputId = useId();

  return (
    <li className="w-72 shrink-0">
      {isOpen ? (
        <form
          className="grid gap-2 rounded-xl bg-muted/70 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const name = String(new FormData(form).get("name") ?? "");
            startTransition(async () => {
              const result = await createColumn(projectId, name);
              if (result.ok) {
                form.reset();
                setIsOpen(false);
              } else {
                toast.error(result.message);
              }
            });
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            New column name
          </label>
          <Input id={inputId} name="name" autoFocus required maxLength={40} placeholder="Column name" className="h-9 bg-card" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Adding…" : "Add column"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" className="w-full justify-start border-dashed" onClick={() => setIsOpen(true)}>
          <PlusIcon />
          Add column
        </Button>
      )}
    </li>
  );
}
