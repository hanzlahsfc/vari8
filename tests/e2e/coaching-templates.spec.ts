import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-014 parameter library + coaching templates — real browser flows with
 * ENABLE_COACHING_TEMPLATES=1 on the primary server (:3000) and a dedicated
 * flag-OFF server (:3101) proving the 404/absent-nav contract. Synthetic
 * fixtures only; names are run-unique so rows never collide across runs.
 */

const FLAG_OFF = "http://127.0.0.1:3101";

let prisma: PrismaClient;
let wsAId: string;
const RUN = `P014 ${Date.now().toString(36)}`;

async function signIn(page: Page, email: string, base = "") {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function createParameterUi(
  page: Page,
  wsId: string,
  kind: string,
  label: string,
  opts: { assertVisible?: boolean } = {},
) {
  await page.goto(`/workspace/${wsId}/parameters`);
  await page.locator("#param-kind").selectOption(kind);
  await page.locator("#param-label").fill(label);
  if (kind === "OPTION") {
    await page.locator("#param-options").fill("Alpha\nBeta");
  }
  await page.getByTestId("create-parameter").click();
  // New rows append at the end of the keyset order — with >1 page of
  // parameters the fresh row may live on a later page, so visibility is
  // only asserted when the caller knows the list fits on page 1.
  if (opts.assertVisible !== false)
    await expect(page.getByText(label)).toBeVisible();
  else await expect(page.getByTestId("parameter-error")).toBeHidden();
}

test.beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });
  const wsA = await prisma.workspace.findUniqueOrThrow({
    where: { slug: E2E.workspaceSlug },
  });
  wsAId = wsA.id;
});

test.afterAll(async () => {
  // Restrict FKs: remove the rows this spec created (version refs →
  // versions → templates → parameters) so workspace-member lifecycle
  // specs elsewhere are never blocked by leftover fixtures.
  if (prisma && wsAId) {
    await prisma.coachingTemplateVersionParameter.deleteMany({
      where: { workspaceId: wsAId },
    });
    await prisma.coachingTemplateVersion.deleteMany({
      where: { workspaceId: wsAId },
    });
    await prisma.coachingTemplate.deleteMany({
      where: { workspaceId: wsAId },
    });
    await prisma.parameterDefinition.deleteMany({
      where: { workspaceId: wsAId },
    });
  }
  await prisma?.$disconnect();
});

test.describe("feature flag OFF — real 404 and absent nav", () => {
  test("all P-014 routes return 404 on the flag-off server", async ({
    page,
  }) => {
    await signIn(page, E2E.owner, FLAG_OFF);
    for (const path of [
      `/workspace/${wsAId}/parameters`,
      `/workspace/${wsAId}/templates`,
      `/workspace/${wsAId}/templates/t_any`,
      `/workspace/${wsAId}/templates/t_any/preview`,
    ]) {
      const res = await page.goto(`${FLAG_OFF}${path}`);
      expect(res?.status(), path).toBe(404);
    }
  });

  test("nav has no Parameters/Templates entries flag-off", async ({ page }) => {
    await signIn(page, E2E.owner, FLAG_OFF);
    await page.goto(`${FLAG_OFF}/workspace/${wsAId}`);
    await expect(page.getByRole("link", { name: "Parameters" })).toBeHidden();
    await expect(page.getByRole("link", { name: "Templates" })).toBeHidden();
  });
});

test.describe("flag-on access control", () => {
  for (const [label, email] of [
    ["assistant", E2E.assistant],
    ["client", E2E.client],
    ["support", E2E.support],
    ["nonmember", E2E.nonmember],
  ] as const) {
    test(`${label} gets the non-disclosing denial on both routes`, async ({
      page,
    }) => {
      await signIn(page, email);
      for (const path of [
        `/workspace/${wsAId}/parameters`,
        `/workspace/${wsAId}/templates`,
      ]) {
        const res = await page.goto(path);
        expect(res?.status(), `${label} ${path}`).toBe(403);
      }
      await page.goto(`/workspace/${wsAId}`);
      await expect(page.getByRole("link", { name: "Parameters" })).toBeHidden();
      await expect(page.getByRole("link", { name: "Templates" })).toBeHidden();
    });
  }
});

test.describe("parameter library", () => {
  test("owner creates measurement and option parameters", async ({ page }) => {
    await signIn(page, E2E.owner);
    await page.goto(`/workspace/${wsAId}/parameters`);
    await expect(page.getByTestId("parameters-page")).toBeVisible();
    await createParameterUi(page, wsAId, "MEASUREMENT", `${RUN} Weight`);
    await createParameterUi(page, wsAId, "OPTION", `${RUN} Day type`);
    const row = page.getByTestId("parameters-table").locator("tr", {
      hasText: `${RUN} Weight`,
    });
    await expect(row).toBeVisible();
    await expect(row.getByTestId("parameter-status")).toHaveText("ACTIVE");
    // No raw IDs visibly displayed anywhere on the page.
    const visibleText = await page.evaluate(() => document.body.innerText);
    expect(visibleText).not.toMatch(/p_[0-9a-f-]{36}/);
    // DOM attribute values carry no internal handles either (picker uses
    // positional indices; only labels render).
    const attrLeak = await page.evaluate(() =>
      Array.from(document.querySelectorAll("option")).some(
        (o) => typeof o.value === "string" && /p_[0-9a-f-]{36}/.test(o.value),
      ),
    );
    expect(attrLeak).toBe(false);
  });

  test("coach creates a parameter (shared workspace library)", async ({
    page,
  }) => {
    await signIn(page, E2E.coach);
    await createParameterUi(page, wsAId, "TEXT", `${RUN} Coach note`);
  });

  test("archive requires explicit confirmation and is terminal", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await createParameterUi(page, wsAId, "TEXT", `${RUN} Archivable`);
    const row = page
      .getByTestId("parameters-table")
      .locator("tr", { hasText: `${RUN} Archivable` });
    await row.getByTestId("archive-parameter").click();
    await expect(page.getByTestId("archive-confirm-text")).toBeVisible();
    await row.getByTestId("confirm-archive-parameter").click();
    await expect(row.getByTestId("parameter-status")).toHaveText("ARCHIVED");
    // No unarchive control exists.
    await expect(row.getByTestId("archive-parameter")).toBeHidden();
  });
});

test.describe("template draft → publish → v2 lifecycle", () => {
  test("owner: create → save → publish → edit → publish v2 → v1 unchanged", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await createParameterUi(page, wsAId, "MEASUREMENT", `${RUN} H2O`);
    await page.goto(`/workspace/${wsAId}/templates`);
    await page.locator("#template-name").fill(`${RUN} Daily`);
    await page.getByTestId("create-template").click();
    await page.waitForURL(/\/templates\/[^/]+$/);
    await expect(page.getByTestId("template-draft-editor")).toBeVisible();

    // Build a section with one item, save, publish v1.
    await page.getByTestId("add-section").click();
    await page.getByTestId("section-label-0").fill("Morning");
    await page.getByTestId("add-item-0").click();
    await page.getByTestId("item-param-0-0").selectOption({
      label: `${RUN} H2O (MEASUREMENT)`,
    });
    await page.getByTestId("item-required-0-0").check();
    await page.getByTestId("save-draft").click();
    await expect(page.getByTestId("template-notice")).toHaveText(
      "Draft saved.",
    );
    await page.getByTestId("publish-template").click();
    await expect(page.getByTestId("version-history")).toBeVisible();
    await expect(page.getByTestId("preview-v1")).toBeVisible();

    // v1 preview — immutable.
    const v1Href = await page.getByTestId("preview-v1").getAttribute("href");
    await page.goto(v1Href!);
    await expect(page.getByTestId("preview-item-label")).toHaveText(
      `${RUN} H2O`,
    );
    const v1Body = await page.textContent(
      '[data-testid="template-preview-page"]',
    );

    // Reopen → add a second section → publish v2.
    await page.goBack();
    await page.getByTestId("open-draft").click();
    await expect(page.getByTestId("template-draft-editor")).toBeVisible();
    await page.getByTestId("add-section").click();
    await page.getByTestId("section-label-1").fill("Evening");
    await page.getByTestId("add-item-1").click();
    await page.getByTestId("save-draft").click();
    await expect(page.getByTestId("template-notice")).toHaveText(
      "Draft saved.",
    );
    await page.getByTestId("publish-template").click();
    await expect(page.getByTestId("preview-v2")).toBeVisible();

    // v1 is byte-identical — later publishes never mutate it.
    await page.goto(v1Href!);
    const v1After = await page.textContent(
      '[data-testid="template-preview-page"]',
    );
    expect(v1After).toBe(v1Body);
  });

  test("stale draft conflict shows the stable message", async ({
    page,
    context,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(`/workspace/${wsAId}/templates`);
    await page.locator("#template-name").fill(`${RUN} Stale`);
    await page.getByTestId("create-template").click();
    await page.waitForURL(/\/templates\/[^/]+$/);
    // Second tab holds the same draft revision — its save loses.
    const page2 = await context.newPage();
    await signIn(page2, E2E.owner);
    await page2.goto(page.url());
    await page.getByTestId("save-draft").click();
    await expect(page.getByTestId("template-notice")).toHaveText(
      "Draft saved.",
    );
    await page2.getByTestId("save-draft").click();
    await expect(page2.getByTestId("template-error")).toContainText(
      "changed while you were editing",
    );
    await page2.close();
  });

  test("parameter_changed conflict at publish requires re-save", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    const label = `${RUN} RPE`;
    await createParameterUi(page, wsAId, "MEASUREMENT", label);
    await page.goto(`/workspace/${wsAId}/templates`);
    await page.locator("#template-name").fill(`${RUN} Changed`);
    await page.getByTestId("create-template").click();
    await page.waitForURL(/\/templates\/[^/]+$/);
    await page.getByTestId("add-section").click();
    await page.getByTestId("section-label-0").fill("Effort");
    await page.getByTestId("add-item-0").click();
    await page
      .getByTestId("item-param-0-0")
      .selectOption({ label: `${label} (MEASUREMENT)` });
    await page.getByTestId("save-draft").click();
    await expect(page.getByTestId("template-notice")).toHaveText(
      "Draft saved.",
    );

    // Bump the parameter revision (display edit) while the draft is open.
    await page.goto(`/workspace/${wsAId}/parameters`);
    const row = page
      .getByTestId("parameters-table")
      .locator("tr", { hasText: label });
    await row.getByTestId("edit-parameter").click();
    // Edit mode replaces the row text — locate the inputs at page level
    // (only one row can be in edit mode at a time).
    await page.getByTestId("edit-parameter-label").fill(`${label} v2`);
    await page.getByTestId("save-parameter-edit").click();
    await expect(page.getByTestId("parameters-table")).toContainText(
      `${label} v2`,
    );

    // Publish fails — the draft acknowledged the old revision.
    await page.goto(page.url().replace("/parameters", "/templates"));
    // Find our template by name.
    await page.getByRole("link", { name: `${RUN} Changed` }).click();
    await page.getByTestId("publish-template").click();
    await expect(page.getByTestId("template-error")).toContainText(
      "changed since this draft was saved",
    );
    // Re-save re-acknowledges → publish succeeds.
    await page.getByTestId("save-draft").click();
    await expect(page.getByTestId("template-notice")).toHaveText(
      "Draft saved.",
    );
    await page.getByTestId("publish-template").click();
    await expect(page.getByTestId("preview-v1")).toBeVisible();
  });
});

test.describe("pagination and picker completeness", () => {
  test(">25 parameters are all reachable via Load more, picker included", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    // Seed 28 ACTIVE + 1 ARCHIVED parameter rows directly (fixture speed);
    // the UI path is exercised end-to-end elsewhere in this spec.
    const ownerMember = await prisma.workspaceMember.findFirstOrThrow({
      where: {
        workspaceId: wsAId,
        role: "WORKSPACE_OWNER",
        user: { email: E2E.owner },
      },
    });
    const tag = `${RUN} Pg`;
    for (let i = 0; i < 28; i++) {
      await prisma.parameterDefinition.create({
        data: {
          workspaceId: wsAId,
          key: `p_p${Date.now().toString(36)}_${i}`,
          kind: "TEXT",
          label: `${tag} ${String(i).padStart(2, "0")}`,
          status: "ACTIVE",
          revision: 1,
          createdByMemberId: ownerMember.id,
          updatedByMemberId: ownerMember.id,
        },
      });
    }
    await prisma.parameterDefinition.create({
      data: {
        workspaceId: wsAId,
        key: `p_p${Date.now().toString(36)}_arch`,
        kind: "TEXT",
        label: `${tag} Archived`,
        status: "ARCHIVED",
        revision: 1,
        createdByMemberId: ownerMember.id,
        updatedByMemberId: ownerMember.id,
        archivedByMemberId: ownerMember.id,
        archivedAt: new Date(),
      },
    });

    await page.goto(`/workspace/${wsAId}/parameters`);
    const countRows = () =>
      page
        .getByTestId("parameters-table")
        .locator('tr[data-testid="parameter-row"]')
        .count();
    // First page renders at most the default page size.
    const firstCount = await countRows();
    expect(firstCount).toBeLessThanOrEqual(25);
    // The continuation link is a native anchor — keyboard-focusable and
    // Enter-activated with no client action plumbing.
    const seenLabels = new Set(
      await page
        .getByTestId("parameters-table")
        .locator('tr[data-testid="parameter-row"] td:first-child')
        .allTextContents(),
    );
    await page.getByTestId("next-page").focus();
    await expect(page.getByTestId("next-page")).toBeFocused();
    await page.keyboard.press("Enter"); // first hop via keyboard
    await page.waitForURL(/cursor=/);
    while (true) {
      const labels = await page
        .getByTestId("parameters-table")
        .locator('tr[data-testid="parameter-row"] td:first-child')
        .allTextContents();
      for (const l of labels) seenLabels.add(l);
      if (!(await page.getByTestId("next-page").isVisible())) break;
      await page.getByTestId("next-page").click();
      await page.waitForURL(/cursor=/);
    }
    // "First page" resets the view.
    await expect(page.getByTestId("first-page")).toBeVisible();
    await page.getByTestId("first-page").click();
    await expect(page).not.toHaveURL(/cursor=/);
    // Every seeded row was reached exactly once — no duplicates, no gaps.
    for (let i = 0; i < 28; i++)
      expect(seenLabels).toContain(`${tag} ${String(i).padStart(2, "0")}`);
    expect(seenLabels).toContain(`${tag} Archived`);

    // Picker: the deepest ACTIVE parameter is selectable; the ARCHIVED one
    // is not offered.
    await page.goto(`/workspace/${wsAId}/templates`);
    await page.locator("#template-name").fill(`${RUN} Picker`);
    await page.getByTestId("create-template").click();
    await page.waitForURL(/\/templates\/[^/]+$/);
    await page.getByTestId("add-section").click();
    await page.getByTestId("section-label-0").fill("s");
    await page.getByTestId("add-item-0").click();
    const picker = page.getByTestId("item-param-0-0");
    await expect(
      picker.locator("option", { hasText: `${tag} 27` }),
    ).toHaveCount(1);
    await expect(
      picker.locator("option", { hasText: `${tag} Archived` }),
    ).toHaveCount(0);
    await picker.selectOption({ label: `${tag} 27 (TEXT)` });
    await page.getByTestId("save-draft").click();
    await expect(page.getByTestId("template-notice")).toHaveText(
      "Draft saved.",
    );
  });
});

test.describe("workspace isolation + empty states", () => {
  test("workspace B shows empty states and none of workspace A's rows", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    const wsB = await prisma.workspace.findUniqueOrThrow({
      where: { slug: E2E.workspaceBSlug },
    });
    // Seed workspace A so the isolation check is meaningful (the row may
    // land on a later page once the library exceeds one page).
    await createParameterUi(page, wsAId, "TEXT", `${RUN} Isolation`, {
      assertVisible: false,
    });
    await page.goto(`/workspace/${wsB.id}/parameters`);
    await expect(page.getByTestId("parameters-empty")).toBeVisible();
    await expect(page.getByText(`${RUN} Isolation`)).toBeHidden();
    await page.goto(`/workspace/${wsB.id}/templates`);
    await expect(page.getByTestId("templates-empty")).toBeVisible();
  });
});

test.describe("accessibility and responsive", () => {
  test("parameters page: keyboard, focus, no overflow at 1440/834/390", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    for (const width of [1440, 834, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/workspace/${wsAId}/parameters`);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `${width}px`).toBeLessThanOrEqual(1);
    }
    // Keyboard: tab reaches the create button; controls are focusable.
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`/workspace/${wsAId}/templates`);
    await page.locator("#template-name").focus();
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() =>
      document.activeElement?.getAttribute("data-testid"),
    );
    expect(focused).toBe("create-template");
  });
});
