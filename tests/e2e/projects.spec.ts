import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers";

// Uses the seed data from supabase/seed.sql (run `npm run db:reset` first).
const WEBSITE_PROJECT = "/w/acme-studio/p/30000000-0000-4000-8000-000000000001";

function column(page: Page, name: string) {
  return page.getByRole("list", { name: `Tasks in ${name}` });
}

/** Creates a throwaway project so tests don't disturb each other or the seed data. */
async function createProject(page: Page, name: string) {
  await page.goto("/w/acme-studio/projects/new");
  await page.getByRole("button", { name: /Start from scratch/ }).click();
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  // These tests work on the board, one tab over from the plan.
  await projectTab(page, "Board").click();
  await expect(page).toHaveURL(/\/board$/);
}

/**
 * Resolves when the next Server Action (a save) gets its reply. Moves show
 * on the board instantly and save in the background, so a test that reloads
 * straight away could cancel the save; start waiting before the action.
 */
function nextSave(page: Page) {
  return page.waitForResponse((response) => response.request().method() === "POST" && Boolean(response.request().headers()["next-action"]));
}

function projectTab(page: Page, name: string) {
  return page.getByRole("navigation", { name: "Project views" }).getByRole("link", { name, exact: true });
}

async function quickAdd(page: Page, columnName: string, title: string) {
  const input = page.getByLabel(`New task title in ${columnName}`);
  // The quick-add box stays open after each task, ready for the next one.
  if (!(await input.isVisible())) {
    const columnItem = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: columnName, exact: true }) });
    await columnItem.getByRole("button", { name: "Add task" }).click();
  }
  await input.fill(title);
  await input.press("Enter");
  await expect(column(page, columnName).getByRole("link", { name: title })).toBeVisible();
}

test("a member creates a project, adds tasks and moves one with the keyboard", async ({ page }) => {
  await signIn(page, "alice@example.com");
  await createProject(page, `Keyboard board ${Date.now()}`);

  await quickAdd(page, "Not started", "Draft brief");
  await quickAdd(page, "Not started", "Book venue");

  // Keyboard drag: focus the card, Space to pick up, arrow right, Space to drop.
  await column(page, "Not started").getByRole("link", { name: "Draft brief" }).focus();
  const saved = nextSave(page);
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(column(page, "Doing").getByRole("link", { name: "Draft brief" })).toBeVisible();

  // The move was saved, not just shown.
  await saved;
  await page.reload();
  await expect(column(page, "Doing").getByRole("link", { name: "Draft brief" })).toBeVisible();
  await expect(column(page, "Not started").getByRole("link", { name: "Book venue" })).toBeVisible();
});

test("the card menu moves a task without dragging", async ({ page }) => {
  await signIn(page, "alice@example.com");
  await createProject(page, `Menu board ${Date.now()}`);
  await quickAdd(page, "Not started", "Send invoice");

  await page.getByRole("button", { name: "Move Send invoice" }).click();
  const saved = nextSave(page);
  await page.getByRole("menuitem", { name: "Done" }).click();
  await expect(column(page, "Done").getByRole("link", { name: "Send invoice" })).toBeVisible();
  await saved;
  await page.reload();
  await expect(column(page, "Done").getByRole("link", { name: "Send invoice" })).toBeVisible();
});

test("a task is edited in the drawer, assigned, labelled and given a checklist", async ({ page }) => {
  test.slow(); // many saves in a row, each waiting on the server
  await signIn(page, "alice@example.com");
  await createProject(page, `Drawer board ${Date.now()}`);
  await quickAdd(page, "Not started", "Plan launch");

  await column(page, "Not started").getByRole("link", { name: "Plan launch" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "Plan launch" })).toBeVisible();

  await drawer.getByLabel("Description").fill("Pick a date and send invites.");
  await drawer.getByLabel("Priority").selectOption("high");
  await drawer.getByLabel("Due date").fill("2030-01-15");
  await drawer.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Task saved.")).toBeVisible();

  await drawer.getByRole("checkbox", { name: "Dave Mensah" }).check();
  await expect(drawer.getByRole("checkbox", { name: "Dave Mensah" })).toBeChecked();
  // Label checkboxes are visually hidden inside a chip, so click the chip itself.
  await drawer.locator("label", { hasText: "Design" }).click();
  await expect(drawer.getByRole("checkbox", { name: "Design" })).toBeChecked();

  await drawer.getByLabel("Add a subtask").fill("Shortlist venues");
  await drawer.getByLabel("Add a subtask").press("Enter");
  await expect(drawer.getByRole("checkbox", { name: "Shortlist venues" })).toBeVisible();

  await drawer.getByRole("button", { name: "Add checklist" }).click();
  await drawer.getByLabel("Add an item to Checklist").fill("Confirm budget");
  await drawer.getByLabel("Add an item to Checklist").press("Enter");
  await drawer.getByRole("checkbox", { name: "Confirm budget" }).check();
  await expect(drawer.getByRole("checkbox", { name: "Confirm budget" })).toBeChecked();

  // Close and check the card shows the saved details.
  await page.keyboard.press("Escape");
  const card = column(page, "Not started").getByRole("listitem").filter({ hasText: "Plan launch" });
  await expect(card.getByText("High")).toBeVisible();
  await expect(card.getByText("Design")).toBeVisible();
  await expect(card.getByLabel("Assigned to Dave Mensah")).toBeVisible();
});

test("a stale edit is rejected instead of overwriting someone else's change", async ({ browser }) => {
  const first = await browser.newPage();
  const second = await browser.newPage();
  await signIn(first, "alice@example.com");
  await signIn(second, "dave@example.com");

  const url = `${WEBSITE_PROJECT}?task=60000000-0000-4000-8000-000000000002`;
  await first.goto(url);
  await second.goto(url);

  await first.getByRole("dialog").getByLabel("Title").fill(`Collect customer logos (${Date.now()})`);
  await first.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(first.getByText("Task saved.")).toBeVisible();

  // The second person's form still holds the old version.
  await second.getByRole("dialog").getByLabel("Description").fill("Edited from an old copy");
  await second.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(second.getByText(/Someone else changed this task/)).toBeVisible();
});

test("search and filters narrow the board and carry over to the list view", async ({ page }) => {
  await signIn(page, "alice@example.com");
  await page.goto(`${WEBSITE_PROJECT}/board`);

  await page.getByLabel("Search tasks").fill("pricing");
  await expect(page.getByText("1 matching task")).toBeVisible();
  await expect(page.getByRole("link", { name: "Design pricing page" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Write homepage copy" })).toHaveCount(0);

  await page.getByRole("link", { name: "List" }).click();
  await expect(page).toHaveURL(/\/list\?q=pricing/);
  await expect(page.getByRole("table").getByRole("link", { name: "Design pricing page" })).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/q=/);
  await page.getByLabel("Priority").selectOption("high");
  await expect(page.getByRole("table").getByRole("link", { name: "Write homepage copy" })).toBeVisible();
  await expect(page.getByRole("table").getByRole("link", { name: "Design pricing page" })).toHaveCount(0);
});

test("viewers can read the board but get no editing controls", async ({ page }) => {
  await signIn(page, "carol@example.com");
  await page.goto(`${WEBSITE_PROJECT}/board`);

  await expect(page.getByText("You can view this project but not change it.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Write homepage copy" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add task" })).toHaveCount(0);
  await expect(projectTab(page, "Settings")).toHaveCount(0);

  await page.getByRole("link", { name: "Write homepage copy" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Save changes" })).toHaveCount(0);
});

test("private projects are hidden from people who weren't added", async ({ page }) => {
  await signIn(page, "carol@example.com");
  await expect(page.getByRole("link", { name: "Hiring plan" })).toHaveCount(0);

  // The response has already started streaming (status 200) when the
  // project lookup fails, so check what's shown rather than the status code.
  await page.goto("/w/acme-studio/p/30000000-0000-4000-8000-000000000002");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByText("Draft senior designer role")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Hiring plan" })).toHaveCount(0);
});

test("archiving a project makes it read-only, and it can be restored", async ({ page }) => {
  await signIn(page, "alice@example.com");
  const name = `Archive me ${Date.now()}`;
  await createProject(page, name);

  await projectTab(page, "Settings").click();
  await page.getByRole("button", { name: "Archive project" }).click();
  await expect(page.getByText("Project archived.")).toBeVisible();
  await expect(page.getByText(/This project is archived/)).toBeVisible();

  await page.getByRole("button", { name: "Restore project" }).click();
  await expect(page.getByText("Project restored.")).toBeVisible();
  await expect(page.getByText(/This project is archived/)).toHaveCount(0);
});

test("deleting a column moves its tasks instead of losing them", async ({ page }) => {
  await signIn(page, "alice@example.com");
  await createProject(page, `Column delete ${Date.now()}`);
  await quickAdd(page, "Doing", "Keep me");

  await page.getByRole("button", { name: "Column options for Doing" }).click();
  await page.getByRole("menuitem", { name: "Delete column" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Move tasks to").selectOption({ label: "Done" });
  await dialog.getByRole("button", { name: "Delete column" }).click();

  await expect(page.getByRole("heading", { name: "Doing" })).toHaveCount(0);
  await expect(column(page, "Done").getByRole("link", { name: "Keep me" })).toBeVisible();
});
