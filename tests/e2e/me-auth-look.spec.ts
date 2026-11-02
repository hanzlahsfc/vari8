import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { createWorkspaceInvitation } from "../../lib/workspace/invitations";
import { hashPassword } from "../../lib/password";
import {
  cleanupMeLookFixtures,
  newMeLookOwned,
  setupMeLookFixtures,
  type MeLookFixture,
} from "./me-look-fixture";
import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * O17 look guard: the client sign-in routes must paint the same shell the
 * client screen /me paints (`.eg-root`, ethereal-shell.css), not the coach
 * one. The rest of the auth suite drives the forms and stays green when the
 * root class or the stylesheet import is dropped, so this spec measures the
 * running pages instead: the root's computed background, ink and font on /me,
 * then the same on /me/login, /me/reset-request, /me/reset and a client
 * /invite, in both modes.
 *
 * It also guards the role rules that a click cannot show: a signed-out /me
 * lands on /me/login, a coach signing in there still reaches /coach, the
 * client reset mail points at /me/reset, and a staff invitation keeps the
 * coach look.
 *
 * Fixtures are the reserved E2E rows (tests/e2e/global-setup.ts) plus one
 * unarchived ClientProfile for E2E.client and one CLIENT invitation, both
 * removed in afterAll.
 */

const prisma = new PrismaClient({
  datasources: { db: { url: e2eDatabaseUrl() } },
});

// The reset routes fail closed unless the e2e server has a mail adapter, and
// `next start` is NODE_ENV=production (no implicit dev-file default). Run this
// spec with MAIL_DELIVERY_ADAPTER=dev-file to measure them.
const DELIVERY_UP = process.env.MAIL_DELIVERY_ADAPTER === "dev-file";
const MAILBOX =
  process.env.DEV_MAILBOX_FILE ??
  path.join(process.cwd(), "var", "mailbox.jsonl");

const PROPS = ["background-color", "color", "font-family"] as const;

// Spec-owned fixtures via ./me-look-fixture: per-invocation identities,
// resources recorded the moment each create returns, and cleanup that
// deletes only owned rows, in restrict-safe order, reporting failures
// instead of masking the original error. The shared s1h-e2e-workspace's
// authoritative appearanceMode is never touched.
const owned = newMeLookOwned();
let fixture: MeLookFixture | undefined;
let clientInviteHref = "";
let staffInviteHref = "";

function fx(): MeLookFixture {
  if (!fixture) throw new Error("me-look fixtures were not set up");
  return fixture;
}

type Look = Record<(typeof PROPS)[number], string>;

async function computed(page: Page, selector: string): Promise<Look> {
  const look = await page.evaluate(
    ([selector, props]) => {
      const el = document.querySelector(selector as string);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const out: Record<string, string> = {};
      for (const prop of props as string[])
        out[prop] = cs.getPropertyValue(prop);
      return out;
    },
    [selector, PROPS as unknown as string[]],
  );
  if (!look) throw new Error(`No element matched ${selector}`);
  return look as Look;
}

/** The ethereal font is loaded, not merely named in a stack. */
async function fontLoaded(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('16px "Ethereal Geist"');
  });
}

async function signInAsClient(page: Page) {
  await page.goto("/me/login");
  await page.locator('input[name="email"]').fill(fx().clientEmail);
  await page.locator('input[name="password"]').fill(E2E.password);
  await page.locator(".auth-button").click();
  await page.waitForURL(/\/me$/, { timeout: 30_000 });
}

function seedMode(page: Page, mode: "light" | "dark") {
  return page.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key as string, value as string);
      } catch {}
    },
    [
      "coaching-ethereal-appearance-v1",
      JSON.stringify({ mode, accent: "#EB91B8", font: "sans" }),
    ],
  );
}

test.beforeAll(async () => {
  fixture = await setupMeLookFixtures(
    prisma,
    {
      hashPassword,
      createInvitation: (owner, input) =>
        createWorkspaceInvitation(owner, input, prisma),
    },
    owned,
  );
  clientInviteHref = fixture.clientInviteHref;
  staffInviteHref = fixture.staffInviteHref;
});

test.afterAll(async () => {
  // Deletes only rows this run created; a mid-setup throw still leaves
  // `owned` complete enough to clean. Failures are reported after every
  // safe attempt, never masking the original setup/test error.
  const errors = await cleanupMeLookFixtures(prisma, owned);
  await prisma.$disconnect();
  if (errors.length > 0) {
    throw new Error(
      `me-look fixture cleanup failed: ${errors
        .map((e) => e.message)
        .join("; ")}`,
    );
  }
});

for (const mode of ["dark", "light"] as const) {
  test(`the client auth routes paint the /me shell (${mode})`, async ({
    page,
  }) => {
    await seedMode(page, mode);
    // The spec-owned workspace's authoritative appearance overrides the
    // stored seed (mergeWorkspaceAppearance); the seeded preference alone
    // cannot flip the shell while the workspace policy says otherwise.
    // Only this spec's workspace is mutated — parallel lanes are isolated.
    await prisma.workspace.update({
      where: { id: fx().workspaceId },
      data: { appearanceMode: mode === "light" ? "LIGHT" : "DARK" },
    });

    // /me is the reference: the client screen's own root.
    await signInAsClient(page);
    await expect(page.locator(".eg-root")).toHaveCount(1);
    await expect(page.locator(".eg-root")).toHaveAttribute("data-mode", mode);
    const home = await computed(page, ".eg-root");
    expect(home["background-color"]).toBe(
      // --v8-canvas: #0B0B0C / #F2F2F4 (lib/canvas/vari8-theme.ts)
      mode === "dark" ? "rgb(11, 11, 12)" : "rgb(242, 242, 244)",
    );
    expect(home["font-family"]).toContain("Ethereal Geist");
    expect(await fontLoaded(page)).toBe(true);

    const paths = [
      "/me/login",
      "/me/reset-request",
      "/me/reset?token=not-a-real-token",
      clientInviteHref,
    ];
    for (const url of paths) {
      const response = await page.goto(url);
      if (response?.status() === 404) {
        // Reset routes close without a mail adapter; the run that matters
        // sets MAIL_DELIVERY_ADAPTER=dev-file.
        expect(DELIVERY_UP, `${url} 404s without a mail adapter`).toBe(false);
        continue;
      }

      // The root /me mounts must be the root here, or the look is gone.
      const root = page.locator(".eg-root");
      await expect(root, `${url} must mount the eg root`).toHaveCount(1);
      await expect(root).toHaveAttribute("data-mode", mode);
      expect(await computed(page, ".eg-root")).toEqual(home);
      expect(await fontLoaded(page), `${url} must load Ethereal Geist`).toBe(
        true,
      );

      const screen = page.locator(".auth-screen");
      await expect(screen).toHaveCount(1);
      await expect(screen).toHaveClass(/eg-auth/);
      // The page wash comes from .eg-root, not from a restated colour.
      expect((await computed(page, ".auth-screen"))["background-color"]).toBe(
        home["background-color"],
      );

      // The card is the one wrapper these routes add: the eg surface.
      const card = page.locator(".auth-card");
      await expect(card).toHaveCSS(
        "background-color",
        // --v8-surface: #161618 / #FFFFFF (lib/canvas/vari8-theme.ts)
        mode === "dark" ? "rgb(22, 22, 24)" : "rgb(255, 255, 255)",
      );
      const shadow = await card.evaluate(
        (el) => getComputedStyle(el).boxShadow,
      );
      expect(shadow, `${url} card keeps the canvas edge`).toContain("inset");
      expect(await card.evaluate((el) => getComputedStyle(el).fontFamily)).toBe(
        home["font-family"],
      );
    }

    // A staff invitation keeps the coach look: no eg root at all.
    await page.goto(staffInviteHref);
    await expect(page.locator(".coach-root")).toHaveCount(1);
    await expect(page.locator(".eg-root")).toHaveCount(0);
  });
}

test("signed out, /me sends the visitor to the client sign-in", async ({
  page,
}) => {
  await page.goto("/me");
  await page.waitForURL(/\/me\/login$/, { timeout: 30_000 });
  await expect(page.locator(".eg-root")).toHaveCount(1);
});

test("a coach signing in at /me/login still lands on /coach", async ({
  page,
}) => {
  await page.goto("/me/login");
  await page.locator('input[name="email"]').fill(E2E.coach);
  await page.locator('input[name="password"]').fill(E2E.password);
  await page.locator(".auth-button").click();
  await page.waitForURL(/\/coach$/, { timeout: 30_000 });
  await expect(page.locator(".coach-root")).toHaveCount(1);
});

test("the client reset mail links to /me/reset", async ({ page }) => {
  test.skip(!DELIVERY_UP, "mail delivery adapter not configured");
  await page.goto("/me/reset-request");
  await page.locator('input[name="email"]').fill(fx().clientEmail);
  await page.locator(".reset-form__submit").click();
  await expect(page.locator(".auth-success")).toBeVisible({ timeout: 30_000 });

  const lines = (await readFile(MAILBOX, "utf8")).trim().split("\n");
  const messages = lines.map(
    (line) => JSON.parse(line) as { to: string; text: string },
  );
  const mine = messages
    .filter((message) => message.to === fx().clientEmail)
    .at(-1);
  expect(mine?.text).toContain("/me/reset?token=");
});
