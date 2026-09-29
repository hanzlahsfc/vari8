import { expect, test } from "@playwright/test";

test("pro-dark theme tokens are applied", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "pro-dark");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(25, 25, 25)",
  );
  await expect(page.locator("body")).toHaveCSS("color", "rgb(255, 255, 255)");
});
