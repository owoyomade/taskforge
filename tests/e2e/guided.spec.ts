import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers";

// Uses the seed data from db/seed.sql (run `npm run db:reset` first).
const WEBSITE_PROJECT = "/w/acme-studio/p/30000000-0000-4000-8000-000000000001";

function phaseSection(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

test("a new project from a template comes with phases, dates and a working plan", async ({ page }) => {
  test.slow(); // creates a whole project and waits on several saves
  await signIn(page, "alice@example.com");
  await page.getByRole("link", { name: "New project" }).first().click();
  await expect(page.getByRole("heading", { name: "What are you planning?" })).toBeVisible();

  await page.getByRole("button", { name: /^Team offsite/ }).click();
  const name = `Offsite ${Date.now()}`;
  await page.getByLabel("Project name").fill(name);
  await page.getByLabel("When should it be finished?").fill("2030-06-30");
  // The preview counts phase dates back from the finish date (Decide is 35 days before).
  await expect(page.getByText("by May 26, 2030")).toBeVisible();
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByRole("list", { name: /Project journey: 0 of 4 phases done/ })).toBeVisible();
  await expect(phaseSection(page, "Decide").getByText("You are here")).toBeVisible();

  // Ticking a task updates the phase's progress and survives a reload.
  await page.getByRole("checkbox", { name: "Mark Agree the goals for the offsite as done" }).check();
  await expect(phaseSection(page, "Decide").getByText(/1 of 3 done/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Mark Agree the goals for the offsite as not done" })).toBeChecked();
});

test("the template gallery can be searched and filtered", async ({ page }) => {
  await signIn(page, "alice@example.com");
  await page.goto("/w/acme-studio/projects/new");

  await page.getByLabel("Search templates").fill("wedding");
  await expect(page.getByRole("button", { name: /Wedding planning/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Team offsite/ })).toHaveCount(0);

  await page.getByLabel("Search templates").fill("");
  await page.getByRole("button", { name: "Hiring and people", exact: true }).click();
  await expect(page.getByRole("button", { name: "Hiring and people", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /Hire for a role/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Wedding planning/ })).toHaveCount(0);
});

test("phases can be added, filled and renamed from the plan", async ({ page }) => {
  await signIn(page, "alice@example.com");
  await page.goto("/w/acme-studio/projects/new");
  await page.getByRole("button", { name: /Start from scratch/ }).click();
  const name = `Phases ${Date.now()}`;
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  await page.getByRole("button", { name: "Add a phase" }).click();
  await page.getByRole("dialog").getByLabel("Phase name").fill("Research");
  await page.getByRole("dialog").getByRole("button", { name: "Add phase" }).click();
  await expect(phaseSection(page, "Research")).toBeVisible();

  await page.getByLabel("Add a task to Research").fill("Interview five users");
  await page.getByLabel("Add a task to Research").press("Enter");
  await expect(phaseSection(page, "Research").getByRole("link", { name: "Interview five users" })).toBeVisible();

  await page.getByRole("button", { name: "Options for phase Research" }).click();
  await page.getByRole("menuitem", { name: "Rename or change date" }).click();
  await page.getByRole("dialog").getByLabel("Phase name").fill("Discovery");
  await page.getByRole("dialog").getByRole("button", { name: "Save phase" }).click();
  await expect(phaseSection(page, "Discovery")).toBeVisible();
});

test("a project can be saved as a template and reused by the team", async ({ page }) => {
  test.slow();
  await signIn(page, "alice@example.com");
  await page.goto(`${WEBSITE_PROJECT}/settings`);
  const templateName = `Launch playbook ${Date.now()}`;
  await page.getByLabel("Template name").fill(templateName);
  await page.getByRole("button", { name: "Save as template" }).click();
  await expect(page.getByText(/Saved\. It now appears/)).toBeVisible();

  await page.goto("/w/acme-studio/projects/new");
  await page.getByRole("button", { name: "Your team's templates", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(templateName) }).click();
  await page.getByLabel("Project name").fill(`From playbook ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();

  // The saved phases come across.
  for (const phase of ["Plan", "Design and write", "Build", "Launch"]) {
    await expect(phaseSection(page, phase)).toBeVisible();
  }
});

test("Do next lists your tasks and ticking one off removes it", async ({ page }) => {
  await signIn(page, "dave@example.com");
  const task = page.getByRole("checkbox", { name: "Mark Set up analytics as done" });
  await expect(page.getByRole("heading", { name: "Do next" })).toBeVisible();
  await expect(task).toBeVisible();
  await expect(page.getByRole("heading", { name: /Overdue/ })).toBeVisible();

  // A ticked task leaves the list at once, so click rather than check().
  await task.click();
  await expect(page.getByText("Done: Set up analytics")).toBeVisible();
  await expect(task).toHaveCount(0);

  // Undo puts it back, keeping the demo data as it was.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Mark Set up analytics as done" })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
});

test("viewers see the plan but can't tick or add anything", async ({ page }) => {
  await signIn(page, "carol@example.com");
  await page.goto(WEBSITE_PROJECT);
  await expect(phaseSection(page, "Design and write")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Mark Write homepage copy as done" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add a phase" })).toHaveCount(0);
  await expect(page.getByLabel(/Add a task to/)).toHaveCount(0);
});
