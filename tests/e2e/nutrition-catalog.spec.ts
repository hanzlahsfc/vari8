import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * Phase 2.1 Nutrition Database catalog — real browser flows at desktop
 * (1440px), tablet (834px) and mobile (390px). Catalog fixtures are reserved
 * synthetic rows created/removed here; they are not real client data.
 */

const RESERVED_SOURCE_NOS = [990001, 990002, 990003];

const FIXTURES = [
  {
    sourceNo: 990001,
    name: "E2E Nutrition Chicken",
    category: "PRO",
    calories: 145,
    protein: 32,
    carbs: 0,
    fats: 1.9,
    state: "Cooked Weight",
  },
  {
    sourceNo: 990002,
    name: "E2E Nutrition Chicken Thigh",
    category: "PRO",
    calories: 209,
    protein: 26,
    carbs: 0,
    fats: 10.9,
    state: "Cooked Weight",
  },
  {
    sourceNo: 990003,
    name: "E2E Nutrition Rice",
    category: "CHO",
    calories: 130,
    protein: 2.7,
    carbs: 28,
    fats: 0.3,
    state: "Cooked Weight",
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
  await prisma.nutritionCatalogItem.deleteMany({
    where: { sourceNo: { in: RESERVED_SOURCE_NOS } },
  });
  await prisma.nutritionCatalogItem.createMany({
    data: FIXTURES.map((item) => ({
      ...item,
      amount: 100,
      unit: "g",
      rowFingerprint: `e2e-${item.sourceNo}`,
    })),
  });
});

test.afterAll(async () => {
  await prisma.nutritionCatalogItem.deleteMany({
    where: { sourceNo: { in: RESERVED_SOURCE_NOS } },
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
  await page.goto(`/workspace/${wsId}/nutrition`);
  await expect(page).toHaveURL(/\/login$/);
});

test("non-member gets HTTP 403 on the catalog", async ({ page }) => {
  await signIn(page, E2E.nonmember);
  const res = await page.goto(`/workspace/${wsId}/nutrition`);
  expect(res?.status()).toBe(403);
  await expect(page.getByTestId("access-denied")).toBeVisible();
});

test("owner reaches the catalog through workspace navigation and searches", async ({
  page,
}) => {
  await signIn(page, E2E.owner);
  await page.goto(`/workspace/${wsId}`);
  const link = page.getByRole("link", {
    name: "Nutrition Database",
    exact: true,
  });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/workspace/${wsId}/nutrition$`));
  await expect(
    page.getByRole("heading", { name: "Nutrition Database", level: 1 }),
  ).toBeVisible();

  // Empty state before a query — never the unbounded catalog.
  await expect(page.getByTestId("nutrition-empty")).toContainText("at least 2");

  await page.getByLabel("FOOD").fill("E2E Nutrition");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByTestId("nutrition-results")).toBeVisible();
  await expect(page.getByTestId("nutrition-results")).toContainText(
    "3 matches",
  );
  await expect(page.getByTestId("nutrition-item")).toHaveCount(3);

  const chicken = page.locator('[data-source-no="990001"]');
  await expect(chicken).toContainText("E2E Nutrition Chicken");
  await expect(chicken).toContainText("CALORIES (kcal)");
  await expect(chicken).toContainText("PROTEIN (g)");
  await expect(chicken).toContainText("COOKED/RAW/DRY");
});

test("min-query, no-match, and category filter behave", async ({ page }) => {
  await signIn(page, E2E.owner);
  await page.goto(`/workspace/${wsId}/nutrition?q=E`);
  await expect(page.getByTestId("nutrition-empty")).toContainText("at least 2");

  await page.goto(`/workspace/${wsId}/nutrition?q=E2E%20NoSuchFood`);
  await expect(page.getByTestId("nutrition-empty")).toContainText(
    "No foods match",
  );

  await page.goto(`/workspace/${wsId}/nutrition?q=E2E%20Nutrition&cat=CHO`);
  await expect(page.getByTestId("nutrition-results")).toContainText("1 match");
  await expect(page.getByTestId("nutrition-item")).toHaveCount(1);
  await expect(page.locator('[data-source-no="990003"]')).toBeVisible();
});

test("keyboard: the FOOD field submits on Enter", async ({ page }) => {
  await signIn(page, E2E.owner);
  await page.goto(`/workspace/${wsId}/nutrition`);
  const input = page.getByLabel("FOOD");
  await input.focus();
  await expect(input).toBeFocused();
  await input.fill("E2E Nutrition Rice");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("nutrition-results")).toContainText("1 match");
  await expect(page.locator('[data-source-no="990003"]')).toBeVisible();
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
    await page.goto(`/workspace/${wsId}/nutrition?q=E2E%20Nutrition`);
    await expect(page.getByTestId("nutrition-results")).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // Results are a reflowed list, never a squeezed desktop table.
    await expect(
      page.locator('[data-testid="nutrition-catalog"] table'),
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
