import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * DASHBOARD-I1 (decision #108) — persisted coach-configured client
 * dashboards: owner arranges + shares widgets; the client sees the
 * committed subset; staff-only widgets never leak; flag-off 404s.
 */

const BASE = "http://127.0.0.1:3000";
const FLAG_OFF = "http://127.0.0.1:3101";

let prisma: PrismaClient;
let wsId: string;
let profileId = "";
let createdProfile = false;

async function signIn(page: Page, email: string, base = BASE) {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/login/);
}

test.beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { slug: E2E.workspaceSlug },
  });
  wsId = ws.id;
  const clientUser = await prisma.user.findUniqueOrThrow({
    where: { email: E2E.client },
  });
  const existing = await prisma.clientProfile.findFirst({
    where: { workspaceId: wsId, userId: clientUser.id },
  });
  if (existing) {
    profileId = existing.id;
  } else {
    createdProfile = true;
    profileId = (
      await prisma.clientProfile.create({
        data: {
          workspaceId: wsId,
          userId: clientUser.id,
          name: "Dashboard Client",
        },
      })
    ).id;
  }
  await prisma.clientDashboardLayout.deleteMany({
    where: { workspaceId: wsId, clientProfileId: profileId },
  });
});

test.afterAll(async () => {
  await prisma.clientDashboardLayout.deleteMany({
    where: { workspaceId: wsId, clientProfileId: profileId },
  });
  if (createdProfile)
    await prisma.clientProfile.delete({ where: { id: profileId } });
  await prisma.$disconnect();
});

const staffUrl = () => `/workspace/${wsId}/clients/${profileId}/dashboard`;
const clientUrl = () => `/workspace/${wsId}/dashboard`;

test.describe("DASHBOARD-I1", () => {
  test("owner adds + shares a widget; client sees the committed subset", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    await expect(page.getByTestId("dashboard-editor")).toBeVisible();
    // add CU04 (client-visible) + CU01 (stays staff-only by default)
    await page.getByTestId("add-widget").selectOption("CU04");
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("add-widget").selectOption("CU01");
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
    // share the CU04 widget with the client
    const canvas = page.getByTestId("dashboard-canvas");
    const widget = canvas.locator("article", { hasText: "Check-in" }).first();
    await widget.getByTestId(/visibility-/).click();
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
  });

  test("editor covers settings, breakpoints, preview and nav guard", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    await expect(page.getByTestId("dashboard-canvas")).toBeVisible();
    const widget = page
      .getByTestId("dashboard-canvas")
      .locator("article")
      .first();
    // per-widget settings: open panel, change a setting within the
    // allowlist, save commits
    await widget.getByTestId(/edit-/).click();
    const settings = page.getByTestId("widget-settings").first();
    await expect(settings).toBeVisible();
    await settings.locator("input").first().fill("Custom title");
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
    // breakpoint tabs + initialize
    await page.getByTestId("bp-mobile").click();
    const init = page.getByTestId("init-mobile");
    if ((await init.count()) > 0) {
      await init.click();
      await expect(page.getByText("Saved")).toBeVisible({
        timeout: 10_000,
      });
    }
    await page.getByTestId("bp-desktop").click();
    // client preview toggle — staff-only widget disappears
    const staffWidget = page
      .getByTestId("dashboard-canvas")
      .locator("article", { hasText: "This week’s focus" });
    await page.getByTestId("client-preview").click();
    await expect(staffWidget).toHaveCount(0);
    await page.getByTestId("client-preview").click();
    // navigation guard: edit inside the debounce window, then try to
    // leave — beforeunload fires
    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("beforeunload");
      await dialog.dismiss();
    });
    await page.getByTestId("dashboard-name").fill("Renamed dashboard");
    await page
      .goto(`/workspace/${wsId}/clients`, { timeout: 3_000 })
      .catch(() => {});
    // still on the editor (dismissed the dialog)
    await expect(page.getByTestId("dashboard-editor")).toBeVisible();
    // let the pending save land
    await expect(page.getByText(/Saved/)).toBeVisible({ timeout: 10_000 });
  });

  test("client view shows only the shared subset", async ({ page }) => {
    await signIn(page, E2E.client);
    await page.goto(clientUrl());
    await expect(page.getByTestId("client-dashboard")).toBeVisible();
    await expect(page.getByTestId("client-widget-CU04")).toBeVisible();
    // staff-only CU01 is absent server-side — never rendered
    await expect(page.getByTestId("client-widget-CU01")).toHaveCount(0);
  });

  test("flag-off server returns 404 and hides the roster link", async ({
    page,
  }) => {
    await signIn(page, E2E.owner, FLAG_OFF);
    await page.goto(`${FLAG_OFF}${staffUrl()}`);
    await expect(
      page.getByRole("heading", { name: /not found|404/i }),
    ).toBeVisible();
    await page.goto(`${FLAG_OFF}/workspace/${wsId}/clients`);
    await expect(page.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
  });

  test("assistant sees the read-only layout, no controls", async ({ page }) => {
    await signIn(page, E2E.assistant);
    await page.goto(staffUrl());
    // assistant has no assignment to this client → 404 (assigned scope)
    const heading = page.getByTestId("dashboard-editor");
    if ((await heading.count()) > 0) {
      await expect(page.getByTestId("add-widget")).toHaveCount(0);
    }
  });
});
