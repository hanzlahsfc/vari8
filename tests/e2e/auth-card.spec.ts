import { expect, test, type Page } from "@playwright/test";

import { E2E } from "./global-setup";

/**
 * O16 look guard: the auth routes must paint the same shell as the canvas root
 * that / sends every coach to, which is /coach (.coach-root, coach.css).
 *
 * The rest of the auth suite drives the forms, so it stays green when the
 * shared stylesheet import or the root class is dropped: fields, actions and
 * copy survive and only the look is lost. This signs in, reads the computed
 * background, font and shadow of the real canvas root on /coach, then reads
 * the same three properties on every auth route and fails on any difference,
 * in both themes.
 */

const AUTH_PAGES = [
  "/login",
  "/signup",
  "/reset-request",
  "/reset?token=not-a-real-token",
  "/invite?workspace=canvas-demo&token=not-a-real-token",
];

const PROPS = ["background-color", "font-family", "box-shadow"] as const;

type RootStyle = Record<(typeof PROPS)[number], string> & { cls: string };

async function rootStyle(page: Page, selector: string): Promise<RootStyle> {
  const style = await page.evaluate(
    ([selector, props]) => {
      const el = document.querySelector(selector as string);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const out: Record<string, string> = {
        cls: el.className,
      };
      for (const prop of props as string[]) {
        out[prop] = cs.getPropertyValue(prop);
      }
      return out;
    },
    [selector, PROPS as unknown as string[]],
  );
  if (!style) throw new Error(`No element matched ${selector}`);
  return style as RootStyle;
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(E2E.coach);
  await page.locator('input[name="password"]').fill(E2E.password);
  await page.locator(".auth-button").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
}

/** The canvas root /coach renders, measured live, dark by default. */
async function canvasRoot(page: Page, theme: "pro-dark" | "pro-white") {
  await signIn(page);
  await page.goto("/coach");
  await expect(page.locator(".coach-root")).toHaveCount(1);
  if (theme === "pro-white") {
    await page.locator('[aria-label="Switch to light mode"]').click();
    await expect(page.locator(".coach-root")).toHaveAttribute(
      "data-mode",
      "light",
    );
  }
  return rootStyle(page, ".coach-root");
}

for (const theme of ["pro-dark", "pro-white"] as const) {
  test(`auth pages paint the coach canvas root (${theme})`, async ({
    page,
  }) => {
    const canvas = await canvasRoot(page, theme);

    // The auth routes follow the app's own theme switch, not data-mode.
    await page.addInitScript((value) => {
      try {
        localStorage.setItem("appearance", value);
      } catch {}
    }, theme);

    for (const path of AUTH_PAGES) {
      const response = await page.goto(path);
      // The password-reset routes 404 while no mail adapter is registered
      // (mailDeliveryConfigured), and a closed route renders nothing to
      // compare. They are measured on the dev server in the card report.
      if (response?.status() === 404) continue;
      const screen = page.locator(".auth-screen");
      await expect(screen).toHaveCount(1);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(screen).toHaveClass(/coach-root/);

      const auth = await rootStyle(page, ".auth-screen");
      for (const prop of PROPS) {
        expect(
          { page: path, prop, value: auth[prop] },
          `${path} ${prop} must match the canvas root on /coach`,
        ).toEqual({ page: path, prop, value: canvas[prop] });
      }
    }

    // The card is the one wrapper the auth routes add; guard its surface too.
    await page.goto("/login");
    const card = page.locator(".auth-card");
    await expect(card).toHaveCount(1);
    await expect(card).toHaveCSS("border-radius", "12px");
    await expect(card).toHaveCSS(
      "background-color",
      theme === "pro-dark" ? "rgb(16, 16, 16)" : "rgb(255, 255, 255)",
    );
  });
}
