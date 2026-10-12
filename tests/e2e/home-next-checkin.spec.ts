import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * FI-I4 (decision #107) — client Home "Next unfinished Check-In" card.
 * Overdue-before-future selection, overdue label, empty state, and the
 * card link to the real authorized detail route. `i4`-namespaced
 * fixtures only; real browser, real seeded rows.
 */

const BASE = "http://127.0.0.1:3000";
const FLAG_OFF = "http://127.0.0.1:3101";

const FORM_ID = "i4_e2e_form";
const VERSION_ID = "i4_e2e_form_v";

let prisma: PrismaClient;
let wsId: string;
let profileId = "";
let createdProfile = false;
let ownerMemberId = "";
let clientUserId = "";
let clientMemberId = "";

async function signIn(page: Page, email: string, base = BASE) {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/login/);
}

test.beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { slug: E2E.workspaceSlug },
  });
  wsId = ws.id;
  ownerMemberId = (
    await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsId, user: { email: E2E.owner } },
    })
  ).id;
  const clientUser = await prisma.user.findUniqueOrThrow({
    where: { email: E2E.client },
  });
  clientUserId = clientUser.id;
  clientMemberId = (
    await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsId, userId: clientUser.id },
    })
  ).id;

  // (workspace_id,user_id) is unique — reuse the shared client's
  // profile if another spec owns it, else create a task-owned one we
  // delete in afterAll so later specs can create their own.
  const existing = await prisma.clientProfile.findFirst({
    where: { workspaceId: wsId, userId: clientUser.id },
  });
  createdProfile = existing === null;
  const profile =
    existing ??
    (await prisma.clientProfile.create({
      data: {
        id: "i4_e2e_client_profile",
        workspaceId: wsId,
        userId: clientUser.id,
        name: "I4 E2E Client",
      },
    }));
  profileId = profile.id;

  await prisma.checkInForm.create({
    data: {
      id: FORM_ID,
      workspaceId: wsId,
      name: "I4 Weekly",
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
      definition: {
        title: "I4 Weekly",
        fields: [
          {
            fieldId: "f_summary",
            kind: "shortText",
            label: "Summary",
            required: true,
            order: 0,
          },
        ],
      } as never,
      publishOriginRevision: 1,
      publishedByMemberId: ownerMemberId,
    },
  });
  for (const [kind, version] of [
    ["PRIVACY_NOTICE", "check-in-dev-privacy-v1"],
    ["HEALTH_DATA", "check-in-dev-health-v1"],
  ] as const) {
    await prisma.consentRecord.deleteMany({
      where: { clientProfileId: profileId, kind, version },
    });
    await prisma.consentRecord.create({
      data: { clientProfileId: profileId, kind, version },
    });
  }
});

test.afterAll(async () => {
  const insts = await prisma.checkInInstance.findMany({
    where: { formId: FORM_ID },
    select: { id: true },
  });
  const subs = await prisma.checkInSubmission.findMany({
    where: { instanceId: { in: insts.map((i) => i.id) } },
    select: { id: true },
  });
  await prisma.checkInReview.deleteMany({
    where: { submissionId: { in: subs.map((s) => s.id) } },
  });
  await prisma.checkInSubmissionAnswer.deleteMany({
    where: { submissionId: { in: subs.map((s) => s.id) } },
  });
  await prisma.checkInSubmission.deleteMany({
    where: { instanceId: { in: insts.map((i) => i.id) } },
  });
  await prisma.checkInInstance.deleteMany({ where: { formId: FORM_ID } });
  await prisma.checkInFormVersion.deleteMany({ where: { formId: FORM_ID } });
  await prisma.checkInForm.deleteMany({ where: { id: FORM_ID } });
  if (createdProfile) {
    await prisma.consentRecord.deleteMany({
      where: { clientProfileId: "i4_e2e_client_profile" },
    });
    await prisma.clientProfile.deleteMany({
      where: { id: "i4_e2e_client_profile" },
    });
  }
  await prisma.$disconnect();
});

async function resetInstances() {
  const insts = await prisma.checkInInstance.findMany({
    where: { formId: FORM_ID },
    select: { id: true },
  });
  const subs = await prisma.checkInSubmission.findMany({
    where: { instanceId: { in: insts.map((i) => i.id) } },
    select: { id: true },
  });
  await prisma.checkInReview.deleteMany({
    where: { submissionId: { in: subs.map((s) => s.id) } },
  });
  await prisma.checkInSubmission.deleteMany({
    where: { instanceId: { in: insts.map((i) => i.id) } },
  });
  await prisma.checkInInstance.deleteMany({ where: { formId: FORM_ID } });
}

const inst = (dueAt: Date, id: string) =>
  prisma.checkInInstance.create({
    data: {
      id,
      workspaceId: wsId,
      clientProfileId: profileId,
      formId: FORM_ID,
      formVersionId: VERSION_ID,
      dueAt,
      scheduledByMemberId: ownerMemberId,
    },
  });

test.describe.configure({ mode: "serial" });
test.describe("FI-I4 next-Check-In card", () => {
  test("card shows earliest unfinished; overdue labeled and links to detail", async ({
    page,
  }) => {
    await resetInstances();
    const past = new Date(Date.now() - 48 * 3600 * 1000);
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    await inst(future, "i4e2e_future");
    await inst(past, "i4e2e_overdue");
    await signIn(page, E2E.client);
    await page.goto(`${BASE}/workspace/${wsId}/home`);

    const card = page.getByTestId("home-next-checkin");
    await expect(card).toBeVisible();
    await expect(card).toContainText("I4 Weekly");
    await expect(card).toContainText(/overdue/i);
    await expect(card).toHaveAttribute(
      "href",
      `/workspace/${wsId}/check-ins/i4e2e_overdue`,
    );
    // The card link reaches the real authorized form route.
    await card.click();
    await expect(page).toHaveURL(/check-ins\/i4e2e_overdue/);
    await expect(page.locator("#ci-f-f_summary")).toBeVisible();
  });

  test("card picks earliest future when nothing is overdue; empty state when all finished", async ({
    page,
  }) => {
    await resetInstances();
    const near = new Date(Date.now() + 24 * 3600 * 1000);
    const far = new Date(Date.now() + 96 * 3600 * 1000);
    await inst(far, "i4e2e_far");
    await inst(near, "i4e2e_near");
    // A cancelled instance must not win.
    await inst(new Date(Date.now() - 3600 * 1000), "i4e2e_cancelled");
    await prisma.checkInInstance.update({
      where: { id: "i4e2e_cancelled" },
      data: {
        cancelledAt: new Date(),
        cancelledByMemberId: ownerMemberId,
      },
    });
    await signIn(page, E2E.client);
    await page.goto(`${BASE}/workspace/${wsId}/home`);
    const card = page.getByTestId("home-next-checkin");
    await expect(card).toHaveAttribute(
      "href",
      `/workspace/${wsId}/check-ins/i4e2e_near`,
    );
    await expect(card).not.toContainText(/overdue/i);

    // Submit the only candidate → truthful empty state.
    await prisma.checkInSubmission.create({
      data: {
        workspaceId: wsId,
        clientProfileId: profileId,
        formId: FORM_ID,
        formVersionId: VERSION_ID,
        instanceId: "i4e2e_near",
        submittedByUserId: clientUserId,
        submittedByMemberId: clientMemberId,
      },
    });
    await prisma.checkInSubmission.create({
      data: {
        workspaceId: wsId,
        clientProfileId: profileId,
        formId: FORM_ID,
        formVersionId: VERSION_ID,
        instanceId: "i4e2e_far",
        submittedByUserId: clientUserId,
        submittedByMemberId: clientMemberId,
      },
    });
    await page.goto(`${BASE}/workspace/${wsId}/home`);
    await expect(page.getByTestId("home-next-checkin-empty")).toBeVisible();
    await expect(page.getByTestId("home-next-checkin-empty")).toContainText(
      /no unfinished/i,
    );
  });

  test("flag-off hides the card; staff home unaffected", async ({ page }) => {
    await signIn(page, E2E.client, FLAG_OFF);
    await page.goto(`${FLAG_OFF}/workspace/${wsId}/home`);
    await expect(page.getByTestId("home-next-checkin")).toHaveCount(0);
    await expect(page.getByTestId("home-next-checkin-empty")).toHaveCount(0);
    await signIn(page, E2E.owner);
    await page.goto(`${BASE}/workspace/${wsId}/home`);
    await expect(page.getByTestId("home-next-checkin")).toHaveCount(0);
  });

  test("card is keyboard-reachable and legible in both themes at 390", async ({
    page,
  }) => {
    await resetInstances();
    await inst(new Date(Date.now() + 24 * 3600 * 1000), "i4e2e_kbd");
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, E2E.client);
    await page.goto(`${BASE}/workspace/${wsId}/home`);
    const card = page.getByTestId("home-next-checkin");
    await card.focus();
    await expect(card).toBeFocused();
    await page.getByRole("button", { name: "Light theme" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      "pro-white",
    );
    await expect(card).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
