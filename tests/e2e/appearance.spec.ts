import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * FI-I3 — bounded light/dark appearance control on the primary test
 * server (:3000). Browser-local preference only: validated identifier
 * under the dedicated `appearance` localStorage key; default pro-dark
 * when absent/malformed; no account persistence or sensitive data.
 */

const BASE = "http://127.0.0.1:3000";

let prisma: PrismaClient;
let wsId = "";

async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const theme = (page: Page) => page.locator("html").getAttribute("data-theme");
const stored = (page: Page) =>
  page.evaluate(() => localStorage.getItem("appearance"));

const lightBtn = (page: Page) =>
  page.getByRole("button", { name: "Light theme" });
const darkBtn = (page: Page) =>
  page.getByRole("button", { name: "Dark theme" });

test.beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });
  wsId = (
    await prisma.workspace.findUniqueOrThrow({
      where: { slug: E2E.workspaceSlug },
    })
  ).id;
});
test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("FI-I3 appearance control", () => {
  test("default is pro-dark with no preference; controls present on staff + client shells", async ({
    page,
  }) => {
    await page.goto(`${BASE}/login`);
    await page.evaluate(() => localStorage.clear());
    await signIn(page, E2E.owner);
    await page.goto(`${BASE}/workspace/${wsId}/clients`);
    expect(await theme(page)).toBe("pro-dark");
    // Staff surface exposes the toggle.
    await expect(lightBtn(page)).toBeVisible();
    await expect(darkBtn(page)).toBeVisible();
    await expect(darkBtn(page)).toHaveAttribute("aria-pressed", "true");
    await expect(lightBtn(page)).toHaveAttribute("aria-pressed", "false");
    // Client surface (tracker shell) exposes the same toggle.
    const ctx = await page.context().browser()!.newContext();
    const client = await ctx.newPage();
    await client.goto(`${BASE}/login`);
    await client.evaluate(() => localStorage.clear());
    await signIn(client, E2E.client);
    await client.goto(`${BASE}/workspace/${wsId}/home`);
    expect(await theme(client)).toBe("pro-dark");
    await expect(lightBtn(client)).toBeVisible();
    await ctx.close();
  });

  test("switching applies each existing theme, persists across reload and navigation", async ({
    page,
  }) => {
    await page.goto(`${BASE}/login`);
    await page.evaluate(() => localStorage.clear());
    await signIn(page, E2E.owner);
    await page.goto(`${BASE}/workspace/${wsId}/clients`);
    await lightBtn(page).click();
    expect(await theme(page)).toBe("pro-white");
    expect(await stored(page)).toBe("pro-white");
    await expect(lightBtn(page)).toHaveAttribute("aria-pressed", "true");
    // Light theme applies real token colors (pro-white background).
    const bg = await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe("rgb(25, 25, 25)");
    // Persists across a full reload.
    await page.reload();
    expect(await theme(page)).toBe("pro-white");
    // And across navigation to another surface.
    await page.goto(`${BASE}/workspace/${wsId}`);
    expect(await theme(page)).toBe("pro-white");
    // Back to dark.
    await darkBtn(page).click();
    expect(await theme(page)).toBe("pro-dark");
    expect(await stored(page)).toBe("pro-dark");
    await page.reload();
    expect(await theme(page)).toBe("pro-dark");
  });

  test("malformed and foreign stored values fall back to pro-dark and are not applied", async ({
    page,
  }) => {
    await page.goto(`${BASE}/login`);
    await signIn(page, E2E.owner);
    for (const bad of [
      "not-a-theme",
      "pro-dark;x{}",
      "light",
      "PRO-DARK",
      "",
    ]) {
      await page.evaluate((v) => localStorage.setItem("appearance", v), bad);
      await page.goto(`${BASE}/workspace/${wsId}/clients`);
      expect(await theme(page)).toBe("pro-dark");
    }
    // Injection attempt stored as a raw string is never executed/styled.
    await page.goto(`${BASE}/login`);
    await page.evaluate(() =>
      localStorage.setItem(
        "appearance",
        '"}</style><script>window.__injected=1</script>',
      ),
    );
    await signIn(page, E2E.owner);
    await page.goto(`${BASE}/workspace/${wsId}/clients`);
    expect(await theme(page)).toBe("pro-dark");
    expect(
      await page.evaluate(
        () => (window as unknown as { __injected?: number }).__injected,
      ),
    ).toBe(undefined);
  });

  test("unavailable storage: toggle still switches for the session without throwing", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("denied", "SecurityError");
      };
      Storage.prototype.getItem = () => {
        throw new DOMException("denied", "SecurityError");
      };
    });
    await page.goto(`${BASE}/login`);
    await signIn(page, E2E.owner);
    await page.goto(`${BASE}/workspace/${wsId}/clients`);
    expect(await theme(page)).toBe("pro-dark");
    await lightBtn(page).click();
    expect(await theme(page)).toBe("pro-white");
    await darkBtn(page).click();
    expect(await theme(page)).toBe("pro-dark");
  });

  test("keyboard operation + selected state at 1440/834/390; no overflow; no sensitive storage", async ({
    page,
  }) => {
    for (const w of [1440, 834, 390]) {
      await page.setViewportSize({ width: w, height: 900 });
      await signIn(page, E2E.owner);
      await page.goto(`${BASE}/workspace/${wsId}/clients`);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
      const btn = lightBtn(page);
      await btn.focus();
      await expect(btn).toBeFocused();
      const box = await btn.boundingBox();
      expect(box && box.height >= 24).toBe(true);
      await page.keyboard.press("Enter");
      expect(await theme(page)).toBe("pro-white");
      await darkBtn(page).click();
      expect(await theme(page)).toBe("pro-dark");
    }
    // Only the permitted identifier is stored — no identity/client data.
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(
      keys
        .filter((k) => !/^appearance$/.test(k))
        .filter((k) =>
          /entry|measure|checkin|client|track|answer|user|workspace/i.test(k),
        ),
    ).toEqual([]);
    const value = await stored(page);
    expect(["pro-dark", "pro-white", null]).toContain(value);
  });
});
