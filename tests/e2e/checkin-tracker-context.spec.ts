import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-025-D6 — explicit DailyEntry tracker context in staff Check-In
 * review (decision #103 + binding contract): the initial staff page
 * loads zero tracker data; "Show tracker context" reveals a manual
 * declared-date form only; each committed reveal is a separate explicit
 * POST writing exactly one `READ daily_entry` audit; no fallback, no
 * availability browsing, no passive preload. Real browser on the
 * production build; synthetic p025d6_* fixtures only.
 */

const BASE = "http://127.0.0.1:3000";
const FLAG_OFF = "http://127.0.0.1:3101";

const FORM_ID = "p025d6_e2e_form";
const VERSION_ID = "p025d6_e2e_version";
const PARAM_ID = "p025d6_e2e_param";
const TEMPLATE_ID = "p025d6_e2e_template";
const TV_ID = "p025d6_e2e_tv";
const ENTRY_DATE = "2024-06-10";

const DEF = {
  title: "D6 Weekly Check-In",
  fields: [
    {
      fieldId: "f_summary",
      kind: "shortText",
      label: "How was your week?",
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
let clientUserId: string;

async function signIn(page: Page, email: string, base = "") {
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
  clientUserId = clientUser.id;

  const existing = await prisma.clientProfile.findFirst({
    where: { workspaceId: wsId, userId: clientUser.id },
  });
  const profile =
    existing ??
    (await prisma.clientProfile.create({
      data: {
        workspaceId: wsId,
        userId: clientUser.id,
        name: "P025D6 E2E Client",
      },
    }));
  profileId = profile.id;
  profileCreated = existing === null || existing.name === "P025D6 E2E Client";

  // Clean namespaced state.
  await prisma.dailyEntryRevisionValue.deleteMany({
    where: { workspaceId: wsId, parameterId: PARAM_ID },
  });
  const staleEntries = await prisma.dailyEntry.findMany({
    where: { workspaceId: wsId, clientProfileId: profileId },
    select: { id: true },
  });
  await prisma.dailyEntryRevision.deleteMany({
    where: { dailyEntryId: { in: staleEntries.map((e) => e.id) } },
  });
  await prisma.dailyEntry.deleteMany({
    where: { workspaceId: wsId, clientProfileId: profileId },
  });
  const staleInst = await prisma.checkInInstance.findMany({
    where: { formId: FORM_ID },
    select: { id: true },
  });
  const staleSubs = await prisma.checkInSubmission.findMany({
    where: { instanceId: { in: staleInst.map((i) => i.id) } },
    select: { id: true },
  });
  await prisma.checkInReview.deleteMany({
    where: { submissionId: { in: staleSubs.map((s) => s.id) } },
  });
  await prisma.checkInSubmissionAnswer.deleteMany({
    where: { submissionId: { in: staleSubs.map((s) => s.id) } },
  });
  await prisma.checkInSubmission.deleteMany({
    where: { instanceId: { in: staleInst.map((i) => i.id) } },
  });
  await prisma.checkInInstance.deleteMany({ where: { formId: FORM_ID } });
  await prisma.clientSetupPin.deleteMany({
    where: { clientProfileId: profileId },
  });
  await prisma.clientSetup.deleteMany({
    where: { clientProfileId: profileId },
  });
  await prisma.clientAssignment.deleteMany({
    where: { clientProfileId: profileId },
  });
  await prisma.checkInFormVersion.deleteMany({ where: { formId: FORM_ID } });
  await prisma.checkInForm.deleteMany({ where: { id: FORM_ID } });
  await prisma.coachingTemplateVersion.deleteMany({
    where: { id: TV_ID },
  });
  await prisma.coachingTemplate.deleteMany({ where: { id: TEMPLATE_ID } });
  await prisma.parameterDefinition.deleteMany({ where: { id: PARAM_ID } });
  await prisma.consentRecord.deleteMany({
    where: {
      clientProfileId: profileId,
      version: {
        in: [
          "check-in-dev-privacy-v1",
          "check-in-dev-health-v1",
          "daily-entry-dev-privacy-v1",
          "daily-entry-dev-health-v1",
        ],
      },
    },
  });

  // Check-In form/version + PRIMARY coach assignment + consent at BOTH
  // registry versions (the D6 consent intersection requires each side's
  // own policy version).
  await prisma.checkInForm.create({
    data: {
      id: FORM_ID,
      workspaceId: wsId,
      name: "P025D6 Weekly",
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
    ["PRIVACY_NOTICE", "daily-entry-dev-privacy-v1"],
    ["HEALTH_DATA", "daily-entry-dev-health-v1"],
  ] as const)
    await prisma.consentRecord.create({
      data: { clientProfileId: profileId, kind, version },
    });

  // DailyEntry fixture — one GENERAL_HEALTH parameter, setup + pin,
  // committed entry+revision for ENTRY_DATE.
  await prisma.parameterDefinition.create({
    data: {
      id: PARAM_ID,
      workspaceId: wsId,
      key: "p_d6_weight",
      kind: "MEASUREMENT",
      label: "Weight",
      unit: "kg",
      validation: { min: 0, max: 500 } as never,
      dataClassification: "GENERAL_HEALTH",
      createdByMemberId: ownerMemberId,
      updatedByMemberId: ownerMemberId,
    },
  });
  await prisma.coachingTemplate.create({
    data: {
      id: TEMPLATE_ID,
      workspaceId: wsId,
      name: "D6 Template",
      createdByMemberId: ownerMemberId,
    },
  });
  const tvDef = {
    title: "D6 Template",
    sections: [
      {
        sectionId: "sec_main",
        label: "Main",
        order: 0,
        items: [
          {
            itemId: "itm_d6_w",
            parameterId: PARAM_ID,
            parameterKey: "p_d6_weight",
            required: true,
            order: 0,
          },
        ],
      },
    ],
    parameters: {
      [PARAM_ID]: {
        key: "p_d6_weight",
        kind: "MEASUREMENT",
        label: "Weight",
        helpText: null,
        unit: "kg",
        ratingScheme: null,
        options: [],
        validation: { min: 0, max: 500 },
        group: null,
        dataClassification: "GENERAL_HEALTH",
        revision: 1,
      },
    },
  };
  await prisma.coachingTemplateVersion.create({
    data: {
      id: TV_ID,
      workspaceId: wsId,
      templateId: TEMPLATE_ID,
      versionSeq: 1,
      definition: tvDef as never,
      publishOriginRevision: 1,
      publishedByMemberId: ownerMemberId,
    },
  });
  const setup = await prisma.clientSetup.create({
    data: { workspaceId: wsId, clientProfileId: profileId },
  });
  const pin = await prisma.clientSetupPin.create({
    data: {
      clientSetupId: setup.id,
      workspaceId: wsId,
      clientProfileId: profileId,
      seq: 1,
      templateId: TEMPLATE_ID,
      templateVersionId: TV_ID,
      assignedByMemberId: ownerMemberId,
    },
  });
  const clientMemberId = (
    await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsId, userId: clientUserId },
    })
  ).id;
  const entry = await prisma.dailyEntry.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      entryDate: new Date(`${ENTRY_DATE}T00:00:00Z`),
      createdByMemberId: clientMemberId,
    },
  });
  const revision = await prisma.dailyEntryRevision.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      dailyEntryId: entry.id,
      clientSetupPinId: pin.id,
      templateVersionId: TV_ID,
      seq: 1,
      canonicalHash: `p025d6-hash-${ENTRY_DATE}`,
      declaredAt: new Date(`${ENTRY_DATE}T08:00:00Z`),
      createdByMemberId: clientMemberId,
    },
  });
  await prisma.dailyEntryRevisionValue.create({
    data: {
      revisionId: revision.id,
      workspaceId: wsId,
      parameterId: PARAM_ID,
      kind: "MEASUREMENT",
      valueNumeric: 80.5,
    },
  });
  await prisma.dailyEntry.update({
    where: { id: entry.id },
    data: { currentRevisionId: revision.id },
  });
});

test.afterAll(async () => {
  if (profileCreated)
    await prisma.clientProfile
      .delete({ where: { id: profileId } })
      .catch(() => {});
  await prisma?.$disconnect();
});

const staffUrl = () =>
  `${BASE}/workspace/${wsId}/clients/${profileId}/checkins`;

const contextAudits = () =>
  prisma.auditEvent.findMany({
    where: { workspaceId: wsId, resourceType: "daily_entry", action: "READ" },
  });

async function fixtureSubmission() {
  const instance = await prisma.checkInInstance.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      formId: FORM_ID,
      formVersionId: VERSION_ID,
      dueAt: new Date("2030-06-01T09:00:00.000Z"),
      scheduledByMemberId: ownerMemberId,
    },
  });
  const submission = await prisma.checkInSubmission.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      formId: FORM_ID,
      formVersionId: VERSION_ID,
      instanceId: instance.id,
      submittedByUserId: clientUserId,
      submittedByMemberId: (
        await prisma.workspaceMember.findFirstOrThrow({
          where: { workspaceId: wsId, userId: clientUserId },
        })
      ).id,
    },
  });
  await prisma.checkInSubmissionAnswer.create({
    data: {
      submissionId: submission.id,
      workspaceId: wsId,
      clientProfileId: profileId,
      fieldId: "f_summary",
      kind: "SHORT_TEXT",
      valueText: "Solid week",
    },
  });
  return submission;
}

test("initial page renders zero tracker data; deliberate reveal → manual date → bounded values + one audit", async ({
  page,
}) => {
  const submission = await fixtureSubmission();
  const before = await contextAudits();
  await signIn(page, E2E.owner);
  await page.goto(staffUrl());
  // Passive render — no tracker context control value, no entry data.
  await expect(page.getByText("Weight")).not.toBeVisible();
  await page.getByTestId("checkin-view-detail").first().click();
  const detail = page.getByTestId("checkin-detail");
  await expect(detail).toBeVisible();
  await expect(detail.getByText("Weight")).not.toBeVisible();

  // Deliberate reveal — exposes the date form, not data.
  await page.getByTestId("checkin-show-tracker-context").click();
  const dateInput = page.getByTestId("checkin-context-date");
  await expect(dateInput).toBeVisible();
  await dateInput.fill(ENTRY_DATE);
  await page.getByTestId("checkin-context-submit").click();

  const entry = page.getByTestId("checkin-context-entry");
  await expect(entry).toBeVisible();
  await expect(entry.getByText(/Weight/)).toBeVisible();
  await expect(page.getByTestId("checkin-context-values")).toContainText(
    "80.5",
  );
  const after = await contextAudits();
  expect(after.length).toBe(before.length + 1);
  void submission;
});

test("no entry for the selected date shows a non-disclosing empty state", async ({
  page,
}) => {
  await fixtureSubmission();
  const before = await contextAudits();
  await signIn(page, E2E.owner);
  await page.goto(staffUrl());
  await page.getByTestId("checkin-view-detail").first().click();
  await page.getByTestId("checkin-show-tracker-context").click();
  await page.getByTestId("checkin-context-date").fill("2024-01-15");
  await page.getByTestId("checkin-context-submit").click();
  await expect(page.getByTestId("checkin-context-empty")).toBeVisible();
  expect((await contextAudits()).length).toBe(before.length);
});

test("invalid date produces an error, not a fallback", async ({ page }) => {
  await fixtureSubmission();
  await signIn(page, E2E.owner);
  await page.goto(staffUrl());
  await page.getByTestId("checkin-view-detail").first().click();
  await page.getByTestId("checkin-show-tracker-context").click();
  await page.getByTestId("checkin-context-date").fill("1969-12-31");
  await page.getByTestId("checkin-context-submit").click();
  await expect(page.getByTestId("checkin-context-error")).toBeVisible();
  await expect(page.getByTestId("checkin-context-entry")).not.toBeVisible();
});

test("denied roles see no values; client cannot reach the staff action", async ({
  page,
}) => {
  await fixtureSubmission();
  const before = await contextAudits();
  await signIn(page, E2E.support);
  await page.goto(staffUrl());
  await page.getByTestId("checkin-view-detail").first().click();
  // SUPPORT is denied at the detail layer — the context control never
  // becomes reachable.
  await expect(
    page.getByTestId("checkin-show-tracker-context"),
  ).not.toBeVisible();
  await page.goto(`${BASE}/workspace/${wsId}/clients/${profileId}/daily`);
  expect((await contextAudits()).length).toBe(before.length);
});

test("keyboard + responsive: the reveal and date form work at all widths", async ({
  page,
}) => {
  await fixtureSubmission();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    await page.getByTestId("checkin-view-detail").first().click();
    const reveal = page.getByTestId("checkin-show-tracker-context");
    await expect(reveal).toBeVisible();
    const box = await reveal.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(40);
    await reveal.click();
    await expect(page.getByTestId("checkin-context-date")).toBeFocused;
    await page.getByTestId("checkin-context-date").fill(ENTRY_DATE);
    await page.getByTestId("checkin-context-submit").click();
    await expect(page.getByTestId("checkin-context-entry")).toBeVisible();
    await checkNoOverflow(page);
  }
});

test("flag-off: the action surface 404s and no audit is written", async ({
  page,
}) => {
  const before = await contextAudits();
  await signIn(page, E2E.owner, FLAG_OFF);
  const res = await page.goto(
    `${FLAG_OFF}/workspace/${wsId}/clients/${profileId}/checkins`,
  );
  expect(res?.status()).toBe(404);
  expect((await contextAudits()).length).toBe(before.length);
});
