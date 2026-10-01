import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * S1-H authenticated workspace shell + 403 routing — real browser flows at
 * desktop, tablet, and mobile widths. Fixtures are the reserved synthetic rows
 * created by `global-setup.ts`.
 */

let prisma: PrismaClient;
let wsId: string;

test.beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { slug: E2E.workspaceSlug },
  });
  wsId = ws.id;
});

test.afterAll(async () => {
  await prisma?.$disconnect();
});

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("unauthenticated /workspace redirects to /login", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/login$/);
});

test("unauthenticated deep link redirects to /login", async ({ page }) => {
  await page.goto(`/workspace/${wsId}`);
  await expect(page).toHaveURL(/\/login$/);
});

test("owner sees the workspace list, shell, and admin area", async ({
  page,
}) => {
  await signIn(page, E2E.owner);
  await page.goto("/workspace");
  await expect(
    page.getByRole("link", { name: E2E.workspaceName, exact: true }),
  ).toBeVisible();

  await page.goto(`/workspace/${wsId}`);
  await expect(page.getByTestId("workspace-shell")).toBeVisible();
  await expect(page.getByTestId("shell-role")).toHaveText("WORKSPACE_OWNER");

  await page.goto(`/workspace/${wsId}/admin`);
  await expect(page.getByTestId("workspace-admin")).toBeVisible();
});

test("coach gets HTTP 403 on the owner-only admin page", async ({ page }) => {
  await signIn(page, E2E.coach);
  const res = await page.goto(`/workspace/${wsId}/admin`);
  expect(res?.status()).toBe(403);
  await expect(page.getByTestId("access-denied")).toBeVisible();
  // The 403 page discloses nothing about the workspace.
  await expect(page.getByTestId("access-denied")).not.toContainText(
    E2E.workspaceName,
  );
});

test("non-member gets HTTP 403 on the workspace shell", async ({ page }) => {
  await signIn(page, E2E.nonmember);
  const res = await page.goto(`/workspace/${wsId}`);
  expect(res?.status()).toBe(403);
  await expect(page.getByTestId("access-denied")).toBeVisible();
});

test("deactivated account is redirected to /login, not 403", async ({
  page,
}) => {
  await signIn(page, E2E.deactivated);
  await prisma.user.update({
    where: { email: E2E.deactivated },
    data: { status: "DEACTIVATED" },
  });
  try {
    await page.goto(`/workspace/${wsId}`);
    await expect(page).toHaveURL(/\/login$/);
  } finally {
    await prisma.user.update({
      where: { email: E2E.deactivated },
      data: { status: "ACTIVE" },
    });
  }
});

test("sign out returns to /login", async ({ page }) => {
  await signIn(page, E2E.owner);
  await page.goto(`/workspace/${wsId}`);
  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/login$/);
});

for (const [name, viewport, navDirection, gridTracks] of [
  ["desktop", { width: 1440, height: 900 }, "column", 2],
  ["tablet", { width: 834, height: 1112 }, "row", 1],
  ["mobile", { width: 390, height: 844 }, "column", 1],
] as const) {
  test(`${name}: shell renders a form-factor layout without horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signIn(page, E2E.owner);
    await page.goto(`/workspace/${wsId}`);
    await expect(page.getByTestId("workspace-shell")).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    const direction = await page
      .locator(".shell__nav")
      .evaluate((el) => getComputedStyle(el).flexDirection);
    expect(direction).toBe(navDirection);

    // Desktop is a two-column grid (sidebar + main); tablet/mobile collapse to
    // a single column — i.e. genuinely different layouts, not one stretched.
    const tracks = await page
      .locator(".shell")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      );
    expect(tracks).toBe(gridTracks);
  });
}
