import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-024 — staff onboarding-submission review on the primary test server
 * (:3000, ENABLE_ONBOARDING_SUBMISSION=1) and the flag-OFF server (:3101).
 * Task-owned synthetic fixtures: a published intake form pinned to a
 * COMPLETED assignment with a committed submission + answers for the
 * reserved client profile, dev consent rows, and coaching assignments
 * for the reserved coach and assistant.
 */

const BASE = "http://127.0.0.1:3000";
const FLAG_OFF = "http://127.0.0.1:3101";

const FORM_ID = "p024_e2e_form";
const VERSION_ID = "p024_e2e_version";
const ASSIGNMENT_ID = "p024_e2e_assignment";
const SUBMISSION_ID = "p024_e2e_submission";
const PROFILE_ID = "p024_e2e_client_profile";
const CLIENT_ASSIGN_ID = "p024_e2e_client_assign";
const ASSISTANT_ASSIGN_ID = "p024_e2e_assistant_assign";

const DEF = {
  title: "P024 Intake",
  fields: [
    {
      fieldId: "f_name",
      kind: "shortText",
      label: "Full name",
      required: true,
      order: 0,
      helpText: null,
      options: [],
    },
    {
      fieldId: "f_goal",
      kind: "singleChoice",
      label: "Goal",
      required: true,
      order: 1,
      helpText: null,
      options: [
        { optionId: "o_gain", label: "Gain" },
        { optionId: "o_lose", label: "Lose" },
      ],
    },
    {
      fieldId: "f_weight",
      kind: "number",
      label: "Weight",
      required: false,
      order: 2,
      helpText: null,
      options: [],
    },
  ],
};

let prisma: PrismaClient;
let wsId = "";
let ownerMemberId = "";
let clientMemberId = "";
let coachMemberId = "";
let assistantMemberId = "";
let clientUserId = "";

async function signIn(page: Page, email: string, base = BASE) {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const pageUrl = () =>
  `${BASE}/workspace/${wsId}/clients/${PROFILE_ID}/onboarding`;

async function expectNoOverflow(page: Page, width: number) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  void width;
}

test.beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { slug: E2E.workspaceSlug },
  });
  wsId = ws.id;
  ownerMemberId = (
    await prisma.workspaceMember.findFirstOrThrow({
      where: {
        workspaceId: wsId,
        role: "WORKSPACE_OWNER",
        user: { email: E2E.owner },
      },
    })
  ).id;
  coachMemberId = (
    await prisma.workspaceMember.findFirstOrThrow({
      where: {
        workspaceId: wsId,
        role: "COACH",
        user: { email: E2E.coach },
      },
    })
  ).id;
  assistantMemberId = (
    await prisma.workspaceMember.findFirstOrThrow({
      where: {
        workspaceId: wsId,
        role: "ASSISTANT_COACH",
        user: { email: E2E.assistant },
      },
    })
  ).id;
  const clientUser = await prisma.user.findUniqueOrThrow({
    where: { email: E2E.client },
  });
  clientUserId = clientUser.id;
  clientMemberId = (
    await prisma.workspaceMember.findFirstOrThrow({
      where: {
        workspaceId: wsId,
        role: "CLIENT",
        userId: clientUser.id,
      },
    })
  ).id;

  // Deterministic cleanup of a previous partial run (Restrict FKs →
  // children before parents).
  await prisma.onboardingSubmissionReview
    .deleteMany({ where: { submissionId: SUBMISSION_ID } })
    .catch(() => {});
  await prisma.onboardingSubmissionAnswer
    .deleteMany({ where: { submissionId: SUBMISSION_ID } })
    .catch(() => {});
  await prisma.onboardingSubmission
    .deleteMany({ where: { id: SUBMISSION_ID } })
    .catch(() => {});
  await prisma.clientAssignment
    .deleteMany({
      where: { id: { in: [CLIENT_ASSIGN_ID, ASSISTANT_ASSIGN_ID] } },
    })
    .catch(() => {});
  await prisma.onboardingFormAssignment
    .deleteMany({ where: { id: ASSIGNMENT_ID } })
    .catch(() => {});
  await prisma.onboardingFormVersion
    .deleteMany({ where: { id: VERSION_ID } })
    .catch(() => {});
  await prisma.onboardingForm
    .deleteMany({ where: { id: FORM_ID } })
    .catch(() => {});
  await prisma.consentRecord
    .deleteMany({
      where: {
        clientProfileId: PROFILE_ID,
        version: { startsWith: "onboarding-submission-dev" },
      },
    })
    .catch(() => {});
  await prisma.clientProfile
    .deleteMany({ where: { id: PROFILE_ID } })
    .catch(() => {});

  await prisma.clientProfile.create({
    data: {
      id: PROFILE_ID,
      workspaceId: wsId,
      userId: clientUserId,
      name: "P024 E2E Client",
    },
  });
  await prisma.onboardingForm.create({
    data: {
      id: FORM_ID,
      workspaceId: wsId,
      name: "P024 Intake",
      createdByMemberId: ownerMemberId,
    },
  });
  await prisma.onboardingFormVersion.create({
    data: {
      id: VERSION_ID,
      formId: FORM_ID,
      versionSeq: 1,
      definition: DEF as never,
      publishOriginRevision: 1,
      publishedByMemberId: ownerMemberId,
    },
  });
  await prisma.onboardingFormAssignment.create({
    data: {
      id: ASSIGNMENT_ID,
      workspaceId: wsId,
      clientProfileId: PROFILE_ID,
      formId: FORM_ID,
      formVersionId: VERSION_ID,
      status: "COMPLETED",
      assignedByMemberId: ownerMemberId,
      endedByMemberId: clientMemberId,
      endedAt: new Date(),
    },
  });
  await prisma.onboardingSubmission.create({
    data: {
      id: SUBMISSION_ID,
      workspaceId: wsId,
      clientProfileId: PROFILE_ID,
      formId: FORM_ID,
      formVersionId: VERSION_ID,
      assignmentId: ASSIGNMENT_ID,
      submittedByUserId: clientUserId,
      submittedByMemberId: clientMemberId,
    },
  });
  await prisma.onboardingSubmissionAnswer.createMany({
    data: [
      {
        submissionId: SUBMISSION_ID,
        workspaceId: wsId,
        fieldId: "f_name",
        kind: "SHORT_TEXT",
        valueText: "Bob Client",
      },
      {
        submissionId: SUBMISSION_ID,
        workspaceId: wsId,
        fieldId: "f_goal",
        kind: "SINGLE_CHOICE",
        valueOptionIds: ["o_gain"],
      },
      {
        submissionId: SUBMISSION_ID,
        workspaceId: wsId,
        fieldId: "f_weight",
        kind: "NUMBER",
        valueNumeric: "80.5",
      },
    ],
  });
  for (const [kind, version] of [
    ["PRIVACY_NOTICE", "onboarding-submission-dev-privacy-v1"],
    ["HEALTH_DATA", "onboarding-submission-dev-health-v1"],
  ] as const)
    await prisma.consentRecord.create({
      data: { clientProfileId: PROFILE_ID, kind, version },
    });
  // Coaching assignments (role COACH — only one ACTIVE PRIMARY exists).
  await prisma.clientAssignment.create({
    data: {
      id: CLIENT_ASSIGN_ID,
      workspaceId: wsId,
      clientProfileId: PROFILE_ID,
      coachMemberId,
      role: "COACH",
    },
  });
  await prisma.clientAssignment.create({
    data: {
      id: ASSISTANT_ASSIGN_ID,
      workspaceId: wsId,
      clientProfileId: PROFILE_ID,
      coachMemberId: assistantMemberId,
      role: "COACH",
    },
  });
});

test.afterAll(async () => {
  await prisma.onboardingSubmissionReview
    .deleteMany({ where: { submissionId: SUBMISSION_ID } })
    .catch(() => {});
  await prisma.onboardingSubmissionAnswer
    .deleteMany({ where: { submissionId: SUBMISSION_ID } })
    .catch(() => {});
  await prisma.onboardingSubmission
    .deleteMany({ where: { id: SUBMISSION_ID } })
    .catch(() => {});
  await prisma.clientAssignment
    .deleteMany({
      where: { id: { in: [CLIENT_ASSIGN_ID, ASSISTANT_ASSIGN_ID] } },
    })
    .catch(() => {});
  await prisma.onboardingFormAssignment
    .deleteMany({ where: { id: ASSIGNMENT_ID } })
    .catch(() => {});
  await prisma.onboardingFormVersion
    .deleteMany({ where: { id: VERSION_ID } })
    .catch(() => {});
  await prisma.onboardingForm
    .deleteMany({ where: { id: FORM_ID } })
    .catch(() => {});
  await prisma.consentRecord
    .deleteMany({
      where: {
        clientProfileId: PROFILE_ID,
        version: { startsWith: "onboarding-submission-dev" },
      },
    })
    .catch(() => {});
  await prisma.clientProfile
    .deleteMany({ where: { id: PROFILE_ID } })
    .catch(() => {});
  await prisma.$disconnect();
});

test.describe("P-024 staff onboarding review", () => {
  test("roster exposes the Onboarding link; header list is answer-free", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(`${BASE}/workspace/${wsId}/clients`);
    const row = page.getByRole("row").filter({ hasText: "P024 E2E Client" });
    const link = row.getByRole("link", { name: "Onboarding" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(pageUrl());
    await expect(page.getByTestId("staff-onboarding-page")).toBeVisible();
    // Header row only — no answer values anywhere on the list GET.
    await expect(page.getByText("P024 Intake")).toBeVisible();
    await expect(page.getByText("Not reviewed")).toBeVisible();
    await expect(page.getByText("Bob Client")).toHaveCount(0);
    await expect(page.getByText("Gain")).toHaveCount(0);
  });

  test("owner views details (read-only); no Mark affordance; one READ audit", async ({
    page,
  }) => {
    const before = await prisma.auditEvent.count({
      where: {
        workspaceId: wsId,
        resourceType: "onboarding_submission",
        action: "READ",
      },
    });
    await signIn(page, E2E.owner);
    await page.goto(pageUrl());
    await page.getByTestId("staff-onboarding-view-details").click();
    await expect(page.getByTestId("staff-onboarding-detail")).toBeVisible();
    await expect(page.getByText("Bob Client")).toBeVisible();
    await expect(page.getByText("Gain")).toBeVisible();
    await expect(
      page.getByTestId("staff-onboarding-mark-reviewed"),
    ).toHaveCount(0);
    await expect
      .poll(async () =>
        prisma.auditEvent.count({
          where: {
            workspaceId: wsId,
            resourceType: "onboarding_submission",
            action: "READ",
          },
        }),
      )
      .toBe(before + 1);
    // GET reload/pagination create zero further audits.
    await page.goto(pageUrl());
    expect(
      await prisma.auditEvent.count({
        where: {
          workspaceId: wsId,
          resourceType: "onboarding_submission",
          action: "READ",
        },
      }),
    ).toBe(before + 1);
  });

  test("assistant reads but cannot mark; coach marks and provenance shows", async ({
    page,
  }) => {
    // Clean any prior review so the mark path is live.
    await prisma.onboardingSubmissionReview.deleteMany({
      where: { submissionId: SUBMISSION_ID },
    });
    await signIn(page, E2E.assistant);
    await page.goto(pageUrl());
    await page.getByTestId("staff-onboarding-view-details").click();
    await expect(page.getByTestId("staff-onboarding-detail")).toBeVisible();
    await expect(
      page.getByTestId("staff-onboarding-mark-reviewed"),
    ).toHaveCount(0);

    const ctx = await page.context().browser()!.newContext();
    const coach = await ctx.newPage();
    await signIn(coach, E2E.coach);
    await coach.goto(pageUrl());
    await coach.getByTestId("staff-onboarding-view-details").click();
    await expect(coach.getByTestId("staff-onboarding-detail")).toBeVisible();
    await coach.getByTestId("staff-onboarding-mark-reviewed").click();
    await expect
      .poll(async () =>
        prisma.onboardingSubmissionReview.count({
          where: { submissionId: SUBMISSION_ID },
        }),
      )
      .toBe(1);
    await coach.goto(pageUrl());
    await expect(
      coach.getByText(/Reviewed by coach@s1h-e2e.test/),
    ).toBeVisible();
    await ctx.close();
  });

  test("client, support and non-member are denied; denied bodies carry no values", async ({
    page,
  }) => {
    for (const email of [E2E.client, E2E.support, E2E.nonmember]) {
      const ctx = await page.context().browser()!.newContext();
      const p = await ctx.newPage();
      await signIn(p, email);
      const res = await p.goto(pageUrl());
      expect([403, 404]).toContain(res?.status());
      expect(await p.content()).not.toContain("Bob Client");
      await ctx.close();
    }
  });

  test("flag-off server renders unavailable with zero marks", async ({
    page,
  }) => {
    await prisma.onboardingSubmissionReview.deleteMany({
      where: { submissionId: SUBMISSION_ID },
    });
    await signIn(page, E2E.coach, FLAG_OFF);
    const res = await page.goto(
      `${FLAG_OFF}/workspace/${wsId}/clients/${PROFILE_ID}/onboarding`,
    );
    expect(res?.status()).toBe(200);
    await expect(page.getByText(/currently unavailable/i)).toBeVisible();
    expect(
      await prisma.onboardingSubmissionReview.count({
        where: { submissionId: SUBMISSION_ID },
      }),
    ).toBe(0);
  });

  test("no-store header on the review route", async ({ page }) => {
    await signIn(page, E2E.owner);
    const res = await page.goto(pageUrl());
    expect(res?.headers()["cache-control"]).toContain("no-store");
  });

  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["tablet", { width: 834, height: 1112 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    test(`${name}: no horizontal overflow; keyboard reaches View details`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await signIn(page, E2E.owner);
      await page.goto(pageUrl());
      await expectNoOverflow(page, viewport.width);
      const btn = page.getByTestId("staff-onboarding-view-details");
      await btn.focus();
      await expect(btn).toBeFocused();
      const box = await btn.boundingBox();
      expect(box && box.height >= 44).toBe(true);
    });
  }
});
