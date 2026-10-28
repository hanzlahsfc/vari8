import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { createWorkspaceInvitation } from "../../lib/workspace/invitations";
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

let clientProfileId: string | undefined;
let clientInviteHref = "";
let staffInviteHref = "";
let inviteTokenIds: string[] = [];

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
  await page.locator('input[name="email"]').fill(E2E.client);
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
  const [client, owner, ws] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: E2E.client } }),
    prisma.user.findUniqueOrThrow({ where: { email: E2E.owner } }),
    prisma.workspace.findUniqueOrThrow({ where: { slug: E2E.workspaceSlug } }),
  ]);

  const existing = await prisma.clientProfile.findFirst({
    where: { userId: client.id, workspaceId: ws.id },
  });
  if (existing) {
    clientProfileId = existing.id;
    if (existing.archivedAt) {
      await prisma.clientProfile.update({
        where: { id: existing.id },
        data: { archivedAt: null },
      });
    }
  } else {
    const created = await prisma.clientProfile.create({
      data: { userId: client.id, workspaceId: ws.id, name: "O17 Client" },
    });
    clientProfileId = created.id;
  }

  const clientInvite = await createWorkspaceInvitation(
    { user: { id: owner.id } },
    {
      workspaceId: ws.id,
      targetEmail: "o17-client-invite@s1h-e2e.test",
      intendedRole: "CLIENT",
    },
    prisma,
  );
  const staffInvite = await createWorkspaceInvitation(
    { user: { id: owner.id } },
    {
      workspaceId: ws.id,
      targetEmail: "o17-staff-invite@s1h-e2e.test",
      intendedRole: "COACH",
    },
    prisma,
  );
  inviteTokenIds = [clientInvite.invitationId, staffInvite.invitationId];
  clientInviteHref = `/invite?workspace=${ws.id}&token=${clientInvite.delivery.rawToken}`;
  staffInviteHref = `/invite?workspace=${ws.id}&token=${staffInvite.delivery.rawToken}`;
});

test.afterAll(async () => {
  if (inviteTokenIds.length > 0) {
    await prisma.accessToken.deleteMany({
      where: { id: { in: inviteTokenIds } },
    });
  }
  if (clientProfileId) {
    await prisma.clientProfile.update({
      where: { id: clientProfileId },
      data: { archivedAt: new Date() },
    });
  }
  await prisma.$disconnect();
});

for (const mode of ["dark", "light"] as const) {
  test(`the client auth routes paint the /me shell (${mode})`, async ({
    page,
  }) => {
    await seedMode(page, mode);

    // /me is the reference: the client screen's own root.
    await signInAsClient(page);
    await expect(page.locator(".eg-root")).toHaveCount(1);
    await expect(page.locator(".eg-root")).toHaveAttribute("data-mode", mode);
    const home = await computed(page, ".eg-root");
    expect(home["background-color"]).toBe(
      mode === "dark" ? "rgb(8, 8, 8)" : "rgb(245, 245, 245)",
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
        mode === "dark" ? "rgb(16, 16, 16)" : "rgb(255, 255, 255)",
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
  await page.locator('input[name="email"]').fill(E2E.client);
  await page.locator(".reset-form__submit").click();
  await expect(page.locator(".auth-success")).toBeVisible({ timeout: 30_000 });

  const lines = (await readFile(MAILBOX, "utf8")).trim().split("\n");
  const messages = lines.map(
    (line) => JSON.parse(line) as { to: string; text: string },
  );
  const mine = messages.filter((message) => message.to === E2E.client).at(-1);
  expect(mine?.text).toContain("/me/reset?token=");
});
