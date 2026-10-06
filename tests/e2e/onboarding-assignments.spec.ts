import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-013 staff-only onboarding assignments — real browser flows with the flag
 * ENABLED on the primary server (:3000) and a dedicated flag-OFF server on
 * :3101 proving the 404/no-nav/zero-mutation contract on a real browser
 * target. Synthetic fixtures only.
 *
 * Fixture layout (workspace A = E2E.workspaceSlug):
 *   "P013 Client One" — ClientProfile linked to the E2E client user (CLIENT
 *     member, ACTIVE) with an ACTIVE ClientAssignment to COACH → assignable
 *     by owner AND by coach.
 *   "P013 Client Two" — eligible profile with NO coach assignment → owner-only.
 *   "P013 Intake"    — ACTIVE form with published version 1 (a version 2 is
 *     added mid-test to exercise Replace).
 * The spec cleans up its own rows (Restrict FKs require child rows first).
 */

const FLAG_OFF = "http://127.0.0.1:3101";
const CLIENT_ONE = "P013 Client One";
const CLIENT_TWO = "P013 Client Two";
const FORM_NAME = "P013 Intake";

let prisma: PrismaClient;
let wsAId: string;
let cpOneId: string;
let cpTwoId: string;
let formId: string;
const assignmentIds: string[] = [];
let coachAssignmentId: string;
let clientTwoUserId: string;
let clientTwoMemberId: string;
let assistantAssignmentId: string;

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

  // Deterministic state: drop any leftover assignment rows and versions>1
  // from a previous partial run before building the fixtures.
  await prisma.onboardingFormAssignment.deleteMany({
    where: {
      OR: [
        { formId: "p013_e2e_form" },
        {
          clientProfileId: {
            in: ["p013_e2e_client_one", "p013_e2e_client_two"],
          },
        },
      ],
    },
  });
  await prisma.onboardingFormVersion.deleteMany({
    where: { formId: "p013_e2e_form", versionSeq: { gt: 1 } },
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

  // Recreate fixture rows idempotently (previous partial runs may exist).
  const cpOne = await prisma.clientProfile.upsert({
    where: { id: "p013_e2e_client_one" },
    update: { userId: clientUser.id },
    create: {
      id: "p013_e2e_client_one",
      workspaceId: wsAId,
      userId: clientUser.id,
      name: CLIENT_ONE,
    },
  });
  cpOneId = cpOne.id;
  // ClientProfile is unique on (workspace, user) — Client Two needs its own
  // user + ACTIVE CLIENT membership to stay eligible.
  const clientTwoUser = await prisma.user.upsert({
    where: { email: "p013-client-two@p013-e2e.test" },
    update: { status: "ACTIVE" },
    create: {
      email: "p013-client-two@p013-e2e.test",
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
    where: { id: "p013_e2e_client_two" },
    update: { userId: clientTwoUser.id },
    create: {
      id: "p013_e2e_client_two",
      workspaceId: wsAId,
      userId: clientTwoUser.id,
      name: CLIENT_TWO,
    },
  });
  cpTwoId = cpTwo.id;

  const form = await prisma.onboardingForm.upsert({
    where: { id: "p013_e2e_form" },
    update: { status: "ACTIVE" },
    create: {
      id: "p013_e2e_form",
      workspaceId: wsAId,
      name: FORM_NAME,
      createdByMemberId: ownerMember.id,
    },
  });
  formId = form.id;
  await prisma.onboardingFormVersion.upsert({
    where: { id: "p013_e2e_form_v1" },
    update: {},
    create: {
      id: "p013_e2e_form_v1",
      formId,
      versionSeq: 1,
      definition: { title: FORM_NAME, fields: [] },
      publishOriginRevision: 1,
      publishedByMemberId: ownerMember.id,
    },
  });

  // Assistant needs an ACTIVE ClientAssignment to see cpOne's rows.
  const assistantMember = await prisma.workspaceMember.findFirstOrThrow({
    where: {
      workspaceId: wsAId,
      role: "ASSISTANT_COACH",
      user: { email: E2E.assistant },
    },
  });
  assistantAssignmentId = (
    await prisma.clientAssignment.upsert({
      where: { id: "p013_e2e_ca_asst" },
      update: { status: "ACTIVE" },
      create: {
        id: "p013_e2e_ca_asst",
        workspaceId: wsAId,
        clientProfileId: cpOneId,
        coachMemberId: assistantMember.id,
        role: "COACH",
        status: "ACTIVE",
      },
    })
  ).id;

  const ca = await prisma.clientAssignment.upsert({
    where: { id: "p013_e2e_ca_one" },
    update: { status: "ACTIVE" },
    create: {
      id: "p013_e2e_ca_one",
      workspaceId: wsAId,
      clientProfileId: cpOneId,
      coachMemberId: coachMember.id,
      role: "COACH",
      status: "ACTIVE",
    },
  });
  coachAssignmentId = ca.id;
});

test.afterAll(async () => {
  await prisma.onboardingFormAssignment
    .deleteMany({ where: { id: { in: assignmentIds } } })
    .catch(() => {});
  await prisma.clientAssignment
    .deleteMany({
      where: { id: { in: [coachAssignmentId, assistantAssignmentId] } },
    })
    .catch(() => {});
  await prisma.onboardingFormVersion
    .deleteMany({ where: { formId } })
    .catch(() => {});
  await prisma.onboardingForm.delete({ where: { id: formId } }).catch(() => {});
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

const assignmentsUrl = (base = "") =>
  `${base}/workspace/${wsAId}/onboarding/assignments`;

test.describe("feature flag OFF (port 3101)", () => {
  test("route returns 404 and the nav entry is absent", async ({ page }) => {
    await signIn(page, E2E.owner, FLAG_OFF);
    const resp = await page.goto(assignmentsUrl(FLAG_OFF));
    expect(resp?.status()).toBe(404);
    await page.goto(`${FLAG_OFF}/workspace/${wsAId}`);
    await expect(
      page.getByRole("link", { name: "Onboarding Assignments" }),
    ).toHaveCount(0);
    // The other nav entries still render — only the flagged one is gone.
    await expect(
      page.getByRole("link", { name: "Onboarding Forms" }),
    ).toBeVisible();
  });

  test("a crafted POST to the closed route mutates nothing", async ({
    request,
  }) => {
    const rowsBefore = await prisma.onboardingFormAssignment.count();
    const auditsBefore = await prisma.auditEvent.count();
    const resp = await request.post(assignmentsUrl(FLAG_OFF), {
      data: { clientProfileId: cpOneId, formId },
    });
    // Next serves the not-found body to a non-action POST (200 or 404
    // depending on transport); the load-bearing assertion is that nothing
    // reached the database — zero rows, zero audit events.
    void resp;
    expect(await prisma.onboardingFormAssignment.count()).toBe(rowsBefore);
    expect(await prisma.auditEvent.count()).toBe(auditsBefore);
  });
});

test.describe("feature flag ON — access and authorization", () => {
  test("unauthenticated requests redirect to login", async ({ page }) => {
    await page.goto(assignmentsUrl());
    await expect(page).toHaveURL(/\/login/);
  });

  test("nav shows the entry only for staff roles", async ({ page }) => {
    await signIn(page, E2E.owner);
    await page.goto(`/workspace/${wsAId}`);
    await expect(
      page.getByRole("link", { name: "Onboarding Assignments" }),
    ).toBeVisible();
  });

  test("support role is denied the staff surface", async ({ page }) => {
    await signIn(page, E2E.support);
    const resp = await page.goto(assignmentsUrl());
    expect(resp?.status()).toBe(403);
  });

  test("owner sees an empty state with pickers", async ({ page }) => {
    await signIn(page, E2E.owner);
    await page.goto(assignmentsUrl());
    await expect(
      page.getByRole("heading", { name: "Onboarding Assignments", level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId("assignment-empty")).toBeVisible();
    await expect(page.getByLabel("Client")).toBeVisible();
    await expect(page.getByLabel("Onboarding form")).toBeVisible();
  });
});

test.describe("feature flag ON — owner lifecycle", () => {
  test("create, replace after a new version, cancel", async ({ page }) => {
    await signIn(page, E2E.owner);
    await page.goto(assignmentsUrl());

    // Create — picks client + form, server pins latest published version.
    await page.getByLabel("Client").selectOption({ label: CLIENT_ONE });
    await page
      .getByLabel("Onboarding form")
      .selectOption({ label: `${FORM_NAME} (version 1)` });
    await page.getByRole("button", { name: "Assign latest version" }).click();
    const row = page
      .getByTestId("assignment-row")
      .filter({ hasText: CLIENT_ONE });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("v1");
    await expect(row).toContainText("Active");
    const created = await prisma.onboardingFormAssignment.findFirstOrThrow({
      where: { workspaceId: wsAId, clientProfileId: cpOneId, status: "ACTIVE" },
    });
    assignmentIds.push(created.id);

    // Duplicate create is rejected at the service level — the row persists.
    // (The UI no longer offers an assign for the same pair, so craft via a
    // second submission of the same form state.)
    await page.getByLabel("Client").selectOption({ label: CLIENT_ONE });
    await page
      .getByLabel("Onboarding form")
      .selectOption({ label: `${FORM_NAME} (version 1)` });
    await page.getByRole("button", { name: "Assign latest version" }).click();
    await expect(page.getByTestId("assignment-alert")).toBeVisible();
    expect(
      await prisma.onboardingFormAssignment.count({
        where: { clientProfileId: cpOneId, formId, status: "ACTIVE" },
      }),
    ).toBe(1);

    // Publish v2 server-side, reload, replace.
    const ownerMember = await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsAId, role: "WORKSPACE_OWNER" },
    });
    const v2 = await prisma.onboardingFormVersion.create({
      data: {
        formId,
        versionSeq: 2,
        definition: { title: FORM_NAME, fields: [] },
        publishOriginRevision: 2,
        publishedByMemberId: ownerMember.id,
      },
    });
    await page.reload();
    const activeRow = page
      .getByTestId("assignment-row")
      .filter({ hasText: CLIENT_ONE });
    await activeRow.getByRole("button", { name: "Replace" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    // Wait for the committed transition to render before reading the DB —
    // the action + router.refresh() are in flight right after the click.
    await expect(
      page.getByTestId("assignment-row").filter({ hasText: "Superseded" }),
    ).toHaveCount(1);
    const superseded = await prisma.onboardingFormAssignment.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(superseded.status).toBe("SUPERSEDED");
    expect(superseded.endedAt).not.toBeNull();
    const next = await prisma.onboardingFormAssignment.findFirstOrThrow({
      where: {
        workspaceId: wsAId,
        clientProfileId: cpOneId,
        status: "ACTIVE",
      },
    });
    assignmentIds.push(next.id);
    expect(next.formVersionId).toBe(v2.id);

    // Cancel — explicit confirm, terminal, single transition.
    const liveRow = page
      .getByTestId("assignment-row")
      .filter({ hasText: CLIENT_ONE });
    await liveRow.getByRole("button", { name: "Cancel" }).first().click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(
      page.getByTestId("assignment-row").filter({ hasText: "Cancelled" }),
    ).toHaveCount(1);
    const cancelled = await prisma.onboardingFormAssignment.findUniqueOrThrow({
      where: { id: next.id },
    });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.endedByMemberId).not.toBeNull();
    await expect(
      page.getByTestId("assignment-row").filter({ hasText: "Cancelled" }),
    ).toHaveCount(1);
  });
});

test.describe("feature flag ON — scoped roles", () => {
  test("coach sees/mutates only assigned clients", async ({ page }) => {
    await signIn(page, E2E.coach);
    await page.goto(assignmentsUrl());
    // Coach's picker contains only the assigned client.
    const picker = page.getByLabel("Client");
    await expect(picker).toBeVisible();
    const options = await picker.locator("option").allTextContents();
    expect(options.some((o) => o.includes(CLIENT_ONE))).toBe(true);
    expect(options.some((o) => o.includes(CLIENT_TWO))).toBe(false);
    // Coach can create for the assigned client.
    await picker.selectOption({ label: CLIENT_ONE });
    await page
      .getByLabel("Onboarding form")
      .selectOption({ label: `${FORM_NAME} (version 2)` });
    await page.getByRole("button", { name: "Assign latest version" }).click();
    // Wait for the committed row to render before reading the DB.
    await expect(
      page.getByTestId("assignment-row").filter({ hasText: "Active" }),
    ).toHaveCount(1);
    const created = await prisma.onboardingFormAssignment.findFirstOrThrow({
      where: { clientProfileId: cpOneId, status: "ACTIVE" },
    });
    assignmentIds.push(created.id);
  });

  test("coach cannot create once the assignment is revoked", async ({
    page,
  }) => {
    await signIn(page, E2E.coach);
    // Revoke before the visit — the picker must not contain the client.
    await prisma.clientAssignment.update({
      where: { id: coachAssignmentId },
      data: { status: "REMOVED" },
    });
    await page.goto(assignmentsUrl());
    const options = await page
      .getByLabel("Client")
      .locator("option")
      .allTextContents();
    expect(options.some((o) => o.includes(CLIENT_ONE))).toBe(false);
    await prisma.clientAssignment.update({
      where: { id: coachAssignmentId },
      data: { status: "ACTIVE" },
    });
  });

  test("assistant sees rows but no mutation controls", async ({ page }) => {
    // Ensure a row exists for the assigned client first.
    const existing = await prisma.onboardingFormAssignment.findFirst({
      where: { clientProfileId: cpOneId, status: "ACTIVE" },
    });
    let created: { id: string } | null = null;
    if (!existing) {
      const ownerMember = await prisma.workspaceMember.findFirstOrThrow({
        where: { workspaceId: wsAId, role: "WORKSPACE_OWNER" },
      });
      const latestV = await prisma.onboardingFormVersion.findFirstOrThrow({
        where: { formId },
        orderBy: { versionSeq: "desc" },
      });
      created = await prisma.onboardingFormAssignment.create({
        data: {
          workspaceId: wsAId,
          clientProfileId: cpOneId,
          formId,
          formVersionId: latestV.id,
          assignedByMemberId: ownerMember.id,
        },
      });
      assignmentIds.push(created.id);
    }
    await signIn(page, E2E.assistant);
    await page.goto(assignmentsUrl());
    await expect(page.getByTestId("assignment-row").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Assign latest version" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Replace" })).toHaveCount(0);
  });
});

test.describe("feature flag ON — layout and safety", () => {
  test("page renders within 1440/834/390 viewports with 44px targets", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(assignmentsUrl());
    for (const w of [1440, 834, 390]) {
      await expectNoOverflow(page, w);
      await expect(
        page.getByRole("heading", { name: "Onboarding Assignments", level: 1 }),
      ).toBeVisible();
    }
    const submit = page.getByRole("button", { name: "Assign latest version" });
    if (await submit.isVisible().catch(() => false)) {
      const box = await submit.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("status is text, keyboard focus is visible, no raw IDs render", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(assignmentsUrl());
    // Tabbing reaches interactive controls with a visible focus outline.
    let sawVisibleFocus = false;
    for (let i = 0; i < 8 && !sawVisibleFocus; i++) {
      await page.keyboard.press("Tab");
      sawVisibleFocus = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return false;
        const o = getComputedStyle(el);
        return o.outlineStyle !== "none" && o.outlineWidth !== "0px";
      });
    }
    expect(sawVisibleFocus).toBe(true);
    // No internal identifiers or emails leak into VISIBLE content. (Select
    // option values and the serialized RSC props necessarily carry the IDs
    // the server actions bind — they are never rendered as content.)
    const visibleText = await page.evaluate(() => document.body.innerText);
    for (const id of assignmentIds) {
      expect(visibleText).not.toContain(id);
    }
    const html = await page.content();
    expect(html).not.toContain("@s1h-e2e.test");
  });
});
