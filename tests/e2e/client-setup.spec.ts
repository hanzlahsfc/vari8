import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../../lib/password";
import {
  cancelClientSetupAssignment,
  createClientSetupAssignment,
} from "../../lib/coaching/client-setup";
import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-016 staff-only client setup / template assignments — real browser flows
 * with the flag ENABLED on the primary server (:3000) and a dedicated
 * flag-OFF server on :3101 proving the 404/no-nav/zero-mutation contract on
 * a real browser target. Synthetic fixtures only.
 *
 * Fixture layout (workspace A = E2E.workspaceSlug):
 *   "P016 Client One" — profile linked to the E2E client user (CLIENT
 *     member, ACTIVE) with ACTIVE ClientAssignments to COACH and
 *     ASSISTANT_COACH → assignable by owner and coach; visible to assistant.
 *   "P016 Client Two" — eligible profile with NO coach assignment →
 *     owner-only.
 *   "P016 Template"  — ACTIVE coaching template with published version 1
 *     (a version 2 is published mid-test to prove the pin never moves).
 *   "P016 Template"  — a second template with the SAME name + published v1,
 *     proving duplicate-name disambiguation without raw IDs (#46).
 *   p016-admin@…    — dual-role account: PLATFORM_ADMIN user that also holds
 *     an ACTIVE WORKSPACE_OWNER membership → still denied (#54).
 *   p016-coach2@…   — COACH member with no ClientAssignment anywhere.
 * The spec cleans up its own rows (Restrict FKs require child rows first).
 */

const FLAG_OFF = "http://127.0.0.1:3101";
const CLIENT_ONE = "P016 Client One";
const CLIENT_TWO = "P016 Client Two";
const TEMPLATE_NAME = "P016 Template";
const ADMIN_EMAIL = "p016-admin@p016-e2e.test";
const COACH_TWO_EMAIL = "p016-coach2@p016-e2e.test";

let prisma: PrismaClient;
let wsAId: string;
let cpOneId: string;
let cpTwoId: string;
let templateId: string;
let dupTemplateId: string;
const pinIds: string[] = [];
const setupIds: string[] = [];
let coachAssignmentId: string;
let assistantAssignmentId: string;
let ownerUserId: string;
let adminUserId: string;
let adminMemberId: string;
let coachTwoUserId: string;
let coachTwoMemberId: string;
let clientTwoUserId: string;
let clientTwoMemberId: string;

async function signIn(page: Page, email: string, base = "") {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function expectNoOverflow(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });
  const REAL_HASH = await hashPassword(E2E.password);
  const wsA = await prisma.workspace.findUniqueOrThrow({
    where: { slug: E2E.workspaceSlug },
  });
  wsAId = wsA.id;

  // Deterministic state: drop leftover pins/setups from a previous partial
  // run before rebuilding fixtures.
  const priorSetups = await prisma.clientSetup.findMany({
    where: {
      clientProfileId: { in: ["p016_e2e_client_one", "p016_e2e_client_two"] },
    },
    select: { id: true },
  });
  await prisma.clientSetupPin.deleteMany({
    where: {
      OR: [
        {
          templateId: { in: ["p016_e2e_template", "p016_e2e_template_dup"] },
        },
        { clientSetupId: { in: priorSetups.map((s) => s.id) } },
      ],
    },
  });
  await prisma.clientSetup.deleteMany({
    where: { id: { in: priorSetups.map((s) => s.id) } },
  });

  const ownerMember = await prisma.workspaceMember.findFirstOrThrow({
    where: {
      workspaceId: wsAId,
      role: "WORKSPACE_OWNER",
      user: { email: E2E.owner },
    },
  });
  ownerUserId = ownerMember.userId;
  const clientUser = await prisma.user.findUniqueOrThrow({
    where: { email: E2E.client },
  });
  const coachMember = await prisma.workspaceMember.findFirstOrThrow({
    where: {
      workspaceId: wsAId,
      role: "COACH",
      user: { email: E2E.coach },
    },
  });

  const cpOne = await prisma.clientProfile.upsert({
    where: { id: "p016_e2e_client_one" },
    update: { userId: clientUser.id },
    create: {
      id: "p016_e2e_client_one",
      workspaceId: wsAId,
      userId: clientUser.id,
      name: CLIENT_ONE,
    },
  });
  cpOneId = cpOne.id;
  const clientTwoUser = await prisma.user.upsert({
    where: { email: "p016-client-two@p016-e2e.test" },
    update: { status: "ACTIVE" },
    create: {
      email: "p016-client-two@p016-e2e.test",
      passwordHash: REAL_HASH,
      status: "ACTIVE",
    },
  });
  clientTwoUserId = clientTwoUser.id;
  clientTwoMemberId = (
    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: wsAId, userId: clientTwoUser.id },
      },
      update: { role: "CLIENT", status: "ACTIVE" },
      create: {
        workspaceId: wsAId,
        userId: clientTwoUser.id,
        role: "CLIENT",
        status: "ACTIVE",
      },
    })
  ).id;
  const cpTwo = await prisma.clientProfile.upsert({
    where: { id: "p016_e2e_client_two" },
    update: { userId: clientTwoUser.id },
    create: {
      id: "p016_e2e_client_two",
      workspaceId: wsAId,
      userId: clientTwoUser.id,
      name: CLIENT_TWO,
    },
  });
  cpTwoId = cpTwo.id;

  const tpl = await prisma.coachingTemplate.upsert({
    where: { id: "p016_e2e_template" },
    update: { status: "ACTIVE" },
    create: {
      id: "p016_e2e_template",
      workspaceId: wsAId,
      name: TEMPLATE_NAME,
      createdByMemberId: ownerMember.id,
    },
  });
  templateId = tpl.id;
  await prisma.coachingTemplateVersion.upsert({
    where: { id: "p016_e2e_template_v1" },
    update: {},
    create: {
      id: "p016_e2e_template_v1",
      workspaceId: wsAId,
      templateId,
      versionSeq: 1,
      definition: { title: TEMPLATE_NAME, sections: [] },
      publishOriginRevision: 1,
      publishedByMemberId: ownerMember.id,
    },
  });
  // Duplicate-name template (decision #46 permits identical display names).
  const dup = await prisma.coachingTemplate.upsert({
    where: { id: "p016_e2e_template_dup" },
    update: { status: "ACTIVE" },
    create: {
      id: "p016_e2e_template_dup",
      workspaceId: wsAId,
      name: TEMPLATE_NAME,
      createdByMemberId: ownerMember.id,
    },
  });
  dupTemplateId = dup.id;
  await prisma.coachingTemplateVersion.upsert({
    where: { id: "p016_e2e_template_dup_v1" },
    update: {},
    create: {
      id: "p016_e2e_template_dup_v1",
      workspaceId: wsAId,
      templateId: dupTemplateId,
      versionSeq: 1,
      definition: { title: TEMPLATE_NAME, sections: [] },
      publishOriginRevision: 1,
      publishedByMemberId: ownerMember.id,
    },
  });

  const assistantMember = await prisma.workspaceMember.findFirstOrThrow({
    where: {
      workspaceId: wsAId,
      role: "ASSISTANT_COACH",
      user: { email: E2E.assistant },
    },
  });
  assistantAssignmentId = (
    await prisma.clientAssignment.upsert({
      where: { id: "p016_e2e_ca_asst" },
      update: { status: "ACTIVE" },
      create: {
        id: "p016_e2e_ca_asst",
        workspaceId: wsAId,
        clientProfileId: cpOneId,
        coachMemberId: assistantMember.id,
        role: "COACH",
        status: "ACTIVE",
      },
    })
  ).id;
  coachAssignmentId = (
    await prisma.clientAssignment.upsert({
      where: { id: "p016_e2e_ca_one" },
      update: { status: "ACTIVE" },
      create: {
        id: "p016_e2e_ca_one",
        workspaceId: wsAId,
        clientProfileId: cpOneId,
        coachMemberId: coachMember.id,
        role: "COACH",
        status: "ACTIVE",
      },
    })
  ).id;

  // Dual-role platform admin: PLATFORM_ADMIN user + ACTIVE owner membership.
  const adminUser = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { platformRole: "PLATFORM_ADMIN", status: "ACTIVE" },
    create: {
      email: ADMIN_EMAIL,
      passwordHash: REAL_HASH,
      platformRole: "PLATFORM_ADMIN",
      status: "ACTIVE",
    },
  });
  adminUserId = adminUser.id;
  adminMemberId = (
    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: wsAId, userId: adminUser.id },
      },
      update: { role: "WORKSPACE_OWNER", status: "ACTIVE" },
      create: {
        workspaceId: wsAId,
        userId: adminUser.id,
        role: "WORKSPACE_OWNER",
        status: "ACTIVE",
      },
    })
  ).id;

  // Coach with no ClientAssignment anywhere.
  const coachTwoUser = await prisma.user.upsert({
    where: { email: COACH_TWO_EMAIL },
    update: { status: "ACTIVE" },
    create: {
      email: COACH_TWO_EMAIL,
      passwordHash: REAL_HASH,
      status: "ACTIVE",
    },
  });
  coachTwoUserId = coachTwoUser.id;
  coachTwoMemberId = (
    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: wsAId, userId: coachTwoUser.id },
      },
      update: { role: "COACH", status: "ACTIVE" },
      create: {
        workspaceId: wsAId,
        userId: coachTwoUser.id,
        role: "COACH",
        status: "ACTIVE",
      },
    })
  ).id;
});

test.afterAll(async () => {
  // Worker restarts after failures drop module state — clean by stable
  // fixture keys, not the tracked id arrays.
  await prisma.clientSetupPin
    .deleteMany({
      where: { clientProfileId: { in: [cpOneId, cpTwoId] } },
    })
    .catch(() => {});
  await prisma.clientSetup
    .deleteMany({
      where: { clientProfileId: { in: [cpOneId, cpTwoId] } },
    })
    .catch(() => {});
  await prisma.clientAssignment
    .deleteMany({
      where: { id: { in: [coachAssignmentId, assistantAssignmentId] } },
    })
    .catch(() => {});
  await prisma.coachingTemplateVersion
    .deleteMany({ where: { templateId: { in: [templateId, dupTemplateId] } } })
    .catch(() => {});
  await prisma.coachingTemplate
    .deleteMany({ where: { id: { in: [templateId, dupTemplateId] } } })
    .catch(() => {});
  await prisma.clientProfile
    .deleteMany({ where: { id: { in: [cpOneId, cpTwoId] } } })
    .catch(() => {});
  await prisma.workspaceMember
    .deleteMany({
      where: {
        id: { in: [clientTwoMemberId, adminMemberId, coachTwoMemberId] },
      },
    })
    .catch(() => {});
  await prisma.user
    .deleteMany({
      where: { id: { in: [clientTwoUserId, adminUserId, coachTwoUserId] } },
    })
    .catch(() => {});
  await prisma.$disconnect();
});

const setupUrl = (base = "") => `${base}/workspace/${wsAId}/client-setups`;

/**
 * Each test seeds its own pin rows via the REAL service and cleans them in
 * `finally` — Playwright restarts the worker after a failure (re-running
 * hooks and dropping module state), so no test may depend on another
 * test's database writes.
 */
async function assignAsOwner(
  clientProfileId: string,
  tplId: string,
): Promise<string> {
  const res = await createClientSetupAssignment(
    { user: { id: ownerUserId } },
    { workspaceId: wsAId, clientProfileId, templateId: tplId },
    prisma,
  );
  return res.assignmentId;
}
async function cancelAsOwner(pinId: string): Promise<void> {
  await cancelClientSetupAssignment(
    { user: { id: ownerUserId } },
    { workspaceId: wsAId, pinId },
    prisma,
  );
}
async function cleanupClientPins(clientProfileId: string): Promise<void> {
  await prisma.clientSetupPin
    .deleteMany({ where: { clientProfileId } })
    .catch(() => {});
  await prisma.clientSetup
    .deleteMany({ where: { clientProfileId } })
    .catch(() => {});
}

test.describe("feature flag OFF (port 3101)", () => {
  test("route returns 404 and the nav entry is absent", async ({ page }) => {
    await signIn(page, E2E.owner, FLAG_OFF);
    const resp = await page.goto(setupUrl(FLAG_OFF));
    expect(resp?.status()).toBe(404);
    await page.goto(`${FLAG_OFF}/workspace/${wsAId}`);
    await expect(page.getByRole("link", { name: "Client Setup" })).toHaveCount(
      0,
    );
    // The other nav entries still render — only the flagged one is gone.
    await expect(
      page.getByRole("link", { name: "Onboarding Forms" }),
    ).toBeVisible();
  });

  // NOTE: this is a transport-level probe, not a server-action invocation —
  // a non-action POST receives the not-found response. The real
  // action-layer flag-off ordering (flag before auth/FormData/boundary) is
  // proven by tests/unit/client-setup-actions.test.ts.
  test("a non-action POST to the closed route mutates nothing", async ({
    request,
  }) => {
    const before = await prisma.clientSetupPin.count();
    const resp = await request.post(
      `${FLAG_OFF}/workspace/${wsAId}/client-setups`,
      {
        form: { clientProfileId: cpOneId, templateId },
        failOnStatusCode: false,
      },
    );
    // The page router answers the probe without erroring — the invariant is
    // that nothing reaches the database either way.
    expect(resp.status()).toBeLessThan(500);
    expect(await prisma.clientSetupPin.count()).toBe(before);
  });
});

test.describe("routing", () => {
  test("the singular legacy path is a 404 on the flag-on server", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    const resp = await page.goto(`/workspace/${wsAId}/client-setup`);
    expect(resp?.status()).toBe(404);
  });
});

test.describe("owner journey (flag on)", () => {
  test("duplicate names disambiguate, assign→conflict→v2 publish keeps pin→cancel→reassign", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(setupUrl());
    await expect(page.getByTestId("client-setup-page")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Client Setup" }),
    ).toBeVisible();

    // Two identically-named templates render with distinct non-ID labels.
    const optionTexts = await page
      .getByLabel("Coaching template")
      .locator("option")
      .allTextContents();
    const named = optionTexts.filter((t) => t.includes(TEMPLATE_NAME));
    expect(named).toHaveLength(2);
    expect(named[0]).not.toBe(named[1]);
    for (const t of named) {
      expect(t).not.toMatch(/p016_e2e|client_setup|cm[a-z0-9]{20,}/);
    }

    // Assign: pick client + the FIRST same-named template; server pins v1.
    await page.getByLabel("Client").selectOption({ label: CLIENT_ONE });
    await page
      .getByLabel("Coaching template")
      .selectOption({ label: named[0] });
    await page.getByRole("button", { name: "Assign latest version" }).click();
    const row = page.getByTestId("setup-row").filter({ hasText: CLIENT_ONE });
    await expect(row).toContainText(TEMPLATE_NAME);
    await expect(row).toContainText("v1");
    await expect(row).toContainText("Active");

    // A second assignment for the same client is refused with a safe alert.
    await page.getByLabel("Client").selectOption({ label: CLIENT_ONE });
    await page.getByLabel("Coaching template").selectOption(templateId);
    await page.getByRole("button", { name: "Assign latest version" }).click();
    await expect(page.getByTestId("setup-alert")).toBeVisible();

    // Publishing a later version does not move the pin.
    const ownerMember = await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsAId, role: "WORKSPACE_OWNER" },
    });
    const v2 = await prisma.coachingTemplateVersion.create({
      data: {
        workspaceId: wsAId,
        templateId,
        versionSeq: 2,
        definition: { title: TEMPLATE_NAME, sections: [] },
        publishOriginRevision: 2,
        publishedByMemberId: ownerMember.id,
      },
    });
    await page.reload();
    await expect(row).toContainText("v1");
    await expect(row).toContainText("Active");

    // Cancel via the two-step confirm — history stays visible.
    await row.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(row).toContainText("Cancelled");
    const pin1 = await prisma.clientSetupPin.findFirstOrThrow({
      where: { clientProfileId: cpOneId, seq: 1 },
    });
    pinIds.push(pin1.id);
    setupIds.push(pin1.clientSetupId);
    expect(pin1.status).toBe("CANCELLED");

    // Reassign appends a new row on the same stable setup — now pinned v2.
    // (The reload reset both selects — pick template by value this time; the
    // raw id is fine inside the test, it is never displayed.)
    await page.getByLabel("Client").selectOption({ label: CLIENT_ONE });
    await page.getByLabel("Coaching template").selectOption(templateId);
    await page.getByRole("button", { name: "Assign latest version" }).click();
    const rows = page.getByTestId("setup-row").filter({ hasText: CLIENT_ONE });
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "Active" })).toContainText("v2");
    const pins = await prisma.clientSetupPin.findMany({
      where: { clientSetupId: pin1.clientSetupId },
      orderBy: { seq: "asc" },
    });
    for (const p of pins) if (!pinIds.includes(p.id)) pinIds.push(p.id);
    expect(pins.map((p) => p.seq)).toEqual([1, 2]);
    expect(pins[1].status).toBe("ACTIVE");
    // The server pinned the LATEST published version at assign time (#50).
    expect(pins[1].templateVersionId).toBe(v2.id);
    await cleanupClientPins(cpOneId);
  });

  test("client, support, and dual-role platform admin are denied", async ({
    page,
  }) => {
    for (const email of [E2E.client, E2E.support, ADMIN_EMAIL]) {
      await signIn(page, email);
      const resp = await page.goto(setupUrl());
      expect(resp?.status()).toBe(403);
      await expect(page.getByTestId("client-setup-page")).toHaveCount(0);
    }
  });
});

test.describe("coach and assistant scoping (flag on)", () => {
  test("assigned coach cancels an owner-created pin (any ACTIVE coach), assigns, cancels", async ({
    page,
  }) => {
    // Seed a current assignment through the real service as the OWNER —
    // the coach then proves decision #52 by ending it without being the
    // original assigner.
    await cleanupClientPins(cpOneId);
    const seededId = await assignAsOwner(cpOneId, templateId);
    try {
      const seededPin = await prisma.clientSetupPin.findUniqueOrThrow({
        where: { id: seededId },
      });
      const pinned = await prisma.coachingTemplateVersion.findUniqueOrThrow({
        where: { id: seededPin.templateVersionId },
      });
      await signIn(page, E2E.coach);
      await page.goto(setupUrl());
      // The picker offers only the coach's assigned client.
      await expect(page.getByLabel("Client").locator("option")).toHaveText([
        /Choose a client/,
        CLIENT_ONE,
      ]);
      // The owner's ACTIVE pin is visible and cancellable by any ACTIVE
      // assigned coach — not just its creator (decision #52).
      const seededRow = page
        .getByTestId("setup-row")
        .filter({ hasText: CLIENT_ONE })
        .first();
      const active = seededRow.filter({ hasText: "Active" });
      await expect(active).toContainText(`v${pinned.versionSeq}`);
      await active.getByRole("button", { name: "Cancel" }).click();
      await page.getByRole("button", { name: "Confirm" }).click();
      await expect(seededRow).toContainText("Cancelled");
      expect(
        (
          await prisma.clientSetupPin.findUniqueOrThrow({
            where: { id: seededId },
          })
        ).status,
      ).toBe("CANCELLED");

      // The coach can also create and cancel their own assignment.
      await page.getByLabel("Client").selectOption({ label: CLIENT_ONE });
      await page.getByLabel("Coaching template").selectOption(templateId);
      await page.getByRole("button", { name: "Assign latest version" }).click();
      const createdRow = page
        .getByTestId("setup-row")
        .filter({ hasText: CLIENT_ONE })
        .filter({ hasText: "Active" });
      await expect(createdRow).toBeVisible();
      await createdRow.getByRole("button", { name: "Cancel" }).click();
      await page.getByRole("button", { name: "Confirm" }).click();
      const rowsAfter = page
        .getByTestId("setup-row")
        .filter({ hasText: CLIENT_ONE });
      await expect(rowsAfter.filter({ hasText: "Active" })).toHaveCount(0);
      const pins = await prisma.clientSetupPin.findMany({
        where: { clientProfileId: cpOneId },
      });
      expect(pins).toHaveLength(2);
      expect(pins.every((p) => p.status === "CANCELLED")).toBe(true);
    } finally {
      await cleanupClientPins(cpOneId);
    }
  });

  test("assistant reads assigned-client rows but gets no write controls", async ({
    page,
  }) => {
    await cleanupClientPins(cpOneId);
    const p1 = await assignAsOwner(cpOneId, templateId);
    await cancelAsOwner(p1);
    const p2 = await assignAsOwner(cpOneId, templateId);
    try {
      const cpOneCount = await prisma.clientSetupPin.count({
        where: { clientProfileId: cpOneId },
      });
      expect(cpOneCount).toBe(2);
      await signIn(page, E2E.assistant);
      await page.goto(setupUrl());
      await expect(page.getByTestId("client-setup-page")).toBeVisible();
      // Read-only: no create form, no lifecycle buttons anywhere.
      await expect(page.getByTestId("setup-create")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Assign" })).toHaveCount(0);
      // Rows for the assistant's assigned client are visible — Client Two
      // (no assignment) is not.
      await expect(
        page.getByTestId("setup-row").filter({ hasText: CLIENT_ONE }),
      ).toHaveCount(cpOneCount);
      await expect(
        page.getByTestId("setup-row").filter({ hasText: CLIENT_TWO }),
      ).toHaveCount(0);
      void p2;
    } finally {
      await cleanupClientPins(cpOneId);
    }
  });

  test("a coach with no ClientAssignment sees the empty pickers state", async ({
    page,
  }) => {
    await signIn(page, COACH_TWO_EMAIL);
    await page.goto(setupUrl());
    await expect(page.getByTestId("client-setup-page")).toBeVisible();
    await expect(page.getByTestId("setup-pickers-empty")).toBeVisible();
    await expect(page.getByTestId("setup-create")).toHaveCount(0);
    await expect(page.getByTestId("setup-row")).toHaveCount(0);
  });

  test("revoking the coach's ClientAssignment collapses the surface immediately", async ({
    page,
  }) => {
    await prisma.clientAssignment.update({
      where: { id: coachAssignmentId },
      data: { status: "REMOVED" },
    });
    try {
      await signIn(page, E2E.coach);
      await page.goto(setupUrl());
      await expect(page.getByTestId("setup-pickers-empty")).toBeVisible();
      await expect(page.getByTestId("setup-create")).toHaveCount(0);
    } finally {
      await prisma.clientAssignment.update({
        where: { id: coachAssignmentId },
        data: { status: "ACTIVE" },
      });
    }
  });
});

test.describe("archived-template behavior (flag on)", () => {
  test("archived template stays readable + cancellable on existing rows, excluded from the picker", async ({
    page,
  }) => {
    // Seed a current assignment through the real service, then archive the
    // pinned template — the pin must stay effective and readable (#53) and
    // authorized cancellation must still work (#51).
    await cleanupClientPins(cpOneId);
    await assignAsOwner(cpOneId, templateId);
    const ownerMember = await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsAId, role: "WORKSPACE_OWNER" },
    });
    // P-014 provenance CHECK: archival carries actor + timestamp.
    await prisma.coachingTemplate.update({
      where: { id: templateId },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedByMemberId: ownerMember.id,
      },
    });
    try {
      await signIn(page, E2E.owner);
      await page.goto(setupUrl());
      // The ACTIVE row remains readable and marks the archived template.
      const row = page
        .getByTestId("setup-row")
        .filter({ hasText: CLIENT_ONE })
        .filter({ hasText: "Active" });
      await expect(row).toContainText(`${TEMPLATE_NAME} (archived)`);
      // The picker lists only the still-ACTIVE duplicate template.
      const optionTexts = await page
        .getByLabel("Coaching template")
        .locator("option")
        .allTextContents();
      const assignable = optionTexts.filter((t) => t.includes(TEMPLATE_NAME));
      expect(assignable).toHaveLength(1);
      // Cancellation still works for an authorized actor on the archived pin.
      const seedRow = page
        .getByTestId("setup-row")
        .filter({ hasText: CLIENT_ONE })
        .first();
      await seedRow.getByRole("button", { name: "Cancel" }).click();
      await page.getByRole("button", { name: "Confirm" }).click();
      await expect(seedRow).toContainText("Cancelled");
    } finally {
      // Restoring ACTIVE must clear the archive provenance — the P-014 CHECK
      // enforces (ARCHIVED ⇔ archived_at/archived_by present).
      await prisma.coachingTemplate.update({
        where: { id: templateId },
        data: {
          status: "ACTIVE",
          archivedAt: null,
          archivedByMemberId: null,
        },
      });
      await cleanupClientPins(cpOneId);
    }
  });
});

test.describe("keyboard + accessibility (flag on)", () => {
  test("keyboard assign and keyboard confirm-cancel both work", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(setupUrl());

    // Keyboard-driven assign for Client Two: focus → ArrowDown selects the
    // first real option in a closed select → Enter submits.
    const clientSelect = page.getByLabel("Client");
    await clientSelect.focus();
    const clientOptions = await clientSelect.locator("option").all();
    // Select Client Two by its label only — never a raw identifier.
    let twoValue: string | null = null;
    for (const o of clientOptions) {
      if ((await o.textContent()) === CLIENT_TWO)
        twoValue = await o.getAttribute("value");
    }
    expect(twoValue).not.toBeNull();
    await clientSelect.selectOption(twoValue as string);
    const templateSelect = page.getByLabel("Coaching template");
    await templateSelect.focus();
    const templateOptions = await templateSelect.locator("option").all();
    let firstTpl: string | null = null;
    for (const o of templateOptions) {
      const v = await o.getAttribute("value");
      if (v) {
        firstTpl = v;
        break;
      }
    }
    expect(firstTpl).not.toBeNull();
    await templateSelect.selectOption(firstTpl as string);
    await page
      .getByRole("button", { name: "Assign latest version" })
      .press("Enter");
    const row = page.getByTestId("setup-row").filter({ hasText: CLIENT_TWO });
    await expect(row).toContainText("Active");

    // Duplicate-assign attempt surfaces a live-region alert.
    await page
      .getByRole("button", { name: "Assign latest version" })
      .press("Enter");
    const alert = page.getByTestId("setup-alert");
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute("role", "alert");
    await expect(alert).toContainText("current template assignment");

    // Keyboard-driven cancel with accessible confirm step.
    await row.getByRole("button", { name: "Cancel" }).press("Enter");
    await expect(page.getByTestId("setup-confirm")).toBeVisible();
    await page.getByRole("button", { name: "Confirm" }).press("Enter");
    await expect(row).toContainText("Cancelled");
    const pin = await prisma.clientSetupPin.findFirstOrThrow({
      where: { clientProfileId: cpTwoId },
    });
    pinIds.push(pin.id);
    setupIds.push(pin.clientSetupId);
    await cleanupClientPins(cpTwoId);
  });

  test("interactive controls meet the 44px minimum touch target", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(setupUrl());
    const submit = page.getByRole("button", {
      name: "Assign latest version",
    });
    const submitBox = await submit.boundingBox();
    expect(submitBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    const cancel = page.getByRole("button", { name: "Cancel" }).first();
    if (await cancel.isVisible()) {
      const box = await cancel.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("responsive + data hygiene (flag on)", () => {
  test("no horizontal overflow at 1440/834/390 and no internal IDs in visible text", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(setupUrl());
    for (const width of [1440, 834, 390]) await expectNoOverflow(page, width);
    const visibleText = await page.evaluate(() => document.body.innerText);
    expect(visibleText).not.toContain("p016_e2e");
    expect(visibleText).not.toContain("client_setup");
    expect(visibleText).not.toContain("@s1h-e2e.test");
    expect(visibleText).not.toContain("p016-");
    const html = await page.content();
    expect(html).not.toContain("client_setup_pin");
    expect(html).not.toContain("meta.version");
  });
});
