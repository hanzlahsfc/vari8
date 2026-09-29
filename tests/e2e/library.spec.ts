import { expect, test } from "@playwright/test";

test("foods library shows committed rows and preserves source order/fields", async ({ page }) => {
  await page.goto("/library/foods");
  await expect(page.getByRole("heading", { name: "Foods", level: 1 })).toBeVisible();
  await expect(page.locator(".library-count")).toHaveText("599 of 599 rows");
  await expect(page.locator(".library-table thead th")).toHaveCount(10);
  await expect(page.locator(".library-table tbody tr").first()).toContainText("Chicken Breast (Cooked)");
});

test("foods search filters results without navigating", async ({ page }) => {
  await page.goto("/library/foods");
  const url = page.url();
  await page.getByLabel("Search").fill("Oats");
  await page.keyboard.press("Enter");
  expect(page.url()).toBe(url); // read-only, no submit/navigation
  await expect(page.locator(".library-count")).toContainText("of 599 rows");
  await expect(page.locator(".library-table tbody tr").first()).toContainText("Oats");
});

test("foods category filter restricts results", async ({ page }) => {
  await page.goto("/library/foods");
  await page.getByLabel("Category").selectOption("PRO");
  await expect(page.locator(".library-count")).not.toHaveText("599 of 599 rows");
  await expect(page.locator(".library-table tbody tr").first()).toContainText("Chicken Breast");
});

test("exercises library filters by muscle group", async ({ page }) => {
  await page.goto("/library/exercises");
  await expect(page.getByRole("heading", { name: "Exercises", level: 1 })).toBeVisible();
  await expect(page.locator(".library-count")).toHaveText("546 of 546 rows");
  await page.getByLabel("Muscle group").selectOption("Core");
  await expect(page.locator(".library-count")).toContainText("of 546 rows");
  await expect(page.locator(".library-table tbody tr").first()).toContainText("Core");
});
