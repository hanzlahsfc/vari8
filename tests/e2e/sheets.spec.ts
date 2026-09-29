import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

const SHEETS = [
  { slug: "daily-tracker", name: "DAILY TRACKER" },
  { slug: "dashboard", name: "DASHBOARD" },
  { slug: "timeline", name: "TIMELINE" },
  { slug: "mealplan", name: "MEALPLAN" },
  { slug: "supplementation", name: "SUPPLEMENTATION" },
  { slug: "menses", name: "MENSES" },
  { slug: "training", name: "TRAINING" },
  { slug: "peaking", name: "PEAKING" },
  { slug: "showday", name: "SHOWDAY" },
  { slug: "exercise-database", name: "Exercise Database" },
  { slug: "nutrition-database", name: "Nutrition Database" },
];

test("sheets index lists all 11 sheets in source order", async ({ page }) => {
  await page.goto("/sheets");
  await expect(
    page.getByRole("heading", { name: "Workbook sheets", level: 1 }),
  ).toBeVisible();
  const links = page.locator(".sheet-list a");
  await expect(links).toHaveCount(11);
  await expect(links.first()).toHaveText("DAILY TRACKER");
  await expect(links.last()).toHaveText("Nutrition Database");
});

test("every sheet view loads with a heading and grid region", async ({
  page,
}) => {
  for (const sheet of SHEETS) {
    await page.goto(`/sheets/${sheet.slug}`);
    await expect(
      page.getByRole("heading", { name: sheet.name, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: `${sheet.name} grid` }),
    ).toBeVisible();
  }
});

test("daily tracker shows safe labels and neutral redacted markers", async ({
  page,
}) => {
  await page.goto("/sheets/daily-tracker");
  await expect(
    page.locator(".sheet-chip", { hasText: "BODYWEIGHT" }),
  ).toBeVisible();
  const redacted = page.locator(".sheet-cell--redacted").first();
  await expect(redacted).toBeVisible();
  // Neutral marker only — no "[REDACTED:" category text or client value in the DOM.
  await expect(redacted).toHaveText("▨");
  await expect(page.locator(".sheet-grid")).not.toContainText("[REDACTED:");
});

test("rendered redacted count matches the committed artifact", async ({
  page,
}) => {
  for (const slug of ["daily-tracker", "menses"]) {
    const artifact = JSON.parse(
      readFileSync(
        join(process.cwd(), "spec", "sheets", `${slug}.json`),
        "utf8",
      ),
    );
    const expected = (artifact.cells as Array<{ text: string }>).filter(
      (cell) => cell.text.startsWith("[REDACTED:"),
    ).length;
    await page.goto(`/sheets/${slug}`);
    await expect(page.locator(".sheet-cell--redacted")).toHaveCount(expected);
  }
});

test("sheet navigation moves between sheets", async ({ page }) => {
  await page.goto("/sheets/dashboard");
  await page.getByRole("link", { name: /DAILY TRACKER/ }).click();
  await expect(
    page.getByRole("heading", { name: "DAILY TRACKER", level: 1 }),
  ).toBeVisible();
  await page.getByRole("link", { name: "All sheets" }).click();
  await expect(
    page.getByRole("heading", { name: "Workbook sheets", level: 1 }),
  ).toBeVisible();
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("wide sheets stay navigable via horizontal scroll", async ({ page }) => {
    await page.goto("/sheets/training");
    const region = page.getByRole("region", { name: "TRAINING grid" });
    await expect(region).toBeVisible();
    const scrollable = await region.evaluate(
      (el) => el.scrollWidth > el.clientWidth,
    );
    expect(scrollable).toBe(true);
  });
});
