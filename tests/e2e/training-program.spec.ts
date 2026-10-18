import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * TRAINING-I1A (PROMPT 244) — real-browser synthetic journey on the
 * production build: assigned coach creates a week-based program → adds
 * sessions/exercises → saves → confirms timezone → publishes → client
 * views the prescribed week (verbatim values); a scheduled replacement
 * is labelled and cancellable; flag-off server 404s both surfaces.
 * Synthetic deterministic fixtures only (ti1a_*).
 */

const BASE = "http://127.0.0.1:3000";
const FLAG_OFF = "http://127.0.0.1:3101";

let prisma: PrismaClient;
let wsId: string;
let profileId = "";
let profileCreated = false;
let coachMemberId: string;

async function signIn(page: Page, email: string, base = BASE) {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/login/);
}

const checkNoOverflow = async (page: Page) => {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
};

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test.beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { slug: E2E.workspaceSlug },
  });
  wsId = ws.id;
  const [coachMember, clientUser] = await Promise.all([
    prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsId, user: { email: E2E.coach } },
    }),
    prisma.user.findUniqueOrThrow({ where: { email: E2E.client } }),
  ]);
  coachMemberId = coachMember.id;
  profileId = `ti1a_e2e_client`;
  const existing = await prisma.clientProfile.findUnique({
    where: { id: profileId },
  });
  if (!existing) {
    await prisma.clientProfile.create({
      data: {
        id: profileId,
        workspaceId: wsId,
        userId: clientUser.id,
        name: "TI1A Fixture Client",
      },
    });
    profileCreated = true;
  }
  await prisma.clientAssignment.upsert({
    where: {
      clientProfileId_coachMemberId: {
        clientProfileId: profileId,
        coachMemberId,
      },
    },
    update: { status: "ACTIVE", role: "PRIMARY" },
    create: {
      workspaceId: wsId,
      clientProfileId: profileId,
      coachMemberId,
      role: "PRIMARY",
      status: "ACTIVE",
    },
  });
  for (const [kind, version] of [
    ["PRIVACY_NOTICE", "training-plan-dev-privacy-v1"],
    ["HEALTH_DATA", "training-plan-dev-health-v1"],
  ] as const) {
    const existing = await prisma.consentRecord.findFirst({
      where: { clientProfileId: profileId, kind, version },
    });
    if (existing) {
      await prisma.consentRecord.update({
        where: { id: existing.id },
        data: { revokedAt: null },
      });
    } else {
      await prisma.consentRecord.create({
        data: {
          clientProfileId: profileId,
          kind,
          version,
          grantedByUserId: clientUser.id,
          source: "CLIENT_SELF",
        },
      });
    }
  }
});

test.afterAll(async () => {
  const programs = await prisma.trainingProgram
    .findMany({ where: { clientProfileId: profileId }, select: { id: true } })
    .catch(() => [] as { id: string }[]);
  const programIds = programs.map((p) => p.id);
  const versions = programIds.length
    ? await prisma.trainingProgramVersion.findMany({
        where: { programId: { in: programIds } },
        select: { id: true },
      })
    : [];
  await prisma.auditEvent
    .deleteMany({
      where: {
        OR: [
          {
            resourceType: "training_program",
            resourceId: { in: programIds.length ? programIds : ["-"] },
          },
          {
            resourceType: "training_program_version",
            resourceId: { in: versions.map((v) => v.id).concat(["-"]) },
          },
          {
            resourceType: "training_program",
            subjectClientProfileId: profileId,
          },
          {
            resourceType: "training_program_version",
            subjectClientProfileId: profileId,
          },
        ],
      },
    })
    .catch(() => {});
  await prisma.trainingProgramVersion
    .deleteMany({
      where: { programId: { in: programIds.length ? programIds : ["-"] } },
    })
    .catch(() => {});
  await prisma.trainingProgram
    .deleteMany({ where: { clientProfileId: profileId } })
    .catch(() => {});
  await prisma.clientAssignment
    .deleteMany({ where: { clientProfileId: profileId } })
    .catch(() => {});
  await prisma.consentRecord
    .deleteMany({
      where: {
        clientProfileId: profileId,
        version: { startsWith: "training-plan-dev" },
      },
    })
    .catch(() => {});
  if (profileCreated)
    await prisma.clientProfile
      .delete({ where: { id: profileId } })
      .catch(() => {});
  await prisma.$disconnect();
});

test("coach authors → publishes → client views prescribed week", async ({
  page,
}) => {
  const listUrl = `${BASE}/workspace/${wsId}/clients/${profileId}/training-program`;
  await signIn(page, E2E.coach);
  await page.goto(listUrl);
  await expect(page.getByTestId("staff-training-page")).toBeVisible();

  // Create a program starting today.
  await page.getByTestId("tp-create-title").fill("E2E Base Block");
  await page.getByTestId("tp-create-start").fill(today());
  await page.getByTestId("tp-create-weeks").fill("4");
  await page.getByTestId("tp-create-tz").fill("UTC");
  await page.getByTestId("tp-create-submit").click();
  await expect(page.getByTestId("staff-training-detail")).toBeVisible();

  // Add a session + exercise + prescription in week 1.
  await page.getByTestId("tp-session-add").click();
  const sessionFieldset = page.locator("fieldset[data-testid^='tp-session-']");
  await expect(sessionFieldset.first()).toBeVisible();
  await sessionFieldset
    .first()
    .getByTestId(/tp-exercise-add-/)
    .click();
  const exercise = sessionFieldset
    .first()
    .locator("fieldset[data-testid^='tp-exercise-']")
    .first();
  await exercise.getByTestId(/tp-ex-name-/).fill("Back squat");
  await exercise.getByTestId(/tp-cell-.*-sets/).fill("4");
  await exercise.getByTestId(/tp-cell-.*-reps/).fill("6");
  await page.getByTestId("tp-save-draft").click();
  await expect(page.getByTestId("training-status")).toContainText(/saved/i);

  // Publish v1 (effective at the program start date).
  await page.getByTestId("tp-effective").fill(today());
  await page.getByTestId("tp-publish").click();
  await expect(page.getByTestId("training-status")).toContainText(/published/i);
  await checkNoOverflow(page);

  // Client views week 1 verbatim.
  await signIn(page, E2E.client);
  await page.goto(`${BASE}/workspace/${wsId}/training-program`);
  await expect(page.getByTestId("client-training-page")).toBeVisible();
  await expect(page.getByTestId("training-current")).toContainText(
    "E2E Base Block",
  );
  await expect(page.getByTestId("training-current")).toContainText(
    "Back squat",
  );
  await expect(page.getByTestId("training-current")).toContainText("Sets: 4");
  await expect(page.getByTestId("training-current")).toContainText("Reps: 6");
  // No write affordance exists for the client.
  await expect(page.getByTestId("tp-save-draft")).toHaveCount(0);
  await checkNoOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await checkNoOverflow(page);
});

test("scheduled replacement is labelled and cancellable", async ({ page }) => {
  const listUrl = `${BASE}/workspace/${wsId}/clients/${profileId}/training-program`;
  await signIn(page, E2E.coach);
  await page.goto(listUrl);
  await expect(page.getByTestId("staff-training-page")).toBeVisible();

  // Create the replacement program starting in 4 weeks.
  await page.getByTestId("tp-create-title").fill("E2E Next Block");
  await page.getByTestId("tp-create-start").fill(inDays(28));
  await page.getByTestId("tp-create-weeks").fill("4");
  await page.getByTestId("tp-create-tz").fill("UTC");
  await page.getByTestId("tp-create-submit").click();
  await expect(page.getByTestId("staff-training-detail")).toBeVisible();

  // Minimum complete draft (session + exercise + prescription), save, then
  // publish claiming the current program.
  await page.getByTestId("tp-session-add").click();
  const fieldset = page.locator("fieldset[data-testid^='tp-session-']");
  await fieldset
    .first()
    .getByTestId(/tp-exercise-add-/)
    .click();
  const exercise = fieldset
    .first()
    .locator("fieldset[data-testid^='tp-exercise-']")
    .first();
  await exercise.getByTestId(/tp-ex-name-/).fill("Leg press");
  await exercise.getByTestId(/tp-cell-.*-sets/).fill("3");
  await exercise.getByTestId(/tp-cell-.*-reps/).fill("10");
  await page.getByTestId("tp-save-draft").click();
  await expect(page.getByTestId("training-status")).toContainText(/saved/i);
  await page.getByTestId("tp-predecessor").selectOption({ index: 1 });
  await page.getByTestId("tp-effective").fill(inDays(28));
  await page.getByTestId("tp-publish").click();
  await expect(page.getByTestId("training-status")).toContainText(/published/i);

  // The pending replacement offers cancellation.
  await expect(page.getByTestId("tp-cancel")).toBeVisible();
  await page.getByTestId("tp-cancel").click();
  await expect(page.getByTestId("training-status")).toContainText(/cancelled/i);

  // Client still sees only the current program — nothing leaked.
  await signIn(page, E2E.client);
  await page.goto(`${BASE}/workspace/${wsId}/training-program`);
  await expect(page.getByTestId("training-current")).toBeVisible();
  await expect(page.getByTestId("training-current")).not.toContainText(
    "E2E Next Block",
  );
});

test("unassigned owner sees a read-only list", async ({ page }) => {
  await signIn(page, E2E.owner);
  await page.goto(
    `${BASE}/workspace/${wsId}/clients/${profileId}/training-program`,
  );
  await expect(page.getByTestId("staff-training-page")).toBeVisible();
  await expect(page.getByTestId("tp-create-submit")).toHaveCount(0);
});

test("flag-off server: staff and client routes return 404", async ({
  page,
}) => {
  await signIn(page, E2E.coach, FLAG_OFF);
  const staffResp = await page.goto(
    `${FLAG_OFF}/workspace/${wsId}/clients/${profileId}/training-program`,
  );
  expect(staffResp?.status()).toBe(404);
  await signIn(page, E2E.client, FLAG_OFF);
  const clientResp = await page.goto(
    `${FLAG_OFF}/workspace/${wsId}/training-program`,
  );
  expect(clientResp?.status()).toBe(404);
});
