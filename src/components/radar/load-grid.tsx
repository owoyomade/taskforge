import { formatDate } from "@/lib/dates";
import type { LoadLevel, PersonLoad, RadarWeek } from "@/lib/workload";
import { cn } from "@/lib/utils";

const LEVEL_STYLE: Record<LoadLevel, string> = {
  ok: "bg-leaf/10 text-foreground",
  near: "bg-sun text-sun-foreground",
  over: "bg-ember text-white dark:text-black",
};

// Spelled out next to the number so the grid doesn't rely on colour alone.
const LEVEL_TEXT: Record<LoadLevel, string> = { ok: "", near: "near", over: "over" };

function weekLabel(week: RadarWeek, index: number): string {
  if (index === 0) return "This week";
  if (index === 1) return "Next week";
  return `Week of ${formatDate(week.start)}`;
}

/** One row per person, one column per week: how many open tasks are due. */
export function LoadGrid({ people, weeks, capacity }: { people: PersonLoad[]; weeks: RadarWeek[]; capacity: number }) {
  return (
    <div className="grid gap-3">
      {/* Scrolls sideways inside its card on narrow screens instead of widening the page. */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">
            Open tasks due per person per week. Capacity is {capacity} per week.
          </caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">
                Person
              </th>
              {weeks.map((week, index) => (
                <th key={week.start} scope="col" className="px-2 py-3 text-center font-medium">
                  {weekLabel(week, index)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {people.map((person) => (
              <tr key={person.id}>
                <th scope="row" className="max-w-48 truncate px-4 py-2.5 text-left font-medium">
                  {person.name}
                </th>
                {person.weeks.map((week, index) => (
                  <td key={weeks[index].start} className="px-2 py-2 text-center">
                    <span
                      className={cn(
                        "inline-flex min-w-16 justify-center gap-1 rounded-lg px-2 py-1 font-semibold tabular-nums",
                        week.count === 0 ? "text-muted-foreground" : LEVEL_STYLE[week.level],
                      )}
                    >
                      {week.count}
                      {LEVEL_TEXT[week.level] ? <span className="font-medium">{LEVEL_TEXT[week.level]}</span> : null}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">near</span> means {Math.ceil(capacity * 0.8)}–{capacity} tasks
        that week, <span className="font-medium text-foreground">over</span> means more than {capacity}. Overdue work
        counts toward this week.
      </p>
    </div>
  );
}
