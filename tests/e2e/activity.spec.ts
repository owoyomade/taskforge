import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers";

// Uses the seed data from supabase/seed.sql.
const WEBSITE_PROJECT = "/w/acme-studio/p/30000000-0000-4000-8000-000000000001";

/** Alice creates a scratch project with one task, so tests don't disturb the demo data. */
async function scratchTask(page: Page, taskTitle: string) {
  await page.goto("/w/acme-studio/projects/new");
  await page.getByRole("button", { name: /Start from scratch/ }).click();
  await page.getByLabel("Project name").fill(`Activity ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByLabel("Add a task").fill(taskTitle);
  await page.getByLabel("Add a task").press("Enter");
  await page.getByRole("link", { name: taskTitle }).click();
  return page.url().split("?")[0];
}

test("assigning and mentioning someone lands in their inbox, and opening it marks it read", async ({ page, browser }) => {
  test.slow();
  const title = `Inbox check ${Date.now()}`;
  await signIn(page, "alice@example.com");
  const projectUrl = await scratchTask(page, title);

  const drawer = page.getByRole("dialog");
  await drawer.getByRole("checkbox", { name: "Dave Mensah" }).check();
  await expect(drawer.getByRole("checkbox", { name: "Dave Mensah" })).toBeChecked();
  await drawer.getByLabel("Write a comment").fill("Can you take this? ");
  await drawer.getByLabel("Mention someone").selectOption({ label: "Dave Mensah" });
  await drawer.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(drawer.getByText("@Dave Mensah")).toBeVisible();

  const dave = await (await browser.newContext()).newPage();
  await signIn(dave, "dave@example.com");
  await expect(dave.getByRole("link", { name: /Inbox \d+ unread/ })).toBeVisible();
  await dave.getByRole("link", { name: /^Inbox( \d+ unread)?$/ }).click();
  await expect(dave.getByRole("button", { name: new RegExp(`Alice Adeyemi assigned you to ${title}`) })).toBeVisible();
  await expect(dave.getByRole("button", { name: new RegExp(`Alice Adeyemi mentioned you in ${title}`) })).toBeVisible();

  await dave.getByRole("button", { name: new RegExp(`assigned you to ${title}`) }).click();
  await expect(dave.getByRole("dialog").getByRole("heading", { name: title })).toBeVisible();
  await dave.goto("/w/acme-studio/inbox?unread=1");
  await expect(dave.getByRole("button", { name: new RegExp(`assigned you to ${title}`) })).toHaveCount(0);

  // The project's activity tells the same story.
  await page.goto(`${projectUrl}/activity`);
  await expect(page.getByText(`added ${title}`)).toBeVisible();
  await expect(page.getByText(`assigned Dave Mensah to ${title}`)).toBeVisible();
  await expect(page.getByText(`commented on ${title}`)).toBeVisible();
});

test("people can turn notification types off and on", async ({ page }) => {
  await signIn(page, "dave@example.com");
  await page.goto("/account");
  const assigned = page.getByRole("checkbox", { name: "Someone assigns me a task" });
  await assigned.uncheck();
  await page.getByRole("button", { name: "Save notification settings" }).click();
  await expect(page.getByText("Notification settings saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Someone assigns me a task" })).not.toBeChecked();

  // Put it back for other tests and the demo.
  await page.getByRole("checkbox", { name: "Someone assigns me a task" }).check();
  await page.getByRole("button", { name: "Save notification settings" }).click();
  await expect(page.getByText("Notification settings saved.").first()).toBeVisible();
});

test("owners can export the activity log; viewers can't", async ({ page }) => {
  await signIn(page, "alice@example.com");
  const csv = await page.request.get("/w/acme-studio/activity/export");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect((await csv.text()).split("\r\n")[0]).toBe('"When (UTC)","Who","What happened","Event type","Project id","Task id"');

  await page.context().clearCookies();
  await signIn(page, "carol@example.com");
  const denied = await page.request.get("/w/acme-studio/activity/export");
  expect(denied.status()).toBe(404);
  await page.goto("/w/acme-studio/activity");
  await expect(page.getByRole("link", { name: "Export as CSV" })).toHaveCount(0);
});

test("the timeline shows phases, tasks and today", async ({ page }) => {
  await signIn(page, "alice@example.com");
  await page.goto(`${WEBSITE_PROJECT}/timeline`);
  const chart = page.getByRole("list", { name: "Timeline" });
  await expect(chart.getByText("Design and write", { exact: true })).toBeVisible();
  await expect(chart.getByRole("link", { name: "Write homepage copy" })).toBeVisible();
  await expect(page.getByText("Today", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Not scheduled yet/ })).toBeVisible();
});

test("the overview shows phase progress and who's doing what", async ({ page }) => {
  await signIn(page, "alice@example.com");
  await page.goto(`${WEBSITE_PROJECT}/overview`);
  await expect(page.getByRole("heading", { name: "Phases" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who's doing what" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Who's doing what" }).getByText("Dave Mensah")).toBeVisible();
});
