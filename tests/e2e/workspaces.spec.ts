import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

// These tests use the seed accounts from db/seed.sql (run `npm run db:reset`).

test("members of one workspace cannot open another tenant's workspace", async ({ page }) => {
  await signIn(page, "bob@example.com");
  await expect(page.getByRole("button", { name: /Current workspace: Bobcat Labs/ })).toBeVisible();

  const response = await page.goto("/w/acme-studio");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByText("Alice Adeyemi")).toHaveCount(0);
});

test("viewers see settings read-only, without rename or delete controls", async ({ page }) => {
  await signIn(page, "carol@example.com");
  await page.goto("/w/acme-studio/settings");

  await expect(page.getByText("Only owners and admins can rename the workspace.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save name" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete workspace" })).toHaveCount(0);
});

test("an owner renames a workspace and deletes one after typing its name", async ({ page }) => {
  await signIn(page, "alice@example.com");

  // Work on a throwaway workspace so the seed data stays intact for other tests.
  await page.goto("/workspaces/new");
  await page.getByLabel("Workspace name").fill("Temporary Team");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("button", { name: /Current workspace: Temporary Team/ })).toBeVisible();

  await page.getByRole("link", { name: "Team and settings" }).click();
  await page.getByLabel("Workspace name").fill("Renamed Team");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Workspace renamed.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Current workspace: Renamed Team/ })).toBeVisible();

  await page.getByRole("button", { name: "Delete workspace" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Type Renamed Team to confirm").fill("wrong name");
  await dialog.getByRole("button", { name: "Delete workspace" }).click();
  await expect(dialog.getByText("Type Renamed Team to confirm.")).toBeVisible();

  await dialog.getByLabel("Type Renamed Team to confirm").fill("Renamed Team");
  await dialog.getByRole("button", { name: "Delete workspace" }).click();
  await expect(page).toHaveURL(/\/w\/acme-studio$/);
});

test("the user menu opens account settings and signs out", async ({ page }) => {
  await signIn(page, "alice@example.com");

  await page.getByRole("button", { name: /Alice Adeyemi/ }).click();
  await page.getByRole("menuitem", { name: "Account settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Account settings" })).toBeVisible();

  await page.goto("/w/acme-studio");
  await page.getByRole("button", { name: /Alice Adeyemi/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  // Signed out for real: protected pages redirect back to sign-in.
  await page.goto("/w/acme-studio");
  await expect(page).toHaveURL(/\/sign-in\?next=/);
});

test("users update their name from account settings", async ({ page }) => {
  await signIn(page, "dave@example.com");
  await page.goto("/account");
  await page.getByLabel("Name").fill("Dave K. Mensah");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();

  await page.getByLabel("Name").fill("Dave Mensah");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.").first()).toBeVisible();
});
