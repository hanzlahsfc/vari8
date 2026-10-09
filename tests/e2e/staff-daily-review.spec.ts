import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../../lib/password";
import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-022 — read-only staff DailyEntry review, real browser flows on the
 * persistent-mode proof server :3102 (ENABLE_DAILY_ENTRY=1, prototype flag
 * off) and the flag-off proof server :3101. Synthetic namespaced fixtures;
 * entries are seeded as real DB rows (FKs enforce coherence) and the staff
 * surface is exercised end to end — roster link, list, explicit View
 * Details, audit rows, no-store headers, responsive/keyboard behavior.
 */
const BASE = "http://127.0.0.1:3102";
const OFF = "http://127.0.0.1:3101";

const CLIENT_EMAIL = "p022-client@p022-e2e.test";
const CP_ID = "p022_e2e_client_profile";
const CP_EMPTY = "p022_e2e_empty_profile";
const CP_NOCONSENT = "p022_e2e_noconsent_profile";
const PARAM_W = "p022_e2e_pd_w";
const PARAM_M = "p022_e2e_pd_m";
const TEMPLATE_ID = "p022_e2e_template";

let prisma: PrismaClient;
let wsId: string;
let ownerMemberId: string;
let clientMemberId: string;

const dailyUrl = (cp: string) =>
  `${BASE}/workspace/${wsId}/clients/${cp}/daily`;

function versionDef() {
  const params: Record<string, unknown> = {
    [PARAM_W]: {
      key: "p_w",
      kind: "MEASUREMENT",
      label: "Weight",
      unit: "kg",
      ratingScheme: null,
      options: [],
      validation: { min: 0, max: 500 },
      group: null,
      dataClassification: "GENERAL_HEALTH",
      revision: 1,
    },
    [PARAM_M]: {
      key: "p_m",
      kind: "RATING",
      label: "Energy",
      unit: null,
      ratingScheme: "SCALE_1_10",
      options: [],
      validation: null,
      group: null,
      dataClassification: "GENERAL_HEALTH",
      revision: 1,
    },
  };
  return {
    title: "T",
    sections: [
      {
        sectionId: "sec_main",
        label: "Main",
        order: 0,
        items: [
          {
            itemId: "itm_w",
            parameterId: PARAM_W,
            parameterKey: "p_w",
            required: true,
            order: 0,
          },
          {
            itemId: "itm_m",
            parameterId: PARAM_M,
            parameterKey: "p_m",
            required: false,
            order: 1,
          },
        ],
      },
    ],
    parameters: params,
  };
}

/** Insert a coherent entry + one revision + values + pointer directly. */
async function seedEntry(
  clientProfileId: string,
  pinId: string,
  date: string,
  weight: string,
) {
  const entry = await prisma.dailyEntry.create({
    data: {
      workspaceId: wsId,
      clientProfileId,
      entryDate: new Date(`${date}T00:00:00Z`),
      createdByMemberId: clientMemberId,
    },
  });
  const rev = await prisma.dailyEntryRevision.create({
    data: {
      dailyEntryId: entry.id,
      workspaceId: wsId,
      clientProfileId,
      clientSetupPinId: pinId,
      templateVersionId: `${TEMPLATE_ID}_v1`,
      seq: 1,
      canonicalHash: `h-${date}-${weight}`,
      declaredAt: new Date(`${date}T08:00:00Z`),
      createdByMemberId: clientMemberId,
    },
  });
  await prisma.dailyEntryRevisionValue.create({
    data: {
      revisionId: rev.id,
      workspaceId: wsId,
      parameterId: PARAM_W,
      kind: "MEASUREMENT",
      valueNumeric: weight,
    },
  });
  await prisma.dailyEntryRevisionValue.create({
    data: {
      revisionId: rev.id,
      workspaceId: wsId,
      parameterId: PARAM_M,
      kind: "RATING",
      valueRating: 7,
    },
  });
  await prisma.dailyEntry.update({
    where: { id: entry.id },
    data: { currentRevisionId: rev.id },
  });
}

async function seedClientProfile(
  id: string,
  name: string,
  opts: { consent: boolean; assignCoach?: boolean; assignAssistant?: boolean },
  userId?: string,
) {
  const cp = await prisma.clientProfile.create({
    data: { id, workspaceId: wsId, name, userId: userId ?? null },
  });
  const setup = await prisma.clientSetup.create({
    data: { workspaceId: wsId, clientProfileId: cp.id },
  });
  const pin = await prisma.clientSetupPin.create({
    data: {
      clientSetupId: setup.id,
      workspaceId: wsId,
      clientProfileId: cp.id,
      seq: 1,
      templateId: TEMPLATE_ID,
      templateVersionId: `${TEMPLATE_ID}_v1`,
      assignedByMemberId: ownerMemberId,
    },
  });
  if (opts.consent) {
    for (const [kind, ver] of [
      ["PRIVACY_NOTICE", "daily-entry-dev-privacy-v1"],
      ["HEALTH_DATA", "daily-entry-dev-health-v1"],
    ] as const)
      await prisma.consentRecord.create({
        data: { clientProfileId: cp.id, kind, version: ver },
      });
  }
  if (opts.assignCoach !== false) {
    const coachMember = await prisma.workspaceMember.findFirstOrThrow({
      where: {
        workspaceId: wsId,
        user: { email: E2E.coach },
      },
    });
    await prisma.clientAssignment.create({
      data: {
        workspaceId: wsId,
        clientProfileId: cp.id,
        coachMemberId: coachMember.id,
        role: "PRIMARY",
        status: "ACTIVE",
      },
    });
  }
  if (opts.assignAssistant !== false) {
    const assistantMember = await prisma.workspaceMember.findFirstOrThrow({
      where: {
        workspaceId: wsId,
        user: { email: E2E.assistant },
      },
    });
    await prisma.clientAssignment.create({
      data: {
        workspaceId: wsId,
        clientProfileId: cp.id,
        coachMemberId: assistantMember.id,
        role: "COACH",
        status: "ACTIVE",
      },
    });
  }
  return { cp, pin };
}

async function cleanupClientProfile(id: string) {
  const revisions = await prisma.dailyEntryRevision.findMany({
    where: { clientProfileId: id },
    select: { id: true },
  });
  await prisma.dailyEntryRevisionValue
    .deleteMany({ where: { revisionId: { in: revisions.map((r) => r.id) } } })
    .catch(() => {});
  await prisma.dailyEntry
    .updateMany({
      where: { clientProfileId: id },
      data: { currentRevisionId: null },
    })
    .catch(() => {});
  await prisma.dailyEntryRevision
    .deleteMany({ where: { clientProfileId: id } })
    .catch(() => {});
  await prisma.dailyEntry
    .deleteMany({ where: { clientProfileId: id } })
    .catch(() => {});
  await prisma.auditEvent
    .deleteMany({ where: { subjectClientProfileId: id } })
    .catch(() => {});
  await prisma.clientAssignment
    .deleteMany({ where: { clientProfileId: id } })
    .catch(() => {});
  await prisma.clientSetupPin
    .deleteMany({ where: { clientProfileId: id } })
    .catch(() => {});
  await prisma.clientSetup
    .deleteMany({ where: { clientProfileId: id } })
    .catch(() => {});
  await prisma.consentRecord
    .deleteMany({ where: { clientProfileId: id } })
    .catch(() => {});
  await prisma.clientProfile.deleteMany({ where: { id } }).catch(() => {});
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

  // Dedicated P-022 client user + member (unique per workspace user id).
  const passwordHash = await hashPassword(E2E.password);
  const clientUser = await prisma.user.upsert({
    where: { email: CLIENT_EMAIL },
    update: { passwordHash, status: "ACTIVE" },
    create: {
      email: CLIENT_EMAIL,
      passwordHash,
      status: "ACTIVE",
      name: "P022 Client",
    },
  });
  const clientMember = await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: wsId, userId: clientUser.id } },
    update: { role: "CLIENT", status: "ACTIVE" },
    create: {
      workspaceId: wsId,
      userId: clientUser.id,
      role: "CLIENT",
      status: "ACTIVE",
    },
  });
  clientMemberId = clientMember.id;

  // Deterministic cleanup of a previous partial run.
  for (const id of [CP_ID, CP_EMPTY, CP_NOCONSENT])
    await cleanupClientProfile(id);
  await prisma.coachingTemplateVersion
    .deleteMany({ where: { templateId: TEMPLATE_ID } })
    .catch(() => {});
  await prisma.coachingTemplate
    .deleteMany({ where: { id: TEMPLATE_ID } })
    .catch(() => {});
  await prisma.parameterDefinition
    .deleteMany({ where: { id: { in: [PARAM_W, PARAM_M] } } })
    .catch(() => {});

  for (const [id, kind, extra] of [
    [PARAM_W, "MEASUREMENT", { unit: "kg", validation: { min: 0, max: 500 } }],
    [PARAM_M, "RATING", { ratingScheme: "SCALE_1_10" }],
  ] as const) {
    await prisma.parameterDefinition.create({
      data: {
        id,
        workspaceId: wsId,
        key: `p_${id}`,
        kind,
        label: id,
        createdByMemberId: ownerMemberId,
        updatedByMemberId: ownerMemberId,
        dataClassification: "GENERAL_HEALTH",
        ...(extra as Record<string, unknown>),
      },
    });
  }
  await prisma.coachingTemplate.create({
    data: {
      id: TEMPLATE_ID,
      workspaceId: wsId,
      name: "P022 Template",
      createdByMemberId: ownerMemberId,
    },
  });
  await prisma.coachingTemplateVersion.create({
    data: {
      id: `${TEMPLATE_ID}_v1`,
      workspaceId: wsId,
      templateId: TEMPLATE_ID,
      versionSeq: 1,
      definition: versionDef() as never,
      publishOriginRevision: 1,
      publishedByMemberId: ownerMemberId,
    },
  });

  const populated = await seedClientProfile(
    CP_ID,
    "P022 Client A",
    {
      consent: true,
    },
    clientUser.id,
  );
  await seedEntry(CP_ID, populated.pin.id, "2026-10-01", "75");
  await seedEntry(CP_ID, populated.pin.id, "2026-10-03", "77");
  await seedClientProfile(CP_EMPTY, "P022 Client B", { consent: true });
  await seedClientProfile(CP_NOCONSENT, "P022 Client C", { consent: false });
});

test.afterAll(async () => {
  for (const id of [CP_ID, CP_EMPTY, CP_NOCONSENT])
    await cleanupClientProfile(id);
  await prisma.coachingTemplateVersion
    .deleteMany({ where: { templateId: TEMPLATE_ID } })
    .catch(() => {});
  await prisma.coachingTemplate
    .deleteMany({ where: { id: TEMPLATE_ID } })
    .catch(() => {});
  await prisma.parameterDefinition
    .deleteMany({ where: { id: { in: [PARAM_W, PARAM_M] } } })
    .catch(() => {});
  const u = await prisma.user.findUnique({ where: { email: CLIENT_EMAIL } });
  if (u) {
    await prisma.workspaceMember
      .deleteMany({ where: { userId: u.id } })
      .catch(() => {});
    await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
  }
  await prisma.$disconnect();
});

async function signIn(page: Page, email: string, base = BASE) {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const readAuditCount = () =>
  prisma.auditEvent.count({
    where: {
      resourceType: "daily_entry",
      action: "READ",
      subjectClientProfileId: CP_ID,
    },
  });

test.describe("P-022 staff DailyEntry review", () => {
  test("roster exposes a Daily entries link and reaches the review route", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(`${BASE}/workspace/${wsId}/clients`);
    const row = page
      .getByTestId("roster-row")
      .filter({ hasText: "P022 Client A" });
    const link = row.getByRole("link", { name: "Daily entries" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/clients/${CP_ID}/daily`));
    await expect(page.getByTestId("staff-daily-review")).toBeVisible();
  });

  test("owner sees newest-first header list with revision counts, no values", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    const res = await page.goto(dailyUrl(CP_ID));
    expect(res?.status()).toBe(200);
    const rows = page.getByTestId("staff-daily-entry-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("2026-10-03");
    await expect(rows.nth(1)).toContainText("2026-10-01");
    // No health values in the list payload.
    await expect(page.getByText("77")).toHaveCount(0);
    await expect(page.getByText("75")).toHaveCount(0);
    await expect(page.getByText("Weight")).toHaveCount(0);
  });

  test("assigned coach views explicit detail; one committed read = one audit", async ({
    page,
  }) => {
    await signIn(page, E2E.coach);
    await page.goto(dailyUrl(CP_ID));
    const before = await readAuditCount();
    const btn = page
      .getByTestId("staff-daily-entry-row")
      .filter({ hasText: "2026-10-03" })
      .getByRole("button", { name: "View details" });
    await btn.click();
    const detail = page.getByTestId("staff-daily-detail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("2026-10-03");
    await expect(detail).toContainText("77");
    await expect(detail).toContainText("Weight");
    expect(await readAuditCount()).toBe(before + 1);
  });

  test("second deliberate View Details posts a second audit", async ({
    page,
  }) => {
    await signIn(page, E2E.assistant);
    await page.goto(dailyUrl(CP_ID));
    const before = await readAuditCount();
    const btn = page
      .getByTestId("staff-daily-entry-row")
      .filter({ hasText: "2026-10-01" })
      .getByRole("button", { name: "View details" });
    await btn.click();
    await expect(page.getByTestId("staff-daily-detail")).toBeVisible();
    await btn.click();
    await expect(page.getByTestId("staff-daily-detail")).toBeVisible();
    expect(await readAuditCount()).toBe(before + 2);
  });

  test("empty state renders for a client with no entries", async ({ page }) => {
    await signIn(page, E2E.owner);
    const res = await page.goto(dailyUrl(CP_EMPTY));
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("staff-daily-empty")).toBeVisible();
    await expect(page.getByTestId("staff-daily-entry-row")).toHaveCount(0);
  });

  test("consent-missing client shows a non-disclosing state", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    const res = await page.goto(dailyUrl(CP_NOCONSENT));
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("staff-daily-consent")).toBeVisible();
    await expect(page.getByTestId("staff-daily-entry-row")).toHaveCount(0);
  });

  for (const [label, email] of [
    ["client", E2E.client],
    ["support", E2E.support],
    ["non-member", E2E.nonmember],
  ] as const) {
    test(`${label} is denied with a non-disclosing 403`, async ({ page }) => {
      await signIn(page, email);
      const res = await page.goto(dailyUrl(CP_ID));
      expect(res?.status()).toBe(403);
      await expect(page.getByTestId("access-denied")).toBeVisible();
      await expect(page.getByText("77")).toHaveCount(0);
    });
  }

  test("unassigned coach is denied a direct URL", async ({ page }) => {
    // wsB has an owner but the coach holds no membership there.
    const wsB = await prisma.workspace.findUniqueOrThrow({
      where: { slug: E2E.workspaceBSlug },
    });
    await signIn(page, E2E.coach);
    const res = await page.goto(
      `${BASE}/workspace/${wsB.id}/clients/${CP_ID}/daily`,
    );
    expect(res?.status()).toBe(403);
  });

  test("GET/pagination/refresh/back-forward create zero READ audits", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    const before = await readAuditCount();
    await page.goto(dailyUrl(CP_ID));
    await page.reload();
    await page.goBack();
    await page.goForward();
    await page.goto(`${dailyUrl(CP_ID)}?c=2026-10-02`);
    expect(await readAuditCount()).toBe(before);
  });

  test("route is no-store on GET and action POST; absent on sibling route", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    const cacheHeaders: { url: string; method: string; cc: string }[] = [];
    page.on("response", (res) => {
      if (res.url().includes(`/clients/${CP_ID}/daily`))
        cacheHeaders.push({
          url: res.url(),
          method: res.request().method(),
          cc: res.headers()["cache-control"] ?? "",
        });
    });
    await page.goto(dailyUrl(CP_ID));
    await page
      .getByTestId("staff-daily-entry-row")
      .first()
      .getByRole("button", { name: "View details" })
      .click();
    await expect(page.getByTestId("staff-daily-detail")).toBeVisible();
    const get = cacheHeaders.find((r) => r.method === "GET");
    const post = cacheHeaders.find((r) => r.method === "POST");
    expect(get?.cc).toContain("no-store");
    expect(post?.cc).toContain("no-store");
    // Sibling roster route must NOT carry the header.
    const rosterRes = await page.goto(`${BASE}/workspace/${wsId}/clients`);
    expect(rosterRes?.headers()["cache-control"] ?? "").not.toContain(
      "no-store",
    );
  });

  test("denied responses carry no values or identifiers", async ({ page }) => {
    await signIn(page, E2E.support);
    const res = await page.goto(dailyUrl(CP_ID));
    expect(res?.status()).toBe(403);
    const body = await res?.text();
    expect(body ?? "").not.toContain("77");
    expect(body ?? "").not.toContain("2026-10-0");
  });

  test("flag off (:3101) renders a non-disclosing unavailable state", async ({
    page,
  }) => {
    await signIn(page, E2E.owner, OFF);
    const res = await page.goto(
      `${OFF}/workspace/${wsId}/clients/${CP_ID}/daily`,
    );
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("staff-daily-unavailable")).toBeVisible();
    await expect(page.getByText("77")).toHaveCount(0);
    await expect(page.getByText("2026-10-03")).toHaveCount(0);
  });

  test("flag off (:3101) hides the roster link", async ({ page }) => {
    await signIn(page, E2E.owner, OFF);
    await page.goto(`${OFF}/workspace/${wsId}/clients`);
    await expect(page.getByRole("link", { name: "Daily entries" })).toHaveCount(
      0,
    );
  });

  test("pending control disables during the detail action", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(dailyUrl(CP_ID));
    const buttons = page.getByRole("button", { name: "View details" });
    await buttons.first().click();
    // While pending, every View details control is disabled.
    await expect(buttons.first()).toBeDisabled();
    await expect(page.getByTestId("staff-daily-detail")).toBeVisible();
    await expect(buttons.first()).toBeEnabled();
  });

  test("detail panel is keyboard reachable and announced", async ({ page }) => {
    await signIn(page, E2E.owner);
    await page.goto(dailyUrl(CP_ID));
    // Reach a View details button via keyboard.
    const btn = page
      .getByTestId("staff-daily-entry-row")
      .first()
      .getByRole("button", { name: "View details" });
    let focused = false;
    for (let i = 0; i < 60 && !focused; i++) {
      await page.keyboard.press("Tab");
      focused = await btn.evaluate((el) => document.activeElement === el);
    }
    expect(focused).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("staff-daily-detail")).toBeVisible();
    await expect(page.getByTestId("staff-daily-detail")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["tablet", { width: 834, height: 1112 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    test(`${name}: review page renders without horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await signIn(page, E2E.owner);
      await page.goto(dailyUrl(CP_ID));
      await expect(page.getByTestId("staff-daily-review")).toBeVisible();
      await page.getByRole("button", { name: "View details" }).first().click();
      await expect(page.getByTestId("staff-daily-detail")).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
