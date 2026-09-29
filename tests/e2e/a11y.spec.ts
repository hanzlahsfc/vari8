import { expect, test } from "@playwright/test";

const ROUTES = [
  "/",
  "/sheets",
  "/sheets/daily-tracker",
  "/library/foods",
  "/library/exercises",
  "/daily", // dev-only prototype, enabled for the test server
];

test("each page has a single h1 and labelled primary navigation", async ({
  page,
}) => {
  for (const route of ROUTES) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();
  }
});

test("library tables expose scoped column headers", async ({ page }) => {
  await page.goto("/library/foods");
  await expect(page.locator(".library-table thead th").first()).toHaveAttribute(
    "scope",
    "col",
  );
});

test("sheet grid region is focusable and labelled", async ({ page }) => {
  await page.goto("/sheets/dashboard");
  const region = page.getByRole("region", { name: "DASHBOARD grid" });
  await expect(region).toBeVisible();
  await expect(region).toHaveAttribute("tabindex", "0");
});
