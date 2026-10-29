import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test("the workspace layout fits a phone screen and the menu opens", async ({ page }) => {
  await signIn(page, "alice@example.com");

  const hasHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalScroll).toBe(false);

  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Team and settings" }).click();
  await expect(page).toHaveURL(/\/w\/acme-studio\/settings$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
