import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-021 — persistent DailyEntry client flow on the dedicated proof server
 * :3102 (ENABLE_DAILY_ENTRY=1, prototype flag explicitly off → mode
 * "persistent"). Synthetic deterministic fixtures; the client user is the
 * reserved `client@s1h-e2e.test` member of the reserved E2E workspace.
 */

const BASE = "http://127.0.0.1:3102";

const CP_ID = "p021_e2e_client_profile";
const PARAM_W = "p021_e2e_pd_w";
const PARAM_M = "p021_e2e_pd_m";
const PARAM_L = "p021_e2e_pd_l";
const TEMPLATE_ID = "p021_e2e_template";

let prisma: PrismaClient;
let wsId: string;
let ownerMemberId: string;

function versionDef() {
  const params: Record<string, unknown> = {
    [PARAM_W]: {
      key: "p_w",
      kind: "MEASUREMENT",
      label: "Weight",
      helpText: null,
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
      helpText: "Rate 1–10",
      unit: null,
      ratingScheme: "SCALE_1_10",
      options: [],
      validation: null,
      group: null,
      dataClassification: "GENERAL_HEALTH",
      revision: 1,
    },
    [PARAM_L]: {
      key: "p_l",
      kind: "OPTION",
      label: "Day label",
      helpText: null,
      unit: null,
      ratingScheme: null,
      options: [
        { optionId: "opt_high", label: "HIGH" },
        { optionId: "opt_medium", label: "MEDIUM" },
        { optionId: "opt_low", label: "LOW" },
      ],
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
          {
            itemId: "itm_l",
            parameterId: PARAM_L,
            parameterKey: "p_l",
            required: false,
            order: 2,
          },
        ],
      },
    ],
    parameters: params,
  };
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

  // Deterministic cleanup of a previous partial run (Restrict FKs require
  // child-before-parent order).
  const staleRevisions = await prisma.dailyEntryRevision.findMany({
    where: { clientProfileId: CP_ID },
    select: { id: true },
  });
  await prisma.dailyEntryRevisionValue.deleteMany({
    where: { revisionId: { in: staleRevisions.map((r) => r.id) } },
  });
  await prisma.dailyEntry.updateMany({
    where: { clientProfileId: CP_ID },
    data: { currentRevisionId: null },
  });
  await prisma.dailyEntryRevision.deleteMany({
    where: { clientProfileId: CP_ID },
  });
  await prisma.dailyEntry.deleteMany({ where: { clientProfileId: CP_ID } });
  await prisma.clientSetupPin.deleteMany({
    where: { clientProfileId: CP_ID },
  });
  await prisma.clientSetup.deleteMany({ where: { clientProfileId: CP_ID } });
  await prisma.consentRecord.deleteMany({
    where: { clientProfileId: CP_ID },
  });
  await prisma.coachingTemplateVersion.deleteMany({
    where: { templateId: TEMPLATE_ID },
  });
  await prisma.coachingTemplate.deleteMany({ where: { id: TEMPLATE_ID } });
  await prisma.parameterDefinition.deleteMany({
    where: { id: { in: [PARAM_W, PARAM_M, PARAM_L] } },
  });
  await prisma.clientProfile.deleteMany({ where: { id: CP_ID } });

  const cp = await prisma.clientProfile.create({
    data: {
      id: CP_ID,
      workspaceId: wsId,
      userId: clientUser.id,
      name: "E2E Client",
    },
  });
  for (const [id, kind, extra] of [
    [PARAM_W, "MEASUREMENT", { unit: "kg", validation: { min: 0, max: 500 } }],
    [PARAM_M, "RATING", { ratingScheme: "SCALE_1_10" }],
    [
      PARAM_L,
      "OPTION",
      {
        options: [
          { optionId: "opt_high", label: "HIGH" },
          { optionId: "opt_medium", label: "MEDIUM" },
          { optionId: "opt_low", label: "LOW" },
        ],
      },
    ],
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
      name: "E2E Template",
      createdByMemberId: ownerMemberId,
    },
  });
  const version = await prisma.coachingTemplateVersion.create({
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
  const setup = await prisma.clientSetup.create({
    data: { workspaceId: wsId, clientProfileId: cp.id },
  });
  await prisma.clientSetupPin.create({
    data: {
      clientSetupId: setup.id,
      workspaceId: wsId,
      clientProfileId: cp.id,
      seq: 1,
      templateId: TEMPLATE_ID,
      templateVersionId: version.id,
      assignedByMemberId: ownerMemberId,
    },
  });
  for (const [kind, version] of [
    ["PRIVACY_NOTICE", "daily-entry-dev-privacy-v1"],
    ["HEALTH_DATA", "daily-entry-dev-health-v1"],
  ] as const)
    await prisma.consentRecord.create({
      data: { clientProfileId: cp.id, kind, version },
    });
});

test.afterAll(async () => {
  // Restrict FKs require child-before-parent order.
  const revisions = await prisma.dailyEntryRevision.findMany({
    where: { clientProfileId: CP_ID },
    select: { id: true },
  });
  await prisma.dailyEntryRevisionValue
    .deleteMany({ where: { revisionId: { in: revisions.map((r) => r.id) } } })
    .catch(() => {});
  await prisma.dailyEntry
    .updateMany({
      where: { clientProfileId: CP_ID },
      data: { currentRevisionId: null },
    })
    .catch(() => {});
  await prisma.dailyEntryRevision
    .deleteMany({ where: { clientProfileId: CP_ID } })
    .catch(() => {});
  await prisma.dailyEntry
    .deleteMany({ where: { clientProfileId: CP_ID } })
    .catch(() => {});
  await prisma.clientSetupPin
    .deleteMany({ where: { clientProfileId: CP_ID } })
    .catch(() => {});
  await prisma.clientSetup
    .deleteMany({ where: { clientProfileId: CP_ID } })
    .catch(() => {});
  await prisma.consentRecord
    .deleteMany({ where: { clientProfileId: CP_ID } })
    .catch(() => {});
  await prisma.coachingTemplateVersion
    .deleteMany({ where: { templateId: TEMPLATE_ID } })
    .catch(() => {});
  await prisma.coachingTemplate
    .deleteMany({ where: { id: TEMPLATE_ID } })
    .catch(() => {});
  await prisma.parameterDefinition
    .deleteMany({ where: { id: { in: [PARAM_W, PARAM_M, PARAM_L] } } })
    .catch(() => {});
  await prisma.clientProfile
    .deleteMany({ where: { id: CP_ID } })
    .catch(() => {});
  await prisma.$disconnect();
});

async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const dailyUrl = () => `${BASE}/workspace/${wsId}/daily`;

test.describe("P-021 persistent DailyEntry", () => {
  test("client sees the persistent form alongside the shell and saves", async ({
    page,
  }) => {
    await signIn(page, E2E.client);
    await page.goto(dailyUrl());
    // Shell still renders.
    await expect(page.getByTestId("daily-tracker")).toBeVisible();
    // Persistent affordances for the client.
    await expect(
      page.getByRole("button", { name: "Save daily entry" }),
    ).toBeVisible();
    const weight = page.getByLabel(/Weight/);
    await weight.fill("75,5");
    await page.getByLabel(/Energy/).selectOption("7");
    await page.getByLabel(/Day label/).selectOption("0");
    await page.getByRole("button", { name: "Save daily entry" }).click();
    await expect(page.getByRole("status").getByText("Saved")).toBeVisible();
    // Read-only history lists the entry.
    await expect(page.getByText("75.5")).toBeVisible();
    // Reload: values prefill from the current revision.
    await page.reload();
    await expect(page.getByLabel(/Weight/)).toHaveValue("75.5");
  });

  test("edit appends a revision visible in history count", async ({ page }) => {
    await signIn(page, E2E.client);
    await page.goto(dailyUrl());
    await page.getByLabel(/Weight/).fill("76");
    await page.getByRole("button", { name: "Save daily entry" }).click();
    await expect(page.getByRole("status").getByText("Saved")).toBeVisible();
    await expect(page.getByText(/revisions/)).toBeVisible();
  });

  test("staff keep the shell only — no form, no history, no Save", async ({
    page,
  }) => {
    await signIn(page, E2E.coach);
    const res = await page.goto(dailyUrl());
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("daily-tracker")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save daily entry" }),
    ).toHaveCount(0);
    await expect(page.getByLabel(/Weight/)).toHaveCount(0);
    await expect(
      page.getByText("Daily tracking is currently unavailable."),
    ).toHaveCount(0);
  });

  test("owner keeps the shell only — no staff value view in v1", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(dailyUrl());
    await expect(page.getByTestId("daily-tracker")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save daily entry" }),
    ).toHaveCount(0);
  });

  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["tablet", { width: 834, height: 1112 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    test(`${name}: form is keyboard-complete with no horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await signIn(page, E2E.client);
      await page.goto(dailyUrl());
      const weight = page.getByLabel(/Weight/);
      await weight.focus();
      await expect(weight).toBeFocused();
      await weight.fill("74");
      await page.keyboard.press("Tab");
      const save = page.getByRole("button", { name: "Save daily entry" });
      await save.focus();
      await expect(save).toBeFocused();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
