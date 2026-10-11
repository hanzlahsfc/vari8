import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-025-D2 — Check-In calendar (decision #104): read-only month grid +
 * accessible agenda over existing answer-free header lists on BOTH
 * surfaces — the staff per-client page and the client own page.
 * Viewer-local (browser) day placement; explicit `timezoneId` contexts
 * prove boundary placement. Cancelled stays visible; zero audits.
 */

const BASE = "http://127.0.0.1:3000";
const FLAG_OFF = "http://127.0.0.1:3101";
const TZ = "America/New_York";

// Deterministic viewer-local day placement (#104): every context runs
// in America/New_York so expected day keys are computable.
test.use({ timezoneId: TZ });

const FORM_ID = "p025d2_e2e_form";
const VERSION_ID = "p025d2_e2e_version";

const DEF = {
  title: "D2 Weekly Check-In",
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
let clientMemberId: string;
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

/** Local day key under the browser's tz — mirrors the component rule. */
function dayKey(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(iso))
    .replace(/\//g, "-");
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
  clientUserId = clientUser.id;
  const clientMember = await prisma.workspaceMember.findFirstOrThrow({
    where: { workspaceId: wsId, userId: clientUser.id },
  });
  clientMemberId = clientMember.id;

  const existing = await prisma.clientProfile.findFirst({
    where: { workspaceId: wsId, userId: clientUser.id },
  });
  const profile =
    existing ??
    (await prisma.clientProfile.create({
      data: {
        workspaceId: wsId,
        userId: clientUser.id,
        name: "P025D2 E2E Client",
      },
    }));
  profileId = profile.id;
  // Owned iff the profile is THIS spec's namespaced fixture — a reused
  // fixture profile is managed by its own spec's cleanup.
  profileCreated = existing === null || existing.name === "P025D2 E2E Client";

  // Clean namespaced fixtures (submission → instance → form order).
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
  await prisma.checkInFormVersion.deleteMany({ where: { formId: FORM_ID } });
  await prisma.checkInForm.deleteMany({ where: { id: FORM_ID } });
  await prisma.clientAssignment.deleteMany({
    where: { clientProfileId: profileId },
  });

  await prisma.checkInForm.create({
    data: {
      id: FORM_ID,
      workspaceId: wsId,
      name: "P025D2 Weekly",
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
  await prisma.consentRecord.deleteMany({
    where: {
      clientProfileId: profileId,
      version: { in: ["check-in-dev-privacy-v1", "check-in-dev-health-v1"] },
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
  const insts = await prisma.checkInInstance
    .findMany({ where: { formId: FORM_ID }, select: { id: true } })
    .catch(() => [] as { id: string }[]);
  const subs = await prisma.checkInSubmission
    .findMany({
      where: { instanceId: { in: insts.map((i) => i.id) } },
      select: { id: true },
    })
    .catch(() => [] as { id: string }[]);
  await prisma.checkInReview
    .deleteMany({ where: { submissionId: { in: subs.map((s) => s.id) } } })
    .catch(() => {});
  await prisma.checkInSubmissionAnswer
    .deleteMany({ where: { submissionId: { in: subs.map((s) => s.id) } } })
    .catch(() => {});
  await prisma.checkInSubmission
    .deleteMany({ where: { instanceId: { in: insts.map((i) => i.id) } } })
    .catch(() => {});
  await prisma.checkInInstance
    .deleteMany({ where: { formId: FORM_ID } })
    .catch(() => {});
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

function inst(dueAt: Date, opts: { cancelled?: boolean } = {}) {
  return prisma.checkInInstance.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      formId: FORM_ID,
      formVersionId: VERSION_ID,
      dueAt,
      scheduledByMemberId: ownerMemberId,
      cancelledByMemberId: opts.cancelled ? ownerMemberId : null,
      cancelledAt: opts.cancelled ? new Date() : null,
    },
  });
}

function submissionFor(instanceId: string) {
  return prisma.checkInSubmission.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      formId: FORM_ID,
      formVersionId: VERSION_ID,
      instanceId,
      submittedByUserId: clientUserId,
      submittedByMemberId: clientMemberId,
    },
  });
}

test("staff calendar: local-day chips, cancelled visible, month nav, agenda — three widths", async ({
  page,
}) => {
  const now = new Date();
  const scheduled = await inst(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 12),
  );
  const cancelled = await inst(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 12),
    { cancelled: true },
  );
  const nextMonth = await inst(
    new Date(now.getFullYear(), now.getMonth() + 1, 10, 12),
  );

  await signIn(page, E2E.owner);
  for (const w of [1440, 834, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`${BASE}/workspace/${wsId}/clients/${profileId}/checkins`);
    await expect(page.getByTestId("checkin-calendar")).toBeVisible();
    await checkNoOverflow(page);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  const schedKey = dayKey(scheduled.dueAt.toISOString(), TZ);
  await expect(
    page
      .getByTestId(`calendar-cell-${schedKey}`)
      .getByTestId("cal-chip-scheduled"),
  ).toBeVisible();
  // Cancelled stays visible with explicit "Cancelled" text.
  const cancKey = dayKey(cancelled.dueAt.toISOString(), TZ);
  const cancChip = page
    .getByTestId(`calendar-cell-${cancKey}`)
    .getByTestId("cal-chip-cancelled");
  await expect(cancChip).toBeVisible();
  await expect(cancChip).toContainText("Cancelled");

  // Month nav: next month chip hidden until we navigate.
  const nextKey = dayKey(nextMonth.dueAt.toISOString(), TZ);
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByTestId(`calendar-cell-${nextKey}`)).toBeVisible();
  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.getByTestId(`calendar-cell-${schedKey}`)).toBeVisible();

  // Agenda toggle renders the same data as a list.
  await page.getByTestId("checkin-calendar-toggle").click();
  const agenda = page.getByTestId("checkin-calendar-agenda");
  await expect(agenda).toBeVisible();
  await expect(agenda.getByText("Cancelled").first()).toBeVisible();
});

test("staff calendar: viewer-local day placement (NY) for a UTC-midnight boundary dueAt", async ({
  page,
}) => {
  // 2026-01-15T02:30Z is 2026-01-14 evening in America/New_York.
  const boundary = await inst(new Date("2026-01-15T02:30:00.000Z"));
  await signIn(page, E2E.owner);
  await page.goto(`${BASE}/workspace/${wsId}/clients/${profileId}/checkins`);

  // Navigate to January 2026 via prev-month clicks from today.
  const now = new Date();
  const target = new Date(2026, 0, 15);
  const diff =
    (now.getFullYear() - target.getFullYear()) * 12 +
    (now.getMonth() - target.getMonth());
  for (let i = 0; i < diff; i++)
    await page.getByRole("button", { name: "Previous month" }).click();

  const localKey = dayKey(boundary.dueAt.toISOString(), TZ); // 2026-01-14
  expect(localKey).toBe("2026-01-14");
  await expect(
    page
      .getByTestId(`calendar-cell-2026-01-14`)
      .getByTestId("cal-chip-scheduled"),
  ).toBeVisible();
  await expect(
    page
      .getByTestId(`calendar-cell-2026-01-15`)
      .getByTestId("cal-chip-scheduled"),
  ).toHaveCount(0);
});

test("client calendar: own chips link to the existing detail page", async ({
  page,
}) => {
  const now = new Date();
  const submitted = await inst(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12),
  );
  await submissionFor(submitted.id);

  await signIn(page, E2E.client);
  await page.goto(`${BASE}/workspace/${wsId}/check-ins`);
  await expect(page.getByTestId("checkin-calendar")).toBeVisible();
  const key = dayKey(submitted.dueAt.toISOString(), TZ);
  const chip = page
    .getByTestId(`calendar-cell-${key}`)
    .getByTestId("cal-chip-submitted");
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page).toHaveURL(new RegExp(`/check-ins/${submitted.id}`));
  await expect(page.getByTestId("checkin-detail")).toBeVisible();
});

test("truncation: a >200-month shows the incomplete notice in grid and agenda; navigating clears it", async ({
  page,
}) => {
  // 201 distinct-dueAt instances inside the CURRENT month.
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  await prisma.checkInInstance.createMany({
    data: Array.from({ length: 201 }, (_, i) => ({
      workspaceId: wsId,
      clientProfileId: profileId,
      formId: FORM_ID,
      formVersionId: VERSION_ID,
      dueAt: new Date(base.getTime() + i * 60_000),
      scheduledByMemberId: ownerMemberId,
    })),
  });

  await signIn(page, E2E.owner);
  await page.goto(`${BASE}/workspace/${wsId}/clients/${profileId}/checkins`);

  const notice = page.getByTestId("checkin-calendar-truncated");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("more than 200 Check-Ins");

  // Notice persists across the grid/agenda toggle.
  await page.getByTestId("checkin-calendar-toggle").click();
  await expect(page.getByTestId("checkin-calendar-agenda")).toBeVisible();
  await expect(notice).toBeVisible();
  await page.getByTestId("checkin-calendar-toggle").click();

  // Navigate to an untruncated month — the notice clears (no stale state).
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(notice).toHaveCount(0);
  await page.getByRole("button", { name: "Today" }).click();
  await expect(notice).toBeVisible();
});

test("flag-off: the calendar is absent on the production-fail-closed build", async ({
  page,
}) => {
  await signIn(page, E2E.client, FLAG_OFF);
  await page.goto(`${FLAG_OFF}/workspace/${wsId}/check-ins`);
  await expect(page.getByTestId("checkin-calendar")).toHaveCount(0);
});
