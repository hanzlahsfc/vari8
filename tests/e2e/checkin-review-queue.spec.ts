import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * CHECK-IN-OVERVIEW-I1 — staff "awaiting review" overview + exact-
 * submission deep link on the production build (approved P2 contract):
 * header-only workspace list (owner workspace scope; coach/assistant
 * assigned scope), ?submission=<id> opens the exact submission through
 * the existing audited detail action — zero detail reads/audits before
 * explicit navigation. Synthetic deterministic fixtures only
 * (cio1_* namespace).
 */

const BASE = "http://127.0.0.1:3000";
const FLAG_OFF = "http://127.0.0.1:3101";

const FORM_A_ID = "cio1_e2e_form_a";
const VERSION_A_ID = "cio1_e2e_version_a";
const FORM_B_ID = "cio1_e2e_form_b";
const VERSION_B_ID = "cio1_e2e_version_b";

const DEF = {
  title: "Queue Weekly",
  fields: [
    {
      fieldId: "f_q1",
      kind: "shortText",
      label: "How was your week?",
      required: true,
      order: 0,
    },
  ],
};

let prisma: PrismaClient;
let wsId: string;
let wsBId: string;
let profileId: string;
let wsBProfileId: string;
let ownerMemberId: string;
let wsBOwnerMemberId: string;
let wsBClientMemberId: string;
let coachMemberId: string;
let assistantMemberId: string;
let clientUserId: string;
let clientMemberId: string;
// Profiles THIS spec created for the shared client user — removed at
// teardown so sibling specs' own (workspace,user) seeds don't collide.
let createdProfileIds: string[] = [];
// Whether wsB already held a CLIENT member row for the shared client
// before this spec upserted one — delete ours at teardown only when we
// created it.
let createdWsBMember = false;

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

async function seedCheckIn(opts: {
  workspaceId: string;
  clientProfileId: string;
  submittedByMemberId: string;
  dueAt: Date;
  submittedAt: Date;
  formId?: string;
  versionId?: string;
  reviewedByMemberId?: string;
}) {
  const instance = await prisma.checkInInstance.create({
    data: {
      workspaceId: opts.workspaceId,
      clientProfileId: opts.clientProfileId,
      formId: opts.formId ?? FORM_A_ID,
      formVersionId: opts.versionId ?? VERSION_A_ID,
      dueAt: opts.dueAt,
      scheduledByMemberId:
        opts.workspaceId === wsId ? ownerMemberId : wsBOwnerMemberId,
    },
  });
  const submission = await prisma.checkInSubmission.create({
    data: {
      workspaceId: opts.workspaceId,
      clientProfileId: opts.clientProfileId,
      formId: opts.formId ?? FORM_A_ID,
      formVersionId: opts.versionId ?? VERSION_A_ID,
      instanceId: instance.id,
      submittedByUserId: clientUserId,
      submittedByMemberId: opts.submittedByMemberId,
      submittedAt: opts.submittedAt,
    },
  });
  if (opts.reviewedByMemberId)
    await prisma.checkInReview.create({
      data: {
        workspaceId: opts.workspaceId,
        clientProfileId: opts.clientProfileId,
        submissionId: submission.id,
        reviewedByMemberId: opts.reviewedByMemberId,
      },
    });
  return { instance, submission };
}

async function removeFixtures() {
  for (const w of [wsId, wsBId]) {
    const instances = await prisma.checkInInstance.findMany({
      where: {
        workspaceId: w,
        formId: { in: [FORM_A_ID, FORM_B_ID, `${FORM_A_ID}_b`] },
      },
      select: { id: true },
    });
    const ids = instances.map((i) => i.id);
    const subs = await prisma.checkInSubmission.findMany({
      where: { instanceId: { in: ids } },
      select: { id: true },
    });
    const subIds = subs.map((s) => s.id);
    await prisma.checkInReview.deleteMany({
      where: { submissionId: { in: subIds } },
    });
    await prisma.checkInSubmission.deleteMany({
      where: { instanceId: { in: ids } },
    });
    await prisma.checkInInstance.deleteMany({ where: { id: { in: ids } } });
  }
}

test.beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { slug: E2E.workspaceSlug },
  });
  wsId = ws.id;
  const wsB = await prisma.workspace.findUniqueOrThrow({
    where: { slug: E2E.workspaceBSlug },
  });
  wsBId = wsB.id;

  const [
    ownerMember,
    wsBOwnerMember,
    coach,
    coachMember,
    assistantMember,
    clientUser,
  ] = await Promise.all([
    prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsId, user: { email: E2E.owner } },
    }),
    prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsBId, user: { email: E2E.owner } },
    }),
    prisma.user.findUniqueOrThrow({ where: { email: E2E.coach } }),
    prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsId, user: { email: E2E.coach } },
    }),
    prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsId, user: { email: E2E.assistant } },
    }),
    prisma.user.findUniqueOrThrow({ where: { email: E2E.client } }),
  ]);
  ownerMemberId = ownerMember.id;
  wsBOwnerMemberId = wsBOwnerMember.id;
  coachMemberId = coachMember.id;
  assistantMemberId = assistantMember.id;
  clientUserId = clientUser.id;
  clientMemberId = (
    await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsId, userId: clientUserId },
    })
  ).id;

  await removeFixtures();

  // My own client profile in wsA — unique (workspace,userId) means reuse
  // the shared client's profile if another spec already made one. If WE
  // create it we must also remove it at teardown: sibling specs seed
  // their own fixed-id profiles for the same (workspace, user) pair and
  // an orphan would collide on the composite unique.
  const existing =
    (await prisma.clientProfile.findFirst({
      where: { workspaceId: wsId, userId: clientUserId },
    })) ?? null;
  const profile =
    existing ??
    (await prisma.clientProfile.create({
      data: { workspaceId: wsId, userId: clientUserId, name: "CIO1 Client" },
    }));
  profileId = profile.id;
  createdProfileIds = existing ? [] : [profile.id];

  // wsB fixtures — isolated workspace for empty/pagination assertions.
  // The shared client has no wsB membership from global-setup; upsert is
  // rerun-safe, and the flag marks whether teardown must remove the row.
  createdWsBMember =
    (await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: wsBId, userId: clientUserId },
      },
    })) === null;
  wsBClientMemberId = (
    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: wsBId, userId: clientUserId },
      },
      update: { role: "CLIENT", status: "ACTIVE" },
      create: {
        workspaceId: wsBId,
        userId: clientUserId,
        role: "CLIENT",
        status: "ACTIVE",
      },
    })
  ).id;
  const existingB =
    (await prisma.clientProfile.findFirst({
      where: { workspaceId: wsBId, userId: clientUserId },
    })) ?? null;
  const wsBProfile =
    existingB ??
    (await prisma.clientProfile.create({
      data: {
        workspaceId: wsBId,
        userId: clientUserId,
        name: "CIO1 WS-B Client",
      },
    }));
  if (!existingB) createdProfileIds.push(wsBProfile.id);
  wsBProfileId = wsBProfile.id;

  for (const [formId, versionId, name] of [
    [FORM_A_ID, VERSION_A_ID, "CIO1 Queue Form A"],
    [FORM_B_ID, VERSION_B_ID, "CIO1 Queue Form B"],
  ] as const) {
    // Rerun-safe: versions first — the form deleteMany would hit the
    // child FK if a prior run left its version row behind.
    await prisma.checkInFormVersion.deleteMany({ where: { id: versionId } });
    await prisma.checkInForm.deleteMany({ where: { id: formId } });
    await prisma.checkInForm.create({
      data: {
        id: formId,
        workspaceId: wsId,
        name,
        status: "ACTIVE",
        createdByMemberId: ownerMemberId,
      },
    });
    await prisma.checkInFormVersion.create({
      data: {
        id: versionId,
        workspaceId: wsId,
        formId,
        versionSeq: 1,
        definition: DEF as never,
        publishOriginRevision: 1,
        publishedByMemberId: ownerMemberId,
      },
    });
  }
  // wsB copies (coherence FKs bind form→workspace).
  for (const [formId, versionId, name] of [
    [FORM_A_ID + "_b", VERSION_A_ID + "_b", "CIO1 WS-B Form"],
  ] as const) {
    await prisma.checkInFormVersion.deleteMany({ where: { id: versionId } });
    await prisma.checkInForm.deleteMany({ where: { id: formId } });
    await prisma.checkInForm.create({
      data: {
        id: formId,
        workspaceId: wsBId,
        name,
        status: "ACTIVE",
        createdByMemberId: wsBOwnerMemberId,
      },
    });
    await prisma.checkInFormVersion.create({
      data: {
        id: versionId,
        workspaceId: wsBId,
        formId,
        versionSeq: 1,
        definition: DEF as never,
        publishOriginRevision: 1,
        publishedByMemberId: wsBOwnerMemberId,
      },
    });
  }

  // Assigned coach + assistant on my profile (read/write scopes).
  await prisma.clientAssignment.deleteMany({
    where: { clientProfileId: profileId },
  });
  await prisma.clientAssignment.createMany({
    data: [
      {
        workspaceId: wsId,
        clientProfileId: profileId,
        coachMemberId,
        role: "PRIMARY",
        status: "ACTIVE",
      },
      {
        workspaceId: wsId,
        clientProfileId: profileId,
        coachMemberId: assistantMemberId,
        role: "COACH",
        status: "ACTIVE",
      },
    ],
  });
  await prisma.consentRecord.createMany({
    data: [
      {
        clientProfileId: profileId,
        kind: "PRIVACY_NOTICE",
        version: "check-in-dev-privacy-v1",
      },
      {
        clientProfileId: profileId,
        kind: "HEALTH_DATA",
        version: "check-in-dev-health-v1",
      },
    ],
    skipDuplicates: true,
  });
});

test.afterAll(async () => {
  await removeFixtures().catch(() => {});
  await prisma.clientAssignment
    .deleteMany({
      where: { clientProfileId: { in: [profileId, wsBProfileId] } },
    })
    .catch(() => {});
  // Remove ONLY the profiles this spec created — a pre-existing shared
  // profile is reused untouched. Consents/assignments are children.
  await prisma.consentRecord
    .deleteMany({ where: { clientProfileId: { in: createdProfileIds } } })
    .catch(() => {});
  await prisma.clientAssignment
    .deleteMany({ where: { clientProfileId: { in: createdProfileIds } } })
    .catch(() => {});
  await prisma.clientProfile
    .deleteMany({ where: { id: { in: createdProfileIds } } })
    .catch(() => {});
  if (createdWsBMember)
    await prisma.workspaceMember
      .deleteMany({
        where: { workspaceId: wsBId, userId: clientUserId },
      })
      .catch(() => {});
  await prisma.checkInFormVersion
    .deleteMany({
      where: {
        id: {
          in: [VERSION_A_ID, VERSION_B_ID, `${VERSION_A_ID}_b`],
        },
      },
    })
    .catch(() => {});
  await prisma.checkInForm
    .deleteMany({
      where: { id: { in: [FORM_A_ID, FORM_B_ID, `${FORM_A_ID}_b`] } },
    })
    .catch(() => {});
  await prisma?.$disconnect();
});

const overviewUrl = (w = wsId) =>
  `${BASE}/workspace/${w}/checkins/review-queue`;
const clientCheckinsUrl = (submission?: string) =>
  `${BASE}/workspace/${wsId}/clients/${profileId}/checkins${
    submission !== undefined ? `?submission=${submission}` : ""
  }`;

const readAudits = (workspaceId: string, submissionId: string) =>
  prisma.auditEvent.findMany({
    where: {
      workspaceId,
      resourceType: "checkin_submission",
      resourceId: submissionId,
      action: "READ",
    },
  });

// ── Flag-off ───────────────────────────────────────────────────────────

test("flag-off server 404s the overview before session/DB work", async ({
  page,
}) => {
  await signIn(page, E2E.owner, FLAG_OFF);
  const res = await page.goto(
    `${FLAG_OFF}/workspace/${wsId}/checkins/review-queue`,
  );
  expect(res?.status()).toBe(404);
});

// ── Overview list + exact-submission navigation ────────────────────────

test("owner sees awaiting rows; clicking a row opens THAT exact submission among several for the client", async ({
  page,
}) => {
  const a = await seedCheckIn({
    workspaceId: wsId,
    clientProfileId: profileId,
    submittedByMemberId: clientMemberId,
    dueAt: new Date("2031-01-05T09:00:00.000Z"),
    submittedAt: new Date("2031-01-05T10:00:00.000Z"),
  });
  const b = await seedCheckIn({
    workspaceId: wsId,
    clientProfileId: profileId,
    submittedByMemberId: clientMemberId,
    dueAt: new Date("2031-01-06T09:00:00.000Z"),
    submittedAt: new Date("2031-01-06T10:00:00.000Z"),
    formId: FORM_B_ID,
    versionId: VERSION_B_ID,
  });
  // Reviewed + scheduled rows must not appear.
  await seedCheckIn({
    workspaceId: wsId,
    clientProfileId: profileId,
    submittedByMemberId: clientMemberId,
    dueAt: new Date("2031-01-07T09:00:00.000Z"),
    submittedAt: new Date("2031-01-07T10:00:00.000Z"),
    reviewedByMemberId: ownerMemberId,
  });
  await prisma.checkInInstance.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      formId: FORM_A_ID,
      formVersionId: VERSION_A_ID,
      dueAt: new Date("2031-01-08T09:00:00.000Z"),
      scheduledByMemberId: ownerMemberId,
    },
  });
  try {
    await signIn(page, E2E.owner);
    await page.goto(overviewUrl());
    const list = page.getByTestId("review-queue-list");
    await expect(list).toBeVisible();
    await expect(list.getByText("CIO1 Queue Form A")).toBeVisible();
    await expect(list.getByText("CIO1 Queue Form B")).toBeVisible();

    // Zero READ audits before any explicit navigation.
    expect((await readAudits(wsId, a.submission.id)).length).toBe(0);
    expect((await readAudits(wsId, b.submission.id)).length).toBe(0);

    // Click the B row — opens exactly B (form title distinguishes).
    await list.getByText("CIO1 Queue Form B").click();
    await expect(page).toHaveURL(new RegExp(`submission=${b.submission.id}`));
    const detail = page.getByTestId("checkin-detail");
    await expect(detail).toBeVisible();
    await expect(detail.getByText("CIO1 Queue Form B")).toBeVisible();
    // One committed detail load → exactly one READ audit for B only.
    expect((await readAudits(wsId, b.submission.id)).length).toBe(1);
    expect((await readAudits(wsId, a.submission.id)).length).toBe(0);
  } finally {
    await removeFixtures();
  }
});

test("no destination request (prefetch) before the row click", async ({
  page,
}) => {
  await seedCheckIn({
    workspaceId: wsId,
    clientProfileId: profileId,
    submittedByMemberId: clientMemberId,
    dueAt: new Date("2031-02-01T09:00:00.000Z"),
    submittedAt: new Date("2031-02-01T10:00:00.000Z"),
  });
  const requests: string[] = [];
  await page.route("**/clients/*/checkins**", (route) => {
    if (route.request().resourceType() === "document")
      requests.push(route.request().url());
    return route.continue();
  });
  try {
    await signIn(page, E2E.owner);
    await page.goto(overviewUrl());
    await expect(page.getByTestId("review-queue-list")).toBeVisible();
    // Links are in the viewport; prefetch={false} + the dynamic page mean
    // nothing has been requested.
    await page.waitForTimeout(1500);
    expect(requests).toEqual([]);
  } finally {
    await page.unroute("**/clients/*/checkins**");
    await removeFixtures();
  }
});

test("deep link: direct ?submission= opens the detail; refresh re-opens (its own audit)", async ({
  page,
}) => {
  const a = await seedCheckIn({
    workspaceId: wsId,
    clientProfileId: profileId,
    submittedByMemberId: clientMemberId,
    dueAt: new Date("2031-03-01T09:00:00.000Z"),
    submittedAt: new Date("2031-03-01T10:00:00.000Z"),
  });
  try {
    await signIn(page, E2E.owner);
    await page.goto(clientCheckinsUrl(a.submission.id));
    const detail = page.getByTestId("checkin-detail");
    await expect(detail).toBeVisible();
    await expect(detail.getByText("CIO1 Queue Form A")).toBeVisible();
    expect((await readAudits(wsId, a.submission.id)).length).toBe(1);
    // Refresh re-opens — a second honest committed read + audit.
    await page.reload();
    await expect(detail).toBeVisible();
    expect((await readAudits(wsId, a.submission.id)).length).toBe(2);
  } finally {
    await removeFixtures();
  }
});

test("repeated/malformed/foreign submission params fail closed without a detail POST or audit", async ({
  page,
}) => {
  const a = await seedCheckIn({
    workspaceId: wsId,
    clientProfileId: profileId,
    submittedByMemberId: clientMemberId,
    dueAt: new Date("2031-03-10T09:00:00.000Z"),
    submittedAt: new Date("2031-03-10T10:00:00.000Z"),
  });
  const foreign = await seedCheckIn({
    workspaceId: wsBId,
    clientProfileId: wsBProfileId,
    submittedByMemberId: wsBClientMemberId,
    dueAt: new Date("2031-03-11T09:00:00.000Z"),
    submittedAt: new Date("2031-03-11T10:00:00.000Z"),
    formId: `${FORM_A_ID}_b`,
    versionId: `${VERSION_A_ID}_b`,
  });
  try {
    await signIn(page, E2E.owner);
    // Repeated
    await page.goto(
      `${clientCheckinsUrl()}?submission=${a.submission.id}&submission=${a.submission.id}`,
    );
    await expect(page.getByTestId("checkin-detail-error")).toBeVisible();
    await expect(page.getByTestId("checkin-detail")).toHaveCount(0);
    // Malformed (over bound)
    await page.goto(`${clientCheckinsUrl()}?submission=${"x".repeat(200)}`);
    await expect(page.getByTestId("checkin-detail-error")).toBeVisible();
    await expect(page.getByTestId("checkin-detail")).toHaveCount(0);
    // Foreign-workspace submission → the action denies.
    await page.goto(clientCheckinsUrl(foreign.submission.id));
    await expect(page.getByTestId("checkin-detail-error")).toBeVisible();
    await expect(page.getByTestId("checkin-detail")).toHaveCount(0);
    // Zero READ audits produced by any of the rejected params.
    expect((await readAudits(wsId, a.submission.id)).length).toBe(0);
    expect((await readAudits(wsBId, foreign.submission.id)).length).toBe(0);
  } finally {
    await removeFixtures();
  }
});

// ── Read-only + denial + stale rows ────────────────────────────────────

test("assistant sees the row read-only; deep link opens detail with no mark control", async ({
  page,
}) => {
  const a = await seedCheckIn({
    workspaceId: wsId,
    clientProfileId: profileId,
    submittedByMemberId: clientMemberId,
    dueAt: new Date("2031-04-01T09:00:00.000Z"),
    submittedAt: new Date("2031-04-01T10:00:00.000Z"),
  });
  try {
    await signIn(page, E2E.assistant);
    await page.goto(overviewUrl());
    const list = page.getByTestId("review-queue-list");
    await expect(list.getByText("CIO1 Queue Form A")).toBeVisible();
    await page.goto(clientCheckinsUrl(a.submission.id));
    await expect(page.getByTestId("checkin-detail")).toBeVisible();
    await expect(page.getByTestId("checkin-mark-reviewed")).toHaveCount(0);
  } finally {
    await removeFixtures();
  }
});

test("denied member: no nav link; direct URL is 403, not an empty queue", async ({
  page,
}) => {
  await signIn(page, E2E.support);
  await page.goto(`${BASE}/workspace/${wsId}`);
  await expect(
    page.getByRole("link", { name: "Check-In Reviews" }),
  ).toHaveCount(0);
  const res = await page.goto(overviewUrl());
  expect(res?.status()).toBe(403);
});

test("assignment revoked between listing and opening fails closed", async ({
  page,
}) => {
  const a = await seedCheckIn({
    workspaceId: wsId,
    clientProfileId: profileId,
    submittedByMemberId: clientMemberId,
    dueAt: new Date("2031-05-01T09:00:00.000Z"),
    submittedAt: new Date("2031-05-01T10:00:00.000Z"),
  });
  try {
    await signIn(page, E2E.coach);
    await page.goto(overviewUrl());
    await expect(
      page.getByTestId("review-queue-list").getByText("CIO1 Queue Form A"),
    ).toBeVisible();
    // Revoke mid-flow — the destination re-authorizes at call time.
    await prisma.clientAssignment.updateMany({
      where: { clientProfileId: profileId, coachMemberId },
      data: { status: "REMOVED" },
    });
    await page.goto(clientCheckinsUrl(a.submission.id));
    // The page's per-client reads re-authorize first: with the
    // assignment gone the whole submissions surface denies — the
    // deep-link panel never mounts, no detail action fires, and the
    // closed `checkins-denied` banner is the honest outcome (stronger
    // than an in-panel error: zero answer-path work happens at all).
    await expect(page.getByTestId("checkins-denied")).toBeVisible();
    await expect(page.getByTestId("checkin-detail")).toHaveCount(0);
    await expect(page.getByTestId("checkin-detail-region")).toHaveCount(0);
    // Refetched queue no longer lists the row.
    await page.goto(overviewUrl());
    await expect(
      page.getByTestId("review-queue-list").getByText("CIO1 Queue Form A"),
    ).toHaveCount(0);
  } finally {
    await prisma.clientAssignment.updateMany({
      where: { clientProfileId: profileId, coachMemberId },
      data: { status: "ACTIVE" },
    });
    await removeFixtures();
  }
});

test("row reviewed after listing still opens truthful reviewed detail", async ({
  page,
}) => {
  const a = await seedCheckIn({
    workspaceId: wsId,
    clientProfileId: profileId,
    submittedByMemberId: clientMemberId,
    dueAt: new Date("2031-06-01T09:00:00.000Z"),
    submittedAt: new Date("2031-06-01T10:00:00.000Z"),
  });
  try {
    await signIn(page, E2E.coach);
    await page.goto(overviewUrl());
    await expect(
      page.getByTestId("review-queue-list").getByText("CIO1 Queue Form A"),
    ).toBeVisible();
    // Review it server-side, then open the deep link.
    await prisma.checkInReview.create({
      data: {
        workspaceId: wsId,
        clientProfileId: profileId,
        submissionId: a.submission.id,
        reviewedByMemberId: coachMemberId,
      },
    });
    await page.goto(clientCheckinsUrl(a.submission.id));
    const detail = page.getByTestId("checkin-detail");
    await expect(detail).toBeVisible();
    await expect(detail.getByText(/Reviewed by/)).toBeVisible();
    await expect(page.getByTestId("checkin-mark-reviewed")).toHaveCount(0);
    // And it is gone from the queue on refetch.
    await page.goto(overviewUrl());
    await expect(
      page.getByTestId("review-queue-list").getByText("CIO1 Queue Form A"),
    ).toHaveCount(0);
  } finally {
    await removeFixtures();
  }
});

// ── A→B same-page navigation (R2-R1 P3-1: stale-response safety) ───────

test("same-page A→B param change resolves to B even while A is delayed", async ({
  page,
}) => {
  const a = await seedCheckIn({
    workspaceId: wsId,
    clientProfileId: profileId,
    submittedByMemberId: clientMemberId,
    dueAt: new Date("2031-07-01T09:00:00.000Z"),
    submittedAt: new Date("2031-07-01T10:00:00.000Z"),
  });
  const b = await seedCheckIn({
    workspaceId: wsId,
    clientProfileId: profileId,
    submittedByMemberId: clientMemberId,
    dueAt: new Date("2031-07-02T09:00:00.000Z"),
    submittedAt: new Date("2031-07-02T10:00:00.000Z"),
    formId: FORM_B_ID,
    versionId: VERSION_B_ID,
  });
  try {
    await signIn(page, E2E.owner);
    // Delay ONLY the detail POST carrying submission A's id.
    let releaseA: (() => void) | null = null;
    const aGate = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    await page.route("**/checkins*", async (route) => {
      const req = route.request();
      if (
        req.method() === "POST" &&
        (req.postData() ?? "").includes(a.submission.id)
      ) {
        await aGate;
      }
      return route.continue();
    });

    await page.goto(clientCheckinsUrl(a.submission.id));
    // A's detail load is in-flight (delayed); swap the param to B on the
    // same mounted page via the native History API.
    await expect
      .poll(async () =>
        page.getByTestId("checkin-detail-region").getAttribute("aria-busy"),
      )
      .toBe("true");
    await page.evaluate(
      (id) => window.history.pushState({}, "", `?submission=${id}`),
      b.submission.id,
    );
    // Let B's dispatch queue behind A, then release A. The serialized
    // useActionState queue resolves them in order — B last wins.
    await page.waitForTimeout(300);
    releaseA!();

    const detail = page.getByTestId("checkin-detail");
    await expect(detail).toBeVisible();
    await expect(detail.getByText("CIO1 Queue Form B")).toBeVisible();
    // Settle, then re-assert: a late A must never surface as the visible
    // target afterwards.
    await page.waitForTimeout(800);
    await expect(detail.getByText("CIO1 Queue Form B")).toBeVisible();
    await expect(detail.getByText("CIO1 Queue Form A")).toHaveCount(0);
    expect((await readAudits(wsId, b.submission.id)).length).toBe(1);
    await page.unroute("**/checkins*");
  } finally {
    await page.unroute("**/checkins*").catch(() => {});
    await removeFixtures();
  }
});

test("back/forward between two deep links re-opens the matching submission", async ({
  page,
}) => {
  const a = await seedCheckIn({
    workspaceId: wsId,
    clientProfileId: profileId,
    submittedByMemberId: clientMemberId,
    dueAt: new Date("2031-08-01T09:00:00.000Z"),
    submittedAt: new Date("2031-08-01T10:00:00.000Z"),
  });
  const b = await seedCheckIn({
    workspaceId: wsId,
    clientProfileId: profileId,
    submittedByMemberId: clientMemberId,
    dueAt: new Date("2031-08-02T09:00:00.000Z"),
    submittedAt: new Date("2031-08-02T10:00:00.000Z"),
    formId: FORM_B_ID,
    versionId: VERSION_B_ID,
  });
  try {
    await signIn(page, E2E.owner);
    await page.goto(clientCheckinsUrl(a.submission.id));
    await expect(page.getByTestId("checkin-detail")).toBeVisible();
    await page.goto(clientCheckinsUrl(b.submission.id));
    const detail = page.getByTestId("checkin-detail");
    await expect(detail.getByText("CIO1 Queue Form B")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("checkin-detail")).toBeVisible();
    await expect(detail.getByText("CIO1 Queue Form A")).toBeVisible();
  } finally {
    await removeFixtures();
  }
});

// ── Pagination + isolated empty state (workspace B) ────────────────────

test("isolated workspace: empty state is truthful; 51 rows paginate via Load earlier", async ({
  page,
}) => {
  await signIn(page, E2E.owner);
  // wsB has no unreviewed submissions → truthful empty (authorized).
  await page.goto(overviewUrl(wsBId));
  await expect(page.getByTestId("review-queue-empty")).toBeVisible();

  for (let i = 0; i < 51; i++)
    await seedCheckIn({
      workspaceId: wsBId,
      clientProfileId: wsBProfileId,
      submittedByMemberId: wsBClientMemberId,
      dueAt: new Date(Date.UTC(2031, 0, 1 + i, 9)),
      submittedAt: new Date(Date.UTC(2029, 0, 1 + i, 10)),
      formId: `${FORM_A_ID}_b`,
      versionId: `${VERSION_A_ID}_b`,
    });
  try {
    await page.goto(overviewUrl(wsBId));
    const list = page.getByTestId("review-queue-list");
    await expect(list.getByText("CIO1 WS-B Form")).toHaveCount(50);
    await page.getByTestId("review-queue-load-more").click();
    await expect(list.getByText("CIO1 WS-B Form")).toHaveCount(51);
    await expect(page.getByTestId("review-queue-load-more")).toHaveCount(0);
  } finally {
    await removeFixtures();
  }
});

// ── Responsive ─────────────────────────────────────────────────────────

test("overview renders at desktop and mobile widths without overflow", async ({
  page,
}) => {
  await seedCheckIn({
    workspaceId: wsId,
    clientProfileId: profileId,
    submittedByMemberId: clientMemberId,
    dueAt: new Date("2031-09-01T09:00:00.000Z"),
    submittedAt: new Date("2031-09-01T10:00:00.000Z"),
  });
  try {
    await signIn(page, E2E.owner);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(overviewUrl());
    await expect(page.getByTestId("review-queue-list")).toBeVisible();
    await checkNoOverflow(page);
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto(overviewUrl());
    await expect(page.getByTestId("review-queue-list")).toBeVisible();
    await checkNoOverflow(page);
  } finally {
    await removeFixtures();
  }
});
