import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-025-C staff Check-In detail review + terminal acknowledgement —
 * real browser flows on the production build: header list → explicit
 * detail reveal (one READ audit per committed view) → mark reviewed
 * (assigned coach only), reviewer-provenance bounds, denied roles,
 * consent boundary, no-store, and responsive/keyboard checks. Synthetic
 * deterministic fixtures only (p025c_* namespace).
 */

const BASE = "http://127.0.0.1:3000";
const FLAG_OFF = "http://127.0.0.1:3101";

const FORM_ID = "p025c_e2e_form";
const VERSION_ID = "p025c_e2e_version";

const DEF = {
  title: "Weekly Check-In",
  fields: [
    {
      fieldId: "f_summary",
      kind: "shortText",
      label: "How was your week?",
      required: true,
      order: 0,
    },
    {
      fieldId: "f_energy",
      kind: "singleChoice",
      label: "Energy",
      required: true,
      order: 1,
      options: [
        { optionId: "o_high", label: "High" },
        { optionId: "o_low", label: "Low" },
      ],
    },
  ],
};

let prisma: PrismaClient;
let wsId: string;
let profileId: string;
let profileCreated = false;
let ownerMemberId: string;
let coachMemberId: string;
let assistantMemberId: string;
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

/** Delete every p025c-namespaced row (children first). */
async function removeFixtures() {
  const stale = await prisma.checkInInstance.findMany({
    where: { formId: FORM_ID },
    select: { id: true },
  });
  const submissions = await prisma.checkInSubmission.findMany({
    where: { instanceId: { in: stale.map((s) => s.id) } },
    select: { id: true },
  });
  await prisma.checkInReview.deleteMany({
    where: { submissionId: { in: submissions.map((s) => s.id) } },
  });
  await prisma.checkInSubmissionAnswer.deleteMany({
    where: { submissionId: { in: submissions.map((s) => s.id) } },
  });
  await prisma.checkInSubmission.deleteMany({
    where: { instanceId: { in: stale.map((s) => s.id) } },
  });
  await prisma.checkInInstance.deleteMany({ where: { formId: FORM_ID } });
}

test.beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { slug: E2E.workspaceSlug },
  });
  wsId = ws.id;

  const [ownerMember, coachMember, assistantMember, clientUser] =
    await Promise.all([
      prisma.workspaceMember.findFirstOrThrow({
        where: { workspaceId: wsId, user: { email: E2E.owner } },
      }),
      prisma.workspaceMember.findFirstOrThrow({
        where: { workspaceId: wsId, user: { email: E2E.coach } },
      }),
      prisma.workspaceMember.findFirstOrThrow({
        where: { workspaceId: wsId, user: { email: E2E.assistant } },
      }),
      prisma.user.findUniqueOrThrow({ where: { email: E2E.client } }),
    ]);
  ownerMemberId = ownerMember.id;
  coachMemberId = coachMember.id;
  assistantMemberId = assistantMember.id;
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
        name: "P025C E2E Client",
      },
    }));
  profileId = profile.id;
  profileCreated = existing === null || existing.name === "P025C E2E Client";

  await removeFixtures();
  await prisma.clientAssignment.deleteMany({
    where: { clientProfileId: profileId },
  });
  await prisma.checkInFormVersion.deleteMany({ where: { formId: FORM_ID } });
  await prisma.checkInForm.deleteMany({ where: { id: FORM_ID } });
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
      name: "P025C Weekly",
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
  // PRIMARY coach + COACH-role assistant assignments.
  await prisma.clientAssignment.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      coachMemberId,
      role: "PRIMARY",
      status: "ACTIVE",
    },
  });
  await prisma.clientAssignment.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      coachMemberId: assistantMemberId,
      role: "COACH",
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
  await removeFixtures().catch(() => {});
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

/** Service-independent submitted fixture — instance + submission + answers
 * shaped exactly like the service output. */
async function fixtureSubmission(dueAt: Date, submittedAt?: Date) {
  const instance = await prisma.checkInInstance.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      formId: FORM_ID,
      formVersionId: VERSION_ID,
      dueAt,
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
      ...(submittedAt ? { submittedAt } : {}),
    },
  });
  await prisma.checkInSubmissionAnswer.createMany({
    data: [
      {
        submissionId: submission.id,
        workspaceId: wsId,
        clientProfileId: profileId,
        fieldId: "f_summary",
        kind: "SHORT_TEXT",
        valueText: "A solid week — good sleep",
      },
      {
        submissionId: submission.id,
        workspaceId: wsId,
        clientProfileId: profileId,
        fieldId: "f_energy",
        kind: "SINGLE_CHOICE",
        valueOptionIds: ["o_high"],
      },
    ],
  });
  return { instance, submission };
}

const staffUrl = () =>
  `${BASE}/workspace/${wsId}/clients/${profileId}/checkins`;

const readAudits = (submissionId: string) =>
  prisma.auditEvent.findMany({
    where: {
      workspaceId: wsId,
      resourceType: "checkin_submission",
      resourceId: submissionId,
      action: "READ",
    },
  });
const reviewAudits = () =>
  prisma.auditEvent.findMany({
    where: { workspaceId: wsId, resourceType: "checkin_review" },
  });

// ── Flag-off contract ──────────────────────────────────────────────────

test("flag-off server 404s the staff surface; zero review rows/audits", async ({
  page,
}) => {
  await signIn(page, E2E.owner, FLAG_OFF);
  const res = await page.goto(
    `${FLAG_OFF}/workspace/${wsId}/clients/${profileId}/checkins`,
  );
  expect(res?.status()).toBe(404);
  expect(await prisma.checkInReview.count()).toBe(0);
});

// ── Header list + explicit detail reveal ───────────────────────────────

test("owner sees submission headers; explicit detail commits one READ audit; no mark control", async ({
  page,
}) => {
  const { submission } = await fixtureSubmission(
    new Date("2032-03-01T09:00:00.000Z"),
  );
  await signIn(page, E2E.owner);
  await page.goto(staffUrl());

  // Header only — the submitted answer text is never in the list markup.
  const row = page.getByTestId("checkin-submission-pending").last();
  await expect(row).toContainText("P025C Weekly");
  await expect(row).toContainText("Submitted");
  await expect(row).not.toContainText("solid week");

  // Explicit detail → reveals labeled answers + ONE structural READ audit.
  const before = await readAudits(submission.id);
  await row.getByTestId("checkin-view-detail").click();
  const detail = page.getByTestId("checkin-detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("How was your week?");
  await expect(detail).toContainText("A solid week — good sleep");
  await expect(detail).toContainText("Energy");
  await expect(detail).toContainText("High");
  expect(await readAudits(submission.id)).toHaveLength(before.length + 1);

  // The owner reads but CANNOT mark (#95-analog owner cell is read-only).
  await expect(page.getByTestId("checkin-mark-reviewed")).toHaveCount(0);
});

test("assigned coach details → marks → terminal reviewed state + provenance", async ({
  page,
}) => {
  const { submission } = await fixtureSubmission(
    new Date("2032-04-01T09:00:00.000Z"),
  );
  await signIn(page, E2E.coach);
  await page.goto(staffUrl());
  // newest-submitted first (submittedAt desc) — this test's fixture.
  const row = page.getByTestId("checkin-submission-pending").first();

  // The mark control exists ONLY after a successful detail view.
  await expect(page.getByTestId("checkin-mark-reviewed")).toHaveCount(0);
  await row.getByTestId("checkin-view-detail").click();
  await expect(page.getByTestId("checkin-detail")).toBeVisible();

  await page.getByTestId("checkin-mark-reviewed").click();
  await expect(page.getByTestId("checkin-mark-confirm")).toBeVisible();
  await page.reload();

  // Terminal: row shows reviewed + bounded reviewer provenance (#91);
  // no second mark control.
  const reviewedRow = page.getByTestId("checkin-submission-reviewed").last();
  await expect(reviewedRow).toContainText("Reviewed");
  await expect(page.getByTestId("checkin-mark-reviewed")).toHaveCount(0);

  const review = await prisma.checkInReview.findUniqueOrThrow({
    where: { submissionId: submission.id },
  });
  expect(review.reviewedByMemberId).toBe(coachMemberId);
  expect(await prisma.checkInReview.count()).toBe(1);
  expect(await reviewAudits()).toHaveLength(1);
});

test("assigned assistant details but cannot mark", async ({ page }) => {
  const { submission } = await fixtureSubmission(
    new Date("2032-05-01T09:00:00.000Z"),
  );
  await signIn(page, E2E.assistant);
  await page.goto(staffUrl());
  const row = page.getByTestId("checkin-submission-pending").last();
  await row.getByTestId("checkin-view-detail").click();
  await expect(page.getByTestId("checkin-detail")).toBeVisible();
  await expect(page.getByTestId("checkin-mark-reviewed")).toHaveCount(0);
  void submission;
});

test("client surfaces never expose reviewer identity (#91)", async ({
  page,
}) => {
  const { submission } = await fixtureSubmission(
    new Date("2032-06-01T09:00:00.000Z"),
  );
  await prisma.checkInReview.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      submissionId: submission.id,
      reviewedByMemberId: coachMemberId,
    },
  });
  await signIn(page, E2E.client);
  await page.goto(`${BASE}/workspace/${wsId}/check-ins`);
  // The client sees the unchanged "Submitted" state — never "Reviewed"
  // and never the reviewer name.
  await expect(page.getByText(/review/i)).toHaveCount(0);
  await page.goto(
    `${BASE}/workspace/${wsId}/check-ins/${
      (
        await prisma.checkInSubmission.findUniqueOrThrow({
          where: { id: submission.id },
        })
      ).instanceId
    }`,
  );
  await expect(page.getByTestId("checkin-submitted-state")).toBeVisible();
  await expect(page.getByText(/review/i)).toHaveCount(0);
});

test("consent withdrawal fails the detail closed — non-disclosing error", async ({
  page,
}) => {
  const { submission } = await fixtureSubmission(
    new Date("2032-07-01T09:00:00.000Z"),
  );
  await prisma.consentRecord.updateMany({
    where: { clientProfileId: profileId },
    data: { revokedAt: new Date() },
  });
  try {
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    const row = page.getByTestId("checkin-submission-pending").last();
    await row.getByTestId("checkin-view-detail").click();
    await expect(page.getByTestId("checkin-detail-error")).toBeVisible();
    await expect(page.getByTestId("checkin-detail")).toHaveCount(0);
    // No answers leaked; no READ audit committed.
    expect(await readAudits(submission.id)).toHaveLength(0);
    await expect(page.getByText("A solid week")).toHaveCount(0);
  } finally {
    await prisma.consentRecord.updateMany({
      where: { clientProfileId: profileId },
      data: { revokedAt: null },
    });
  }
});

test("responsive + keyboard + no-overflow on the review surface", async ({
  page,
}) => {
  await fixtureSubmission(new Date("2032-08-01T09:00:00.000Z"));
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    await checkNoOverflow(page);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  // Keyboard: tab to a View-details control and activate it.
  await page.goto(staffUrl());
  const viewBtn = page.getByTestId("checkin-view-detail").last();
  await viewBtn.focus();
  await expect(viewBtn).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("checkin-detail")).toBeVisible({
    timeout: 15_000,
  });
  // aria-live detail region is announced for assistive tech.
  await expect(page.getByTestId("checkin-detail-region")).toHaveAttribute(
    "aria-live",
    "polite",
  );
});
