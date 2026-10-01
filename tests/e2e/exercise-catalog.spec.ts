import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * Phase 2.2 Exercise Database catalog — real browser flows at desktop
 * (1440px), tablet (834px) and mobile (390px). Catalog fixtures are reserved
 * synthetic rows created/removed here; they are not real client data.
 */

const RESERVED_SOURCE_IDS = [990001, 990002, 990003];

const FIXTURES = [
  {
    sourceId: 990001,
    name: "E2E Exercise Back Squat",
    muscleGroup: "Quadriceps",
    primaryTarget: "Quadriceps",
    additionalTargets: "Gluteus Maximus",
    equipment: "Barbell",
    movementPattern: "Squat",
    positionSetup: "Standing",
    cues: "E2E cue text",
    videoLink: null,
  },
  {
    sourceId: 990002,
    name: "E2E Exercise Front Squat",
    muscleGroup: "Quadriceps",
    primaryTarget: "Quadriceps",
    additionalTargets: null,
    equipment: "Barbell",
    movementPattern: "Squat",
    positionSetup: "Standing",
    cues: null,
    videoLink: null,
  },
  {
    sourceId: 990003,
    name: "E2E Exercise Pulldown",
    muscleGroup: "Back",
    primaryTarget: "Latissimus",
    additionalTargets: null,
    equipment: "Cable",
    movementPattern: "Vertical Pull",
    positionSetup: "Seated",
    cues: null,
    videoLink: null,
  },
];

let prisma: PrismaClient;
let wsId: string;

test.beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { slug: E2E.workspaceSlug },
  });
  wsId = ws.id;
  await prisma.exerciseCatalogItem.deleteMany({
    where: { sourceId: { in: RESERVED_SOURCE_IDS } },
  });
  await prisma.exerciseCatalogItem.createMany({
    data: FIXTURES.map((item) => ({
      ...item,
      rowFingerprint: `e2e-${item.sourceId}`,
    })),
  });
});

test.afterAll(async () => {
  await prisma.exerciseCatalogItem.deleteMany({
    where: { sourceId: { in: RESERVED_SOURCE_IDS } },
  });
  await prisma?.$disconnect();
});

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("unauthenticated deep link redirects to /login", async ({ page }) => {
  await page.goto(`/workspace/${wsId}/exercises`);
  await expect(page).toHaveURL(/\/login$/);
});

test("non-member gets HTTP 403 on the catalog", async ({ page }) => {
  await signIn(page, E2E.nonmember);
  const res = await page.goto(`/workspace/${wsId}/exercises`);
  expect(res?.status()).toBe(403);
  await expect(page.getByTestId("access-denied")).toBeVisible();
});

test("owner reaches the catalog through workspace navigation and searches", async ({
  page,
}) => {
  await signIn(page, E2E.owner);
  await page.goto(`/workspace/${wsId}`);
  const link = page.getByRole("link", {
    name: "Exercise Database",
    exact: true,
  });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/workspace/${wsId}/exercises$`));
  await expect(
    page.getByRole("heading", { name: "Exercise Database", level: 1 }),
  ).toBeVisible();

  // Empty state before a query — never the unbounded catalog.
  await expect(page.getByTestId("exercise-empty")).toContainText("at least 2");

  await page.getByLabel("EXERCISE NAME").fill("E2E Exercise");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByTestId("exercise-results")).toBeVisible();
  await expect(page.getByTestId("exercise-results")).toContainText("3 matches");
  await expect(page.getByTestId("exercise-item")).toHaveCount(3);

  const squat = page.locator('[data-source-id="990001"]');
  await expect(squat).toContainText("E2E Exercise Back Squat");
  await expect(squat).toContainText("MUSCLE GROUP");
  await expect(squat).toContainText("MOVEMENT PATTERN");
  await expect(squat).toContainText("POSITION / SETUP");
});

test("min-query, no-match, and facet filters behave", async ({ page }) => {
  await signIn(page, E2E.owner);
  await page.goto(`/workspace/${wsId}/exercises?q=E`);
  await expect(page.getByTestId("exercise-empty")).toContainText("at least 2");

  await page.goto(`/workspace/${wsId}/exercises?q=E2E%20NoSuchExercise`);
  await expect(page.getByTestId("exercise-empty")).toContainText(
    "No exercises match",
  );

  await page.goto(
    `/workspace/${wsId}/exercises?q=E2E%20Exercise&muscleGroup=Back`,
  );
  await expect(page.getByTestId("exercise-results")).toContainText("1 match");
  await expect(page.getByTestId("exercise-item")).toHaveCount(1);
  await expect(page.locator('[data-source-id="990003"]')).toBeVisible();

  await page.goto(
    `/workspace/${wsId}/exercises?q=E2E%20Exercise&equipment=Cable`,
  );
  await expect(page.getByTestId("exercise-results")).toContainText("1 match");
  await expect(page.locator('[data-source-id="990003"]')).toBeVisible();
});

test("keyboard: the EXERCISE NAME field submits on Enter", async ({ page }) => {
  await signIn(page, E2E.owner);
  await page.goto(`/workspace/${wsId}/exercises`);
  const input = page.getByLabel("EXERCISE NAME");
  await input.focus();
  await expect(input).toBeFocused();
  await input.fill("E2E Exercise Pulldown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("exercise-results")).toContainText("1 match");
  await expect(page.locator('[data-source-id="990003"]')).toBeVisible();
});

for (const [name, viewport, minColumns] of [
  ["desktop", { width: 1440, height: 900 }, 2],
  ["tablet", { width: 834, height: 1112 }, 2],
  ["mobile", { width: 390, height: 844 }, 1],
] as const) {
  test(`${name}: deliberate reflow, touch controls, no horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signIn(page, E2E.owner);
    await page.goto(`/workspace/${wsId}/exercises?q=E2E%20Exercise`);
    await expect(page.getByTestId("exercise-results")).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // Results are a reflowed list, never a squeezed desktop table.
    await expect(
      page.locator('[data-testid="exercise-catalog"] table'),
    ).toHaveCount(0);

    const columns = await page
      .locator(".catalog-item__fields")
      .first()
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      );
    if (minColumns === 1) expect(columns).toBe(1);
    else expect(columns).toBeGreaterThanOrEqual(minColumns);

    const button = await page
      .getByRole("button", { name: "Search" })
      .boundingBox();
    expect(button?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
}
