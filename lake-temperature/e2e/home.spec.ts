import { expect, test } from "@playwright/test";

test("home page renders without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ice Warriors");
  await expect(page.locator("#current")).toBeVisible();
  await expect(page.locator("#history")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("history range controls can be selected", async ({ page }) => {
  await page.goto("/");
  const buttons = page.locator("#range-controls button");
  expect(await buttons.count()).toBeGreaterThan(1);
  await buttons.nth(1).click();
  await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
});

test("theme toggle switches mode", async ({ page }) => {
  await page.goto("/");
  const toggle = page.locator("#theme-toggle");
  test.skip(!(await toggle.isVisible()), "theme toggle is hidden on this viewport");
  await expect(toggle).toHaveAttribute("aria-pressed", /true|false/);
  const before = await toggle.getAttribute("aria-pressed");
  await toggle.click();
  await expect(toggle).not.toHaveAttribute("aria-pressed", before!);
});
