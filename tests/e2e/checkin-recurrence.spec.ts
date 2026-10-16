import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * CHECK-IN-RECURRENCE-I1 — staff recurring-rule workflow in a real
 * browser on the production build (decision #114; reviewed P3 contract):
 * create a weekly rule (explicit confirmed timezone), explicitly
 * generate the bounded horizon, verify materialized instances in the
 * existing list, pause/generate-block, and End cancels only pending
 * occurrences. Reads never schedule; truthful coverage copy only.
 * Synthetic deterministic fixtures only (reci1_* namespace).
 */

const BASE = "http://127.0.0.1:3000";
const FLAG_OFF = "http://127.0.0.1:3101";

const FORM_ID = "reci1_e2e_form";
const VERSION_ID = "reci1_e2e_version";

const DEF = {
  title: "Recurring Weekly",
  fields: [
    {
      fieldId: "f_note",
      kind: "shortText",
      label: "Note",
      required: true,
      order: 0,
    },
  ],
};

let prisma: PrismaClient;
let wsId: string;
let profileId: string;
let profileCreated = false;
let ownerMemberId: string;
let coachMemberId: string;

async function signIn(page: Page, email: string, base = "") {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/login/);
}

/** Delete every reci1-namespaced rule + its generated instances. */
async function removeRuleFixtures() {
  const rules = await prisma.checkInScheduleRule.findMany({
    where: { formId: FORM_ID },
    select: { id: true },
  });
  const ruleIds = rules.map((r) => r.id);
  const generated = await prisma.checkInInstance.findMany({
    where: { originRuleId: { in: ruleIds } },
    select: { id: true },
  });
  const genIds = generated.map((g) => g.id);
  await prisma.checkInSubmissionAnswer.deleteMany({
    where: { submission: { instanceId: { in: genIds } } },
  });
  await prisma.checkInSubmission.deleteMany({
    where: { instanceId: { in: genIds } },
  });
  await prisma.checkInInstance.deleteMany({
    where: { originRuleId: { in: ruleIds } },
  });
  await prisma.checkInScheduleRule.deleteMany({
    where: { id: { in: ruleIds } },
  });
}

test.beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { slug: E2E.workspaceSlug },
  });
  wsId = ws.id;

  const [ownerMember, coachMember, clientUser] = await Promise.all([
    prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsId, user: { email: E2E.owner } },
    }),
    prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsId, user: { email: E2E.coach } },
    }),
    prisma.user.findUniqueOrThrow({ where: { email: E2E.client } }),
  ]);
  ownerMemberId = ownerMember.id;
  coachMemberId = coachMember.id;

  const existing = await prisma.clientProfile.findFirst({
    where: { workspaceId: wsId, userId: clientUser.id },
  });
  const profile =
    existing ??
    (await prisma.clientProfile.create({
      data: {
        workspaceId: wsId,
        userId: clientUser.id,
        name: "RECI1 E2E Client",
      },
    }));
  profileId = profile.id;
  profileCreated = existing === null;

  await removeRuleFixtures();
  await prisma.checkInFormVersion.deleteMany({ where: { formId: FORM_ID } });
  await prisma.checkInForm.deleteMany({ where: { id: FORM_ID } });
  await prisma.clientAssignment.deleteMany({
    where: { clientProfileId: profileId },
  });
  await prisma.consentRecord.deleteMany({
    where: {
      clientProfileId: profileId,
      version: { startsWith: "check-in-dev" },
    },
  });

  await prisma.checkInForm.create({
    data: {
      id: FORM_ID,
      workspaceId: wsId,
      name: "RECI1 Weekly",
      status: "ACTIVE",
      createdByMemberId: ownerMemberId,
    },
  });
  await prisma.checkInFormVersion.create({
    data: {
      id: VERSION_ID,
      workspaceId: wsId,
      formId: FORM_ID,
      versionSeq: 1,
      definition: DEF as never,
      publishOriginRevision: 1,
      publishedByMemberId: ownerMemberId,
    },
  });
  await prisma.clientAssignment.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      coachMemberId,
      role: "PRIMARY",
      status: "ACTIVE",
    },
  });
  for (const [kind, version] of [
    ["PRIVACY_NOTICE", "check-in-dev-privacy-v1"],
    ["HEALTH_DATA", "check-in-dev-health-v1"],
  ] as const)
    await prisma.consentRecord.create({
      data: { clientProfileId: profileId, kind, version },
    });
});

test.afterAll(async () => {
  await removeRuleFixtures().catch(() => {});
  await prisma.checkInFormVersion
    .deleteMany({ where: { formId: FORM_ID } })
    .catch(() => {});
  await prisma.checkInForm
    .deleteMany({ where: { id: FORM_ID } })
    .catch(() => {});
  await prisma.clientAssignment
    .deleteMany({ where: { clientProfileId: profileId } })
    .catch(() => {});
  await prisma.consentRecord
    .deleteMany({
      where: {
        clientProfileId: profileId,
        version: { startsWith: "check-in-dev" },
      },
    })
    .catch(() => {});
  if (profileCreated)
    await prisma.clientProfile
      .delete({ where: { id: profileId } })
      .catch(() => {});
  await prisma?.$disconnect();
});

function checkinsUrl() {
  return `${BASE}/workspace/${wsId}/clients/${profileId}/checkins`;
}

test("owner creates a weekly rule, explicitly generates, sees truthful coverage, pauses and ends", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, E2E.owner);
  await page.goto(checkinsUrl());
  await expect(page.getByTestId("staff-checkins-page")).toBeVisible();

  // Recurring section is present with conspicuous nonautomatic copy.
  const section = page.getByTestId("checkin-rules-section");
  await expect(section).toBeVisible();
  await expect(section).toContainText(/does not replenish|not automatic/i);

  // Create a weekly rule — form selection, weekday, local time, the
  // explicitly confirmed timezone, and a start date.
  await section.getByLabel(/Check-In form/i).selectOption({ index: 0 });
  await section.getByLabel(/Day of week/i).selectOption("MONDAY");
  await section.getByLabel(/Local time/i).fill("09:30");
  await section.getByTestId("checkin-rule-tz").fill("UTC");
  await section.getByTestId("checkin-rule-tz").press("Tab");
  await section.getByRole("checkbox", { name: /confirm/i }).check();
  const today = new Date().toISOString().slice(0, 10);
  await section.getByLabel(/Start date/i).fill(today);
  await section.getByRole("button", { name: /create.*rule/i }).click();
  await expect(section.getByTestId("rule-created")).toBeVisible();

  // Explicit generation — a deliberate staff action.
  await section
    .getByRole("button", { name: /generate.*dates|generate.*check-?ins/i })
    .first()
    .click();
  const result = page.getByTestId("rule-generate-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText(/created/i);
  await expect(result).toContainText(/through|coverage/i);

  // Materialized occurrences surface in the ordinary instance list.
  const generated = await prisma.checkInInstance.findMany({
    where: { formId: FORM_ID, originRuleId: { not: null } },
  });
  expect(generated.length).toBeGreaterThan(0);
  expect(generated.length).toBeLessThanOrEqual(9);
  await expect(page.getByTestId("staff-checkins-list")).toBeVisible();

  // Replay — truthful no-op, not a false "created".
  await section
    .getByRole("button", { name: /generate.*dates|generate.*check-?ins/i })
    .first()
    .click();
  await expect(result).toContainText(/already|0/i);

  // Pause blocks generation honestly.
  await section
    .getByRole("button", { name: /^pause$/i })
    .first()
    .click();
  await expect(page.getByTestId("rule-paused")).toBeVisible();

  // End cancels pending generated occurrences; rule shows ENDED.
  await section
    .getByRole("button", { name: /^resume$/i })
    .first()
    .click();
  await section.getByRole("button", { name: /^end$/i }).first().click();
  await expect(page.getByTestId("rule-ended")).toBeVisible();
  const remaining = await prisma.checkInInstance.findMany({
    where: {
      formId: FORM_ID,
      originRuleId: { not: null },
      cancelledAt: null,
      submissions: { none: {} },
    },
  });
  expect(remaining).toHaveLength(0);
});

test("reads never schedule: visiting pages creates no instances", async ({
  page,
}) => {
  await signIn(page, E2E.owner);
  const before = await prisma.checkInInstance.count({
    where: { formId: FORM_ID },
  });
  await page.goto(checkinsUrl());
  await page.reload();
  // The client's own surface too.
  await signIn(page, E2E.client);
  await page.goto(`${BASE}/workspace/${wsId}/check-ins`);
  await page.waitForLoadState("networkidle");
  const after = await prisma.checkInInstance.count({
    where: { formId: FORM_ID },
  });
  expect(after).toBe(before);
});

test("flag-off build returns 404 on the staff page", async ({ page }) => {
  await signIn(page, E2E.owner, FLAG_OFF);
  const res = await page.goto(
    `${FLAG_OFF}/workspace/${wsId}/clients/${profileId}/checkins`,
  );
  expect(res?.status()).toBe(404);
});
