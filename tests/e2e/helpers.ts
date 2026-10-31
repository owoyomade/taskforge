import { expect, type Page } from "@playwright/test";

import { E2E_BASE_URL } from "../../playwright.config";

// Locally, every email the app sends lands in Mailpit (docker-compose.yml).
// Its API lets tests open the confirmation or reset link like a real user.
const MAILPIT_URL = "http://127.0.0.1:8025";

export const SEED_PASSWORD = "Password123";

/** A unique address per test run so tests never collide with each other. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}

/** Waits for the newest email sent to `to` and returns the first auth link in it. */
export function latestAuthLink(to: string): Promise<string> {
  // Confirmation and reset links both go through the sign-in library at /api/auth/.
  return latestEmailLink(to, "/api/auth/");
}

/**
 * Waits for an email to `to` with a link whose path starts with `pathPrefix`
 * and returns that link from the newest such email. Other emails to the
 * same address (a sign-up confirmation, say) are skipped.
 */
export async function latestEmailLink(to: string, pathPrefix: string): Promise<string> {
  let link: string | undefined;

  await expect
    .poll(
      async () => {
        const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
        const { messages } = (await search.json()) as { messages: { ID: string }[] }; // newest first

        for (const { ID } of messages) {
          const message = await fetch(`${MAILPIT_URL}/api/v1/message/${ID}`);
          const { HTML } = (await message.json()) as { HTML: string };
          const href = [...HTML.matchAll(/href="([^"]*)"/g)]
            .map((match) => match[1].replaceAll("&amp;", "&"))
            .find((candidate) => URL.canParse(candidate) && new URL(candidate).pathname.startsWith(pathPrefix));
          // Emails point at the Site URL (port 3000); send the test to its own server instead.
          if (href) {
            const emailed = new URL(href);
            link = new URL(emailed.pathname + emailed.search, E2E_BASE_URL).toString();
            break;
          }
        }
        return link;
      },
      { message: `waiting for an email to ${to} linking to ${pathPrefix}`, timeout: 15_000 },
    )
    .toBeTruthy();

  return link as string;
}

export async function signIn(page: Page, email: string, password = SEED_PASSWORD) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/w\//);
}

/** Signs up, confirms the email through Mailpit, and lands on onboarding. */
export async function signUpAndConfirm(page: Page, name: string, email: string, password: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await page.goto(await latestAuthLink(email));
  await expect(page).toHaveURL(/\/onboarding$/);
}
