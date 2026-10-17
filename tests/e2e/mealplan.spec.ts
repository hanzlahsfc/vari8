import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * MEAL-PLAN-I1 — real-browser synthetic journey on the production build:
 * assigned coach confirms timezone → drafts → publishes an effective-dated
 * version → client views the published plan (all variants, verbatim
 * values); unassigned owner sees a read-only view; assistant read-only;
 * flag-off server 404s. Synthetic deterministic fixtures only (mpi1_*).
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
  profileId = `mpi1_e2e_client`;
  const existing = await prisma.clientProfile.findUnique({
    where: { id: profileId },
  });
  if (!existing) {
    await prisma.clientProfile.create({
      data: {
        id: profileId,
        workspaceId: wsId,
        userId: clientUser.id,
        name: "MPI1 Fixture Client",
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
    ["PRIVACY_NOTICE", "meal-plan-dev-privacy-v1"],
    ["HEALTH_DATA", "meal-plan-dev-health-v1"],
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
  const plans = await prisma.mealPlan
    .findMany({ where: { clientProfileId: profileId }, select: { id: true } })
    .catch(() => [] as { id: string }[]);
  const planIds = plans.map((p) => p.id);
  const versions = planIds.length
    ? await prisma.mealPlanVersion.findMany({
        where: { mealPlanId: { in: planIds } },
        select: { id: true },
      })
    : [];
  await prisma.auditEvent
    .deleteMany({
      where: {
        OR: [
          {
            resourceType: "meal_plan",
            resourceId: { in: planIds.length ? planIds : ["-"] },
          },
          {
            resourceType: "meal_plan_version",
            resourceId: { in: versions.map((v) => v.id).concat(["-"]) },
          },
          { resourceType: "meal_plan", subjectClientProfileId: profileId },
          {
            resourceType: "meal_plan_version",
            subjectClientProfileId: profileId,
          },
        ],
      },
    })
    .catch(() => {});
  await prisma.mealPlanVersion
    .deleteMany({
      where: { mealPlanId: { in: planIds.length ? planIds : ["-"] } },
    })
    .catch(() => {});
  await prisma.mealPlan
    .deleteMany({ where: { clientProfileId: profileId } })
    .catch(() => {});
  await prisma.clientAssignment
    .deleteMany({ where: { clientProfileId: profileId } })
    .catch(() => {});
  await prisma.consentRecord
    .deleteMany({
      where: {
        clientProfileId: profileId,
        version: { startsWith: "meal-plan-dev" },
      },
    })
    .catch(() => {});
  if (profileCreated)
    await prisma.clientProfile
      .delete({ where: { id: profileId } })
      .catch(() => {});
  await prisma.$disconnect();
});

test("assigned coach confirms tz → drafts → publishes; client views plan", async ({
  page,
}) => {
  const staffUrl = `${BASE}/workspace/${wsId}/clients/${profileId}/meal-plan`;
  await signIn(page, E2E.coach);
  await page.goto(staffUrl);
  await expect(page.getByTestId("staff-mealplan-page")).toBeVisible();

  // Confirm the client's scheduling timezone explicitly.
  await page.getByTestId("mealplan-timezone").fill("UTC");
  await page.getByTestId("mealplan-tz-confirm").click();
  await expect(page.getByTestId("mealplan-status")).toContainText(
    /timezone|confirmed/i,
  );

  // Edit the draft and save (creates the plan container).
  await page.getByTestId("mealplan-title").fill("E2E Cut Plan");
  await page.getByTestId("variant-label-0").fill("Training day");
  await page.getByTestId("meal-name-0-0").fill("Breakfast");
  await page.getByTestId("meal-food-0-0").fill("Synthetic oats and whey");
  await page.getByTestId("meal-kcal-0-0").fill("352");
  await page.getByTestId("mealplan-save-draft").click();
  await expect(page.getByTestId("mealplan-status")).toContainText(/saved/i);

  // Publish today's version.
  await page.getByTestId("mealplan-effective-date").fill(today());
  await page.getByTestId("mealplan-publish").click();
  await expect(page.getByTestId("mealplan-status")).toContainText(/published/i);
  await checkNoOverflow(page);

  // Client views the published plan — verbatim values, all variants.
  await signIn(page, E2E.client);
  await page.goto(`${BASE}/workspace/${wsId}/meal-plan`);
  await expect(page.getByTestId("client-mealplan-page")).toBeVisible();
  await expect(page.getByTestId("mealplan-current")).toContainText(
    "Training day",
  );
  await expect(page.getByTestId("mealplan-current")).toContainText(
    "Synthetic oats and whey",
  );
  await expect(page.getByTestId("mealplan-current")).toContainText("352");
  // No write affordance exists for the client.
  await expect(page.getByTestId("mealplan-save-draft")).toHaveCount(0);
  await checkNoOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await checkNoOverflow(page);
});

test("unassigned owner sees a read-only view", async ({ page }) => {
  await signIn(page, E2E.owner);
  await page.goto(`${BASE}/workspace/${wsId}/clients/${profileId}/meal-plan`);
  await expect(page.getByTestId("staff-mealplan-page")).toBeVisible();
  await expect(page.getByTestId("mealplan-save-draft")).toHaveCount(0);
  await expect(page.getByTestId("mealplan-publish")).toHaveCount(0);
});

test("flag-off server: staff and client routes return 404", async ({
  page,
}) => {
  await signIn(page, E2E.coach, FLAG_OFF);
  const staffResp = await page.goto(
    `${FLAG_OFF}/workspace/${wsId}/clients/${profileId}/meal-plan`,
  );
  expect(staffResp?.status()).toBe(404);
  await signIn(page, E2E.client, FLAG_OFF);
  const clientResp = await page.goto(`${FLAG_OFF}/workspace/${wsId}/meal-plan`);
  expect(clientResp?.status()).toBe(404);
});
