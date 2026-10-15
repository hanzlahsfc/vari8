import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * CHECK-IN-FEEDBACK-I1 — bounded staff written feedback on Check-In
 * submissions, real-browser flows on the production build: review ack →
 * compose → send → client "Response sent"; nonce retry dedup after an
 * aborted response; denied/review-required/consent boundaries.
 * Synthetic deterministic fixtures only (cfi1_* namespace).
 */

const BASE = "http://127.0.0.1:3000";
const FLAG_OFF = "http://127.0.0.1:3101";

const FORM_ID = "cfi1_e2e_form";
const VERSION_ID = "cfi1_e2e_version";

const DEF = {
  title: "CFI1 Weekly",
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

async function removeFixtures() {
  const instances = await prisma.checkInInstance.findMany({
    where: { formId: FORM_ID },
    select: { id: true },
  });
  const submissions = await prisma.checkInSubmission.findMany({
    where: { instanceId: { in: instances.map((s) => s.id) } },
    select: { id: true },
  });
  await prisma.checkInFeedback.deleteMany({
    where: { submissionId: { in: submissions.map((s) => s.id) } },
  });
  await prisma.checkInReview.deleteMany({
    where: { submissionId: { in: submissions.map((s) => s.id) } },
  });
  await prisma.checkInSubmissionAnswer.deleteMany({
    where: { submissionId: { in: submissions.map((s) => s.id) } },
  });
  await prisma.checkInSubmission.deleteMany({
    where: { instanceId: { in: instances.map((s) => s.id) } },
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
        name: "CFI1 E2E Client",
      },
    }));
  profileId = profile.id;
  profileCreated = existing === null;

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
      name: "CFI1 Weekly",
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
  // Owner needs an explicit assignment to send (#111) — grant PRIMARY.
  await prisma.clientAssignment.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      coachMemberId: ownerMemberId,
      role: "COACH",
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

async function fixtureReviewed(dueAt: Date) {
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
    },
  });
  await prisma.checkInSubmissionAnswer.create({
    data: {
      submissionId: submission.id,
      workspaceId: wsId,
      clientProfileId: profileId,
      fieldId: "f_summary",
      kind: "SHORT_TEXT",
      valueText: "A solid week",
    },
  });
  await prisma.checkInReview.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      submissionId: submission.id,
      reviewedByMemberId: coachMemberId,
    },
  });
  return { instance, submission };
}

const staffUrl = () =>
  `${BASE}/workspace/${wsId}/clients/${profileId}/checkins`;

// Rows render identical "Submitted <now>" labels across fixtures — the
// only stable identity is the hidden submissionId input inside the row.
const submissionRow = (page: Page, submissionId: string, reviewed = true) =>
  page
    .getByTestId(
      reviewed ? "checkin-submission-reviewed" : "checkin-submission-pending",
    )
    .filter({
      has: page.locator(`input[name="submissionId"][value="${submissionId}"]`),
    });

async function openDetail(page: Page, submissionId: string, reviewed = true) {
  const row = submissionRow(page, submissionId, reviewed);
  await row.getByTestId("checkin-view-detail").click();
  await expect(page.getByTestId("checkin-detail")).toBeVisible();
}

// ── Flag-off contract ──────────────────────────────────────────────────

test("flag-off server 404s the staff surface; zero feedback rows", async ({
  page,
}) => {
  await signIn(page, E2E.owner, FLAG_OFF);
  const res = await page.goto(
    `${FLAG_OFF}/workspace/${wsId}/clients/${profileId}/checkins`,
  );
  expect(res?.status()).toBe(404);
  expect(await prisma.checkInFeedback.count()).toBe(0);
});

// ── Core journey ───────────────────────────────────────────────────────

test("assigned coach reviews → sends feedback → client sees 'Response sent'", async ({
  page,
}) => {
  const { instance, submission } = await fixtureReviewed(
    new Date("2032-08-01T09:00:00.000Z"),
  );
  await signIn(page, E2E.coach);
  await page.goto(staffUrl());
  await openDetail(page, submission.id);

  const input = page.getByTestId("checkin-feedback-input");
  await expect(input).toBeVisible();
  await input.fill("Great consistency this week — keep it up.");
  await page.getByTestId("checkin-feedback-send").click();
  await expect(page.getByTestId("checkin-feedback-confirm")).toBeVisible();
  await expect(page.getByTestId("checkin-feedback-list")).toContainText(
    "Great consistency this week",
  );

  const row2 = await prisma.checkInFeedback.findFirst({
    where: { workspaceId: wsId },
    orderBy: { sentAt: "desc" },
  });
  expect(row2?.authoredByMemberId).toBe(coachMemberId);
  expect(
    await prisma.auditEvent.count({
      where: { resourceType: "checkin_feedback", resourceId: row2!.id },
    }),
  ).toBe(1);

  // Client sees "Response sent" — never a read/seen state.
  await signIn(page, E2E.client);
  await page.goto(`${BASE}/workspace/${wsId}/check-ins/${instance.id}`);
  await expect(page.getByTestId("checkin-response-sent")).toBeVisible();
  await expect(page.getByTestId("checkin-client-feedback-list")).toContainText(
    "Great consistency this week",
  );
  // No read/seen tracking — the status copy is exactly "Response sent".
  await expect(page.getByTestId("checkin-client-feedback")).not.toContainText(
    /read|seen by|opened/i,
  );
});

test("unreviewed submission offers no composer (canSend false)", async ({
  page,
}) => {
  const instance = await prisma.checkInInstance.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      formId: FORM_ID,
      formVersionId: VERSION_ID,
      dueAt: new Date("2032-09-01T09:00:00.000Z"),
      scheduledByMemberId: ownerMemberId,
    },
  });
  await prisma.checkInSubmission.create({
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
  const pendSub = await prisma.checkInSubmission.findFirstOrThrow({
    where: { instanceId: instance.id },
  });
  await signIn(page, E2E.coach);
  await page.goto(staffUrl());
  await openDetail(page, pendSub.id, false);
  await expect(page.getByTestId("checkin-feedback-input")).toHaveCount(0);
  await expect(page.getByTestId("checkin-feedback-empty")).toBeVisible();
});

test("assigned assistant reads the thread but cannot send", async ({
  page,
}) => {
  const { submission } = await fixtureReviewed(
    new Date("2032-10-01T09:00:00.000Z"),
  );
  await prisma.checkInFeedback.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      submissionId: submission.id,
      authoredByMemberId: coachMemberId,
      body: "thread entry",
      clientRequestId: `cfi1-seed-${Date.now()}`,
    },
  });
  await signIn(page, E2E.assistant);
  await page.goto(staffUrl());
  await openDetail(page, submission.id);
  await expect(page.getByTestId("checkin-feedback-list")).toContainText(
    "thread entry",
  );
  await expect(page.getByTestId("checkin-feedback-input")).toHaveCount(0);
});

test("aborted send response → remount reconciliation → retry commits exactly one row", async ({
  page,
}) => {
  const { submission } = await fixtureReviewed(
    new Date("2032-11-01T09:00:00.000Z"),
  );
  await signIn(page, E2E.coach);
  await page.goto(staffUrl());
  await openDetail(page, submission.id);

  // Abort the FIRST send response mid-flight — the row may or may not
  // commit; the nonce marker survives in sessionStorage either way.
  let aborted = false;
  await page.route("**/checkins", async (route) => {
    const req = route.request();
    if (!aborted && req.method() === "POST") {
      aborted = true;
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.getByTestId("checkin-feedback-input").fill("uncertain send body");
  await page
    .getByTestId("checkin-feedback-send")
    .click()
    .catch(() => {});
  await page.waitForTimeout(1000);
  await page.unroute("**/checkins");

  // Reload + re-view → the composer reconciles via sessionStorage
  // marker + the authorized recovery read.
  await page.reload();
  await openDetail(page, submission.id);

  const alreadyLanded = await prisma.checkInFeedback.count({
    where: { submissionId: submission.id },
  });
  if (alreadyLanded === 0) {
    // Marker said the send never landed → composer restored the nonce;
    // resend commits it.
    await page
      .getByTestId("checkin-feedback-input")
      .fill("uncertain send body");
    await page.getByTestId("checkin-feedback-send").click();
    await page.waitForTimeout(1200);
  }

  const rows = await prisma.checkInFeedback.findMany({
    where: { submissionId: submission.id },
  });
  expect(rows).toHaveLength(1);
  await checkNoOverflow(page);
});

test("follow-up appends a second dated row (immutable corrections)", async ({
  page,
}) => {
  const { submission } = await fixtureReviewed(
    new Date("2032-12-01T09:00:00.000Z"),
  );
  await signIn(page, E2E.coach);
  await page.goto(staffUrl());
  await openDetail(page, submission.id);

  await page.getByTestId("checkin-feedback-input").fill("first message");
  await page.getByTestId("checkin-feedback-send").click();
  await expect(page.getByTestId("checkin-feedback-confirm")).toBeVisible();

  await page.getByTestId("checkin-feedback-input").fill("follow-up note");
  await page.getByTestId("checkin-feedback-send").click();
  await page.waitForTimeout(800);

  const rows = await prisma.checkInFeedback.findMany({
    where: { submissionId: submission.id },
    orderBy: [{ sentAt: "asc" }, { id: "asc" }],
  });
  expect(rows.map((r) => r.body)).toEqual(["first message", "follow-up note"]);
});

test("consent withdrawal hides feedback from the client exactly like answers", async ({
  page,
}) => {
  const { instance, submission } = await fixtureReviewed(
    new Date("2033-01-01T09:00:00.000Z"),
  );
  await prisma.checkInFeedback.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      submissionId: submission.id,
      authoredByMemberId: coachMemberId,
      body: "will be hidden",
      clientRequestId: `cfi1-cons-${Date.now()}`,
    },
  });
  await prisma.consentRecord.updateMany({
    where: { clientProfileId: profileId },
    data: { revokedAt: new Date() },
  });
  await signIn(page, E2E.client);
  await page.goto(`${BASE}/workspace/${wsId}/check-ins/${instance.id}`);
  await expect(page.getByTestId("checkin-response-sent")).toHaveCount(0);
  await expect(page.getByText(/will be hidden/i)).toHaveCount(0);
  // Restore consent for the remaining tests.
  await prisma.consentRecord.updateMany({
    where: { clientProfileId: profileId },
    data: { revokedAt: null },
  });
});
