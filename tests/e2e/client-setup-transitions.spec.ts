import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-020B — dev-gated template-version transitions on client setups, real
 * browser. Primary server (:3000) has ENABLE_CLIENT_SETUP_TRANSITIONS=1;
 * the dedicated proof server on :3102 keeps the parent gate on but the
 * transitions flag off. Synthetic fixtures only.
 *
 * Fixtures (workspace A):
 *   "P020B Template"         — ACTIVE, v1 {p_a} → v2 {p_a, p_b}; both
 *                              classification-eligible.
 *   "P020B Empty Template"   — ACTIVE, v1 == v2 identical definitions.
 *   "P020B Blocked Template" — ACTIVE, v2 references an UNCLASSIFIED
 *                              parameter → TARGET_INELIGIBLE block.
 * Client profile reused from the P-016 fixture space via a dedicated
 * "P020B Client" profile assigned to the E2E coach + assistant.
 */

const FLAG_OFF = "http://127.0.0.1:3102";
const CLIENT_NAME = "P020B Client";
const TEMPLATE_NAME = "P020B Template";
const EMPTY_TEMPLATE = "P020B Empty Template";
const BLOCKED_TEMPLATE = "P020B Blocked Template";

const CLIENT_PROFILE_ID = "p020b_e2e_client";
const TEMPLATE_ID = "p020b_e2e_template";
const EMPTY_TEMPLATE_ID = "p020b_e2e_empty_template";
const BLOCKED_TEMPLATE_ID = "p020b_e2e_blocked_template";

let prisma: PrismaClient;
let wsAId: string;
let cpId: string;
let ownerMemberId: string;
let coachMemberId: string;

const CLASSIFIED = {
  key: "",
  kind: "MEASUREMENT",
  label: "Weight",
  helpText: null,
  unit: "kg",
  ratingScheme: null,
  options: [],
  validation: null,
  group: null,
  dataClassification: "GENERAL_HEALTH",
  revision: 1,
};

function def(params: Array<{ id: string; key: string; label: string }>) {
  const parameters: Record<string, unknown> = {};
  const items = params.map((p, i) => ({
    itemId: `itm_${p.id}`,
    parameterId: p.id,
    parameterKey: p.key,
    required: false,
    order: i,
  }));
  for (const p of params)
    parameters[p.id] = { ...CLASSIFIED, key: p.key, label: p.label };
  return {
    title: "T",
    sections: [{ sectionId: "sec_main", label: "Main", order: 0, items }],
    parameters,
  };
}

const P_A = { id: "pd_a", key: "p_a", label: "Weight" };
const P_B = { id: "pd_b", key: "p_b", label: "Waist" };
const P_UNCLASSIFIED = { id: "pd_c", key: "p_c", label: "Hip" };

const V1 = def([P_A]);
const V2 = def([P_A, P_B]);
const V2_BLOCKED = (() => {
  const d = def([P_A, P_UNCLASSIFIED]) as {
    parameters: Record<string, Record<string, unknown>>;
  };
  d.parameters[P_UNCLASSIFIED.id].dataClassification = null;
  return d;
})();

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
  const ownerMember = await prisma.workspaceMember.findFirstOrThrow({
    where: {
      workspaceId: wsAId,
      role: "WORKSPACE_OWNER",
      user: { email: E2E.owner },
    },
  });
  ownerMemberId = ownerMember.id;
  coachMemberId = (
    await prisma.workspaceMember.findFirstOrThrow({
      where: {
        workspaceId: wsAId,
        role: "COACH",
        user: { email: E2E.coach },
      },
    })
  ).id;
  const assistantMemberId = (
    await prisma.workspaceMember.findFirstOrThrow({
      where: {
        workspaceId: wsAId,
        role: "ASSISTANT_COACH",
        user: { email: E2E.assistant },
      },
    })
  ).id;
  const clientUser = await prisma.user.findUniqueOrThrow({
    where: { email: E2E.client },
  });

  // Deterministic state — drop leftovers from a previous partial run.
  await prisma.clientSetupPin.deleteMany({
    where: {
      clientProfileId: CLIENT_PROFILE_ID,
    },
  });
  await prisma.clientSetup.deleteMany({
    where: { clientProfileId: CLIENT_PROFILE_ID },
  });
  await prisma.clientAssignment.deleteMany({
    where: { clientProfileId: CLIENT_PROFILE_ID },
  });
  await prisma.coachingTemplateVersionParameter.deleteMany({
    where: {
      templateId: { in: [TEMPLATE_ID, EMPTY_TEMPLATE_ID, BLOCKED_TEMPLATE_ID] },
    },
  });
  await prisma.coachingTemplateVersion.deleteMany({
    where: {
      templateId: { in: [TEMPLATE_ID, EMPTY_TEMPLATE_ID, BLOCKED_TEMPLATE_ID] },
    },
  });
  await prisma.coachingTemplate.deleteMany({
    where: {
      id: { in: [TEMPLATE_ID, EMPTY_TEMPLATE_ID, BLOCKED_TEMPLATE_ID] },
    },
  });
  await prisma.clientProfile.deleteMany({
    where: { id: CLIENT_PROFILE_ID },
  });

  const cp = await prisma.clientProfile.create({
    data: {
      id: CLIENT_PROFILE_ID,
      workspaceId: wsAId,
      userId: clientUser.id,
      name: CLIENT_NAME,
    },
  });
  cpId = cp.id;

  for (const [id, name, versions] of [
    [TEMPLATE_ID, TEMPLATE_NAME, [V1, V2]],
    [EMPTY_TEMPLATE_ID, EMPTY_TEMPLATE, [V1, V1]],
    [BLOCKED_TEMPLATE_ID, BLOCKED_TEMPLATE, [V1, V2_BLOCKED]],
  ] as const) {
    await prisma.coachingTemplate.create({
      data: {
        id,
        workspaceId: wsAId,
        name,
        createdByMemberId: ownerMemberId,
      },
    });
    for (const [i, definition] of versions.entries()) {
      await prisma.coachingTemplateVersion.create({
        data: {
          id: `${id}_v${i + 1}`,
          workspaceId: wsAId,
          templateId: id,
          versionSeq: i + 1,
          definition: definition as never,
          publishOriginRevision: i + 1,
          publishedByMemberId: ownerMemberId,
        },
      });
    }
  }

  await prisma.clientAssignment.create({
    data: {
      workspaceId: wsAId,
      clientProfileId: cpId,
      coachMemberId,
      role: "COACH",
      status: "ACTIVE",
    },
  });
  await prisma.clientAssignment.create({
    data: {
      workspaceId: wsAId,
      clientProfileId: cpId,
      coachMemberId: assistantMemberId,
      role: "COACH",
      status: "ACTIVE",
    },
  });
});

test.afterAll(async () => {
  await prisma.clientSetupPin
    .deleteMany({ where: { clientProfileId: cpId } })
    .catch(() => {});
  await prisma.clientSetup
    .deleteMany({ where: { clientProfileId: cpId } })
    .catch(() => {});
  await prisma.clientAssignment
    .deleteMany({ where: { clientProfileId: cpId } })
    .catch(() => {});
  await prisma.coachingTemplateVersion
    .deleteMany({
      where: {
        templateId: {
          in: [TEMPLATE_ID, EMPTY_TEMPLATE_ID, BLOCKED_TEMPLATE_ID],
        },
      },
    })
    .catch(() => {});
  await prisma.coachingTemplate
    .deleteMany({
      where: {
        id: { in: [TEMPLATE_ID, EMPTY_TEMPLATE_ID, BLOCKED_TEMPLATE_ID] },
      },
    })
    .catch(() => {});
  await prisma.clientProfile
    .deleteMany({ where: { id: CLIENT_PROFILE_ID } })
    .catch(() => {});
  await prisma.$disconnect();
});

const setupUrl = (base = "") => `${base}/workspace/${wsAId}/client-setups`;

/** Seeds a setup + ACTIVE pin directly (C1 semantics — all-NULL lineage). */
async function pinOn(templateId: string, versionSeq: number) {
  const version = await prisma.coachingTemplateVersion.findFirstOrThrow({
    where: { templateId, versionSeq },
  });
  const setup = await prisma.clientSetup.create({
    data: { workspaceId: wsAId, clientProfileId: cpId },
  });
  const pin = await prisma.clientSetupPin.create({
    data: {
      clientSetupId: setup.id,
      workspaceId: wsAId,
      clientProfileId: cpId,
      seq: 1,
      templateId,
      templateVersionId: version.id,
      assignedByMemberId: ownerMemberId,
    },
  });
  return { setup, pin };
}

async function cleanup() {
  await prisma.clientSetupPin
    .deleteMany({ where: { clientProfileId: cpId } })
    .catch(() => {});
  await prisma.clientSetup
    .deleteMany({ where: { clientProfileId: cpId } })
    .catch(() => {});
}

test.describe("P-020B transitions — owner", () => {
  test("upgrade: mandatory review → confirm → superseded lineage + audits", async ({
    page,
  }) => {
    await pinOn(TEMPLATE_ID, 1);
    try {
      await signIn(page, E2E.owner);
      await page.goto(setupUrl());
      const row = page
        .getByTestId("setup-row")
        .filter({ hasText: CLIENT_NAME })
        .filter({ hasText: "Active" });
      await expect(row).toContainText("v1");

      await row.getByTestId("transition-open").click();
      const panel = page.getByTestId("transition-panel");
      await expect(panel).toBeVisible();
      // Focus lands on the panel heading for keyboard/AT users.
      await expect(panel.locator("h2")).toBeFocused();

      await panel.getByTestId("transition-upgrade-choice").click();
      await panel.getByTestId("transition-review-button").click();
      const review = page.getByTestId("transition-review");
      await expect(review).toBeVisible();
      await expect(review).toContainText("version 1 → version 2");
      await expect(review).toContainText("Parameter added");
      await expect(review).toContainText("Waist");
      // P-021: the daily-entry consumer is registered, so the honest
      // zero-provider notice is gone; this client's fixture has no recorded
      // history, so no impact list renders either.
      await expect(page.getByTestId("transition-no-providers")).toHaveCount(0);
      await expect(
        page.getByTestId("transition-impact-daily-entry"),
      ).toHaveCount(0);
      await expect(page.getByTestId("transition-blocked")).toHaveCount(0);

      await page.getByTestId("transition-confirm").click();
      await expect(panel).toHaveCount(0);
      await expect(row).toContainText("v2");

      const pins = await prisma.clientSetupPin.findMany({
        where: { clientProfileId: cpId },
        orderBy: { seq: "asc" },
      });
      expect(pins).toHaveLength(2);
      expect(pins[0].status).toBe("SUPERSEDED");
      expect(pins[1].status).toBe("ACTIVE");
      expect(pins[1].supersedesPinId).toBe(pins[0].id);
      expect(pins[1].transitionKind).toBe("UPGRADE");
      const audits = await prisma.auditEvent.findMany({
        where: {
          resourceType: "client_setup_pin",
          resourceId: { in: [pins[0].id, pins[1].id] },
        },
      });
      expect(audits).toHaveLength(2);
    } finally {
      await cleanup();
    }
  });

  test("rollback: positional earlier-version review → confirm → ROLLBACK pin", async ({
    page,
  }) => {
    const { pin } = await pinOn(TEMPLATE_ID, 2);
    void pin;
    try {
      await signIn(page, E2E.owner);
      await page.goto(setupUrl());
      const row = page
        .getByTestId("setup-row")
        .filter({ hasText: CLIENT_NAME })
        .filter({ hasText: "Active" });
      await expect(row).toContainText("v2");

      await row.getByTestId("transition-open").click();
      const panel = page.getByTestId("transition-panel");
      // No later version — the upgrade choice is absent.
      await expect(panel.getByTestId("transition-upgrade-choice")).toHaveCount(
        0,
      );
      await panel.getByTestId("transition-rollback-select").selectOption("0");
      await panel.getByTestId("transition-review-button").click();
      const review = page.getByTestId("transition-review");
      await expect(review).toContainText("version 2 → version 1");
      await expect(review).toContainText("Parameter removed");
      await expect(page.getByTestId("transition-warnings")).toBeVisible();
      await page.getByTestId("transition-confirm").click();
      await expect(row).toContainText("v1");
      const active = await prisma.clientSetupPin.findFirstOrThrow({
        where: { clientProfileId: cpId, status: "ACTIVE" },
      });
      expect(active.transitionKind).toBe("ROLLBACK");
    } finally {
      await cleanup();
    }
  });

  test("empty diff still requires explicit review + confirmation", async ({
    page,
  }) => {
    await pinOn(EMPTY_TEMPLATE_ID, 1);
    try {
      await signIn(page, E2E.owner);
      await page.goto(setupUrl());
      const row = page
        .getByTestId("setup-row")
        .filter({ hasText: CLIENT_NAME })
        .filter({ hasText: "Active" });
      await row.getByTestId("transition-open").click();
      const panel = page.getByTestId("transition-panel");
      await panel.getByTestId("transition-upgrade-choice").click();
      await panel.getByTestId("transition-review-button").click();
      await expect(page.getByTestId("transition-empty-diff")).toContainText(
        "No structural changes",
      );
      await page.getByTestId("transition-confirm").click();
      await expect(row).toContainText("v2");
      const active = await prisma.clientSetupPin.findFirstOrThrow({
        where: { clientProfileId: cpId, status: "ACTIVE" },
      });
      const summary = active.transitionSummary as {
        categories: Record<string, number>;
      };
      expect(Object.values(summary.categories)).toEqual([0, 0, 0, 0, 0, 0]);
    } finally {
      await cleanup();
    }
  });

  test("a version published after review invalidates it (stale alert, zero writes)", async ({
    page,
  }) => {
    const { pin } = await pinOn(TEMPLATE_ID, 1);
    try {
      await signIn(page, E2E.owner);
      await page.goto(setupUrl());
      const row = page
        .getByTestId("setup-row")
        .filter({ hasText: CLIENT_NAME })
        .filter({ hasText: "Active" });
      await row.getByTestId("transition-open").click();
      const panel = page.getByTestId("transition-panel");
      await panel.getByTestId("transition-upgrade-choice").click();
      await panel.getByTestId("transition-review-button").click();
      await expect(page.getByTestId("transition-review")).toBeVisible();

      // New publication lands between review and confirm (#58).
      await prisma.coachingTemplateVersion.create({
        data: {
          id: `${TEMPLATE_ID}_v3`,
          workspaceId: wsAId,
          templateId: TEMPLATE_ID,
          versionSeq: 3,
          definition: V2 as never,
          publishOriginRevision: 3,
          publishedByMemberId: ownerMemberId,
        },
      });
      const pinsBefore = await prisma.clientSetupPin.count();
      await page.getByTestId("transition-confirm").click();
      await expect(page.getByTestId("transition-alert")).toContainText(
        "The list changed while you were working",
      );
      expect(await prisma.clientSetupPin.count()).toBe(pinsBefore);
      const after = await prisma.clientSetupPin.findUniqueOrThrow({
        where: { id: pin.id },
      });
      expect(after.status).toBe("ACTIVE");
    } finally {
      await prisma.coachingTemplateVersion
        .deleteMany({ where: { id: `${TEMPLATE_ID}_v3` } })
        .catch(() => {});
      await cleanup();
    }
  });

  test("structurally ineligible target shows a block, not a confirm", async ({
    page,
  }) => {
    await pinOn(BLOCKED_TEMPLATE_ID, 1);
    try {
      await signIn(page, E2E.owner);
      await page.goto(setupUrl());
      const row = page
        .getByTestId("setup-row")
        .filter({ hasText: CLIENT_NAME })
        .filter({ hasText: "Active" });
      await row.getByTestId("transition-open").click();
      const panel = page.getByTestId("transition-panel");
      await panel.getByTestId("transition-upgrade-choice").click();
      await panel.getByTestId("transition-review-button").click();
      await expect(page.getByTestId("transition-blocked")).toContainText(
        "blocked",
      );
      await expect(page.getByTestId("transition-confirm")).toHaveCount(0);
      const pins = await prisma.clientSetupPin.findMany({
        where: { clientProfileId: cpId },
      });
      expect(pins).toHaveLength(1);
      expect(pins[0].status).toBe("ACTIVE");
    } finally {
      await cleanup();
    }
  });

  test("no raw ids leak into the review DOM or form values", async ({
    page,
  }) => {
    const { setup, pin } = await pinOn(TEMPLATE_ID, 1);
    try {
      await signIn(page, E2E.owner);
      await page.goto(setupUrl());
      const row = page
        .getByTestId("setup-row")
        .filter({ hasText: CLIENT_NAME })
        .filter({ hasText: "Active" });
      await row.getByTestId("transition-open").click();
      const panel = page.getByTestId("transition-panel");
      await panel.getByTestId("transition-upgrade-choice").click();
      await panel.getByTestId("transition-review-button").click();
      await expect(page.getByTestId("transition-review")).toBeVisible();

      const secrets = [
        pin.id,
        setup.id,
        cpId,
        TEMPLATE_ID,
        `${TEMPLATE_ID}_v1`,
        `${TEMPLATE_ID}_v2`,
        ownerMemberId,
        "pd_a",
        "itm_",
      ];
      const html = await page.content();
      for (const secret of secrets) expect(html).not.toContain(secret);

      const inputValues = await page
        .locator("input, select, textarea")
        .evaluateAll((els) =>
          els.map((el) => (el as HTMLInputElement).value ?? ""),
        );
      for (const v of inputValues) {
        for (const secret of secrets) expect(v).not.toContain(secret);
      }
    } finally {
      await cleanup();
    }
  });
});

test.describe("P-020B transitions — roles + accessibility", () => {
  test("assigned coach performs the same review→confirm upgrade", async ({
    page,
  }) => {
    await pinOn(TEMPLATE_ID, 1);
    try {
      await signIn(page, E2E.coach);
      await page.goto(setupUrl());
      const row = page
        .getByTestId("setup-row")
        .filter({ hasText: CLIENT_NAME })
        .filter({ hasText: "Active" });
      await row.getByTestId("transition-open").click();
      const panel = page.getByTestId("transition-panel");
      await panel.getByTestId("transition-upgrade-choice").click();
      await panel.getByTestId("transition-review-button").click();
      await expect(page.getByTestId("transition-review")).toBeVisible();
      await page.getByTestId("transition-confirm").click();
      await expect(row).toContainText("v2");
    } finally {
      await cleanup();
    }
  });

  test("assistant/support roles get no transition control or output", async ({
    page,
  }) => {
    await pinOn(TEMPLATE_ID, 1);
    try {
      await signIn(page, E2E.assistant);
      await page.goto(setupUrl());
      await expect(page.getByTestId("client-setup-page")).toBeVisible();
      await expect(page.getByTestId("transition-open")).toHaveCount(0);
      await expect(page.getByTestId("transition-panel")).toHaveCount(0);

      await signIn(page, E2E.support);
      await page.goto(setupUrl());
      // Denied roles never reach the surface at all.
      await expect(page.getByTestId("transition-open")).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });

  test("panel is keyboard-operable, focused, and touch-target sized at 390px", async ({
    page,
  }) => {
    await pinOn(TEMPLATE_ID, 1);
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await signIn(page, E2E.owner);
      await page.goto(setupUrl());
      const row = page
        .getByTestId("setup-row")
        .filter({ hasText: CLIENT_NAME })
        .filter({ hasText: "Active" });
      await row.getByTestId("transition-open").focus();
      await page.keyboard.press("Enter");
      const panel = page.getByTestId("transition-panel");
      await expect(panel).toBeVisible();
      await expect(panel.locator("h2")).toBeFocused();

      // Targets load asynchronously — the first tabbable control must exist
      // before Tab can land on it.
      const upgrade = panel.getByTestId("transition-upgrade-choice");
      await expect(upgrade).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(upgrade).toBeFocused();
      for (const testid of [
        "transition-upgrade-choice",
        "transition-review-button",
      ]) {
        const box = await panel.getByTestId(testid).boundingBox();
        expect(box && box.height >= 44).toBeTruthy();
        expect(box && box.width >= 44).toBeTruthy();
      }
      await page.keyboard.press("Enter");
      await page.getByTestId("transition-review-button").click();
      await expect(page.getByTestId("transition-review")).toBeVisible();
      await expectNoOverflow(page, 390);
    } finally {
      await cleanup();
    }
  });

  test("no horizontal overflow with the review open at 1440/834/390", async ({
    page,
  }) => {
    await pinOn(TEMPLATE_ID, 1);
    try {
      await signIn(page, E2E.owner);
      await page.goto(setupUrl());
      const row = page
        .getByTestId("setup-row")
        .filter({ hasText: CLIENT_NAME })
        .filter({ hasText: "Active" });
      await row.getByTestId("transition-open").click();
      const panel = page.getByTestId("transition-panel");
      await panel.getByTestId("transition-upgrade-choice").click();
      await panel.getByTestId("transition-review-button").click();
      await expect(page.getByTestId("transition-review")).toBeVisible();
      for (const width of [1440, 834, 390]) {
        await expectNoOverflow(page, width);
      }
    } finally {
      await cleanup();
    }
  });
});

test.describe("P-020B transitions — flag off (port 3102, parent on)", () => {
  test("page renders but the transition control is absent", async ({
    page,
  }) => {
    await pinOn(TEMPLATE_ID, 1);
    try {
      await signIn(page, E2E.owner, FLAG_OFF);
      const resp = await page.goto(setupUrl(FLAG_OFF));
      expect(resp?.ok()).toBeTruthy();
      await expect(page.getByTestId("client-setup-page")).toBeVisible();
      await expect(page.getByTestId("transition-open")).toHaveCount(0);
      await expect(page.getByTestId("transition-panel")).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });
});
