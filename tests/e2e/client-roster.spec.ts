import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../../lib/password";
import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-010 read-only staff client roster — real browser flows at
 * 1440/834/390 widths. Synthetic fixtures only: client profiles +
 * assignments created in beforeAll and removed in afterAll (the global
 * teardown only removes its own reserved rows; Restrict FKs require this
 * spec to clean its own client rows).
 *
 * Fixture layout (workspace A = E2E.workspaceSlug):
 *   P010 Alpha   — ACTIVE assignment to COACH
 *   P010 Beta    — REMOVED coach assignment + ACTIVE assignment to ASSISTANT
 *   P010 Gamma   — no assignment (owner-only visible)
 * Workspace B (E2E.workspaceBSlug, owner-only) carries P010B-* rows for
 * pagination. `roster-empty` is a COACH with zero assignments;
 * `roster-admin` is a PLATFORM_ADMIN with no membership.
 */

const ROSTER_EMAILS = [
  "roster-empty@p010-e2e.test",
  "roster-admin@p010-e2e.test",
];
const CLIENT_NAME_PREFIX = "P010";
const PAGE_TWO_EXTRA = 2;
const PAGE_SIZE = 25;

let prisma: PrismaClient;
let wsAId: string;
let wsBId: string;

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test.beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });
  const wsA = await prisma.workspace.findUniqueOrThrow({
    where: { slug: E2E.workspaceSlug },
  });
  const wsB = await prisma.workspace.findUniqueOrThrow({
    where: { slug: E2E.workspaceBSlug },
  });
  wsAId = wsA.id;
  wsBId = wsB.id;

  const coachUser = await prisma.user.findUniqueOrThrow({
    where: { email: E2E.coach },
  });
  const assistantUser = await prisma.user.findUniqueOrThrow({
    where: { email: E2E.assistant },
  });
  const coachMember = await prisma.workspaceMember.findUniqueOrThrow({
    where: {
      workspaceId_userId: { workspaceId: wsAId, userId: coachUser.id },
    },
  });
  const assistantMember = await prisma.workspaceMember.findUniqueOrThrow({
    where: {
      workspaceId_userId: { workspaceId: wsAId, userId: assistantUser.id },
    },
  });

  const alpha = await prisma.clientProfile.create({
    data: { workspaceId: wsAId, name: `${CLIENT_NAME_PREFIX} Alpha` },
  });
  const beta = await prisma.clientProfile.create({
    data: { workspaceId: wsAId, name: `${CLIENT_NAME_PREFIX} Beta` },
  });
  await prisma.clientProfile.create({
    data: { workspaceId: wsAId, name: `${CLIENT_NAME_PREFIX} Gamma` },
  });
  await prisma.clientProfile.create({
    data: { workspaceId: wsBId, name: `${CLIENT_NAME_PREFIX} OtherWorkspace` },
  });

  await prisma.clientAssignment.create({
    data: {
      workspaceId: wsAId,
      clientProfileId: alpha.id,
      coachMemberId: coachMember.id,
      role: "PRIMARY",
      status: "ACTIVE",
    },
  });
  await prisma.clientAssignment.create({
    data: {
      workspaceId: wsAId,
      clientProfileId: beta.id,
      coachMemberId: coachMember.id,
      role: "COACH",
      status: "REMOVED",
    },
  });
  await prisma.clientAssignment.create({
    data: {
      workspaceId: wsAId,
      clientProfileId: beta.id,
      coachMemberId: assistantMember.id,
      role: "COACH",
      status: "ACTIVE",
    },
  });

  const passwordHash = await hashPassword(E2E.password);
  const emptyCoach = await prisma.user.upsert({
    where: { email: ROSTER_EMAILS[0] },
    update: { passwordHash, status: "ACTIVE" },
    create: {
      email: ROSTER_EMAILS[0],
      passwordHash,
      status: "ACTIVE",
      name: "P010 Empty Coach",
    },
  });
  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: { workspaceId: wsAId, userId: emptyCoach.id },
    },
    update: { role: "COACH", status: "ACTIVE" },
    create: {
      workspaceId: wsAId,
      userId: emptyCoach.id,
      role: "COACH",
      status: "ACTIVE",
    },
  });
  await prisma.user.upsert({
    where: { email: ROSTER_EMAILS[1] },
    update: { passwordHash, status: "ACTIVE", platformRole: "PLATFORM_ADMIN" },
    create: {
      email: ROSTER_EMAILS[1],
      passwordHash,
      status: "ACTIVE",
      name: "P010 Platform Admin",
      platformRole: "PLATFORM_ADMIN",
    },
  });

  // Pagination fixtures on workspace B (owner-only membership).
  await prisma.clientProfile.createMany({
    data: Array.from({ length: PAGE_SIZE + PAGE_TWO_EXTRA - 1 }, (_, i) => ({
      workspaceId: wsBId,
      name: `${CLIENT_NAME_PREFIX}B ${String(i + 1).padStart(2, "0")}`,
    })),
  });
});

test.afterAll(async () => {
  const rosterUsers = await prisma.user.findMany({
    where: { email: { in: ROSTER_EMAILS } },
    select: { id: true },
  });
  const rosterUserIds = rosterUsers.map((u) => u.id);
  const rosterClients = await prisma.clientProfile.findMany({
    where: { name: { startsWith: CLIENT_NAME_PREFIX } },
    select: { id: true },
  });
  const rosterClientIds = rosterClients.map((c) => c.id);
  // Restrict FKs: assignments → profiles → members → users.
  await prisma.clientAssignment.deleteMany({
    where: { clientProfileId: { in: rosterClientIds } },
  });
  await prisma.clientProfile.deleteMany({
    where: { id: { in: rosterClientIds } },
  });
  await prisma.workspaceMember.deleteMany({
    where: { userId: { in: rosterUserIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: rosterUserIds } } });
  await prisma.$disconnect();
});

const rosterUrl = (wsId: string) => `/workspace/${wsId}/clients`;

test("unauthenticated request redirects to /login", async ({ page }) => {
  await page.goto(rosterUrl(wsAId));
  await expect(page).toHaveURL(/\/login$/);
});

test("owner sees every workspace client and none from another workspace", async ({
  page,
}) => {
  await signIn(page, E2E.owner);
  const res = await page.goto(rosterUrl(wsAId));
  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("client-roster")).toBeVisible();
  for (const name of [
    `${CLIENT_NAME_PREFIX} Alpha`,
    `${CLIENT_NAME_PREFIX} Beta`,
    `${CLIENT_NAME_PREFIX} Gamma`,
  ]) {
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  }
  await expect(
    page.getByText(`${CLIENT_NAME_PREFIX} OtherWorkspace`),
  ).toHaveCount(0);
  await expect(page.getByTestId("client-roster-empty")).toHaveCount(0);
});

test("coach sees only ACTIVE assigned clients", async ({ page }) => {
  await signIn(page, E2E.coach);
  await page.goto(rosterUrl(wsAId));
  await expect(
    page.getByRole("cell", { name: `${CLIENT_NAME_PREFIX} Alpha` }),
  ).toBeVisible();
  await expect(page.getByText(`${CLIENT_NAME_PREFIX} Beta`)).toHaveCount(0);
  await expect(page.getByText(`${CLIENT_NAME_PREFIX} Gamma`)).toHaveCount(0);
});

test("assistant coach sees only ACTIVE assigned clients", async ({ page }) => {
  await signIn(page, E2E.assistant);
  await page.goto(rosterUrl(wsAId));
  await expect(
    page.getByRole("cell", { name: `${CLIENT_NAME_PREFIX} Beta` }),
  ).toBeVisible();
  await expect(page.getByText(`${CLIENT_NAME_PREFIX} Alpha`)).toHaveCount(0);
});

test("coach with no assignments gets the empty state", async ({ page }) => {
  await signIn(page, ROSTER_EMAILS[0]);
  await page.goto(rosterUrl(wsAId));
  await expect(page.getByTestId("client-roster-empty")).toBeVisible();
  await expect(page.getByTestId("client-roster-table")).toHaveCount(0);
});

for (const [label, email] of [
  ["support", E2E.support],
  ["client", E2E.client],
  ["nonmember", E2E.nonmember],
  ["platform admin without membership", ROSTER_EMAILS[1]],
] as const) {
  test(`${label} is denied with a non-disclosing 403`, async ({ page }) => {
    await signIn(page, email);
    const res = await page.goto(rosterUrl(wsAId));
    expect(res?.status()).toBe(403);
    await expect(page.getByTestId("access-denied")).toBeVisible();
    await expect(page.getByTestId("access-denied")).not.toContainText(
      E2E.workspaceName,
    );
  });
}

test("suspended membership fails closed immediately", async ({ page }) => {
  const coachUser = await prisma.user.findUniqueOrThrow({
    where: { email: E2E.coach },
  });
  const coachMember = await prisma.workspaceMember.findUniqueOrThrow({
    where: {
      workspaceId_userId: { workspaceId: wsAId, userId: coachUser.id },
    },
  });
  await prisma.workspaceMember.update({
    where: { id: coachMember.id },
    data: { status: "SUSPENDED" },
  });
  try {
    await signIn(page, E2E.coach);
    const res = await page.goto(rosterUrl(wsAId));
    expect(res?.status()).toBe(403);
  } finally {
    await prisma.workspaceMember.update({
      where: { id: coachMember.id },
      data: { status: "ACTIVE" },
    });
  }
});

test("a member of wsA who is not a member of wsB is denied wsB's roster", async ({
  page,
}) => {
  // Coach holds a wsA membership but nothing in wsB — the workspace-scoped
  // query can never leak across the boundary.
  await signIn(page, E2E.coach);
  const denied = await page.goto(rosterUrl(wsBId));
  expect(denied?.status()).toBe(403);
  await expect(page.getByTestId("access-denied")).toBeVisible();
});

test("navigation exposes Clients to staff roles", async ({ page }) => {
  await signIn(page, E2E.coach);
  await page.goto(`/workspace/${wsAId}`);
  const link = page.getByRole("link", { name: "Clients", exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/workspace/${wsAId}/clients`));
  await expect(page.getByTestId("client-roster")).toBeVisible();
});

test("pagination is bounded and traversable next/prev", async ({ page }) => {
  await signIn(page, E2E.owner);
  await page.goto(rosterUrl(wsBId));
  await expect(page.getByTestId("client-roster")).toBeVisible();
  await expect(page.getByTestId("roster-row")).toHaveCount(PAGE_SIZE);
  await expect(page.getByTestId("roster-page-indicator")).toHaveText("Page 1");
  const next = page.getByRole("link", { name: "Next page" });
  await expect(next).toBeVisible();
  await next.click();
  await expect(page.getByTestId("roster-row")).toHaveCount(
    PAGE_SIZE + PAGE_TWO_EXTRA - PAGE_SIZE,
  );
  await expect(page.getByTestId("roster-page-indicator")).toHaveText("Page 2");
  const prev = page.getByRole("link", { name: "Previous page" });
  await expect(prev).toBeVisible();
  await prev.click();
  await expect(page.getByTestId("roster-row")).toHaveCount(PAGE_SIZE);
  await expect(page.getByTestId("roster-page-indicator")).toHaveText("Page 1");
});

for (const bad of [
  "c=bad%20cursor",
  `c=${"a".repeat(65)}`,
  "c=a&c=b",
  "p=start",
  `c=abc&p=${"x,".repeat(70)}x`,
]) {
  test(`malformed pagination params are rejected: ${bad.slice(0, 40)}`, async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    const res = await page.goto(`${rosterUrl(wsAId)}?${bad}`);
    expect(res?.status()).toBe(403);
  });
}

test("the roster page issues no mutation requests", async ({ page }) => {
  await signIn(page, E2E.owner);
  // Attach after sign-in: only requests the roster page itself may issue.
  const mutations: string[] = [];
  page.on("request", (req) => {
    if (req.method() !== "GET") mutations.push(`${req.method()} ${req.url()}`);
  });
  await page.goto(rosterUrl(wsAId));
  await expect(page.getByTestId("client-roster")).toBeVisible();
  // Paginating on wsB is link navigation only — still zero mutations.
  await page.goto(rosterUrl(wsBId));
  await page.getByRole("link", { name: "Next page" }).click();
  await page.getByRole("link", { name: "Previous page" }).click();
  expect(mutations).toEqual([]);
});

test("keyboard traversal reaches pagination links with visible focus", async ({
  page,
}) => {
  await signIn(page, E2E.owner);
  await page.goto(rosterUrl(wsBId));
  const next = page.getByRole("link", { name: "Next page" });
  // Structural bound — derived from the rendered focusable count, not a
  // fixed number that silently rots when a row gains a legitimate action.
  const budget =
    (await page
      .locator("a[href], button, input, select, textarea, [tabindex]")
      .evaluateAll(
        (els) =>
          els.filter(
            (e) =>
              (e as HTMLElement).offsetWidth > 0 ||
              (e as HTMLElement).offsetHeight > 0,
          ).length,
      )) + 4;
  // Real keypresses so :focus-visible heuristics apply. Record the
  // focused element's accessible text + destination each stop so the
  // traversal ORDER is assertable, not just reachability.
  const visited: { name: string; href: string }[] = [];
  let focused = false;
  for (let i = 0; i < budget && !focused; i++) {
    await page.keyboard.press("Tab");
    visited.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLAnchorElement | null;
        return {
          name: el?.textContent?.trim() ?? "",
          href: el?.getAttribute("href") ?? "",
        };
      }),
    );
    focused = await next.evaluate((el) => document.activeElement === el);
  }
  expect(focused).toBe(true);
  const outline = await next.evaluate(
    (el) => getComputedStyle(el).outlineWidth,
  );
  expect(outline).not.toBe("0px");

  // Contract: EVERY rendered row action is keyboard-reached, in stable
  // DOM order, all before the pagination link. A skipped, misnamed,
  // mis-destined, or unreachable action — or unstable order — fails
  // here. The Check-Ins link is the P-025-B action and is asserted
  // unconditionally; other action classes are asserted against their
  // rendered counts (flag-conditional).
  const checkinsStops = visited.filter((s) => s.name === "Check-Ins");
  const dailyStops = visited.filter((s) => s.name === "Daily entries");
  const renderedDaily = await page
    .getByRole("link", { name: "Daily entries" })
    .count();
  expect(checkinsStops).toHaveLength(PAGE_SIZE);
  expect(dailyStops).toHaveLength(renderedDaily);
  for (const stop of checkinsStops)
    expect(stop.href).toMatch(/\/clients\/[^/]+\/checkins$/);
  // Order: every row action precedes the pagination link (the last stop).
  const lastActionIdx = Math.max(
    visited.map((s) => s.name).lastIndexOf("Check-Ins"),
    visited.map((s) => s.name).lastIndexOf("Daily entries"),
  );
  expect(lastActionIdx).toBeGreaterThanOrEqual(0);
  expect(lastActionIdx).toBeLessThan(visited.length - 1);
});

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["tablet", { width: 834, height: 1112 }],
  ["mobile", { width: 390, height: 844 }],
] as const) {
  test(`${name}: roster renders without horizontal viewport overflow`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signIn(page, E2E.owner);
    await page.goto(rosterUrl(wsAId));
    await expect(page.getByTestId("client-roster")).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
