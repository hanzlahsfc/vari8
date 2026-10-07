import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-016 staff-only client setup / template assignments — real browser flows
 * with the flag ENABLED on the primary server (:3000) and a dedicated
 * flag-OFF server on :3101 proving the 404/no-nav/zero-mutation contract on
 * a real browser target. Synthetic fixtures only.
 *
 * Fixture layout (workspace A = E2E.workspaceSlug):
 *   "P016 Client One" — ClientProfile linked to the E2E client user (CLIENT
 *     member, ACTIVE) with ACTIVE ClientAssignments to COACH and
 *     ASSISTANT_COACH → assignable by owner and coach; visible to assistant.
 *   "P016 Client Two" — eligible profile with NO coach assignment →
 *     owner-only.
 *   "P016 Template"   — ACTIVE coaching template with published version 1
 *     (a version 2 is added mid-test to prove the pin never moves).
 * The spec cleans up its own rows (Restrict FKs require child rows first).
 */

const FLAG_OFF = "http://127.0.0.1:3101";
const CLIENT_ONE = "P016 Client One";
const CLIENT_TWO = "P016 Client Two";
const TEMPLATE_NAME = "P016 Template";

let prisma: PrismaClient;
let wsAId: string;
let cpOneId: string;
let cpTwoId: string;
let templateId: string;
const pinIds: string[] = [];
const setupIds: string[] = [];
let coachAssignmentId: string;
let assistantAssignmentId: string;
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
        { templateId: "p016_e2e_template" },
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
      passwordHash: "scrypt$x",
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
});

test.afterAll(async () => {
  await prisma.clientSetupPin
    .deleteMany({ where: { id: { in: pinIds } } })
    .catch(() => {});
  await prisma.clientSetupPin
    .deleteMany({ where: { templateId } })
    .catch(() => {});
  await prisma.clientSetup
    .deleteMany({ where: { id: { in: setupIds } } })
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
    .deleteMany({ where: { templateId } })
    .catch(() => {});
  await prisma.coachingTemplate
    .delete({ where: { id: templateId } })
    .catch(() => {});
  await prisma.clientProfile
    .deleteMany({ where: { id: { in: [cpOneId, cpTwoId] } } })
    .catch(() => {});
  await prisma.workspaceMember
    .deleteMany({ where: { id: clientTwoMemberId } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: clientTwoUserId } })
    .catch(() => {});
  await prisma.$disconnect();
});

const setupUrl = (base = "") => `${base}/workspace/${wsAId}/client-setup`;

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
      `${FLAG_OFF}/workspace/${wsAId}/client-setup`,
      {
        form: { clientProfileId: cpOneId, templateId },
        failOnStatusCode: false,
      },
    );
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(await prisma.clientSetupPin.count()).toBe(before);
  });
});

test.describe("owner flows (flag on)", () => {
  test("assign → one ACTIVE row pinned to latest version → cancel → history", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(setupUrl());
    await expect(page.getByTestId("client-setup-page")).toBeVisible();
    // Terminology: "Client Setup", "template assignment" — never IDs.
    await expect(
      page.getByRole("heading", { name: "Client Setup" }),
    ).toBeVisible();

    // Assign: pick client + template; server pins the latest version.
    await page.getByLabel("Client").selectOption({ label: CLIENT_ONE });
    await page
      .getByLabel("Coaching template")
      .selectOption({ label: `${TEMPLATE_NAME} (version 1)` });
    await page.getByRole("button", { name: "Assign latest version" }).click();
    const row = page.getByTestId("setup-row").filter({ hasText: CLIENT_ONE });
    await expect(row).toContainText(TEMPLATE_NAME);
    await expect(row).toContainText("v1");
    await expect(row).toContainText("Active");

    // A second assignment for the same client is refused with a safe alert.
    await page.getByLabel("Client").selectOption({ label: CLIENT_ONE });
    await page
      .getByLabel("Coaching template")
      .selectOption({ label: `${TEMPLATE_NAME} (version 1)` });
    await page.getByRole("button", { name: "Assign latest version" }).click();
    await expect(page.getByTestId("setup-alert")).toBeVisible();

    // Publishing a later version does not move the pin.
    const ownerMember = await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsAId, role: "WORKSPACE_OWNER" },
    });
    await prisma.coachingTemplateVersion.create({
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

    // Cancel via the two-step confirm, then verify history is retained.
    await row.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(row).toContainText("Cancelled");
    const pin = await prisma.clientSetupPin.findFirstOrThrow({
      where: { templateId },
    });
    pinIds.push(pin.id);
    setupIds.push(pin.clientSetupId);
    expect(pin.status).toBe("CANCELLED");

    // Reassign appends a new row — the cancelled history stays visible.
    await page.getByLabel("Client").selectOption({ label: CLIENT_ONE });
    await page.getByRole("button", { name: "Assign latest version" }).click();
    const rows = page.getByTestId("setup-row").filter({ hasText: CLIENT_ONE });
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("v2");
    await expect(rows.nth(0)).toContainText("Active");
    const pins = await prisma.clientSetupPin.findMany({
      where: { clientSetupId: pin.clientSetupId },
      orderBy: { seq: "asc" },
    });
    pinIds.push(...pins.map((p) => p.id).filter((id) => !pinIds.includes(id)));
    expect(pins.map((p) => p.seq)).toEqual([1, 2]);
    expect(pins[1].templateVersionId).toBe("p016_e2e_template_v2");
  });

  test("client and support users are denied the page", async ({ page }) => {
    for (const email of [E2E.client, E2E.support]) {
      await signIn(page, email);
      const resp = await page.goto(setupUrl());
      expect(resp?.status()).toBe(403);
      await expect(page.getByTestId("client-setup-page")).toHaveCount(0);
    }
  });
});

test.describe("coach and assistant scoping (flag on)", () => {
  test("coach sees only assigned clients and can assign + cancel", async ({
    page,
  }) => {
    await signIn(page, E2E.coach);
    await page.goto(setupUrl());
    // Client picker offers only the coach's assigned client.
    await expect(page.getByLabel("Client").locator("option")).toHaveText([
      /Choose a client/,
      CLIENT_ONE,
    ]);
    await page.getByLabel("Client").selectOption({ label: CLIENT_ONE });
    await page
      .getByLabel("Coaching template")
      .selectOption({ label: `${TEMPLATE_NAME} (version 2)` });
    await page.getByRole("button", { name: "Assign latest version" }).click();
    const row = page.getByTestId("setup-row").filter({ hasText: CLIENT_ONE });
    await expect(row).toContainText("Active");
    await row.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(row).toContainText("Cancelled");
    const pin = await prisma.clientSetupPin.findFirstOrThrow({
      where: { clientProfileId: cpOneId },
      orderBy: { seq: "desc" },
    });
    pinIds.push(pin.id);
    setupIds.push(pin.clientSetupId);
  });

  test("assistant reads assigned-client rows but gets no write controls", async ({
    page,
  }) => {
    await signIn(page, E2E.assistant);
    await page.goto(setupUrl());
    await expect(page.getByTestId("client-setup-page")).toBeVisible();
    // Read-only: no create form, no lifecycle buttons anywhere.
    await expect(page.getByTestId("setup-create")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Assign" })).toHaveCount(0);
    // Rows for the assistant's assigned client are visible; Client Two is not.
    await expect(
      page.getByTestId("setup-row").filter({ hasText: CLIENT_ONE }),
    ).toHaveCount(
      await prisma.clientSetupPin.count({
        where: { clientProfileId: cpOneId },
      }),
    );
    await expect(
      page.getByTestId("setup-row").filter({ hasText: CLIENT_TWO }),
    ).toHaveCount(0);
  });
});

test.describe("responsive + data hygiene", () => {
  test("no horizontal overflow at 1440/834/390 and no internal IDs in DOM", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(setupUrl());
    for (const width of [1440, 834, 390]) await expectNoOverflow(page, width);
    const html = await page.content();
    expect(html).not.toContain("p016_e2e");
    expect(html).not.toContain("client_setup_pin");
    expect(html).not.toContain("@s1h-e2e.test");
  });
});
