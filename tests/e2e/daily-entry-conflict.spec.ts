import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-021 mode coverage:
 *  - the primary server (:3000) resolves "conflict" (ENABLE_DAILY_PROTOTYPE
 *    AND ENABLE_DAILY_ENTRY on) — shell preserved, persistence unavailable;
 *  - the flag-off proof server (:3101) resolves "off" — shell preserved,
 *    no persistence affordances at all.
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

test("conflict mode: client keeps the shell; persistence unavailable", async ({
  page,
}) => {
  await signIn(page, E2E.client);
  const res = await page.goto(`/workspace/${wsId}/daily`);
  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("daily-tracker")).toBeVisible();
  await expect(
    page.getByText("Daily tracking is currently unavailable."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save daily entry" }),
  ).toHaveCount(0);
});

test("conflict mode: staff keep the shell unchanged", async ({ page }) => {
  await signIn(page, E2E.coach);
  const res = await page.goto(`/workspace/${wsId}/daily`);
  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("daily-tracker")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save daily entry" }),
  ).toHaveCount(0);
});

test("flag off (:3101): client keeps the shell, no persistence affordances", async ({
  page,
}) => {
  const OFF = "http://127.0.0.1:3101";
  await page.goto(`${OFF}/login`);
  await page.getByLabel("Email").fill(E2E.client);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  const res = await page.goto(`${OFF}/workspace/${wsId}/daily`);
  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("daily-tracker")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save daily entry" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Daily tracking is currently unavailable."),
  ).toHaveCount(0);
});
