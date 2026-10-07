import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-020A — parameter classification management surface: real-browser flows
 * with ENABLE_PARAMETER_CLASSIFICATION=1 on the primary server (:3000) and
 * the dedicated flag-off server (:3101) proving control-absence on a real
 * target. Synthetic fixtures only.
 */
const FLAG_OFF = "http://127.0.0.1:3101";
const PARAM_LABEL = "P020A Classify Weight";
const PARAM_LABEL_2 = "P020A Classify Resting HR";

let prisma: PrismaClient;
let wsId: string;
let paramId: string;
let paramId2: string;

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
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { slug: E2E.workspaceSlug },
  });
  wsId = ws.id;
  const ownerMember = await prisma.workspaceMember.findFirstOrThrow({
    where: {
      workspaceId: wsId,
      role: "WORKSPACE_OWNER",
      user: { email: E2E.owner },
    },
  });
  // Deterministic state: remove any leftover fixture from a prior run.
  const prior = await prisma.parameterDefinition.findMany({
    where: {
      workspaceId: wsId,
      label: { in: [PARAM_LABEL, PARAM_LABEL_2] },
    },
    select: { id: true },
  });
  await prisma.parameterDefinition.deleteMany({
    where: { id: { in: prior.map((p) => p.id) } },
  });
  const row2 = await prisma.parameterDefinition.create({
    data: {
      workspaceId: wsId,
      key: `p_${crypto.randomUUID()}`,
      kind: "MEASUREMENT",
      label: PARAM_LABEL_2,
      unit: "bpm",
      createdByMemberId: ownerMember.id,
      updatedByMemberId: ownerMember.id,
    },
  });
  paramId2 = row2.id;
  const row = await prisma.parameterDefinition.create({
    data: {
      workspaceId: wsId,
      key: `p_${crypto.randomUUID()}`,
      kind: "MEASUREMENT",
      label: PARAM_LABEL,
      unit: "kg",
      createdByMemberId: ownerMember.id,
      updatedByMemberId: ownerMember.id,
    },
  });
  paramId = row.id;
});

test.afterAll(async () => {
  for (const id of [paramId, paramId2]) {
    if (id) await prisma.parameterDefinition.delete({ where: { id } });
  }
  await prisma?.$disconnect();
});

test("owner sees the classification control and classifies GENERAL_HEALTH", async ({
  page,
}) => {
  await signIn(page, E2E.owner);
  await page.goto(`/workspace/${wsId}/parameters`);
  const row = page
    .getByTestId("parameter-row")
    .filter({ hasText: PARAM_LABEL });
  await expect(row.getByTestId("classify-parameter")).toBeVisible();
  await row.getByTestId("classification-select").selectOption("GENERAL_HEALTH");
  await row.getByTestId("classify-parameter").click();
  await expect(row.getByTestId("classification-state")).toContainText(
    "GENERAL_HEALTH",
  );
  // Classified state is immutable — the control is gone.
  await expect(row.getByTestId("classify-parameter")).toHaveCount(0);
});

test("coach sees the classification control (write authority)", async ({
  page,
}) => {
  await signIn(page, E2E.coach);
  await page.goto(`/workspace/${wsId}/parameters`);
  const row = page
    .getByTestId("parameter-row")
    .filter({ hasText: PARAM_LABEL_2 });
  await expect(row.getByTestId("classify-parameter")).toBeVisible();
});

test("classification control exposes only non-reserved categories", async ({
  page,
}) => {
  await signIn(page, E2E.owner);
  await page.goto(`/workspace/${wsId}/parameters`);
  const row = page
    .getByTestId("parameter-row")
    .filter({ hasText: PARAM_LABEL });
  const options = await row
    .getByTestId("classification-select")
    .locator("option")
    .allTextContents();
  expect(options.join("|")).not.toContain("BLOODWORK");
  expect(options.join("|")).not.toContain("PED_HRT");
});

test("flag-off server hides the classification control", async ({ page }) => {
  await signIn(page, E2E.owner, FLAG_OFF);
  const res = await page.goto(`${FLAG_OFF}/workspace/${wsId}/parameters`);
  expect(res?.status()).toBe(404);
});

test("assistant is denied the parameters surface entirely", async ({
  page,
}) => {
  await signIn(page, E2E.assistant);
  const res = await page.goto(`/workspace/${wsId}/parameters`);
  expect(res?.status()).toBe(403);
});

test("no raw parameter id appears in the classify DOM", async ({ page }) => {
  await signIn(page, E2E.owner);
  await page.goto(`/workspace/${wsId}/parameters`);
  const row = page
    .getByTestId("parameter-row")
    .filter({ hasText: PARAM_LABEL });
  const html = await row.innerHTML();
  expect(html).not.toContain(paramId);
});

for (const width of [1440, 834, 390]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await signIn(page, E2E.owner);
    await page.goto(`/workspace/${wsId}/parameters`);
    await expectNoOverflow(page, width);
  });
}
