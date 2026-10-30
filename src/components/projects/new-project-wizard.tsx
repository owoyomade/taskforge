"use client";

import { useActionState, useId, useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  BookmarkIcon,
  CheckIcon,
  ClipboardListIcon,
  FilePlusIcon,
  GraduationCapIcon,
  HandshakeIcon,
  HouseIcon,
  LaptopIcon,
  MegaphoneIcon,
  PartyPopperIcon,
  SearchIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

import { createProjectFromTemplate } from "@/app/(app)/template-actions";
import { ColorPicker } from "@/components/color-picker";
import { fieldErrors, FormField, FormMessage, previousValue } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDays, formatDate } from "@/lib/dates";
import { initialFormState } from "@/lib/form-state";
import { asColor, LABEL_STYLES, type Color } from "@/lib/project-constants";
import { BLANK_TEMPLATE, TEMPLATE_CATEGORIES, TEMPLATES, type BuiltInTemplate } from "@/lib/templates/library";
import type { TemplateDefinition } from "@/lib/templates/schema";
import { cn } from "@/lib/utils";

/** A template as the wizard shows it, whether built in or saved by the team. */
export type WizardTemplate = {
  ref: string;
  name: string;
  category: string;
  summary: string;
  durationDays: number;
  color: Color;
  definition: TemplateDefinition;
};

const TEAM_CATEGORY = "Your team's templates";

function fromBuiltIn(template: BuiltInTemplate): WizardTemplate {
  return { ...template, ref: `builtin:${template.id}` };
}

type NewProjectWizardProps = {
  workspaceId: string;
  today: string;
  savedTemplates: WizardTemplate[];
};

/**
 * Two steps: pick a template ("What are you planning?"), then name it and
 * choose a finish date. The preview shows exactly what will be created.
 */
export function NewProjectWizard({ workspaceId, today, savedTemplates }: NewProjectWizardProps) {
  const [selected, setSelected] = useState<WizardTemplate | null>(null);

  return selected ? (
    <CustomizeStep workspaceId={workspaceId} today={today} template={selected} onBack={() => setSelected(null)} />
  ) : (
    <ChooseStep savedTemplates={savedTemplates} onChoose={setSelected} />
  );
}

// Each category gets an icon and a soft colour so the list can be scanned by
// topic rather than read card by card.
const CATEGORY_LOOK: Record<string, { icon: LucideIcon; tint: string }> = {
  [TEAM_CATEGORY]: { icon: BookmarkIcon, tint: "bg-accent text-accent-foreground" },
  Events: { icon: PartyPopperIcon, tint: LABEL_STYLES.rose },
  Marketing: { icon: MegaphoneIcon, tint: LABEL_STYLES.amber },
  "Product and software": { icon: LaptopIcon, tint: LABEL_STYLES.blue },
  "Hiring and people": { icon: UsersIcon, tint: LABEL_STYLES.violet },
  Operations: { icon: ClipboardListIcon, tint: LABEL_STYLES.slate },
  "Clients and sales": { icon: HandshakeIcon, tint: LABEL_STYLES.teal },
  "Personal and home": { icon: HouseIcon, tint: LABEL_STYLES.rose },
  "School and learning": { icon: GraduationCapIcon, tint: LABEL_STYLES.violet },
};
const FALLBACK_LOOK = { icon: ClipboardListIcon, tint: LABEL_STYLES.slate };

/** "about 6 weeks": a rough, friendly length for the suggested schedule. */
function roughLength(days: number): string {
  if (days < 14) return `${days} days`;
  if (days < 60) return `about ${Math.round(days / 7)} weeks`;
  return `about ${Math.round(days / 30)} months`;
}

function ChooseStep({ savedTemplates, onChoose }: { savedTemplates: WizardTemplate[]; onChoose: (template: WizardTemplate) => void }) {
  const [category, setCategory] = useState<string>("All");
  const [query, setQuery] = useState("");
  const searchId = useId();

  const all = useMemo(() => [...savedTemplates, ...TEMPLATES.map(fromBuiltIn)], [savedTemplates]);
  const categories = ["All", ...(savedTemplates.length > 0 ? [TEAM_CATEGORY] : []), ...TEMPLATE_CATEGORIES];
  const normalized = query.trim().toLowerCase();
  const shown = all.filter(
    (template) =>
      (category === "All" || template.category === category) &&
      (!normalized || `${template.name} ${template.summary} ${template.category}`.toLowerCase().includes(normalized)),
  );
  // Browsing everything shows one section per category; a search or a
  // chosen category shows a single flat list.
  const sections =
    category === "All" && !normalized
      ? categories
          .slice(1)
          .map((name) => ({ name, templates: shown.filter((template) => template.category === name) }))
          .filter((section) => section.templates.length > 0)
      : [{ name: category === "All" ? "Matching plans" : category, templates: shown }];

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-3xl font-bold">What are you planning?</h1>
        <p className="max-w-2xl text-muted-foreground">
          Pick the closest match. Each plan comes with phases, tasks and checklists you can change afterwards, so it
          doesn&apos;t need to be perfect.
        </p>
      </div>

      <div className="grid gap-3">
        <div className="relative max-w-md">
          <label htmlFor={searchId} className="sr-only">
            Search templates
          </label>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search, e.g. wedding, launch, hiring"
            className="h-11 rounded-full bg-card pl-10"
          />
        </div>
        <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
          {categories.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={category === name}
              onClick={() => setCategory(name)}
              className="rounded-full border bg-card px-3.5 py-1.5 text-sm outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {category === "All" && !normalized ? (
        <button
          type="button"
          onClick={() => onChoose(fromBuiltIn(BLANK_TEMPLATE))}
          className="flex items-center gap-4 rounded-2xl border border-dashed border-primary/40 bg-card p-4 text-left outline-none hover:border-primary hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground" aria-hidden="true">
            <FilePlusIcon className="size-5" />
          </span>
          <span className="grid gap-0.5">
            <span className="font-semibold">Start from scratch</span>
            <span className="text-sm text-muted-foreground">An empty board with Not started, Doing and Done columns.</span>
          </span>
        </button>
      ) : null}

      {sections.map((section) => {
        const look = CATEGORY_LOOK[section.name] ?? FALLBACK_LOOK;
        const Icon = look.icon;
        return (
          <section key={section.name} aria-labelledby={`${searchId}-${section.name}`} className="grid gap-3">
            <h2 id={`${searchId}-${section.name}`} className="flex items-center gap-2 text-lg font-bold">
              {CATEGORY_LOOK[section.name] ? (
                <span className={cn("grid size-7 place-items-center rounded-lg", look.tint)} aria-hidden="true">
                  <Icon className="size-4" />
                </span>
              ) : null}
              {section.name}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>li]:min-w-0">
              {section.templates.map((template) => (
                <li key={template.ref}>
                  <TemplateCard template={template} onChoose={onChoose} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No templates match. Try another word, or{" "}
          <button type="button" className="font-medium text-foreground underline underline-offset-4" onClick={() => onChoose(fromBuiltIn(BLANK_TEMPLATE))}>
            start from scratch
          </button>
          .
        </p>
      ) : null}
    </div>
  );
}

function TemplateCard({ template, onChoose }: { template: WizardTemplate; onChoose: (template: WizardTemplate) => void }) {
  const { phases, tasks } = template.definition;
  const look = CATEGORY_LOOK[template.category] ?? FALLBACK_LOOK;
  const Icon = look.icon;
  return (
    <button
      type="button"
      onClick={() => onChoose(template)}
      className="grid h-full w-full grid-cols-1 content-start gap-3 rounded-2xl border bg-card p-5 text-left outline-none hover:border-primary/50 hover:shadow-[0_4px_16px_-8px] hover:shadow-primary/30 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex items-start gap-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", look.tint)} aria-hidden="true">
          <Icon className="size-[1.125rem]" />
        </span>
        <span className="min-w-0 pt-1.5 text-base leading-tight font-semibold">{template.name}</span>
      </span>
      <span className="line-clamp-2 text-sm text-muted-foreground">{template.summary}</span>
      {phases.length > 0 ? (
        // The phases in order, so people can see whether the plan fits them.
        <ol className="mt-auto flex flex-wrap gap-1.5 pt-1" aria-label="Phases">
          {phases.map((phase, index) => (
            <li key={phase.name + index} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-secondary-foreground">
              <span className="text-muted-foreground">{index + 1}</span> {phase.name}
            </li>
          ))}
        </ol>
      ) : null}
      <span className="text-xs text-muted-foreground">
        {tasks.length} tasks, {roughLength(template.durationDays)}
      </span>
    </button>
  );
}

function CustomizeStep({
  workspaceId,
  today,
  template,
  onBack,
}: {
  workspaceId: string;
  today: string;
  template: WizardTemplate;
  onBack: () => void;
}) {
  const [state, formAction, isPending] = useActionState(createProjectFromTemplate, initialFormState);
  const [finishDate, setFinishDate] = useState(previousValue(state, "finishDate") ?? addDays(today, template.durationDays));
  const [hasDeadline, setHasDeadline] = useState(true);
  const visibilityId = useId();
  const deadlineId = useId();
  const { phases, tasks } = template.definition;
  const isBlank = template.ref === `builtin:${BLANK_TEMPLATE.id}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form action={formAction} className="grid content-start gap-5" noValidate>
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 justify-self-start text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" />
          Choose a different plan
        </button>
        <div className="grid gap-1">
          <h1 className="text-3xl font-bold">Make it yours</h1>
          <p className="text-muted-foreground">
            {isBlank ? "An empty project you can shape yourself." : `Based on "${template.name}". You can change anything later.`}
          </p>
        </div>

        {state.status === "error" && !state.fieldErrors ? <FormMessage state={state} /> : null}
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="templateRef" value={template.ref} />
        <input type="hidden" name="finishDate" value={hasDeadline ? finishDate : ""} />

        <FormField
          label="Project name"
          name="name"
          required
          maxLength={80}
          defaultValue={previousValue(state, "name") ?? (isBlank ? "" : template.name)}
          placeholder="e.g. Spring launch party"
          errors={fieldErrors(state, "name")}
        />

        <div className="grid gap-2">
          <FormField
            label="When should it be finished?"
            name="finishDateInput"
            type="date"
            value={finishDate}
            min={today}
            disabled={!hasDeadline}
            onChange={(event) => setFinishDate(event.target.value)}
            hint={isBlank ? undefined : "We'll spread the plan's dates back from this day."}
            errors={fieldErrors(state, "finishDate")}
          />
          <label htmlFor={deadlineId} className="flex items-center gap-2 text-sm">
            <input
              id={deadlineId}
              type="checkbox"
              className="size-4 accent-primary"
              checked={!hasDeadline}
              onChange={(event) => setHasDeadline(!event.target.checked)}
            />
            No deadline (tasks won&apos;t get dates)
          </label>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={visibilityId}>Who can see it</Label>
          <NativeSelect id={visibilityId} name="visibility" defaultValue={previousValue(state, "visibility") ?? "workspace"}>
            <option value="workspace">Everyone in the workspace</option>
            <option value="private">Only people I add (and workspace admins)</option>
          </NativeSelect>
        </div>

        <ColorPicker name="color" legend="Colour" defaultValue={asColor(previousValue(state, "color") ?? template.color)} />

        <Button type="submit" size="lg" className="h-11 justify-self-start px-6" disabled={isPending}>
          {isPending ? "Creating your plan…" : "Create project"}
        </Button>
      </form>

      <aside aria-labelledby="preview-heading" className="grid content-start gap-4 rounded-2xl border bg-card p-6">
        <h2 id="preview-heading" className="text-lg font-semibold">
          What you&apos;ll get
        </h2>
        {phases.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            A board with {template.definition.columns.map((column) => column.name).join(", ")}. Add phases and tasks
            whenever you&apos;re ready.
          </p>
        ) : (
          <ol className="grid gap-4">
            {phases.map((phase, index) => {
              const phaseTasks = tasks.filter((task) => task.phase === index);
              return (
                <li key={phase.name + index} className="grid grid-cols-[1.5rem_1fr] gap-3">
                  <span className="mt-0.5 grid size-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div className="grid gap-1">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-2 font-semibold">
                      {phase.name}
                      {hasDeadline && finishDate ? (
                        <span className="text-xs font-normal text-muted-foreground">by {formatDate(addDays(finishDate, phase.offsetDays))}</span>
                      ) : null}
                    </p>
                    <ul className="grid gap-0.5 text-sm text-muted-foreground">
                      {phaseTasks.map((task) => (
                        <li key={task.title} className="flex items-start gap-1.5">
                          <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-leaf" aria-hidden="true" />
                          <span className={cn(task.priority === "high" || task.priority === "urgent" ? "text-foreground" : undefined)}>
                            {task.title}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </aside>
    </div>
  );
}
