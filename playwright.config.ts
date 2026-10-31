import { defineConfig, devices } from "@playwright/test";

// Tests get their own port so they never reuse a `npm run dev` server that
// happens to be running on 3000.
export const E2E_BASE_URL = "http://localhost:3100";

// End-to-end tests drive a real browser against a production build of the app
// and the local database and Mailpit. Before running: `npm run db:up` and
// `npm run db:reset` (or use `npm run test:e2e:fresh`, which resets for you). A production build is used rather than `next dev`
// because it's closer to what users get and stays stable under parallel tests.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // Two browsers at a time: each save re-renders a whole board, and more
  // parallel sessions than that overload a single local server and database.
  workers: 2,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /(mobile|hardening)\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
    // Accessibility scans and security checks run once the feature tests
    // finish. Scanning ~30 pages is CPU-heavy, and running it alongside the
    // feature tests slowed the local server enough to make them flaky. It
    // also spreads out sign-ins under the per-address sign-in limits.
    {
      name: "hardening",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /hardening\.spec\.ts/,
      dependencies: ["desktop", "mobile"],
    },
  ],
  webServer: {
    command: "npm run build && npx next start --port 3100",
    url: E2E_BASE_URL,
    env: {
      // The suite signs in many times from one address; raise (not remove) the per-address limits.
      AUTH_IP_LIMIT_MULTIPLIER: "20",
      // Emailed links and sign-in redirects point at the test server itself,
      // so the tests never depend on a dev server running on port 3000.
      NEXT_PUBLIC_SITE_URL: E2E_BASE_URL,
    },
    // Always a fresh build: reusing a server left running from an earlier
    // run would quietly test old code.
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
