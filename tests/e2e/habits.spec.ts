import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * HABITS-I1 (decision 110) — real TL21/TL22 journeys: staff create
 * habits on the editor page; the client sees + completes + undoes via
 * TL21; TL22 renders done/scheduled counts; archived habits leave TL21;
 * assistants read only; desktop 1440 / tablet 834 / mobile 390 and both
 * themes stay operable; flag-off denies.
 */

const BASE = "http://127.0.0.1:3000";
const FLAG_OFF = "http://127.0.0.1:3101";

let prisma: PrismaClient;
let wsId: string;
let profileId = "";
let createdProfile = false;
let seededLayout = false;

function utcToday(): string {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

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
          name: "Habit Client",
        },
      })
    ).id;
  }
  // RESTRICT order: logs → schedules → habits.
  const habitIds = (
    await prisma.habit.findMany({
      where: { workspaceId: wsId, clientProfileId: profileId },
      select: { id: true },
    })
  ).map((h) => h.id);
  await prisma.habitLog.deleteMany({ where: { habitId: { in: habitIds } } });
  await prisma.habitSchedule.deleteMany({
    where: { habitId: { in: habitIds } },
  });
  await prisma.habit.deleteMany({
    where: { workspaceId: wsId, clientProfileId: profileId },
  });
  // Seed a committed layout with client-visible TL21 + TL22 (avoids
  // editor interplay; layout behaviour is covered by the dashboard spec).
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
        name: "Habit Client's dashboard",
        widgets: [
          {
            id: "wh1",
            kind: "TL21",
            settings: {
              title: "Today's habits",
              source: "habits",
              summary: "today",
              period: "today",
              historyPeriod: "auto",
              target: false,
              size: "Compact",
              fields: [],
              labels: {},
              option: "list",
              unit: "",
              visibility: "client",
            },
          },
          {
            id: "wh2",
            kind: "TL22",
            settings: {
              title: "Habit consistency",
              source: "habits",
              summary: "scheduled-statuses",
              period: "7d",
              historyPeriod: "auto",
              target: false,
              size: "Compact",
              fields: [],
              labels: {},
              option: "scheduled",
              unit: "",
              visibility: "client",
            },
          },
        ],
        layouts: {
          desktop: {
            wh1: { x: 0, y: 0, w: 4, h: 3, size: "Compact" },
            wh2: { x: 4, y: 0, w: 4, h: 3, size: "Compact" },
          },
        },
        widths: { desktop: 1040 },
      },
    },
  });
  seededLayout = layout.revision === 1;
});

test.afterAll(async () => {
  const habitIds = (
    await prisma.habit.findMany({
      where: { workspaceId: wsId, clientProfileId: profileId },
      select: { id: true },
    })
  ).map((h) => h.id);
  await prisma.habitLog.deleteMany({ where: { habitId: { in: habitIds } } });
  await prisma.habitSchedule.deleteMany({
    where: { habitId: { in: habitIds } },
  });
  await prisma.habit.deleteMany({
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

async function checkAllDays(page: Page, prefix: string) {
  for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
    await page.getByLabel(`${prefix} ${day}`).check();
}

test.describe("HABITS-I1", () => {
  test("owner creates; client marks done + undoes via TL21; TL22 counts", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    await expect(page.getByTestId("staff-habits")).toBeVisible();
    await page.getByTestId("habit-name-input").fill("Walk the dog");
    await page.getByTestId("habit-target-input").fill("30 min");
    await page.getByTestId("habit-start-input").fill(utcToday());
    await checkAllDays(page, "habit-create");
    await page.getByTestId("habit-create-btn").click();
    await expect(page.getByText("Walk the dog")).toBeVisible({
      timeout: 10_000,
    });

    // Client sees it via TL21 and marks done.
    await signIn(page, E2E.client);
    await page.goto(clientUrl());
    const clientHabits = page.getByTestId("client-habits");
    const toggle = clientHabits.locator("[data-testid^=habit-toggle-]");
    await expect(toggle).toHaveText("Mark done", { timeout: 10_000 });
    await expect(clientHabits.getByText("Walk the dog")).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveText("Undo", { timeout: 10_000 });
    await expect(page.locator("[data-testid^=habit-state-]")).toHaveText(
      "Done",
    );

    // TL22 reflects the mark.
    await expect(page.getByTestId("consistency-total")).toContainText(
      "1 of 1 done",
    );

    // Persists across refresh.
    await page.reload();
    await expect(page.locator("[data-testid^=habit-state-]")).toHaveText(
      "Done",
    );

    // Undo restores Not logged.
    await page.locator("[data-testid^=habit-toggle-]").click();
    await expect(page.locator("[data-testid^=habit-state-]")).toHaveText(
      "Not logged",
    );
  });

  test("archived habit leaves TL21 but TL22 keeps its history", async ({
    page,
  }) => {
    // Self-contained: the habit is created through the real staff flow
    // inside this test — worker restarts after a failure re-run
    // beforeAll, so no test may depend on another test's rows.
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    await page.getByTestId("habit-name-input").fill("Archived habit");
    await page.getByTestId("habit-target-input").fill("T");
    await page.getByTestId("habit-start-input").fill(utcToday());
    await checkAllDays(page, "habit-create");
    await page.getByTestId("habit-create-btn").click();
    await expect(page.getByText("Archived habit")).toBeVisible({
      timeout: 10_000,
    });

    // The client sees it in TL21 while it is active.
    await signIn(page, E2E.client);
    await page.goto(clientUrl());
    const clientHabits = page.getByTestId("client-habits");
    await expect(clientHabits.getByText("Archived habit")).toBeVisible({
      timeout: 10_000,
    });

    // Owner archives it — same-day archive still keeps it out of TL21.
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    const row = page.locator("li", { hasText: "Archived habit" });
    await row.getByTestId(/^habit-archive-btn-/).click();
    await expect(row.locator("[data-testid^=staff-habit-state-]")).toHaveText(
      "Archived",
      { timeout: 10_000 },
    );

    await signIn(page, E2E.client);
    await page.goto(clientUrl());
    await expect(page.getByTestId("client-habits")).toBeVisible();
    await expect(clientHabits.getByText("Archived habit")).not.toBeVisible();
    // TL22 keeps the archived row's history — the row exists in counts.
    await expect(
      page.locator("[data-testid^=consistency-row-]", {
        hasText: "Archived habit",
      }),
    ).toBeVisible();
    await expect(page.getByTestId("consistency-total")).toContainText("of");
  });

  test("assistant reads habits but sees no management controls", async ({
    page,
  }) => {
    // Seed directly — this test verifies the assistant's read-only view,
    // not the creation flow (covered above), and must not depend on
    // another test's rows.
    const habit = await prisma.habit.create({
      data: {
        workspaceId: wsId,
        clientProfileId: profileId,
        name: "Seeded habit",
        target: "T",
      },
    });
    await prisma.habitSchedule.create({
      data: {
        habitId: habit.id,
        effectiveFrom: new Date(`${utcToday()}T00:00:00Z`),
        weekdays: 127,
      },
    });
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
    if (existing)
      await prisma.clientAssignment.update({
        where: { id: existing.id },
        data: { status: "ACTIVE" },
      });
    else
      await prisma.clientAssignment.create({
        data: {
          workspaceId: wsId,
          clientProfileId: profileId,
          coachMemberId: assistantMember.id,
          role: "COACH",
          status: "ACTIVE",
        },
      });

    await signIn(page, E2E.assistant);
    await page.goto(staffUrl());
    await expect(page.getByTestId("staff-habits")).toBeVisible();
    await expect(page.getByText("Seeded habit")).toBeVisible();
    await expect(page.getByTestId("habit-create-btn")).not.toBeVisible();
    await expect(page.locator("[data-testid^=habit-archive-btn-]")).toHaveCount(
      0,
    );
  });

  test("desktop 1440 / tablet 834 / mobile 390 stay operable", async ({
    page,
  }) => {
    for (const width of [1440, 834, 390] as const) {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, E2E.client);
      await page.goto(clientUrl());
      await expect(page.getByTestId("client-habits")).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByTestId("client-consistency")).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  });

  test("both themes render the widgets", async ({ page }) => {
    await signIn(page, E2E.client);
    await page.goto(clientUrl());
    await expect(page.getByTestId("client-habits")).toBeVisible({
      timeout: 10_000,
    });

    // Drive both themes via the same storage the appearance control
    // writes — init scripts cannot be used here (they re-run on reload).
    await page.evaluate(() =>
      window.localStorage.setItem("appearance", "pro-white"),
    );
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      "pro-white",
    );
    await expect(page.getByTestId("client-habits")).toBeVisible();

    await page.evaluate(() =>
      window.localStorage.setItem("appearance", "pro-dark"),
    );
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      "pro-dark",
    );
    await expect(page.getByTestId("client-habits")).toBeVisible();
  });

  test("flag-off server denies the staff habit surface", async ({ page }) => {
    await signIn(page, E2E.owner, FLAG_OFF);
    await page.goto(`${FLAG_OFF}${staffUrl()}`);
    await expect(
      page.getByRole("heading", { name: /not found|404/i }),
    ).toBeVisible();
  });
});
