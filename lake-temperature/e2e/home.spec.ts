import { expect, test } from "@playwright/test";

test("home page shows the current temperature dashboard", async ({ page }) => {
  await page.goto("/temperature");

  await expect(page.getByRole("heading", { name: "Current water temperature" })).toBeVisible();
  await expect(page.locator("#stats")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Temperature history" })).toBeVisible();
  await expect(page.getByRole("group", { name: "History range" })).toBeVisible();
});
