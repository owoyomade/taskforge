import { defineConfig, devices } from "@playwright/test";

// Tests get their own port so they never reuse a `npm run dev` server that
// happens to be running on 3000.
export const E2E_BASE_URL = "http://localhost:3100";

// End-to-end tests drive a real browser against a production build of the app
// and the local Supabase stack. Before running: `npm run db:start` and
// `npm run db:reset`. A production build is used rather than `next dev`
// because it's closer to what users get and stays stable under parallel tests.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // Two browsers at a time: each save re-renders a whole board, and more
  // parallel sessions than that overload a single local server and Supabase.
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
    // also spreads out sign-ins under Supabase's limit of 30 per 5 minutes.
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
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
