import { expect, test } from "@playwright/test";
import pg from "pg";

import { signIn } from "./helpers";

// Uses the seed accounts from db/seed.sql (run `npm run db:reset` first):
// alice (owner), dave (admin) and carol (viewer). Each test run builds its
// own small workspace straight in the local database, so other tests that
// change the seed data can't affect what the radar shows. Every task is due
// today, so the results don't depend on the day of the week.
const OWNER_URL = process.env.DATABASE_OWNER_URL ?? "postgres://postgres:postgres@127.0.0.1:5433/taskforge";
const ALICE = "a1a1a1a1-0000-4000-8000-000000000001";
const CAROL = "c3c3c3c3-0000-4000-8000-000000000003";
const DAVE = "d4d4d4d4-0000-4000-8000-000000000004";

async function createRadarWorkspace(slug: string): Promise<void> {
  const client = new pg.Client({ connectionString: OWNER_URL });
  await client.connect();
  try {
    await client.query("begin");
    const [workspace] = (
      await client.query<{ id: string }>(
        "insert into public.workspaces (name, slug, created_by, weekly_capacity) values ('Radar Test', $1, $2, 1) returning id",
        [slug, ALICE],
      )
    ).rows;
    await client.query(
      `insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'admin'), ($1, $4, 'viewer')`,
      [workspace.id, ALICE, DAVE, CAROL],
    );
    const [project] = (
      await client.query<{ id: string }>(
        "insert into public.projects (workspace_id, name, owner_id, created_by) values ($1, 'Spring launch', $2, $2) returning id",
        [workspace.id, ALICE],
      )
    ).rows;
    const [todo] = (
      await client.query<{ id: string }>(
        `insert into public.board_columns (workspace_id, project_id, name, position, is_done)
         values ($1, $2, 'To do', 1000, false), ($1, $2, 'Done', 2000, true) returning id`,
        [workspace.id, project.id],
      )
    ).rows;
    const tasks = (
      await client.query<{ id: string; title: string }>(
        `insert into public.tasks (workspace_id, project_id, column_id, title, due_date, position, created_by)
         select $1, $2, $3, title, current_date, position, $4
         from (values ('Write the press release', 1000), ('Book the venue', 2000), ('Order the banners', 3000)) as t(title, position)
         returning id, title`,
        [workspace.id, project.id, todo.id, ALICE],
      )
    ).rows;
    // Dave has two tasks due today against a capacity of 1; the banners have nobody.
    for (const task of tasks.filter((row) => row.title !== "Order the banners")) {
      await client.query("insert into public.task_assignees (task_id, project_id, workspace_id, user_id) values ($1, $2, $3, $4)", [
        task.id,
        project.id,
        workspace.id,
        DAVE,
      ]);
    }
    await client.query("commit");
  } finally {
    await client.end();
  }
}

async function deleteRadarWorkspace(slug: string): Promise<void> {
  const client = new pg.Client({ connectionString: OWNER_URL });
  await client.connect();
  try {
    await client.query("delete from public.workspaces where slug = $1", [slug]);
  } finally {
    await client.end();
  }
}

const slug = `radar-test-${Date.now().toString(36)}`;
test.beforeAll(() => createRadarWorkspace(slug));
test.afterAll(() => deleteRadarWorkspace(slug));
test.describe.configure({ mode: "serial" });

test("the radar shows who is over capacity and why tasks are at risk, and one click moves the work", async ({ page }) => {
  await signIn(page, "alice@example.com");
  await page.goto(`/w/${slug}`);
  await page.getByRole("link", { name: "Workload radar" }).first().click();
  await expect(page.getByRole("heading", { name: "Workload radar" })).toBeVisible();
  await expect(page.getByText("3 tasks may slip, and 1 person is over capacity")).toBeVisible();

  // Dave's row: two tasks this week, over a capacity of 1.
  const daveRow = page.getByRole("row", { name: /Dave Mensah/ });
  await expect(daveRow.getByRole("cell").first()).toHaveText("2over");

  // Each risk says why.
  const banners = page.getByRole("listitem").filter({ hasText: "Order the banners" });
  await expect(banners.getByText("Nobody is on it")).toBeVisible();
  const pressRelease = page.getByRole("listitem").filter({ hasText: "Write the press release" });
  await expect(pressRelease.getByText("Assigned to someone over capacity that week")).toBeVisible();

  // Alice has room (nothing due), so she's suggested; one click hands it over.
  await page.getByRole("button", { name: /^Move to Alice Adeyemi\s?: Write the press release, from Dave Mensah$/ }).click();
  await expect(page.getByText("Write the press release is now with Alice Adeyemi.")).toBeVisible();
  await page.reload();
  await expect(daveRow.getByRole("cell").first()).toHaveText("1near");
  await expect(page.getByRole("button", { name: /Write the press release/ })).toHaveCount(0);
});

test("an owner changes the capacity in settings and the radar follows it", async ({ page }) => {
  await signIn(page, "alice@example.com");
  await page.goto(`/w/${slug}/settings#capacity`);
  await page.getByLabel("Tasks per person per week").fill("0");
  await page.getByRole("button", { name: "Save capacity" }).click();
  await expect(page.getByText("Use at least 1.")).toBeVisible();

  await page.getByLabel("Tasks per person per week").fill("4");
  await page.getByRole("button", { name: "Save capacity" }).click();
  await expect(page.getByText("Capacity saved.")).toBeVisible();

  await page.goto(`/w/${slug}/radar`);
  await expect(page.getByText("4 tasks per person per week")).toBeVisible();
  await expect(page.getByRole("row", { name: /Dave Mensah/ }).getByRole("cell").first()).toHaveText("1");
});

test("a viewer sees the radar but can't reassign work or change the capacity", async ({ page }) => {
  await signIn(page, "carol@example.com");
  await page.goto(`/w/${slug}/radar`);
  await expect(page.getByRole("heading", { name: "Tasks at risk" })).toBeVisible();
  await expect(page.getByText("Order the banners")).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Move|Assign) to / })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "change it" })).toHaveCount(0);

  await page.goto(`/w/${slug}/settings`);
  await expect(page.getByText("Only owners and admins can change it.")).toBeVisible();
  await expect(page.getByLabel("Tasks per person per week")).toHaveCount(0);
});
