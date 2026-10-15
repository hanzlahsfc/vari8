import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * SOLO-COACH-I1 — owner-managed coach assignments + assigned-owner review
 * writes (decision 111). Real-browser flows on the production build:
 * roster → Coaches screen → explicit self-assignment → owner marks BOTH a
 * Check-In submission and an onboarding submission reviewed; unassigned
 * owner sees no mark affordance; non-owner members are denied the screen.
 * Synthetic deterministic fixtures only (sci_* namespace).
 */

const BASE = "http://127.0.0.1:3000";

const PROFILE_ID = "sci_e2e_client_profile";
const CIN_FORM_ID = "sci_e2e_cin_form";
const CIN_VERSION_ID = "sci_e2e_cin_version";
const ONB_FORM_ID = "sci_e2e_onb_form";
const ONB_VERSION_ID = "sci_e2e_onb_version";
const ONB_ASSIGNMENT_ID = "sci_e2e_onb_assignment";
const ONB_SUBMISSION_ID = "sci_e2e_onb_submission";

const CIN_DEF = {
  title: "SCI Weekly",
  fields: [
    {
      fieldId: "f_note",
      kind: "shortText",
      label: "Week notes",
      required: true,
      order: 0,
    },
  ],
};

const ONB_DEF = {
  title: "SCI Intake",
  fields: [
    {
      fieldId: "f_name",
      kind: "shortText",
      label: "Name",
      required: true,
      order: 0,
    },
  ],
};

let prisma: PrismaClient;
let wsId = "";
let ownerMemberId = "";
let clientMemberId = "";
let clientUserId = "";

async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const coachesUrl = () =>
  `${BASE}/workspace/${wsId}/clients/${PROFILE_ID}/coaches`;
const checkinsUrl = () =>
  `${BASE}/workspace/${wsId}/clients/${PROFILE_ID}/checkins`;
const onboardingUrl = () =>
  `${BASE}/workspace/${wsId}/clients/${PROFILE_ID}/onboarding`;

async function removeFixtures() {
  const instances = await prisma.checkInInstance.findMany({
    where: { formId: CIN_FORM_ID },
    select: { id: true },
  });
  const subs = await prisma.checkInSubmission.findMany({
    where: { instanceId: { in: instances.map((i) => i.id) } },
    select: { id: true },
  });
  await prisma.checkInReview.deleteMany({
    where: { submissionId: { in: subs.map((s) => s.id) } },
  });
  await prisma.checkInSubmissionAnswer.deleteMany({
    where: { submissionId: { in: subs.map((s) => s.id) } },
  });
  await prisma.checkInSubmission.deleteMany({
    where: { instanceId: { in: instances.map((i) => i.id) } },
  });
  await prisma.checkInInstance.deleteMany({ where: { formId: CIN_FORM_ID } });
  await prisma.checkInFormVersion.deleteMany({
    where: { formId: CIN_FORM_ID },
  });
  await prisma.checkInForm.deleteMany({ where: { id: CIN_FORM_ID } });
  await prisma.onboardingSubmissionReview
    .deleteMany({ where: { submissionId: ONB_SUBMISSION_ID } })
    .catch(() => {});
  await prisma.onboardingSubmissionAnswer
    .deleteMany({ where: { submissionId: ONB_SUBMISSION_ID } })
    .catch(() => {});
  await prisma.onboardingSubmission
    .deleteMany({ where: { id: ONB_SUBMISSION_ID } })
    .catch(() => {});
  await prisma.onboardingFormAssignment
    .deleteMany({ where: { id: ONB_ASSIGNMENT_ID } })
    .catch(() => {});
  await prisma.onboardingFormVersion
    .deleteMany({ where: { formId: ONB_FORM_ID } })
    .catch(() => {});
  await prisma.onboardingForm
    .deleteMany({ where: { id: ONB_FORM_ID } })
    .catch(() => {});
  await prisma.clientAssignment
    .deleteMany({ where: { clientProfileId: PROFILE_ID } })
    .catch(() => {});
  await prisma.consentRecord
    .deleteMany({
      where: {
        clientProfileId: PROFILE_ID,
        version: { startsWith: "sci-" },
      },
    })
    .catch(() => {});
  await prisma.clientProfile
    .deleteMany({ where: { id: PROFILE_ID } })
    .catch(() => {});
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
  const clientUser = await prisma.user.findUniqueOrThrow({
    where: { email: E2E.client },
  });
  clientUserId = clientUser.id;
  clientMemberId = (
    await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsId, role: "CLIENT", userId: clientUserId },
    })
  ).id;

  await removeFixtures();

  await prisma.clientProfile.create({
    data: {
      id: PROFILE_ID,
      workspaceId: wsId,
      userId: clientUserId,
      name: "SCI E2E Client",
    },
  });

  // Check-In form + submitted instance.
  await prisma.checkInForm.create({
    data: {
      id: CIN_FORM_ID,
      workspaceId: wsId,
      name: "SCI Weekly",
      status: "ACTIVE",
      createdByMemberId: ownerMemberId,
    },
  });
  await prisma.checkInFormVersion.create({
    data: {
      id: CIN_VERSION_ID,
      workspaceId: wsId,
      formId: CIN_FORM_ID,
      versionSeq: 1,
      definition: CIN_DEF as never,
      publishOriginRevision: 1,
      publishedByMemberId: ownerMemberId,
    },
  });
  const instance = await prisma.checkInInstance.create({
    data: {
      workspaceId: wsId,
      clientProfileId: PROFILE_ID,
      formId: CIN_FORM_ID,
      formVersionId: CIN_VERSION_ID,
      dueAt: new Date("2032-01-05T09:00:00.000Z"),
      scheduledByMemberId: ownerMemberId,
    },
  });
  const cinSubmission = await prisma.checkInSubmission.create({
    data: {
      workspaceId: wsId,
      clientProfileId: PROFILE_ID,
      formId: CIN_FORM_ID,
      formVersionId: CIN_VERSION_ID,
      instanceId: instance.id,
      submittedByUserId: clientUserId,
      submittedByMemberId: clientMemberId,
    },
  });
  await prisma.checkInSubmissionAnswer.create({
    data: {
      submissionId: cinSubmission.id,
      workspaceId: wsId,
      clientProfileId: PROFILE_ID,
      fieldId: "f_note",
      kind: "SHORT_TEXT",
      valueText: "sci week notes",
    },
  });

  // Onboarding form + completed assignment + submission.
  await prisma.onboardingForm.create({
    data: {
      id: ONB_FORM_ID,
      workspaceId: wsId,
      name: "SCI Intake",
      createdByMemberId: ownerMemberId,
    },
  });
  await prisma.onboardingFormVersion.create({
    data: {
      id: ONB_VERSION_ID,
      formId: ONB_FORM_ID,
      versionSeq: 1,
      definition: ONB_DEF as never,
      publishOriginRevision: 1,
      publishedByMemberId: ownerMemberId,
    },
  });
  await prisma.onboardingFormAssignment.create({
    data: {
      id: ONB_ASSIGNMENT_ID,
      workspaceId: wsId,
      clientProfileId: PROFILE_ID,
      formId: ONB_FORM_ID,
      formVersionId: ONB_VERSION_ID,
      status: "COMPLETED",
      assignedByMemberId: ownerMemberId,
      endedByMemberId: clientMemberId,
      endedAt: new Date(),
    },
  });
  await prisma.onboardingSubmission.create({
    data: {
      id: ONB_SUBMISSION_ID,
      workspaceId: wsId,
      clientProfileId: PROFILE_ID,
      formId: ONB_FORM_ID,
      formVersionId: ONB_VERSION_ID,
      assignmentId: ONB_ASSIGNMENT_ID,
      submittedByUserId: clientUserId,
      submittedByMemberId: clientMemberId,
    },
  });
  await prisma.onboardingSubmissionAnswer.create({
    data: {
      submissionId: ONB_SUBMISSION_ID,
      workspaceId: wsId,
      fieldId: "f_name",
      kind: "SHORT_TEXT",
      valueText: "Sci Client",
    },
  });

  // Consent for both surfaces.
  for (const [kind, version] of [
    ["PRIVACY_NOTICE", "sci-privacy-v1"],
    ["HEALTH_DATA", "sci-health-v1"],
  ] as const)
    await prisma.consentRecord.create({
      data: { clientProfileId: PROFILE_ID, kind, version },
    });

  // Ensure the owner starts UNASSIGNED on this profile.
  await prisma.clientAssignment.deleteMany({
    where: {
      clientProfileId: PROFILE_ID,
      coachMemberId: ownerMemberId,
    },
  });
});

test.afterAll(async () => {
  await removeFixtures().catch(() => {});
  await prisma?.$disconnect();
});

test.describe("SOLO-COACH-I1 owner-as-coach", () => {
  test("unassigned owner reads a submission but has no mark control", async ({
    page,
  }) => {
    await prisma.clientAssignment.deleteMany({
      where: {
        clientProfileId: PROFILE_ID,
        coachMemberId: ownerMemberId,
      },
    });
    await signIn(page, E2E.owner);
    await page.goto(checkinsUrl());
    const row = page.getByTestId("checkin-submission-pending").last();
    await row.getByTestId("checkin-view-detail").click();
    await expect(page.getByTestId("checkin-detail")).toBeVisible();
    await expect(page.getByTestId("checkin-detail")).toContainText(
      "sci week notes",
    );
    await expect(page.getByTestId("checkin-mark-reviewed")).toHaveCount(0);
  });

  test("owner self-assigns via the Coaches screen, then marks both reviews", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);

    // Roster → Coaches link → owner-gated assignment screen.
    await page.goto(`${BASE}/workspace/${wsId}/clients`);
    const row = page.getByRole("row").filter({ hasText: "SCI E2E Client" });
    const link = row.getByRole("link", { name: "Coaches" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(coachesUrl());
    await expect(page.getByTestId("coach-assignments-page")).toBeVisible();

    // Explicit self-assignment as PRIMARY through the real UI.
    await page.getByTestId("assign-member-select").selectOption({
      value: ownerMemberId,
    });
    await page.getByTestId("assign-role-select").selectOption("PRIMARY");
    await page.getByTestId("assign-submit").click();

    const ownerRow = page
      .getByTestId("coach-assignment-row")
      .filter({ hasText: "PRIMARY" });
    await expect(ownerRow).toBeVisible();

    const assignment = await prisma.clientAssignment.findFirstOrThrow({
      where: {
        clientProfileId: PROFILE_ID,
        coachMemberId: ownerMemberId,
        status: "ACTIVE",
      },
    });
    expect(assignment.role).toBe("PRIMARY");

    // Assigned owner can now mark the Check-In submission reviewed.
    await page.goto(checkinsUrl());
    const cinRow = page.getByTestId("checkin-submission-pending").last();
    await cinRow.getByTestId("checkin-view-detail").click();
    await expect(page.getByTestId("checkin-detail")).toBeVisible();
    await page.getByTestId("checkin-mark-reviewed").click();
    await expect(page.getByTestId("checkin-mark-confirm")).toBeVisible();

    // And the onboarding submission — the separately approved amendment.
    await page.goto(onboardingUrl());
    const onbRow = page.getByTestId("staff-onboarding-row").last();
    await onbRow.getByTestId("staff-onboarding-view-details").click();
    await expect(page.getByTestId("staff-onboarding-detail")).toBeVisible();
    await expect(
      page.getByTestId("staff-onboarding-mark-reviewed"),
    ).toBeVisible();
    await page.getByTestId("staff-onboarding-mark-reviewed").click();
    await expect(
      page.getByTestId("staff-onboarding-reviewed"),
    ).toBeVisible();
  });

  test("non-owner members are denied the Coaches screen", async ({ page }) => {
    await signIn(page, E2E.coach);
    await page.goto(coachesUrl());
    // Repo-standard non-disclosing denial — 403, never a rendered manager.
    await expect(page.getByTestId("coach-assignments-page")).toHaveCount(0);
    const status = await page.request
      .get(coachesUrl())
      .then((r) => r.status());
    expect(status).toBe(403);
  });
});
