import { expect, test } from "@playwright/test";

// The test server enables ENABLE_DAILY_PROTOTYPE=1 (see playwright.config.ts).
test("prototype shows the not-saved notice and only in-scope fields", async ({ page }) => {
  await page.goto("/daily");
  await expect(page.getByRole("heading", { name: "Daily Tracker (prototype)", level: 1 })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("not saved");

  await expect(page.getByLabel("Weight (kg)")).toBeVisible();
  await expect(page.getByLabel("BBT (°C)")).toBeVisible();
  await expect(page.getByLabel("Blood glucose (mmol/L)")).toBeVisible();
  await expect(page.getByLabel("Desire to train")).toBeVisible();
  await expect(page.getByLabel("Day label")).toBeVisible();

  // Excluded fields must not be present as inputs.
  await expect(page.getByLabel("E2")).toHaveCount(0);
  await expect(page.getByLabel("PROG")).toHaveCount(0);
  await expect(page.getByLabel("Coach note")).toHaveCount(0);

  // Computed marker is advertised.
  await expect(page.getByText("TODO(product)").first()).toBeVisible();
});

test("entry appears in the week view, makes no write request, and is cleared on refresh", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
      writes.push(`${request.method()} ${request.url()}`);
    }
  });

  await page.goto("/daily");
  await page.getByLabel("Date").fill("2026-01-05");
  await page.getByLabel("Weight (kg)").fill("80");
  await page.getByLabel("Desire to train").fill("5");
  await page.getByRole("button", { name: "Add to week view" }).click();

  const week = page.getByRole("region", { name: "In-memory week view" });
  await expect(week).toBeVisible();
  await expect(week).toContainText("80");
  await expect(week).toContainText("TODO(product)");
  expect(writes).toEqual([]);

  await page.reload();
  await expect(page.getByText("No entries yet.")).toBeVisible();
});

test("enforces only the source-confirmed constraints", async ({ page }) => {
  await page.goto("/daily");
  await page.getByLabel("Date").fill("2026-01-05");
  await page.getByLabel("Desire to train").fill("11");
  await page.getByRole("button", { name: "Add to week view" }).click();
  await expect(page.locator(".daily-errors")).toContainText("1-10");
  await expect(page.getByText("No entries yet.")).toBeVisible();
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the form is usable at mobile width", async ({ page }) => {
    await page.goto("/daily");
    await expect(page.getByRole("heading", { name: "Daily Tracker (prototype)", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Weight (kg)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to week view" })).toBeVisible();
  });
});
