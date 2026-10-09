import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-023 — client onboarding submission flow on the primary test server
 * (:3000, ENABLE_ONBOARDING_SUBMISSION=1) and the flag-OFF proof server
 * (:3101) for the 404 contract. Synthetic deterministic fixtures: a
 * published 6-kind form pinned to an ACTIVE assignment for the reserved
 * client user, plus the dev consent rows.
 */

const BASE = "http://127.0.0.1:3000";
const FLAG_OFF = "http://127.0.0.1:3101";

const FORM_ID = "p023_e2e_form";
const VERSION_ID = "p023_e2e_version";
const ASSIGNMENT_ID = "p023_e2e_assignment";
const PROFILE_ID = "p023_e2e_client_profile";

const DEF = {
  title: "E2E Intake",
  fields: [
    {
      fieldId: "f_name",
      kind: "shortText",
      label: "Full name",
      required: true,
      order: 0,
      helpText: "Your legal name",
    },
    {
      fieldId: "f_notes",
      kind: "longText",
      label: "Health notes",
      required: false,
      order: 1,
    },
    {
      fieldId: "f_weight",
      kind: "number",
      label: "Weight",
      required: true,
      order: 2,
    },
    {
      fieldId: "f_start",
      kind: "date",
      label: "Start date",
      required: false,
      order: 3,
    },
    {
      fieldId: "f_goal",
      kind: "singleChoice",
      label: "Goal",
      required: true,
      order: 4,
      options: [
        { optionId: "o_gain", label: "Gain" },
        { optionId: "o_lose", label: "Lose" },
      ],
    },
    {
      fieldId: "f_days",
      kind: "multiChoice",
      label: "Training days",
      required: false,
      order: 5,
      options: [
        { optionId: "d_mon", label: "Monday" },
        { optionId: "d_wed", label: "Wednesday" },
        { optionId: "d_fri", label: "Friday" },
      ],
    },
  ],
};

let prisma: PrismaClient;
let wsId: string;
let ownerMemberId: string;
let profileId: string;
const extraFixtureIds: string[] = [];

/** (ws, client, form) is fully unique — extra assignments need their own
 * form/version. Tracks ids for deterministic cleanup. */
async function createExtraAssignment(aId: string) {
  extraFixtureIds.push(aId);
  await prisma.onboardingForm.create({
    data: {
      id: `${aId}_form`,
      workspaceId: wsId,
      name: `Extra ${aId}`,
      createdByMemberId: ownerMemberId,
    },
  });
  await prisma.onboardingFormVersion.create({
    data: {
      id: `${aId}_v`,
      formId: `${aId}_form`,
      versionSeq: 1,
      definition: DEF as never,
      publishOriginRevision: 1,
      publishedByMemberId: ownerMemberId,
    },
  });
  return prisma.onboardingFormAssignment.create({
    data: {
      id: aId,
      workspaceId: wsId,
      clientProfileId: profileId,
      formId: `${aId}_form`,
      formVersionId: `${aId}_v`,
      assignedByMemberId: ownerMemberId,
    },
  });
}

async function deleteExtraAssignment(aId: string) {
  const sub = await prisma.onboardingSubmission.findFirst({
    where: { assignmentId: aId },
    select: { id: true },
  });
  if (sub)
    await prisma.onboardingSubmissionAnswer.deleteMany({
      where: { submissionId: sub.id },
    });
  await prisma.onboardingSubmission.deleteMany({
    where: { assignmentId: aId },
  });
  await prisma.onboardingFormAssignment.deleteMany({ where: { id: aId } });
  await prisma.onboardingFormVersion.deleteMany({
    where: { formId: `${aId}_form` },
  });
  await prisma.onboardingForm.deleteMany({ where: { id: `${aId}_form` } });
}

async function signIn(page: Page, email: string, base = BASE) {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const listUrl = () => `${BASE}/workspace/${wsId}/onboarding`;
const detailUrl = () => `${BASE}/workspace/${wsId}/onboarding/${ASSIGNMENT_ID}`;

async function expectNoOverflow(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
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

  // Deterministic cleanup of a previous partial run (Restrict FKs →
  // child rows before parents). All assignments on this form are removed:
  // the ACTIVE-per-(client,form) partial unique index would otherwise
  // collide with a leftover ACTIVE row from an interrupted run.
  const staleAssigns = await prisma.onboardingFormAssignment.findMany({
    where: { formId: FORM_ID },
    select: { id: true },
  });
  const staleSubs = await prisma.onboardingSubmission.findMany({
    where: { assignmentId: { in: staleAssigns.map((a) => a.id) } },
    select: { id: true },
  });
  await prisma.onboardingSubmissionAnswer.deleteMany({
    where: { submissionId: { in: staleSubs.map((s) => s.id) } },
  });
  await prisma.onboardingSubmission.deleteMany({
    where: { assignmentId: { in: staleAssigns.map((a) => a.id) } },
  });
  await prisma.onboardingFormAssignment.deleteMany({
    where: { formId: FORM_ID },
  });
  await prisma.onboardingFormVersion.deleteMany({ where: { formId: FORM_ID } });
  await prisma.onboardingForm.deleteMany({ where: { id: FORM_ID } });
  await prisma.consentRecord.deleteMany({
    where: {
      clientProfile: { workspaceId: wsId, userId: clientUser.id },
      version: { startsWith: "onboarding-submission-dev" },
    },
  });

  // Reuse the client's own profile if another spec created one (unique
  // (workspaceId,userId)); otherwise create the P-023 fixture profile.
  const existing = await prisma.clientProfile.findFirst({
    where: { workspaceId: wsId, userId: clientUser.id },
  });
  const profile =
    existing ??
    (await prisma.clientProfile.create({
      data: {
        id: PROFILE_ID,
        workspaceId: wsId,
        userId: clientUser.id,
        name: "P023 E2E Client",
      },
    }));
  profileId = profile.id;

  await prisma.onboardingForm.create({
    data: {
      id: FORM_ID,
      workspaceId: wsId,
      name: "P023 Intake",
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
      clientProfileId: profileId,
      formId: FORM_ID,
      formVersionId: VERSION_ID,
      assignedByMemberId: ownerMemberId,
    },
  });
  for (const [kind, version] of [
    ["PRIVACY_NOTICE", "onboarding-submission-dev-privacy-v1"],
    ["HEALTH_DATA", "onboarding-submission-dev-health-v1"],
  ] as const)
    await prisma.consentRecord.create({
      data: { clientProfileId: profileId, kind, version },
    });
});

test.afterAll(async () => {
  for (const aId of [...extraFixtureIds, ASSIGNMENT_ID])
    await deleteExtraAssignment(aId).catch(() => {});
  await prisma.onboardingFormVersion
    .deleteMany({ where: { formId: FORM_ID } })
    .catch(() => {});
  await prisma.onboardingForm
    .deleteMany({ where: { id: FORM_ID } })
    .catch(() => {});
  await prisma.consentRecord
    .deleteMany({
      where: {
        clientProfileId: profileId,
        version: { startsWith: "onboarding-submission-dev" },
      },
    })
    .catch(() => {});
  // The p023-namespaced profile is always this spec's fixture — remove it
  // when present (including leftovers from an interrupted earlier run).
  await prisma.clientProfile
    .deleteMany({ where: { id: PROFILE_ID } })
    .catch(() => {});
  await prisma.$disconnect();
});

test.describe("P-023 client onboarding submission", () => {
  test("flag-off list and detail return 404", async ({ page }) => {
    await signIn(page, E2E.client, FLAG_OFF);
    const list = await page.goto(`${FLAG_OFF}/workspace/${wsId}/onboarding`);
    expect(list?.status()).toBe(404);
    const detail = await page.goto(
      `${FLAG_OFF}/workspace/${wsId}/onboarding/${ASSIGNMENT_ID}`,
    );
    expect(detail?.status()).toBe(404);
    // No submission/audit activity from a flag-off attempt.
    expect(
      await prisma.onboardingSubmission.count({
        where: { assignmentId: ASSIGNMENT_ID },
      }),
    ).toBe(0);
    expect(
      await prisma.auditEvent.count({
        where: { resourceType: "onboarding_submission" },
      }),
    ).toBe(0);
  });

  test("client discovers own assignment; staff cannot reach the route", async ({
    page,
  }) => {
    await signIn(page, E2E.client);
    const res = await page.goto(listUrl());
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("link", { name: "P023 Intake" })).toBeVisible();
    await expect(page.getByText("Status: Active")).toBeVisible();
    // Staff denied at the collection guard.
    const ctx = await page.context().browser()!.newContext();
    const staff = await ctx.newPage();
    await signIn(staff, E2E.coach);
    const denied = await staff.goto(listUrl());
    expect(denied?.status()).toBe(403);
    await ctx.close();
  });

  test("required validation blocks submit; review → confirm → submitted view", async ({
    page,
  }) => {
    await signIn(page, E2E.client);
    await page.goto(detailUrl());
    // Missing required answers → client-side summary + field errors.
    await page.getByRole("button", { name: "Review answers" }).click();
    await expect(page.getByTestId("onboarding-error-summary")).toBeVisible();
    // Fill every kind.
    await page.getByLabel(/Full name/).fill("Bob Client");
    await page.getByLabel(/Health notes/).fill("Some notes");
    await page.getByLabel(/Weight/).fill("80.5");
    await page.getByLabel(/Start date/).fill("2026-10-01");
    await page.getByLabel(/Goal/).selectOption("o_gain");
    await page.getByLabel("Monday").check();
    await page.getByLabel("Friday").check();
    await page.getByRole("button", { name: "Review answers" }).click();
    // Confirm step shows irreversibility + review list.
    await expect(page.getByTestId("onboarding-confirm")).toBeVisible();
    await expect(page.getByText(/irreversible/)).toBeVisible();
    await page.getByTestId("onboarding-confirm-submit").click();
    // The action commits then revalidates: either the client's transitional
    // success panel or the server-rendered submitted view wins the race.
    await expect(
      page
        .getByTestId("onboarding-submit-done")
        .or(page.getByTestId("onboarding-submitted")),
    ).toBeVisible();
    // The commit is durable: the assignment row is COMPLETED.
    await expect
      .poll(async () => {
        const a = await prisma.onboardingFormAssignment.findUniqueOrThrow({
          where: { id: ASSIGNMENT_ID },
        });
        return a.status;
      })
      .toBe("COMPLETED");
    // Reload → server-driven read-only submitted view with own answers.
    await page.goto(detailUrl());
    await expect(page.getByTestId("onboarding-submitted")).toBeVisible();
    await expect(page.getByText("Bob Client")).toBeVisible();
    await expect(page.getByText("Gain")).toBeVisible();
    // No resubmit affordance.
    await expect(
      page.getByRole("button", { name: "Review answers" }),
    ).toHaveCount(0);
    // List now shows Completed.
    await page.goto(listUrl());
    await expect(page.getByText("Status: Completed")).toBeVisible();
  });

  test("staff assignments page shows Completed without answers", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(`${BASE}/workspace/${wsId}/onboarding/assignments`);
    await expect(page.getByText("Completed")).toBeVisible();
    await expect(page.getByText("Bob Client")).toHaveCount(0);
  });

  test("consent withdrawal hides own-answer detail; list keeps metadata", async ({
    page,
  }) => {
    await prisma.consentRecord.updateMany({
      where: { clientProfileId: profileId, kind: "PRIVACY_NOTICE" },
      data: { revokedAt: new Date() },
    });
    await signIn(page, E2E.client);
    await page.goto(detailUrl());
    await expect(page.getByText("This form is not available.")).toBeVisible();
    await page.goto(listUrl());
    await expect(page.getByText("Status: Completed")).toBeVisible();
    // Restore consent for suite hygiene.
    await prisma.consentRecord.updateMany({
      where: { clientProfileId: profileId, kind: "PRIVACY_NOTICE" },
      data: { revokedAt: null },
    });
  });

  test("no-store headers on list and detail; no answer data in URL", async ({
    page,
  }) => {
    await signIn(page, E2E.client);
    const list = await page.goto(listUrl());
    expect(list?.headers()["cache-control"]).toContain("no-store");
    const detail = await page.goto(detailUrl());
    expect(detail?.headers()["cache-control"]).toContain("no-store");
    expect(page.url()).not.toContain("answersJson");
    expect(page.url()).toContain(ASSIGNMENT_ID);
  });

  test("beforeunload fires only while dirty; submitted form is not trapped", async ({
    page,
  }) => {
    // Fresh assignment so the form starts fillable.
    const extra = await createExtraAssignment(
      "p023_e2e_assignment_beforeunload",
    );
    let dialogSeen = false;
    page.on("dialog", async (d) => {
      dialogSeen = true;
      await d.dismiss(); // stay on the page
    });
    await signIn(page, E2E.client);
    await page.goto(`${BASE}/workspace/${wsId}/onboarding/${extra.id}`);
    // Untouched form: no guard, navigation is free.
    await page.goto(listUrl());
    expect(dialogSeen).toBe(false);
    // Dirty form: reload prompts the browser's leave-confirmation dialog.
    // Evaluate-driven reload avoids the unresolved-navigation promise a
    // dismissed beforeunload dialog leaves on page.reload().
    await page.goto(`${BASE}/workspace/${wsId}/onboarding/${extra.id}`);
    await page.getByLabel(/Full name/).fill("Dirty");
    const [dialog] = await Promise.all([
      page.waitForEvent("dialog"),
      page.evaluate(() => window.location.reload()).catch(() => {}),
    ]);
    expect(dialog.type()).toBe("beforeunload");
    // The page.on("dialog") listener already dismissed it.
    expect(dialogSeen).toBe(true);
    // Complete and submit the same form — post-success navigation is not trapped.
    dialogSeen = false;
    await page.getByLabel(/Full name/).fill("Guarded User");
    await page.getByLabel(/Weight/).fill("70");
    await page.getByLabel(/Goal/).selectOption("o_gain");
    await page.getByRole("button", { name: "Review answers" }).click();
    await page.getByTestId("onboarding-confirm-submit").click();
    await expect(
      page
        .getByTestId("onboarding-submit-done")
        .or(page.getByTestId("onboarding-submitted")),
    ).toBeVisible();
    await page.goto(listUrl());
    await page.waitForTimeout(300);
    expect(dialogSeen).toBe(false);
    // Submitted assignment row cleanup (children before parents).
    await deleteExtraAssignment(extra.id);
    extraFixtureIds.splice(extraFixtureIds.indexOf(extra.id), 1);
  });

  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["tablet", { width: 834, height: 1112 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    test(`${name}: no horizontal overflow; keyboard completes the form`, async ({
      page,
    }) => {
      // Fresh assignment per viewport so the form is fillable.
      const aId = `p023_e2e_assignment_${name}`;
      await createExtraAssignment(aId);
      await page.setViewportSize(viewport);
      await signIn(page, E2E.client);
      await page.goto(`${BASE}/workspace/${wsId}/onboarding/${aId}`);
      await expectNoOverflow(page, viewport.width, viewport.height);
      // Keyboard: focus the first control, fill, tab through.
      await page.getByLabel(/Full name/).focus();
      await expect(page.getByLabel(/Full name/)).toBeFocused();
      await page.getByLabel(/Full name/).fill("Kb User");
      const review = page.getByRole("button", { name: "Review answers" });
      await review.focus();
      await expect(review).toBeFocused();
      // Touch-target probe: the review button meets the ≥44px floor.
      const box = await review.boundingBox();
      expect(box && box.height >= 44).toBe(true);
      await deleteExtraAssignment(aId);
      extraFixtureIds.splice(extraFixtureIds.indexOf(aId), 1);
    });
  }
});
