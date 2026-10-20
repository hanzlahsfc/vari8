import { expect, test } from "@playwright/test";

/**
 * O16 look guard, one rule: the auth routes render inside a canvas card.
 *
 * The rest of the auth suite drives the forms, so it stays green even when the
 * `.auth-card` wrapper is deleted: the fields, actions and copy survive, only
 * the look is lost. This asserts the computed canvas surface on the wrapper
 * itself, which is the thing that cannot be observed any other way.
 */
test("auth routes render inside the canvas card", async ({ page }) => {
  await page.goto("/login");

  const screen = page.locator(".auth-screen");
  await expect(screen).toHaveCSS("background-color", "rgb(7, 7, 7)");

  const card = page.locator(".auth-card");
  await expect(card).toHaveCount(1);
  await expect(card).toHaveCSS("background-color", "rgb(20, 20, 20)");
  await expect(card).toHaveCSS("border-radius", "12px");
});
