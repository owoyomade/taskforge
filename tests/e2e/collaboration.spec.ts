import { expect, test } from "@playwright/test";

import { E2E_BASE_URL } from "../../playwright.config";
import { latestEmailLink, signIn, signUpAndConfirm, uniqueEmail } from "./helpers";

// Uses the seed data from db/seed.sql (run `npm run db:reset` first).
const PRICING_TASK = "/w/acme-studio/p/30000000-0000-4000-8000-000000000001?task=60000000-0000-4000-8000-000000000003";
const ERIN_INVITE = "/invite/0123456789abcdef0123456789abcdef0123456789abcdef";

test("an admin invites someone new by email, who signs up, accepts and can then be removed", async ({ page, browser }) => {
  test.slow(); // two accounts, sign-up email and several round trips
  const email = uniqueEmail("invitee");

  await signIn(page, "alice@example.com");
  await page.goto("/w/acme-studio/settings");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Role", { exact: true }).selectOption("member");
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText(`We've emailed an invitation to ${email}.`, { exact: false })).toBeVisible();
  const link = await page.getByLabel("Invite link").inputValue(); // the copy-it-yourself fallback
  expect(link).toMatch(/\/invite\/[0-9a-f]{48}$/);
  await expect(page.getByText(email, { exact: true })).toBeVisible(); // in the open invitations list

  // The invitee, in a separate browser session.
  const invitee = await (await browser.newContext()).newPage();
  await signUpAndConfirm(invitee, "Ife Invitee", email, "welcome2026");
  await expect(invitee.getByText("You have an invitation")).toBeVisible();

  // They follow the link in the invitation email, which is the same one Alice was shown.
  const emailed = await latestEmailLink(email, "/invite/");
  expect(new URL(emailed).pathname).toBe(new URL(link).pathname);
  await invitee.goto(emailed);
  await expect(invitee.getByRole("heading", { name: "Join Acme Studio" })).toBeVisible();
  await invitee.getByRole("button", { name: "Accept and join" }).click();
  await expect(invitee).toHaveURL(/\/w\/acme-studio$/);
  await expect(invitee.getByRole("link", { name: "Website relaunch" }).first()).toBeVisible();

  // The same link can't be used again.
  await invitee.goto(new URL(new URL(link).pathname, E2E_BASE_URL).toString());
  await expect(invitee.getByText("This invitation has already been accepted.")).toBeVisible();

  // Alice removes them; they lose access immediately.
  await page.reload();
  const row = page.getByRole("listitem").filter({ hasText: email });
  await row.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove member" }).click();
  await expect(page.getByText("Ife Invitee was removed.")).toBeVisible();

  await invitee.goto("/w/acme-studio");
  await expect(invitee.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("an invitation can't be accepted from a different account", async ({ page }) => {
  await signIn(page, "bob@example.com");
  await page.goto(ERIN_INVITE);
  await expect(page.getByRole("heading", { name: "Join Acme Studio" })).toBeVisible();
  await expect(page.getByText(/invited e•••@example\.com/)).toBeVisible();

  await page.getByRole("button", { name: "Accept and join" }).click();
  await expect(page.getByText(/sent to a different email address/)).toBeVisible();
  await page.goto("/w/acme-studio");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("owners change roles, and admins can't touch owners", async ({ page, browser }) => {
  await signIn(page, "alice@example.com");
  await page.goto("/w/acme-studio/settings");
  await page.getByLabel("Role for Carol Chen").selectOption("member");
  await expect(page.getByText("Carol Chen is now member.")).toBeVisible();
  await page.getByLabel("Role for Carol Chen").selectOption("viewer");
  await expect(page.getByText("Carol Chen is now viewer.")).toBeVisible();

  const dave = await (await browser.newContext()).newPage();
  await signIn(dave, "dave@example.com");
  await dave.goto("/w/acme-studio/settings");
  await expect(dave.getByLabel("Role for Carol Chen")).toBeVisible();
  await expect(dave.getByLabel("Role for Alice Adeyemi")).toHaveCount(0);
  await expect(dave.getByRole("heading", { name: "Transfer ownership" })).toHaveCount(0);
});

test("comments support mentions, editing and deleting", async ({ page }) => {
  await signIn(page, "alice@example.com");
  await page.goto(PRICING_TASK);
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("First draft of the tiers is in Figma.")).toBeVisible();

  const note = `Ship it on Friday ${Date.now()}`;
  await drawer.getByLabel("Write a comment").fill(`${note}, thanks `);
  await drawer.getByLabel("Mention someone").selectOption({ label: "Dave Mensah" });
  await expect(drawer.getByLabel("Write a comment")).toHaveValue(`${note}, thanks @Dave Mensah `);
  await drawer.getByRole("button", { name: "Comment", exact: true }).click();

  const comment = drawer.getByRole("listitem").filter({ hasText: note });
  await expect(comment.getByText("@Dave Mensah")).toBeVisible();

  await comment.getByRole("button", { name: "Edit" }).click();
  await comment.getByLabel("Edit comment").fill(`${note} (updated)`);
  await comment.getByRole("button", { name: "Save" }).click();
  await expect(drawer.getByText(`${note} (updated)`)).toBeVisible();
  await expect(drawer.getByText("(edited)").first()).toBeVisible();

  await drawer.getByRole("listitem").filter({ hasText: `${note} (updated)` }).getByRole("button", { name: "Delete" }).click();
  await expect(drawer.getByText(`${note} (updated)`)).toHaveCount(0);
});

test("files attach, download through an access check, and unsafe types are refused", async ({ page }) => {
  // Two uploads, a download and a delete: more than 30 seconds on a busy machine.
  test.slow();
  await signIn(page, "alice@example.com");
  await page.goto(PRICING_TASK);
  const drawer = page.getByRole("dialog");
  const fileName = `notes-${Date.now()}.txt`;

  await drawer.getByLabel("Attach a file").setInputFiles({ name: fileName, mimeType: "text/plain", buffer: Buffer.from("Pricing notes") });
  await expect(page.getByText(`${fileName} attached.`)).toBeVisible();
  const download = drawer.getByRole("link", { name: fileName });
  await expect(download).toBeVisible();

  const response = await page.request.get((await download.getAttribute("href")) ?? "");
  expect(response.ok()).toBe(true);
  expect(await response.text()).toBe("Pricing notes");

  await drawer.getByLabel("Attach a file").setInputFiles({
    name: "invoice.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("<html><script>alert(1)</script></html>"),
  });
  await expect(page.getByText(/That file type isn't allowed/)).toBeVisible();

  await drawer.getByRole("button", { name: `Delete ${fileName}` }).click();
  await expect(drawer.getByRole("link", { name: fileName })).toHaveCount(0);
});

test("viewers read comments and files but can't add either", async ({ page }) => {
  await signIn(page, "carol@example.com");
  await page.goto(PRICING_TASK);
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("First draft of the tiers is in Figma.")).toBeVisible();
  await expect(drawer.getByLabel("Write a comment")).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Attach a file" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("people outside the workspace can't download its attachments", async ({ page }) => {
  // Alice uploads a file and notes its download address.
  await signIn(page, "alice@example.com");
  await page.goto(PRICING_TASK);
  const fileName = `private-${Date.now()}.txt`;
  await page.getByRole("dialog").getByLabel("Attach a file").setInputFiles({ name: fileName, mimeType: "text/plain", buffer: Buffer.from("secret") });
  const href = await page.getByRole("dialog").getByRole("link", { name: fileName }).getAttribute("href");

  // Bob, from another tenant, tries the same address.
  await page.context().clearCookies();
  await signIn(page, "bob@example.com");
  const response = await page.request.get(href ?? "", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
});
