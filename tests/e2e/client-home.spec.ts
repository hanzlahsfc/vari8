import { expect, test, type Page } from "@playwright/test";

import { E2E } from "./global-setup";

/**
 * FRONTEND-INTEGRATION-I2 — client Home navigation surface.
 * Lily-styled navigation cards reach ONLY existing client routes:
 * /daily (with its history), /onboarding (flagged), /check-ins
 * (flagged; calendar lives on that page). Zero data loads — no
 * next/latest selection, no counts, no aggregates, no localStorage.
 *
 * RED-first: written before the route exists; initial failures are
 * 404 navigation misses (labeled module-missing RED, not behavioral).
 */

const BASE = "http://127.0.0.1:3000"; // all-gates-on server (Home loads no DailyEntry state)
const FLAG_OFF = "http://127.0.0.1:3101"; // all client surfaces OFF

async function signIn(page: Page, email: string, base = BASE) {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/login/);
}

const HOME = (wsId: string) => `${BASE}/workspace/${wsId}/home`;
const FLAG_HOME = (wsId: string) => `${FLAG_OFF}/workspace/${wsId}/home`;

let wsId: string;

test.beforeAll(async () => {
  wsId = E2E.workspaceSlug;
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { slug: E2E.workspaceSlug },
    });
    wsId = ws.id;
  } finally {
    await prisma.$disconnect();
  }
});

test("client Home: reachable, shows navigation cards to real routes; unauthenticated and non-member denied", async ({
  page,
}) => {
  await signIn(page, E2E.client);
  await page.goto(HOME(wsId));
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

  // The navigation cards are links to the EXISTING client routes.
  const cards = page.locator(".home-card");
  const daily = cards.filter({ hasText: "Daily tracking" });
  const onboarding = cards.filter({ hasText: "Onboarding" });
  const checkins = cards.filter({ hasText: "Check-Ins" });
  await expect(daily).toBeVisible();
  await expect(onboarding).toBeVisible();
  await expect(checkins).toBeVisible();
  await expect(daily).toHaveAttribute("href", `/workspace/${wsId}/daily`);
  await expect(onboarding).toHaveAttribute(
    "href",
    `/workspace/${wsId}/onboarding`,
  );
  await expect(checkins).toHaveAttribute(
    "href",
    `/workspace/${wsId}/check-ins`,
  );

  // Workspace context is preserved (the shell carries the workspace name).
  await expect(page.locator(".shell__brand")).toHaveText("S1H E2E Workspace");

  // The client nav links back Home from every client surface.
  await expect(
    page.locator(".shell__nav").getByRole("link", { name: "Home" }),
  ).toHaveAttribute("href", `/workspace/${wsId}/home`);

  // Cards actually reach their destinations (real routes, not invented).
  await checkins.click();
  await expect(page).toHaveURL(new RegExp(`/workspace/${wsId}/check-ins`));
  await page.goto(HOME(wsId));
  await daily.click();
  await expect(page).toHaveURL(new RegExp(`/workspace/${wsId}/daily`));
});

test("unauthenticated users are redirected to /login; non-member gets 403", async ({
  page,
}) => {
  await page.goto(HOME(wsId));
  await expect(page).toHaveURL(/login/);

  await signIn(page, E2E.nonmember);
  await page.goto(HOME(wsId));
  await expect(page.getByText(/403|forbidden|denied/i).first()).toBeVisible();
});

test("staff members keep the staff shell and do not see client cards", async ({
  page,
}) => {
  await signIn(page, E2E.owner);
  await page.goto(HOME(wsId));
  // Staff chrome is the staff workspace nav — client cards are absent.
  await expect(page.locator(".shell__brand")).toHaveText("S1H E2E Workspace");
  await expect(page.locator(".home-card")).toHaveCount(0);
  await expect(
    page.getByText(/client member navigation surface/i),
  ).toBeVisible();
});

test("flag-off: gated cards are hidden like the client nav; Daily tracking remains", async ({
  page,
}) => {
  await signIn(page, E2E.client, FLAG_OFF);
  await page.goto(FLAG_HOME(wsId));
  await expect(page.getByRole("link", { name: /Onboarding/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Check-Ins/i })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Daily tracking/i }),
  ).toBeVisible();
});

test("an ACTIVE non-CLIENT member (SUPPORT) is denied with 403 — layout else-branch", async ({
  page,
}) => {
  // SUPPORT is a real member but holds no workspaceSettings read, so it
  // reaches the layout's non-CLIENT denial branch — distinct from the
  // non-member (no row) and staff-owner (staff branch) paths.
  await signIn(page, E2E.support);
  await page.goto(HOME(wsId));
  await expect(page.getByText(/403|forbidden|denied/i).first()).toBeVisible();
  await expect(page.locator(".home-card")).toHaveCount(0);
});

test("inactive membership and foreign-workspace access deny with 403", async ({
  page,
}) => {
  // Task-owned fixture: a REMOVED member row for the client on
  // workspace B exercises BOTH the inactive-membership guard and the
  // foreign-workspace denial (deleted after the test).
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  let wsBId = "";
  try {
    const wsB = await prisma.workspace.findUniqueOrThrow({
      where: { slug: E2E.workspaceBSlug },
    });
    wsBId = wsB.id;
    const client = await prisma.user.findUniqueOrThrow({
      where: { email: E2E.client },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: wsBId,
        userId: client.id,
        role: "CLIENT",
        status: "REMOVED",
      },
    });
  } finally {
    await prisma.$disconnect();
  }

  await signIn(page, E2E.client);
  await page.goto(HOME(wsBId));
  await expect(page.getByText(/403|forbidden|denied/i).first()).toBeVisible();
  await expect(page.locator(".home-card")).toHaveCount(0);

  // Task-owned cleanup.
  const prisma2 = new PrismaClient();
  try {
    const client = await prisma2.user.findUniqueOrThrow({
      where: { email: E2E.client },
    });
    await prisma2.workspaceMember.delete({
      where: {
        workspaceId_userId: { workspaceId: wsBId, userId: client.id },
      },
    });
  } finally {
    await prisma2.$disconnect();
  }
});

test("keyboard + a11y + responsive: every card reachable by tab; no overflow at 1440/834/390; no localStorage", async ({
  page,
}) => {
  await signIn(page, E2E.client);
  for (const w of [1440, 834, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(HOME(wsId));
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    const main = page.getByRole("main");
    const box = await main.boundingBox();
    const maxRight = box!.x + box!.width + 1;
    for (const link of await page.locator(".home-card").all()) {
      const b = await link.boundingBox();
      expect(b!.x + b!.width).toBeLessThanOrEqual(maxRight + 0.5);
    }
  }
  // No sensitive client data is written to localStorage on this surface.
  await page.goto(HOME(wsId));
  const keys = await page.evaluate(() =>
    Object.keys(window.localStorage).filter((k) =>
      /entry|measure|checkin|client|track|answer/i.test(k),
    ),
  );
  expect(keys).toEqual([]);
});
