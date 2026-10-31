import { expect, test } from "@playwright/test";

// The public demo needs DEMO_PASSWORD in .env.local (see .env.example).

test("Try the demo signs a visitor in to the sample workspace, with risky actions turned off", async ({ page }) => {
  test.slow(); // the first click builds the demo workspace
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).click();

  await expect(page).toHaveURL(/\/w\/demo-studio$/);
  await expect(page.getByRole("heading", { name: "Hi Alex" })).toBeVisible();
  await expect(page.getByText("You're exploring a shared demo.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Product launch campaign" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Inbox \d+ unread/ })).toBeVisible();

  // Invitations would let anyone use the demo to reach other people.
  await page.goto("/w/demo-studio/settings");
  await page.getByLabel("Email address").fill("someone@example.com");
  await page.getByLabel("Role", { exact: true }).selectOption("member");
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText("That's turned off in the demo.")).toBeVisible();

  // The banner's sign-up button ends the demo session instead of bouncing back to it.
  await page.getByRole("button", { name: "Create your own free account" }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
});

test("the demo account can't be signed in to with the normal form", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByLabel("Password").fill("a-guess-1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Use the Try the demo button to explore the demo.")).toBeVisible();
});
