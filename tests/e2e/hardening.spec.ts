import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";
import path from "node:path";

import { signIn } from "./helpers";

/**
 * Alice's signed-in session, created once per worker and reused by every
 * test that asks for it. Signing in for each of the ~30 page checks would
 * trip Supabase's limit of 30 sign-ins per 5 minutes from one address and
 * fail unrelated tests.
 */
const test = base.extend<object, { aliceSession: string }>({
  aliceSession: [
    async ({ browser }, provide, workerInfo) => {
      const file = path.join(workerInfo.project.outputDir, `alice-session-${workerInfo.workerIndex}.json`);
      // A hand-made browser context doesn't inherit the config's baseURL.
      const context = await browser.newContext({ baseURL: workerInfo.project.use.baseURL });
      await signIn(await context.newPage(), "alice@example.com");
      await context.storageState({ path: file });
      await context.close();
      await provide(file);
    },
    { scope: "worker" },
  ],
});

// Uses the seed data from supabase/seed.sql.
const WEBSITE_PROJECT = "/w/acme-studio/p/30000000-0000-4000-8000-000000000001";
const SEED_TASK = "60000000-0000-4000-8000-000000000001";

/**
 * Runs axe (an automated accessibility checker) against the page as it is
 * now, for WCAG 2.2 level A and AA rules, and fails with a readable list of
 * problems. Automated checks catch roughly a third of real issues; keyboard
 * and screen reader testing by a person is still needed.
 */
async function expectNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const problems = results.violations.map(
    (violation) => `${violation.id} (${violation.impact}): ${violation.help}\n    ${violation.nodes.map((node) => node.target.join(" ")).join("\n    ")}`,
  );
  expect.soft(problems, `Accessibility problems on ${page.url()}`).toEqual([]);
}

/** Collects Content Security Policy violations reported in the browser console. */
function watchForCspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  return violations;
}

// One test per page keeps failures easy to read and each test well inside
// its time limit (an axe scan takes a few seconds on a busy page).
const SIGNED_OUT_PAGES = ["/", "/sign-in", "/sign-up", "/forgot-password"];
const SIGNED_IN_PAGES = [
  "/w/acme-studio",
  "/w/acme-studio/inbox",
  "/w/acme-studio/activity",
  "/w/acme-studio/settings",
  "/w/acme-studio/projects/new",
  "/account",
  ...["", "/board", "/list", "/timeline", "/overview", "/activity", "/settings"].map((view) => `${WEBSITE_PROJECT}${view}`),
];

test.describe("accessibility", () => {
  // Signing in plus a full scan can pass 30 seconds while the server is still warming up.
  test.describe.configure({ timeout: 60_000 });

  for (const pagePath of SIGNED_OUT_PAGES) {
    test(`signed out: ${pagePath}`, async ({ page }) => {
      await page.goto(pagePath);
      await expectNoAccessibilityViolations(page);
    });
  }

  test.describe("signed in", () => {
    test.use({ storageState: async ({ aliceSession }, provide) => provide(aliceSession) });

    for (const theme of ["light", "dark"] as const) {
      for (const pagePath of SIGNED_IN_PAGES) {
        test(`${theme}: ${pagePath.replace(WEBSITE_PROJECT, "project")}`, async ({ page }) => {
          // The theme is the person's choice (user menu → Appearance), which
          // next-themes keeps in localStorage under "theme".
          await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
          await page.goto(pagePath);
          await expectNoAccessibilityViolations(page);
        });
      }
    }

    test("the task drawer", async ({ page }) => {
      await page.goto(`${WEBSITE_PROJECT}/board?task=${SEED_TASK}`);
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoAccessibilityViolations(page);
    });
  });
});

test.describe("security", () => {
  test("pages send security headers and run without CSP violations", async ({ page }) => {
    const violations = watchForCspViolations(page);
    const response = await page.goto("/sign-in");
    const headers = response?.headers() ?? {};
    expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"]).toBeUndefined();

    // Interactive pages still work under the policy: signing in and opening a
    // board both need client-side JavaScript.
    await signIn(page, "alice@example.com");
    await page.goto(`${WEBSITE_PROJECT}/board`);
    await expect(page.getByRole("button", { name: "Move Write homepage copy" }).first()).toBeVisible();
    expect(violations).toEqual([]);
  });

  test("each page load gets a different nonce", async ({ request }) => {
    const first = (await request.get("/sign-in")).headers()["content-security-policy"];
    const second = (await request.get("/sign-in")).headers()["content-security-policy"];
    expect(first).not.toBe(second);
  });

  test("the health check reports the database is reachable", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(await response.json()).toMatchObject({ status: "ok", database: "ok" });
  });
});

test("keyboard users can skip past the sidebar", async ({ page }) => {
  await signIn(page, "alice@example.com");
  await page.goto("/w/acme-studio");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("people can switch between light and dark from the user menu", async ({ page }) => {
  await signIn(page, "alice@example.com");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: /Alice Adeyemi/ }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
