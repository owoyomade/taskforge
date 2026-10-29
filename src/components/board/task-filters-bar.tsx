"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchIcon, XIcon } from "lucide-react";

import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRIORITIES, PRIORITY_LABELS } from "@/lib/project-constants";
import type { LabelView, Person } from "@/lib/projects";

type TaskFiltersBarProps = {
  people: Person[];
  labels: LabelView[];
  showSort?: boolean;
  resultCount: number;
};

const FILTER_KEYS = ["q", "assignee", "priority", "label", "due"] as const;

/**
 * Search and filter controls. Every change updates the URL, which makes
 * the server re-run the query, so the board and list always show real data.
 */
export function TaskFiltersBar({ people, labels, showSort = false, resultCount }: TaskFiltersBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const ids = { search: useId(), assignee: useId(), priority: useId(), label: useId(), due: useId(), sort: useId() };
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function update(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("task");
    router.replace(next.size > 0 ? `${pathname}?${next.toString()}` : pathname, { scroll: false });
  }

  // Search as you type, but wait until typing pauses so each keystroke
  // doesn't become its own database query.
  function handleQueryChange(value: string) {
    setQuery(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => update("q", value.trim()), 300);
  }

  const active = FILTER_KEYS.some((key) => searchParams.get(key));

  return (
    <div className="grid gap-2">
      <form
        role="search"
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          clearTimeout(searchTimer.current);
          update("q", query.trim());
        }}
      >
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <label htmlFor={ids.search} className="sr-only">
            Search tasks
          </label>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={ids.search}
            type="search"
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            placeholder="Search tasks"
            maxLength={100}
            className="h-10 pl-8"
          />
        </div>
        <FilterSelect id={ids.assignee} label="Assignee" value={searchParams.get("assignee")} onChange={(v) => update("assignee", v)}>
          <option value="">Anyone</option>
          <option value="none">Unassigned</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect id={ids.priority} label="Priority" value={searchParams.get("priority")} onChange={(v) => update("priority", v)}>
          <option value="">Any priority</option>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_LABELS[priority]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect id={ids.label} label="Label" value={searchParams.get("label")} onChange={(v) => update("label", v)}>
          <option value="">Any label</option>
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect id={ids.due} label="Due date" value={searchParams.get("due")} onChange={(v) => update("due", v)}>
          <option value="">Any date</option>
          <option value="overdue">Overdue</option>
          <option value="week">Due in the next 7 days</option>
          <option value="none">No due date</option>
        </FilterSelect>
        {showSort ? (
          <FilterSelect id={ids.sort} label="Sort by" value={searchParams.get("sort")} onChange={(v) => update("sort", v)}>
            <option value="">Board order</option>
            <option value="due">Due date</option>
            <option value="priority">Priority</option>
            <option value="title">Title</option>
            <option value="updated">Recently updated</option>
          </FilterSelect>
        ) : null}
        {active ? (
          <Button
            type="button"
            variant="ghost"
            className="h-10"
            onClick={() => {
              setQuery("");
              const next = new URLSearchParams(searchParams);
              for (const key of FILTER_KEYS) next.delete(key);
              router.replace(next.size > 0 ? `${pathname}?${next.toString()}` : pathname, { scroll: false });
            }}
          >
            <XIcon />
            Clear filters
          </Button>
        ) : null}
      </form>
      {active ? (
        <p className="text-sm text-muted-foreground" role="status">
          {resultCount === 1 ? "1 matching task" : `${resultCount} matching tasks`}
        </p>
      ) : null}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <NativeSelect id={id} value={value ?? ""} onChange={(event) => onChange(event.target.value)} className="min-w-36">
        {children}
      </NativeSelect>
    </div>
  );
}
