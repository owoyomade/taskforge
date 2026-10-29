import { expect, test } from "@playwright/test";

import { latestAuthLink, signUpAndConfirm, uniqueEmail } from "./helpers";

test("a new user signs up, confirms their email and sets up two workspaces", async ({ page }) => {
  const email = uniqueEmail("signup");
  await signUpAndConfirm(page, "Tolu Bamidele", email, "launch2026");

  await expect(page.getByRole("heading", { name: "Welcome, Tolu" })).toBeVisible();
  await page.getByLabel("Workspace name").fill("Harbor Creative");
  await page.getByRole("button", { name: "Create workspace" }).click();

  await expect(page).toHaveURL(/\/w\/harbor-creative-[a-z0-9]{6}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Harbor Creative" })).toBeVisible();
  await expect(page.getByText("Your role: Owner.")).toBeVisible();

  // Create a second workspace from the switcher, then switch back.
  await page.getByRole("button", { name: /Switch workspace/ }).click();
  await page.getByRole("menuitem", { name: "Create workspace" }).click();
  await page.getByLabel("Workspace name").fill("Side Project");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Side Project" })).toBeVisible();

  await page.getByRole("button", { name: /Switch workspace/ }).click();
  await page.getByRole("menuitem", { name: "Harbor Creative" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Harbor Creative" })).toBeVisible();
});

test("signing in before confirming the email explains what to do", async ({ page }) => {
  const email = uniqueEmail("unconfirmed");
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Pending Person");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("launch2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("launch2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Confirm your email first.")).toBeVisible();
});

test("a user resets a forgotten password with the emailed link", async ({ page }) => {
  const email = uniqueEmail("reset");
  await signUpAndConfirm(page, "Reset Tester", email, "original2026");
  await page.getByLabel("Workspace name").fill("Reset Space");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Reset Space" })).toBeVisible();
  await page.context().clearCookies();

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/a reset link is on its way/)).toBeVisible();

  await expect
    .poll(async () => (await latestAuthLink(email)).includes("type=recovery"), { timeout: 15_000 })
    .toBe(true);
  await page.goto(await latestAuthLink(email));
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("changed2026");
  await page.getByLabel("Confirm new password").fill("changed2026");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Reset Space" })).toBeVisible();

  // The new password works for a fresh sign-in.
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("changed2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Reset Space" })).toBeVisible();
});

test("signed-out visitors are sent to sign in and returned afterwards", async ({ page }) => {
  await page.goto("/w/acme-studio/settings");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fw%2Facme-studio%2Fsettings$/);

  await page.getByLabel("Email").fill("alice@example.com");
  await page.getByLabel("Password").fill("Password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/w\/acme-studio\/settings$/);
});

test("a malicious next parameter cannot redirect off-site", async ({ page }) => {
  await page.goto("/sign-in?next=//evil.example");
  await page.getByLabel("Email").fill("alice@example.com");
  await page.getByLabel("Password").fill("Password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/localhost:3100\/w\/acme-studio$/);
});
