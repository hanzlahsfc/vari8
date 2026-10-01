import { expect, test } from "@playwright/test";

// The committed catalog artifacts are synthetic fixtures (see
// tests/unit/source-data-policy.test.ts); real catalog data lives in PostgreSQL
// via the trusted import. These tests assert the libraries render the fixture.
test("foods library shows synthetic fixture rows and preserves source order/fields", async ({
  page,
}) => {
  await page.goto("/library/foods");
  await expect(
    page.getByRole("heading", { name: "Foods", level: 1 }),
  ).toBeVisible();
  await expect(page.locator(".library-count")).toHaveText("3 of 3 rows");
  await expect(page.locator(".library-table thead th")).toHaveCount(10);
  await expect(page.locator(".library-table tbody tr").first()).toContainText(
    "SYNTHETIC FIXTURE FOOD ALPHA",
  );
});

test("foods search filters results without navigating", async ({ page }) => {
  await page.goto("/library/foods");
  const url = page.url();
  await page.getByLabel("Search").fill("BETA");
  await page.keyboard.press("Enter");
  expect(page.url()).toBe(url); // read-only, no submit/navigation
  await expect(page.locator(".library-count")).toContainText("of 3 rows");
  await expect(page.locator(".library-table tbody tr").first()).toContainText(
    "SYNTHETIC FIXTURE FOOD BETA",
  );
});

test("foods category filter restricts results", async ({ page }) => {
  await page.goto("/library/foods");
  await page.getByLabel("Category").selectOption("SYNTHETIC-A");
  await expect(page.locator(".library-count")).not.toHaveText("3 of 3 rows");
  await expect(page.locator(".library-count")).toContainText("of 3 rows");
  await expect(page.locator(".library-table tbody tr").first()).toContainText(
    "SYNTHETIC FIXTURE FOOD ALPHA",
  );
});

test("exercises library filters by muscle group", async ({ page }) => {
  await page.goto("/library/exercises");
  await expect(
    page.getByRole("heading", { name: "Exercises", level: 1 }),
  ).toBeVisible();
  await expect(page.locator(".library-count")).toHaveText("2 of 2 rows");
  await page.getByLabel("Muscle group").selectOption("Synthetic Group B");
  await expect(page.locator(".library-count")).toContainText("of 2 rows");
  await expect(page.locator(".library-table tbody tr").first()).toContainText(
    "Synthetic Group B",
  );
});
