import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * CLIENT-TASKS-I1 (decision 109) — real CU03 client tasks: staff
 * assign on the editor page; the client sees + completes + undoes;
 * state persists across refresh; cancelled tasks hide from the client;
 * assistants read only; flag-off denies.
 */

const BASE = "http://127.0.0.1:3000";
const FLAG_OFF = "http://127.0.0.1:3101";

let prisma: PrismaClient;
let wsId: string;
let profileId = "";
let createdProfile = false;
let seededLayout = false;

async function signIn(page: Page, email: string, base = BASE) {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/login/);
}

const staffUrl = () => `/workspace/${wsId}/clients/${profileId}/dashboard`;
const clientUrl = () => `/workspace/${wsId}/dashboard`;

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
          name: "Task Client",
        },
      })
    ).id;
  }
  await prisma.clientTask.deleteMany({
    where: { workspaceId: wsId, clientProfileId: profileId },
  });
  // Seed a committed layout with a client-visible CU03 (avoids editor
  // interplay; layout behaviour is covered by the dashboard spec).
  const ownerUser = await prisma.user.findUniqueOrThrow({
    where: { email: E2E.owner },
  });
  const ownerMember = await prisma.workspaceMember.findFirstOrThrow({
    where: { workspaceId: wsId, userId: ownerUser.id },
  });
  await prisma.clientDashboardLayout.deleteMany({
    where: { workspaceId: wsId, clientProfileId: profileId },
  });
  const layout = await prisma.clientDashboardLayout.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      revision: 1,
      updatedByMemberId: ownerMember.id,
      config: {
        version: 1,
        name: "Task Client's dashboard",
        widgets: [
          {
            id: "wt1",
            kind: "CU03",
            settings: {
              title: "Your tasks",
              source: "tasks",
              summary: "both",
              period: "today",
              historyPeriod: "auto",
              target: false,
              size: "Compact",
              fields: [],
              labels: {},
              option: "both",
              unit: "",
              visibility: "client",
            },
          },
        ],
        layouts: {
          desktop: {
            wt1: { x: 0, y: 0, w: 4, h: 3, size: "Compact" },
          },
        },
        widths: { desktop: 1040 },
      },
    },
  });
  seededLayout = layout.revision === 1;
});

test.afterAll(async () => {
  await prisma.clientTask.deleteMany({
    where: { workspaceId: wsId, clientProfileId: profileId },
  });
  if (seededLayout)
    await prisma.clientDashboardLayout.deleteMany({
      where: { workspaceId: wsId, clientProfileId: profileId },
    });
  if (createdProfile) {
    await prisma.clientAssignment.deleteMany({
      where: { workspaceId: wsId, clientProfileId: profileId },
    });
    await prisma.clientProfile.delete({ where: { id: profileId } });
  }
  await prisma.$disconnect();
});

test.describe("CLIENT-TASKS-I1", () => {
  test("owner assigns; client completes + undoes; staff see badges", async ({
    page,
  }) => {
    // Owner assigns through the real staff surface.
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    await expect(page.getByTestId("staff-tasks")).toBeVisible();
    await page.getByTestId("task-title-input").fill("Upload training log");
    await page.getByTestId("task-due-input").fill("2026-12-01");
    await page.getByTestId("task-assign-btn").click();
    await expect(page.getByText("Upload training log")).toBeVisible({
      timeout: 10_000,
    });

    // Client sees it through CU03 and completes it.
    await signIn(page, E2E.client);
    await page.goto(clientUrl());
    const toggle = page.locator("[data-testid^=task-toggle-]");
    await expect(toggle).toHaveText("Mark done", { timeout: 10_000 });
    await expect(page.getByText("Upload training log")).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveText("Undo", { timeout: 10_000 });
    await expect(page.locator("[data-testid^=task-state-]")).toHaveText("Done");

    // Persists across refresh.
    await page.reload();
    await expect(page.locator("[data-testid^=task-state-]")).toHaveText("Done");

    // Staff read shows completion.
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    await expect(page.locator("[data-testid^=staff-task-state-]")).toHaveText(
      "Done",
      { timeout: 10_000 },
    );

    // Client undo restores Open.
    await signIn(page, E2E.client);
    await page.goto(clientUrl());
    await page.locator("[data-testid^=task-toggle-]").click();
    await expect(page.locator("[data-testid^=task-state-]")).toHaveText("Open");
  });

  test("cancelled tasks hide from the client; staff keep them", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    await page.getByTestId("task-title-input").fill("Cancelled task");
    await page.getByTestId("task-due-input").fill("2026-12-15");
    await page.getByTestId("task-assign-btn").click();
    await expect(page.getByText("Cancelled task")).toBeVisible({
      timeout: 10_000,
    });
    const row = page.locator("li", { hasText: "Cancelled task" });
    await row.getByTestId(/^task-cancel-btn-/).click();
    await expect(row.locator("[data-testid^=staff-task-state-]")).toHaveText(
      "Cancelled",
      { timeout: 10_000 },
    );

    await signIn(page, E2E.client);
    await page.goto(clientUrl());
    await expect(page.getByTestId("client-tasks")).toBeVisible();
    await expect(page.getByText("Cancelled task")).not.toBeVisible();
  });

  test("assistant reads tasks but sees no management controls", async ({
    page,
  }) => {
    // Seed an ACTIVE assignment for the assistant fixture.
    const assistantUser = await prisma.user.findUniqueOrThrow({
      where: { email: E2E.assistant },
    });
    const assistantMember = await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsId, userId: assistantUser.id },
    });
    const existing = await prisma.clientAssignment.findFirst({
      where: {
        workspaceId: wsId,
        clientProfileId: profileId,
        coachMemberId: assistantMember.id,
      },
    });
    const assignment = existing
      ? await prisma.clientAssignment.update({
          where: { id: existing.id },
          data: { status: "ACTIVE" },
        })
      : await prisma.clientAssignment.create({
          data: {
            workspaceId: wsId,
            clientProfileId: profileId,
            coachMemberId: assistantMember.id,
            role: "COACH",
            status: "ACTIVE",
          },
        });
    void assignment;

    await signIn(page, E2E.assistant);
    await page.goto(staffUrl());
    await expect(page.getByTestId("staff-tasks")).toBeVisible();
    await expect(page.getByText("Cancelled task")).toBeVisible();
    await expect(page.getByTestId("task-assign-btn")).not.toBeVisible();
    await expect(page.locator("[data-testid^=task-cancel-btn-]")).toHaveCount(
      0,
    );
  });

  test("mobile-width client flow stays operable (390px)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, E2E.client);
    await page.goto(clientUrl());
    await expect(page.getByTestId("client-tasks")).toBeVisible({
      timeout: 10_000,
    });
    const toggle = page.locator("[data-testid^=task-toggle-]").first();
    if (await toggle.isVisible()) {
      await toggle.click();
      await expect(toggle).not.toHaveText("Mark done");
    }
  });

  test("flag-off server denies the staff task surface", async ({ page }) => {
    await signIn(page, E2E.owner, FLAG_OFF);
    await page.goto(`${FLAG_OFF}${staffUrl()}`);
    await expect(
      page.getByRole("heading", { name: /not found|404/i }),
    ).toBeVisible();
  });
});
