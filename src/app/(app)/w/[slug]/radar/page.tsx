import type { Metadata } from "next";
import Link from "next/link";

import { LoadGrid } from "@/components/radar/load-grid";
import { RiskList } from "@/components/radar/risk-list";
import { can } from "@/lib/permissions";
import { getWorkspaceRadar } from "@/lib/radar";
import { dateRange } from "@/lib/task-filters";
import { getWorkspaceForUser } from "@/lib/workspaces";

export const metadata: Metadata = { title: "Workload radar" };

/**
 * Who has too much on, and which tasks may slip, over the next four weeks.
 * The rules live in src/lib/workload.ts; this page only lays them out.
 */
export default async function WorkloadRadarPage({ params }: PageProps<"/w/[slug]/radar">) {
  const { slug } = await params;
  const workspace = await getWorkspaceForUser(slug);
  const { today } = dateRange(0);
  const radar = await getWorkspaceRadar(workspace, today);
  const overloaded = radar.people.filter((person) => person.weeks.some((week) => week.level === "over")).length;

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10">
      <header className="grid gap-1">
        <h1 className="text-3xl font-bold">Workload radar</h1>
        <p className="text-muted-foreground">
          {radar.risks.length === 0 && overloaded === 0
            ? "Nobody is over capacity and nothing looks at risk for the next four weeks."
            : `${radar.risks.length} task${radar.risks.length === 1 ? "" : "s"} may slip, and ${overloaded} ${
                overloaded === 1 ? "person is" : "people are"
              } over capacity in the next four weeks.`}
        </p>
      </header>

      <section aria-labelledby="risks-heading" className="grid gap-3">
        <h2 id="risks-heading" className="text-lg font-semibold">
          Tasks at risk
        </h2>
        <RiskList
          risks={radar.risks}
          today={today}
          workspaceSlug={workspace.slug}
          canEdit={workspace.role !== "viewer"}
        />
      </section>

      <section aria-labelledby="load-heading" className="grid gap-3">
        <div className="grid gap-1">
          <h2 id="load-heading" className="text-lg font-semibold">
            Who has what on
          </h2>
          <p className="text-sm text-muted-foreground">
            Open tasks due each week, from the projects you can see. The team&apos;s capacity is{" "}
            <span className="font-medium text-foreground">{radar.capacity} tasks per person per week</span>
            {can(workspace.role, "renameWorkspace") ? (
              <>
                {" "}
                (
                <Link href={`/w/${workspace.slug}/settings#capacity`} className="underline underline-offset-4">
                  change it
                </Link>
                )
              </>
            ) : null}
            .
          </p>
        </div>
        <LoadGrid people={radar.people} weeks={radar.weeks} capacity={radar.capacity} />
      </section>
    </div>
  );
}
