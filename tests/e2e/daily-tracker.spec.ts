import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * Phase 1.1 Daily Tracker production shell — real browser flows at desktop
 * (1440px), tablet (834px) and mobile (390px). Fixtures are the reserved
 * synthetic rows created by `global-setup.ts` (never real client data).
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

const SECTION_NAMES = [
  "DATE & PHASE",
  "BODYWEIGHT",
  "MENSES",
  "SLEEP",
  "ACTIVITY",
  "BIOFEEDBACK",
  "BIOMETRICS",
  "NUTRITION & DIGESTION",
  "NOTES",
] as const;

test("unauthenticated deep link redirects to /login", async ({ page }) => {
  await page.goto(`/workspace/${wsId}/daily`);
  await expect(page).toHaveURL(/\/login$/);
});

test("non-member gets HTTP 403 on the daily tracker", async ({ page }) => {
  await signIn(page, E2E.nonmember);
  const res = await page.goto(`/workspace/${wsId}/daily`);
  expect(res?.status()).toBe(403);
  await expect(page.getByTestId("access-denied")).toBeVisible();
});

test("owner reaches the Daily Tracker through workspace navigation", async ({
  page,
}) => {
  await signIn(page, E2E.owner);
  await page.goto(`/workspace/${wsId}`);
  const link = page.getByRole("link", { name: "Daily Tracker", exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/workspace/${wsId}/daily$`));
  await expect(
    page.getByRole("heading", { name: "Daily Tracker", level: 1 }),
  ).toBeVisible();
  await expect(page.getByTestId("daily-tracker")).toBeVisible();
});

test("coach with a granted dailyTracking read scope reaches the page", async ({
  page,
}) => {
  await signIn(page, E2E.coach);
  const res = await page.goto(`/workspace/${wsId}/daily`);
  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("daily-tracker")).toBeVisible();
});

test("renders the nine verified sections with source labels and units only", async ({
  page,
}) => {
  await signIn(page, E2E.owner);
  await page.goto(`/workspace/${wsId}/daily`);
  await expect(page.locator('[data-testid="tracker-section"]')).toHaveCount(9);
  for (const name of SECTION_NAMES) {
    await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
  }

  const weight = page.locator('[data-field-key="weightKg"]');
  await expect(weight).toContainText("WEIGHT (kg)");
  await expect(page.locator('[data-field-key="bbtC"]')).toContainText(
    "BBT (°C)",
  );
  await expect(page.locator('[data-field-key="bloodGlucose"]')).toContainText(
    "BLOOD GLUCOSE (mmol/L)",
  );
  await expect(page.locator('[data-field-key="rhr"]')).toContainText(
    "RHR (bpm)",
  );
  await expect(page.locator('[data-field-key="bloodPressure"]')).toContainText(
    "BLOOD PRESSURE (mmHg)",
  );
  await expect(page.locator('[data-field-key="dayLabel"]')).toContainText(
    "DAY LABEL",
  );
  await expect(page.locator('[data-field-key="waterL"]')).toContainText(
    "WATER (L)",
  );

  // The source CALORIES column is a computed placeholder, never an input.
  const calories = page.locator('[data-field-key="calories"]');
  await expect(calories).toContainText("TODO(product)");
  await expect(calories.locator("input, select, textarea")).toHaveCount(0);

  // Excluded fields/columns must not exist at all. (Exact text match avoids
  // the fixture workspace name "S1H E2E Workspace" substring.)
  await expect(page.getByText("E2", { exact: true })).toHaveCount(0);
  await expect(page.getByText("PROG", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Coaches' notes", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator('[data-field-key="e2"]')).toHaveCount(0);
  await expect(page.locator('[data-field-key="calorieAuto"]')).toHaveCount(0);
});

test("performs no write request and advertises Phase 4 unavailability", async ({
  page,
}) => {
  await signIn(page, E2E.owner);
  await page.goto(`/workspace/${wsId}`);
  const writes: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
      writes.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.getByRole("link", { name: "Daily Tracker", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Daily Tracker" }),
  ).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Phase 4");
  expect(writes).toEqual([]);
});

test("keyboard: section navigation is focusable and activates with Enter", async ({
  page,
}) => {
  await signIn(page, E2E.owner);
  await page.goto(`/workspace/${wsId}/daily`);
  const notesLink = page
    .getByTestId("tracker-section-nav")
    .getByRole("link", { name: /NOTES/ });
  await notesLink.focus();
  await expect(notesLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-section-id="notes"]')).toBeInViewport();
  await expect(
    page.getByTestId("tracker-section-nav").locator('[aria-current="true"]'),
  ).toHaveCount(1);
});

for (const [name, viewport, navDirection, gridTracks] of [
  ["desktop", { width: 1440, height: 900 }, "column", 2],
  ["tablet", { width: 834, height: 1112 }, "row", 1],
  ["mobile", { width: 390, height: 844 }, "row", 1],
] as const) {
  test(`${name}: deliberate layout, touch targets and no horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signIn(page, E2E.owner);
    await page.goto(`/workspace/${wsId}/daily`);
    await expect(page.getByTestId("daily-tracker")).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    const tracks = await page
      .locator(".tracker")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      );
    expect(tracks).toBe(gridTracks);

    const direction = await page
      .locator(".tracker__nav-list")
      .evaluate((el) => getComputedStyle(el).flexDirection);
    expect(direction).toBe(navDirection);

    if (name !== "desktop") {
      const box = await page
        .locator(".tracker__nav-link")
        .first()
        .boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
}
