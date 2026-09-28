import { expect, test } from "@playwright/test";

test("shell renders", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("App");
  await expect(page.getByRole("heading", { name: "App" })).toBeVisible();
});
