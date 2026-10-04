import { expect, test, type Page } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-008 onboarding form builder — real browser flows at desktop (1440px),
 * tablet (834px) and mobile (390px). Synthetic fixtures only; this slice has
 * no submission domain, and the preview must persist nothing.
 *
 * Provenance (TDD recovery): adapted TESTS-ONLY from the frozen read-only
 * candidate branch feature/p008-onboarding-form-builder @ d10d788, per the
 * recovery contract; the `editor save foundation` describe and the
 * open-draft editor-ready mount assertions were adapted TESTS-ONLY from
 * feature/p008-onboarding-form-builder-tdd-5c @ bb5ef98. These tests
 * encode the reviewed contract; the production implementation is rebuilt
 * fresh on this branch.
 *
 * Slice ownership: the authz/nav/list/create tests govern 5C-1; the
 * mount+denial suite governs 5C-2a. The `editor save foundation` describe
 * (plus the dedicated blank-option creation test, new to this recovery)
 * governs ES-2/ES-3 — those assertions stay intentionally RED until the
 * behavior lands. Lifecycle controls (open-draft/publish/archive) remain
 * out of slice and must NOT render.
 */

let prisma: PrismaClient;
let wsId: string;
let wsBId: string;
let ownerMemberId: string;

async function removeFixtures() {
  await prisma.onboardingFormVersion.deleteMany({
    where: { form: { workspaceId: wsId, name: { startsWith: "E2E P8" } } },
  });
  await prisma.onboardingForm.deleteMany({
    where: { workspaceId: wsId, name: { startsWith: "E2E P8" } },
  });
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
  const ownerMember = await prisma.workspaceMember.findFirstOrThrow({
    where: { workspaceId: wsId, role: "WORKSPACE_OWNER" },
  });
  ownerMemberId = ownerMember.id;
  await removeFixtures();
});

test.afterAll(async () => {
  await removeFixtures();
  await prisma?.$disconnect();
});

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/login/);
}

const seedDefinition = (title: string) => ({
  title,
  fields: [
    {
      fieldId: "f_seed_1",
      kind: "shortText",
      label: "Full name",
      required: true,
      order: 0,
    },
  ],
});

/**
 * Complete zero-delta proof for mount/edit phases (Atlas follow-up): a
 * read mount or client-local edit must leave serialized workspace forms
 * (name/status/draft/revision/updatedAt/editor+archival stamps), all
 * version rows, and all onboarding audit rows byte-identical.
 */
const workspaceSnapshot = async () => ({
  forms: await prisma.onboardingForm.findMany({
    where: { workspaceId: wsId },
    orderBy: { id: "asc" },
  }),
  versions: await prisma.onboardingFormVersion.findMany({
    where: { form: { workspaceId: wsId } },
    orderBy: [{ formId: "asc" }, { versionSeq: "asc" }],
  }),
  audits: await prisma.auditEvent.findMany({
    where: { resourceType: "onboarding_form", workspaceId: wsId },
    orderBy: { id: "asc" },
  }),
});

/** Every non-GET request on ANY path — read/edit phases must write none. */
function trackNonGet(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (req) => {
    if (req.method() !== "GET") {
      requests.push(`${req.method()} ${req.url()}`);
    }
  });
  return requests;
}

// Sorted key→value pairs so a value change under a reused key can't evade.
const storageSnapshot = (page: Page) =>
  page.evaluate(() => {
    const pairs = (s: Storage) =>
      [...Array(s.length).keys()]
        .map((i) => s.key(i)!)
        .sort()
        .map((k) => [k, s.getItem(k)]);
    return JSON.stringify([pairs(localStorage), pairs(sessionStorage)]);
  });

test("unauthenticated deep link redirects to /login", async ({ page }) => {
  await page.goto(`/workspace/${wsId}/onboarding/forms`);
  await expect(page).toHaveURL(/login/);
});

test("non-member gets HTTP 403 on the form library AND create page", async ({
  page,
}) => {
  await signIn(page, E2E.nonmember);
  const res = await page.goto(`/workspace/${wsId}/onboarding/forms`);
  expect(res?.status()).toBe(403);
  const res2 = await page.goto(`/workspace/${wsId}/onboarding/forms/new`);
  expect(res2?.status()).toBe(403);
});

test("foreign-workspace and malformed segments fail closed (non-disclosing)", async ({
  page,
}) => {
  // The coach is a member of the fixture workspace only — a different
  // workspace's library must be indistinguishable from a missing one, and a
  // malformed workspace segment must fail before any resource read.
  await signIn(page, E2E.coach);
  const foreign = await page.goto(`/workspace/${wsBId}/onboarding/forms`);
  expect(foreign?.status()).toBe(403);
  const malformed = await page.goto(
    `/workspace/not-a-workspace/onboarding/forms`,
  );
  expect(malformed?.status()).toBe(403);
});

test("client member is denied the list AND new-page deep link", async ({
  page,
}) => {
  await signIn(page, E2E.client);
  const res = await page.goto(`/workspace/${wsId}/onboarding/forms`);
  expect(res?.status()).toBe(403);
  const res2 = await page.goto(`/workspace/${wsId}/onboarding/forms/new`);
  expect(res2?.status()).toBe(403);
});

test("assistant coach and support are denied list AND new-page deep link", async ({
  page,
}) => {
  for (const email of [E2E.assistant, E2E.support]) {
    await signIn(page, email);
    const res = await page.goto(`/workspace/${wsId}/onboarding/forms`);
    expect(res?.status()).toBe(403);
    const res2 = await page.goto(`/workspace/${wsId}/onboarding/forms/new`);
    expect(res2?.status()).toBe(403);
  }
});

test("nav gates the onboarding-forms entry by current server-side role", async ({
  page,
}) => {
  // Owner AND coach see the entry (both hold workspace-scope read).
  for (const email of [E2E.owner, E2E.coach]) {
    await signIn(page, email);
    const res = await page.goto(`/workspace/${wsId}`);
    expect(res?.status()).toBe(200);
    await expect(
      page.locator(".shell__nav").getByText("Onboarding Forms"),
    ).toBeVisible();
  }
  // The assistant reliably reaches the staff shell — hard-assert HTTP 200,
  // then the entry must be absent. A conditional check could vacuously pass
  // if the shell ever started 403ing this role.
  await signIn(page, E2E.assistant);
  const assistantRes = await page.goto(`/workspace/${wsId}`);
  expect(assistantRes?.status()).toBe(200);
  await expect(
    page.locator(".shell__nav").getByText("Onboarding Forms"),
  ).not.toBeVisible();
  // Remaining denied roles: the staff shell itself 403s for
  // client/support/nonmember — the entry is unreachable either way.
  for (const email of [E2E.support, E2E.client, E2E.nonmember]) {
    await signIn(page, email);
    const res = await page.goto(`/workspace/${wsId}`);
    expect(res?.status()).toBe(403);
  }
});

for (const width of [1440, 834, 390] as const) {
  test(`coach reaches the list and create page at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, E2E.coach);
    const res = await page.goto(`/workspace/${wsId}/onboarding/forms`);
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("new-onboarding-form")).toBeVisible();
    // No horizontal overflow on the LIST page at this width.
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false);

    const res2 = await page.goto(`/workspace/${wsId}/onboarding/forms/new`);
    expect(res2?.status()).toBe(200);
    await expect(
      page.getByRole("button", { name: "Create form" }),
    ).toBeVisible();
    // No horizontal overflow on the NEW page at this width.
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false);
    // The create surface has exactly one text input — no intake/answer
    // fields exist in this slice.
    await expect(page.getByRole("textbox")).toHaveCount(1);

    // Real keyboard traversal — Tab keypresses, not programmatic .focus() —
    // must reach the name input, then the submit control in DOM order.
    const input = page.getByTestId("form-name-input");
    const submit = page.getByRole("button", { name: "Create form" });
    for (let i = 0; i < 40; i++) {
      if (await input.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(input).toBeFocused();
    for (let i = 0; i < 10; i++) {
      if (await submit.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(submit).toBeFocused();
  });
}

test.describe("seeded list rendering", () => {
  // Independent per-test fixture state: each test seeds exactly the row it
  // asserts on, and the reserved `E2E P8` namespace is cleaned before AND
  // after so ordering can never leak rows between tests.
  test.beforeEach(removeFixtures);
  test.afterEach(removeFixtures);

  async function listRow(page: Page, name: string) {
    await signIn(page, E2E.owner);
    await page.goto(`/workspace/${wsId}/onboarding/forms`);
    const row = page
      .getByTestId("onboarding-forms-table")
      .getByRole("row")
      .filter({ hasText: name });
    await expect(row).toHaveCount(1);
    return row;
  }

  test("draft-only form renders DRAFT status with no published version", async ({
    page,
  }) => {
    const form = await prisma.onboardingForm.create({
      data: {
        workspaceId: wsId,
        name: "E2E P8 Seed Draft",
        createdByMemberId: ownerMemberId,
        draftRevision: 3,
        draft: seedDefinition("E2E P8 Seed Draft"),
      },
      select: { id: true },
    });
    const row = await listRow(page, "E2E P8 Seed Draft");
    await expect(row.getByTestId("form-status-badge")).toHaveText("DRAFT");
    await expect(row.getByTestId("form-version")).toHaveText("—");
    await expect(
      row.getByRole("link", { name: "E2E P8 Seed Draft" }),
    ).toHaveAttribute("href", `/workspace/${wsId}/onboarding/forms/${form.id}`);
  });

  test("published form renders PUBLISHED status and its latest version", async ({
    page,
  }) => {
    const form = await prisma.onboardingForm.create({
      data: {
        workspaceId: wsId,
        name: "E2E P8 Seed Published",
        createdByMemberId: ownerMemberId,
        draftRevision: 4,
        draft: Prisma.DbNull, // publish consumes the open draft (SQL NULL)
        versions: {
          create: [
            {
              versionSeq: 1,
              definition: seedDefinition("E2E P8 Seed Published"),
              publishOriginRevision: 1,
              publishedByMemberId: ownerMemberId,
            },
            {
              versionSeq: 2,
              definition: seedDefinition("E2E P8 Seed Published v2"),
              publishOriginRevision: 4,
              publishedByMemberId: ownerMemberId,
            },
          ],
        },
      },
      select: { id: true },
    });
    const row = await listRow(page, "E2E P8 Seed Published");
    await expect(row.getByTestId("form-status-badge")).toHaveText("PUBLISHED");
    await expect(row.getByTestId("form-version")).toHaveText("v2");
    await expect(
      row.getByRole("link", { name: "E2E P8 Seed Published" }),
    ).toHaveAttribute("href", `/workspace/${wsId}/onboarding/forms/${form.id}`);
  });

  test("open draft over published history keeps DRAFT badge AND latest version", async ({
    page,
  }) => {
    // Mixed state: a reopened draft coexisting with published versions must
    // show DRAFT (current draft is what a coach edits) while the retained
    // latest version stays visible — published history is never implied gone.
    const form = await prisma.onboardingForm.create({
      data: {
        workspaceId: wsId,
        name: "E2E P8 Seed Mixed",
        createdByMemberId: ownerMemberId,
        draftRevision: 4,
        draft: seedDefinition("E2E P8 Seed Mixed (draft)"),
        versions: {
          create: [
            {
              versionSeq: 1,
              definition: seedDefinition("E2E P8 Seed Mixed"),
              publishOriginRevision: 2,
              publishedByMemberId: ownerMemberId,
            },
            {
              versionSeq: 2,
              definition: seedDefinition("E2E P8 Seed Mixed v2"),
              publishOriginRevision: 3,
              publishedByMemberId: ownerMemberId,
            },
          ],
        },
      },
      select: { id: true },
    });
    const row = await listRow(page, "E2E P8 Seed Mixed");
    await expect(row.getByTestId("form-status-badge")).toHaveText("DRAFT");
    await expect(row.getByTestId("form-version")).toHaveText("v2");
    await expect(
      row.getByRole("link", { name: "E2E P8 Seed Mixed" }),
    ).toHaveAttribute("href", `/workspace/${wsId}/onboarding/forms/${form.id}`);
  });

  test("archived form renders ARCHIVED status and retained version", async ({
    page,
  }) => {
    const form = await prisma.onboardingForm.create({
      data: {
        workspaceId: wsId,
        name: "E2E P8 Seed Archived",
        createdByMemberId: ownerMemberId,
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedByMemberId: ownerMemberId,
        draftRevision: 2,
        draft: Prisma.DbNull,
        versions: {
          create: [
            {
              versionSeq: 1,
              definition: seedDefinition("E2E P8 Seed Archived"),
              publishOriginRevision: 2,
              publishedByMemberId: ownerMemberId,
            },
          ],
        },
      },
      select: { id: true },
    });
    const row = await listRow(page, "E2E P8 Seed Archived");
    await expect(row.getByTestId("form-status-badge")).toHaveText("ARCHIVED");
    await expect(row.getByTestId("form-version")).toHaveText("v1");
    await expect(
      row.getByRole("link", { name: "E2E P8 Seed Archived" }),
    ).toHaveAttribute("href", `/workspace/${wsId}/onboarding/forms/${form.id}`);
  });

  for (const width of [1440, 834, 390] as const) {
    test(`populated list has no horizontal overflow at ${width}px`, async ({
      page,
    }) => {
      // A real multi-row table — including a long name — must not push the
      // page viewport at any pinned width.
      const longTail = "longnamesegment".repeat(6); // 90 chars
      for (let i = 1; i <= 5; i += 1) {
        await prisma.onboardingForm.create({
          data: {
            workspaceId: wsId,
            name: i === 5 ? `E2E P8 Pop ${longTail}` : `E2E P8 Pop ${i} short`,
            createdByMemberId: ownerMemberId,
            draft: seedDefinition(`E2E P8 Pop ${i}`),
          },
          select: { id: true },
        });
      }
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, E2E.owner);
      await page.goto(`/workspace/${wsId}/onboarding/forms`);
      await expect(page.getByTestId("onboarding-forms-table")).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        ),
      ).toBe(false);
    });
  }
});

test.describe("empty list + controlled-pending create", () => {
  // Fixture-scoped cleanup, NOT broad deletion: only the reserved `E2E P8`
  // namespace inside this workspace is touched, before AND after each test,
  // so a created row can never leak into the next width's empty-state
  // assertion.
  test.beforeEach(removeFixtures);
  test.afterEach(removeFixtures);

  for (const width of [1440, 834, 390] as const) {
    test(`empty state + single-row create at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, E2E.owner);
      await page.goto(`/workspace/${wsId}/onboarding/forms`);
      await expect(page.getByTestId("onboarding-empty-state")).toBeVisible();
      await page.getByTestId("new-onboarding-form").click();
      await expect(page).toHaveURL(/onboarding\/forms\/new$/);
      await page.getByRole("button", { name: "Create form" }).click();
      // Empty name → safe validation message, stays on /new, no navigation.
      // Scoped to the create form: Next's route announcer also carries
      // role="alert" and must not satisfy this locator.
      await expect(page).toHaveURL(/onboarding\/forms\/new$/);
      await expect(
        page.getByTestId("create-onboarding-form").getByRole("alert"),
      ).toBeVisible();

      // Count every mutating request to the onboarding routes so a
      // double-submit can be detected at the network layer.
      const mutating: string[] = [];
      page.on("request", (req) => {
        if (req.method() !== "GET" && req.url().includes("/onboarding/forms"))
          mutating.push(`${req.method()} ${req.url()}`);
      });

      // Deterministic pending: hold the action POST at the network layer so
      // disabled-state assertions cannot race a fast server.
      let release!: () => void;
      const hold = new Promise<void>((r) => (release = r));
      await page.route(`**/onboarding/forms/new`, async (route) => {
        if (route.request().method() === "POST") {
          await hold;
        }
        await route.continue();
      });

      const submit = page.getByRole("button", { name: "Create form" });
      const input = page.getByTestId("form-name-input");
      await input.fill(`E2E P8 5C1 ${width}`);
      const storageBefore = await storageSnapshot(page);
      // Real keyboard submission — Enter in the focused input, not a click.
      await input.press("Enter");
      try {
        // BOTH name input and submit are disabled while pending.
        await expect(submit).toBeDisabled();
        await expect(input).toBeDisabled();
        // Hammer the submit path while the first request is held: more Enter
        // presses and further submit attempts must not produce a second
        // mutation request. Attempts on the disabled controls time out
        // quickly — the attempt itself is what matters.
        await page.keyboard.press("Enter");
        await page.keyboard.press("Enter");
        await submit.click({ timeout: 1_000 }).catch(() => {});
        await input.press("Enter", { timeout: 1_000 }).catch(() => {});
        expect(mutating).toHaveLength(1);
      } finally {
        // The held POST is ALWAYS released — including on assertion failure —
        // so the run can never wedge on an unresolved route handler.
        release();
      }

      // Navigation to the canonical editor route means the action resolved
      // ok:true — the literal `new` segment is excluded so a still-pending
      // /new URL can never satisfy this wait.
      await expect(page).toHaveURL(
        /onboarding\/forms\/(?!new$)[A-Za-z0-9_-]+$/,
      );
      // Creating a definition writes nothing to browser storage and leaves
      // exactly one row — a double-submit cannot duplicate.
      expect(await storageSnapshot(page)).toBe(storageBefore);
      const rows = await prisma.onboardingForm.count({
        where: { workspaceId: wsId, name: `E2E P8 5C1 ${width}` },
      });
      expect(rows).toBe(1);
    });
  }

  test("aborted action transport surfaces a safe inline error; retry succeeds", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(`/workspace/${wsId}/onboarding/forms`);
    await expect(page.getByTestId("onboarding-empty-state")).toBeVisible();
    await page.getByTestId("new-onboarding-form").click();
    await expect(page).toHaveURL(/onboarding\/forms\/new$/);

    const auditsBefore = await prisma.auditEvent.count({
      where: { resourceType: "onboarding_form" },
    });

    // Deterministic transport failure: the action POST is aborted at the
    // network layer before delivery — the server never sees it, so zero
    // DB/audit mutation is provable. This does NOT claim client-side
    // rollback: if a mutation raced past an abort point it would be a
    // different (server-side) failure mode.
    await page.route(`**/onboarding/forms/new`, async (route) => {
      if (route.request().method() === "POST") {
        await route.abort();
        return;
      }
      await route.continue();
    });

    const submit = page.getByRole("button", { name: "Create form" });
    const input = page.getByTestId("form-name-input");
    await input.fill("E2E P8 transport");
    await submit.click();

    // Safe inline failure inside the create form — the generic boundary
    // message, never a thrown transport exception, stack, or payload.
    await expect(
      page.getByTestId("create-onboarding-form").getByRole("alert"),
    ).toContainText("Something went wrong");
    // Pending cleared: both controls usable again, typed name preserved.
    await expect(submit).toBeEnabled();
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue("E2E P8 transport");
    // Stayed on /new; nothing was created or audited for the abort.
    await expect(page).toHaveURL(/onboarding\/forms\/new$/);
    expect(
      await prisma.onboardingForm.count({
        where: { workspaceId: wsId, name: "E2E P8 transport" },
      }),
    ).toBe(0);
    expect(
      await prisma.auditEvent.count({
        where: { resourceType: "onboarding_form" },
      }),
    ).toBe(auditsBefore);

    // Retry path stays usable: with the abort lifted the same name submits
    // cleanly and lands on the canonical editor route with exactly one row.
    await page.unroute(`**/onboarding/forms/new`);
    await submit.click();
    await expect(page).toHaveURL(/onboarding\/forms\/(?!new$)[A-Za-z0-9_-]+$/);
    expect(
      await prisma.onboardingForm.count({
        where: { workspaceId: wsId, name: "E2E P8 transport" },
      }),
    ).toBe(1);
  });
});

/**
 * 5C-2a editor mount + read guards — this slice owns ONLY the mount/read
 * surface: authorization, non-disclosure, and rendered read states. Editing
 * behavior (save/publish/reopen/preview) is out of scope and stays RED in
 * the lifecycle tests below. Ownership command: `-g "editor mount"`.
 */
test.describe("editor mount + read guards", () => {
  test.beforeEach(removeFixtures);
  test.afterEach(removeFixtures);

  const seedForm = (
    name: string,
    extra: Omit<
      Prisma.OnboardingFormUncheckedCreateInput,
      "workspaceId" | "name" | "createdByMemberId"
    > = {},
  ) =>
    prisma.onboardingForm.create({
      data: {
        workspaceId: wsId,
        name,
        createdByMemberId: ownerMemberId,
        draftRevision: 1,
        ...extra,
      },
      select: { id: true },
    });

  const MUTATION_TESTIDS = [
    "save-draft",
    "publish-form",
    "archive-form",
    "open-draft",
  ] as const;

  async function expectMountReadOnly(page: Page) {
    // Mount is READ-ONLY in EVERY state this slice, not only archived:
    // the name control is disabled, no named mutation control exists, and
    // the editor region contains no submit/button at all.
    await expect(page.getByTestId("form-name")).toBeDisabled();
    for (const testid of MUTATION_TESTIDS) {
      await expect(page.getByTestId(testid)).toHaveCount(0);
    }
    await expect(
      page
        .getByTestId("onboarding-form-editor")
        .locator("button, [type='submit']"),
    ).toHaveCount(0);
  }

  async function expectAllControlsDisabled(page: Page, region: string) {
    const controls = page
      .getByTestId(region)
      .locator("input,textarea,select,button");
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      await expect(controls.nth(i)).toBeDisabled();
    }
  }

  /**
   * Open-draft mount = editor-ready surface (ES-2 contract): name and
   * field inputs are ENABLED for metadata editing; local edit controls
   * (add/remove/move) may exist, but the ONLY server-mutation control is
   * a CLEAN (disabled) save. Reopen/publish/archive controls do not
   * exist in this slice.
   */
  async function expectEditorReady(page: Page) {
    await expect(page.getByTestId("form-name")).toBeEnabled();
    await expect(page.getByTestId("save-draft")).toBeVisible();
    await expect(page.getByTestId("save-draft")).toBeDisabled();
    for (const testid of ["publish-form", "archive-form", "open-draft"]) {
      await expect(page.getByTestId(testid)).toHaveCount(0);
    }
    await expect(
      page.getByTestId("onboarding-form-editor").locator("[type='submit']"),
    ).toHaveCount(0);
  }

  test("unauthenticated deep link to the editor redirects to /login", async ({
    page,
  }) => {
    await page.goto(`/workspace/${wsId}/onboarding/forms/not-a-real-id`);
    await expect(page).toHaveURL(/\/login/);
  });

  test("denied-role deep links get the identical non-disclosing 403", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8 Mount Denied", {
      draft: seedDefinition("E2E P8 Mount Denied"),
    });
    const path = `/workspace/${wsId}/onboarding/forms/${form.id}`;
    // The assistant is the discriminating probe: it passes the staff layout
    // but lacks the resource — the editor page itself must deny. Other
    // denied roles may 403 earlier; the visible denial must be identical
    // either way and must never render the form name.
    for (const email of [
      E2E.assistant,
      E2E.client,
      E2E.support,
      E2E.nonmember,
    ]) {
      await signIn(page, email);
      const res = await page.goto(path);
      expect(res?.status()).toBe(403);
      await expect(page.getByTestId("access-denied")).toBeVisible();
      await expect(page.getByTestId("onboarding-form-editor")).toHaveCount(0);
      await expect(page.getByText("E2E P8 Mount Denied")).toHaveCount(0);
    }
  });

  test("dual-member isolation: wsA form under a wsB URL renders the IDENTICAL denial as nonexistent", async ({
    page,
  }) => {
    // The owner is a member of BOTH fixture workspaces — passing the layout
    // AND resource authorization in wsB, so a wsA formId under a wsB URL
    // exercises the resource-level workspace scoping, not nonmembership.
    const form = await seedForm("E2E P8 Foreign", {
      draft: seedDefinition("E2E P8 Foreign"),
    });
    await signIn(page, E2E.owner);
    const foreign = await page.goto(
      `/workspace/${wsBId}/onboarding/forms/${form.id}`,
    );
    expect(foreign?.status()).toBe(403);
    await expect(page.getByTestId("access-denied")).toBeVisible();
    await expect(page.getByText("E2E P8 Foreign")).toHaveCount(0);
    const foreignDenial =
      (await page.getByTestId("access-denied").textContent()) ?? "";
    // Same workspace URL shape, a formId that exists nowhere — status AND
    // the visible denial content must be indistinguishable. (Raw body
    // comparison is impossible: the RSC flight payload embeds the URL
    // segments — only the VISIBLE denial region is compared.)
    const missing = await page.goto(
      `/workspace/${wsBId}/onboarding/forms/missingformid123`,
    );
    expect(missing?.status()).toBe(403);
    await expect(page.getByTestId("access-denied")).toBeVisible();
    await expect(page.getByTestId("onboarding-form-editor")).toHaveCount(0);
    expect(await page.getByTestId("access-denied").textContent()).toBe(
      foreignDenial,
    );
    // And inside wsA itself: nonexistent == the same denial, not a 404 or
    // partial render that would leak the workspace's forms.
    const missingA = await page.goto(
      `/workspace/${wsId}/onboarding/forms/missingformid123`,
    );
    expect(missingA?.status()).toBe(403);
    await expect(page.getByTestId("access-denied")).toBeVisible();
  });

  test("nonexistent and malformed formIds fail closed identically", async ({
    page,
  }) => {
    await seedForm("E2E P8 Real Name", {
      draft: seedDefinition("E2E P8 Real Name"),
    });
    await signIn(page, E2E.owner);
    for (const bad of ["missingformid123", "not!valid!segment"]) {
      const res = await page.goto(`/workspace/${wsId}/onboarding/forms/${bad}`);
      expect(res?.status()).toBe(403);
      await expect(page.getByTestId("access-denied")).toBeVisible();
      await expect(page.getByText("E2E P8 Real Name")).toHaveCount(0);
    }
  });

  test("active form with an open draft mounts READ-ONLY: name + draft visible, zero mutation surface", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8 Mount Draft", {
      draft: seedDefinition("E2E P8 Mount Draft"),
    });
    const before = await workspaceSnapshot();
    await signIn(page, E2E.coach);
    // EVERY non-GET post-signin on ANY path — the mount itself must write
    // nothing at all (no onboarding-only scoping).
    const mutating = trackNonGet(page);
    const res = await page.goto(
      `/workspace/${wsId}/onboarding/forms/${form.id}`,
    );
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("onboarding-form-editor")).toBeVisible();
    await expect(page.getByTestId("form-name")).toHaveValue(
      "E2E P8 Mount Draft",
    );
    await expect(page.getByTestId("draft-editor")).toBeVisible();
    await expect(page.getByTestId("no-draft")).toHaveCount(0);
    // Open draft mounts EDITOR-READY: metadata inputs enabled, the only
    // button is a clean disabled save — still zero mutation traffic.
    await expectEditorReady(page);
    await expect(page.getByTestId("field-label-0")).toBeEnabled();
    await expect(page.getByTestId("field-label-0")).toHaveValue("Full name");
    // Mount issues ZERO mutating requests on any path, and the complete
    // workspace state is byte-identical — serialized forms (name/status/
    // draft/revision/updatedAt/editor+archival stamps), all version rows,
    // all audit rows.
    expect(mutating).toEqual([]);
    expect(await workspaceSnapshot()).toEqual(before);
  });

  test("active form without a draft mounts the no-draft read state", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8 Mount Published", {
      draft: Prisma.DbNull,
      versions: {
        create: [
          {
            versionSeq: 1,
            definition: seedDefinition("E2E P8 Mount Published"),
            publishOriginRevision: 1,
            publishedByMemberId: ownerMemberId,
          },
        ],
      },
    });
    const before = await workspaceSnapshot();
    await signIn(page, E2E.owner);
    const mutating = trackNonGet(page);
    const res = await page.goto(
      `/workspace/${wsId}/onboarding/forms/${form.id}`,
    );
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("onboarding-form-editor")).toBeVisible();
    await expect(page.getByTestId("form-name")).toHaveValue(
      "E2E P8 Mount Published",
    );
    await expect(page.getByTestId("no-draft")).toBeVisible();
    await expect(page.getByTestId("draft-editor")).toHaveCount(0);
    await expectMountReadOnly(page);
    expect(mutating).toEqual([]);
    expect(await workspaceSnapshot()).toEqual(before);
  });

  test("archived form mounts permanently read-only: banner, no mutation controls", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8 Mount Archived", {
      status: "ARCHIVED",
      archivedAt: new Date(),
      archivedByMemberId: ownerMemberId,
      draft: Prisma.DbNull,
      versions: {
        create: [
          {
            versionSeq: 1,
            definition: seedDefinition("E2E P8 Mount Archived"),
            publishOriginRevision: 1,
            publishedByMemberId: ownerMemberId,
          },
        ],
      },
    });
    const before = await workspaceSnapshot();
    await signIn(page, E2E.owner);
    const mutating = trackNonGet(page);
    const res = await page.goto(
      `/workspace/${wsId}/onboarding/forms/${form.id}`,
    );
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("onboarding-form-editor")).toBeVisible();
    await expect(page.getByTestId("form-name")).toHaveValue(
      "E2E P8 Mount Archived",
    );
    await expect(page.getByTestId("archived-banner")).toBeVisible();
    // Permanently read-only: reopen is NEVER offered on an archived form,
    // and no save/publish/archive control may render at all.
    await expectMountReadOnly(page);
    expect(mutating).toEqual([]);
    expect(await workspaceSnapshot()).toEqual(before);
  });

  test("archived form WITH a preserved draft renders its content read-only", async ({
    page,
  }) => {
    // An archived form may still hold draft content — it must render so the
    // coach can see what was frozen, but nothing can become editable.
    const form = await seedForm("E2E P8 Mount Archived Draft", {
      status: "ARCHIVED",
      archivedAt: new Date(),
      archivedByMemberId: ownerMemberId,
      draft: seedDefinition("E2E P8 Mount Archived Draft"),
      versions: {
        create: [
          {
            versionSeq: 1,
            definition: seedDefinition("E2E P8 Mount Archived Draft"),
            publishOriginRevision: 1,
            publishedByMemberId: ownerMemberId,
          },
        ],
      },
    });
    const before = await workspaceSnapshot();
    await signIn(page, E2E.owner);
    const mutating = trackNonGet(page);
    const res = await page.goto(
      `/workspace/${wsId}/onboarding/forms/${form.id}`,
    );
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("onboarding-form-editor")).toBeVisible();
    await expect(page.getByTestId("archived-banner")).toBeVisible();
    await expect(page.getByTestId("draft-editor")).toBeVisible();
    await expect(page.getByTestId("draft-editor")).toContainText("Full name");
    await expectMountReadOnly(page);
    await expectAllControlsDisabled(page, "draft-editor");
    expect(mutating).toEqual([]);
    expect(await workspaceSnapshot()).toEqual(before);
  });

  for (const width of [1440, 834, 390] as const) {
    test(`mounted editor has no horizontal overflow at ${width}px`, async ({
      page,
    }) => {
      const form = await seedForm("E2E P8 Mount Width", {
        draft: seedDefinition("E2E P8 Mount Width"),
      });
      const before = await workspaceSnapshot();
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, E2E.coach);
      const mutating = trackNonGet(page);
      await page.goto(`/workspace/${wsId}/onboarding/forms/${form.id}`);
      await expect(page.getByTestId("onboarding-form-editor")).toBeVisible();
      await expectEditorReady(page);
      expect(mutating).toEqual([]);
      expect(await workspaceSnapshot()).toEqual(before);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        ),
      ).toBe(false);
    });

    test(`local metadata edits arm save — zero network/storage/DB delta at ${width}px`, async ({
      page,
    }) => {
      // ES-2A standalone case: editing EXISTING metadata (name + a field
      // label) is client-local only. Dirty arming enables the save control
      // but NOTHING is sent — no non-GET request, no web-storage write, no
      // workspace DB delta. Save wiring itself stays ES-3.
      const form = await seedForm(`E2E P8 Local Edit ${width}`, {
        draft: seedDefinition(`E2E P8 Local Edit ${width}`),
      });
      const before = await workspaceSnapshot();
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, E2E.coach);
      const mutating = trackNonGet(page);
      await page.goto(`/workspace/${wsId}/onboarding/forms/${form.id}`);
      await expect(page.getByTestId("onboarding-form-editor")).toBeVisible();
      await expectEditorReady(page);
      const storageBefore = await storageSnapshot(page);
      await page
        .getByTestId("form-name")
        .fill(`E2E P8 Local Edit ${width} (edited)`);
      await page.getByTestId("field-label-0").fill("Edited label");
      // Dirty arming must hold the EDITED values and enable the clean save.
      await expect(page.getByTestId("form-name")).toHaveValue(
        `E2E P8 Local Edit ${width} (edited)`,
      );
      await expect(page.getByTestId("field-label-0")).toHaveValue(
        "Edited label",
      );
      await expect(page.getByTestId("save-draft")).toBeEnabled();
      // Still zero mutation traffic, zero storage delta, byte-identical DB.
      expect(mutating).toEqual([]);
      expect(await storageSnapshot(page)).toBe(storageBefore);
      expect(await workspaceSnapshot()).toEqual(before);
    });

    // ES-2B client-local structure phase: add/remove/move field and
    // add/remove option are local edits — they arm the save but send
    // NOTHING (same zero-delta contract as metadata edits). Runs RED on
    // the ES-2A head where the structure handlers are still inert.
    test(`local structure edits arm save — zero network/storage/DB delta at ${width}px`, async ({
      page,
    }) => {
      const form = await seedForm(`E2E P8 Local Struct ${width}`, {
        draft: seedDefinition(`E2E P8 Local Struct ${width}`),
      });
      const before = await workspaceSnapshot();
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, E2E.coach);
      const mutating = trackNonGet(page);
      await page.goto(`/workspace/${wsId}/onboarding/forms/${form.id}`);
      await expect(page.getByTestId("onboarding-form-editor")).toBeVisible();
      await expectEditorReady(page);
      const storageBefore = await storageSnapshot(page);
      // The seeded draft has one shortText field at index 0.
      await page.getByTestId("add-field-singleChoice").click();
      await expect(page.getByTestId("field-label-1")).toHaveCount(1);
      await expect(
        page.getByTestId("field-options-1").getByPlaceholder("Option label"),
      ).toHaveCount(1);
      await page.getByTestId("add-option-1").click();
      await expect(
        page.getByTestId("field-options-1").getByPlaceholder("Option label"),
      ).toHaveCount(2);
      // Move the new choice field above the seeded field.
      await page.getByLabel("Move field 2 up").click();
      await expect(
        page.getByTestId("field-options-0").getByPlaceholder("Option label"),
      ).toHaveCount(2);
      await expect(page.getByTestId("field-label-1")).toHaveValue("Full name");
      // Remove the seeded field — the choice field survives at index 0.
      await page.getByLabel("Remove field 2").click();
      await expect(page.getByTestId("field-label-1")).toHaveCount(0);
      await expect(
        page.getByTestId("field-options-0").getByPlaceholder("Option label"),
      ).toHaveCount(2);
      // Dirty arming holds; still zero mutation traffic/storage/DB delta.
      await expect(page.getByTestId("save-draft")).toBeEnabled();
      expect(mutating).toEqual([]);
      expect(await storageSnapshot(page)).toBe(storageBefore);
      expect(await workspaceSnapshot()).toEqual(before);
    });
  }
});

test.describe("editor save foundation", () => {
  test.beforeEach(removeFixtures);
  test.afterEach(removeFixtures);

  const seedForm = (
    name: string,
    extra: Omit<
      Prisma.OnboardingFormUncheckedCreateInput,
      "workspaceId" | "name" | "createdByMemberId"
    > = {},
  ) =>
    prisma.onboardingForm.create({
      data: {
        workspaceId: wsId,
        name,
        createdByMemberId: ownerMemberId,
        draftRevision: 1,
        ...extra,
      },
      select: { id: true },
    });

  const coachMember = () =>
    prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsId, role: "COACH", status: "ACTIVE" },
    });

  const draftFields = async (formId: string) =>
    (
      (
        await prisma.onboardingForm.findUniqueOrThrow({
          where: { id: formId },
          select: { draft: true },
        })
      ).draft as {
        fields: {
          fieldId: string;
          kind: string;
          label: string;
          required: boolean;
          order: number;
          helpText?: string;
          options?: { optionId: string; label: string }[];
        }[];
      }
    ).fields.slice();

  test("coach edits all six kinds, adds/removes/reorders, and saves twice with stable server IDs", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8 SaveBase", {
      draft: seedDefinition("E2E P8 SaveBase"),
    });
    const coach = await coachMember();
    await signIn(page, E2E.coach);
    await page.goto(`/workspace/${wsId}/onboarding/forms/${form.id}`);
    await expect(page.getByTestId("onboarding-form-editor")).toBeVisible();
    await expect(page.getByTestId("form-name")).toBeEnabled();
    // Not dirty yet — save cannot fire.
    await expect(page.getByTestId("save-draft")).toBeDisabled();
    // Slice boundary: reopen/publish/archive controls do not exist in
    // 5C-2b-1; the seeded draft row already exists.
    for (const testid of ["publish-form", "archive-form", "open-draft"]) {
      await expect(page.getByTestId(testid)).toHaveCount(0);
    }
    // Seeded shortText field visible with its label.
    await expect(page.getByTestId("field-label-0")).toHaveValue("Full name");

    // All editing is client-local until save — zero requests on any path,
    // and no browser storage is touched.
    const storageBefore = await storageSnapshot(page);
    const editPhase = trackNonGet(page);
    const kinds = [
      "longText",
      "number",
      "date",
      "singleChoice",
      "multiChoice",
    ] as const;
    for (const [i, kind] of kinds.entries()) {
      await page.getByTestId(`add-field-${kind}`).click();
      await page.getByTestId(`field-label-${i + 1}`).fill(`Q ${kind}`);
    }
    // Options are definition metadata for the choice kinds — including a
    // real option REMOVAL: Option B must not persist.
    await page
      .getByTestId("field-options-4")
      .getByPlaceholder("Option label")
      .fill("Option A");
    await page.getByTestId("add-option-4").click();
    await page
      .getByTestId("field-options-4")
      .getByPlaceholder("Option label")
      .nth(1)
      .fill("Option B");
    await page
      .getByTestId("field-options-4")
      .getByLabel("Remove option 2")
      .click();
    await page
      .getByTestId("field-options-5")
      .getByPlaceholder("Option label")
      .fill("Option X");
    // Required + helpText are definition metadata too.
    await page.getByTestId("field-required-0").check();
    await page.getByTestId("field-help-0").fill("Shown under the label");
    // Field removal: add a seventh throwaway field then remove it.
    await page.getByTestId("add-field-shortText").click();
    await page.getByTestId("field-label-6").fill("Throwaway");
    await page.getByLabel("Remove field 7").click();
    await expect(page.getByTestId("field-label-6")).toHaveCount(0);
    // Reorder: move multiChoice (last of the remaining six) up once.
    await page.getByLabel("Move field 6 up").click();
    // Dirty now — save enabled; still zero requests during the edit phase.
    await expect(page.getByTestId("save-draft")).toBeEnabled();
    expect(editPhase).toEqual([]);
    expect(await storageSnapshot(page)).toBe(storageBefore);

    // Save #1 — intentionally padded label proves the server-normalized
    // result re-seeds the inputs. cleanText TRIMS OUTER whitespace only —
    // inner spacing is preserved verbatim ("  Padded   name  " →
    // "Padded   name"); the service has no whitespace-collapse policy.
    await page.getByTestId("field-label-0").fill("  Padded   name  ");
    const saves = trackNonGet(page);
    await page.getByTestId("save-draft").click();
    await expect
      .poll(async () => {
        const f = await prisma.onboardingForm.findUniqueOrThrow({
          where: { id: form.id },
        });
        return f.draftRevision;
      })
      .toBe(2);
    expect(saves.filter((r) => r.startsWith("POST"))).toHaveLength(1);
    const first = await draftFields(form.id);
    // ALL SIX kinds persist through the save — longText retained.
    expect(first).toHaveLength(6);
    // Normalized: outer-trimmed label persisted AND the input re-seeded.
    expect(first.find((f) => f.order === 0)?.label).toBe("Padded   name");
    await expect(page.getByTestId("field-label-0")).toHaveValue(
      "Padded   name",
    );
    expect(first.find((f) => f.order === 0)?.required).toBe(true);
    expect(first.find((f) => f.order === 0)?.helpText).toBe(
      "Shown under the label",
    );
    // Reorder persisted: multiChoice now sits at order 4, singleChoice 5.
    const byOrder = [...first].sort((a, b) => a.order - b.order);
    expect(byOrder.map((f) => f.kind)).toEqual([
      "shortText",
      "longText",
      "number",
      "date",
      "multiChoice",
      "singleChoice",
    ]);
    expect(byOrder[4].options?.map((o) => o.label)).toEqual(["Option X"]);
    // The removed option did NOT persist — singleChoice keeps only A.
    expect(byOrder[5].options?.map((o) => o.label)).toEqual(["Option A"]);
    // Every field/option carries a server-minted id; the coach saved it.
    const firstIds = byOrder.map((f) => ({
      fieldId: f.fieldId,
      optionIds: (f.options ?? []).map((o) => o.optionId),
    }));
    for (const f of firstIds) expect(f.fieldId).toBeTruthy();
    expect(
      (
        await prisma.onboardingForm.findUniqueOrThrow({
          where: { id: form.id },
        })
      ).draftSavedByMemberId,
    ).toBe(coach.id);
    // Save cleared dirty — the button is disabled until the next edit.
    await expect(page.getByTestId("save-draft")).toBeDisabled();

    // Save #2 — rename + label edit; EVERY field/option id round-trips.
    // The name is PADDED: the server normalizes it (trim-only), the DB
    // row must hold the trimmed value AND the input must re-seed to the
    // server's normalized name — never keep the raw client padding.
    await page.getByTestId("form-name").fill("  E2E P8 SaveBase renamed  ");
    await page.getByTestId("field-label-0").fill("Renamed question");
    await page.getByTestId("save-draft").click();
    await expect
      .poll(async () => {
        const f = await prisma.onboardingForm.findUniqueOrThrow({
          where: { id: form.id },
        });
        return f.draftRevision;
      })
      .toBe(3);
    const second = await draftFields(form.id);
    expect(
      [...second]
        .sort((a, b) => a.order - b.order)
        .map((f) => ({
          fieldId: f.fieldId,
          optionIds: (f.options ?? []).map((o) => o.optionId),
        })),
    ).toEqual(firstIds);
    const row = await prisma.onboardingForm.findUniqueOrThrow({
      where: { id: form.id },
    });
    expect(row.name).toBe("E2E P8 SaveBase renamed");
    // The normalized draft title matches, and the INPUT reflects the
    // server's value — not the padded client text.
    expect((row.draft as { title: string }).title).toBe(
      "E2E P8 SaveBase renamed",
    );
    await expect(page.getByTestId("form-name")).toHaveValue(
      "E2E P8 SaveBase renamed",
    );
    // No version was minted by saves, and no row was duplicated.
    expect(
      await prisma.onboardingFormVersion.count({ where: { formId: form.id } }),
    ).toBe(0);
    expect(
      await prisma.onboardingForm.count({
        where: { workspaceId: wsId, name: { startsWith: "E2E P8 SaveBase" } },
      }),
    ).toBe(1);
  });

  test("all edit controls disable while a save is in flight, then re-enable", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8 SavePending", {
      draft: seedDefinition("E2E P8 SavePending"),
    });
    await signIn(page, E2E.coach);
    await page.goto(`/workspace/${wsId}/onboarding/forms/${form.id}`);
    await page.getByTestId("field-label-0").fill("Edited");
    // Hold the save POST so the pending window is observable: `intercepted`
    // resolves only when the request is actually in flight (never a
    // release-placeholder race), and `releaseGate` frees it from finally
    // so a failed assertion can never wedge the test.
    let interceptedResolve: () => void = () => {};
    let releaseResolve: () => void = () => {};
    const intercepted = new Promise<void>((r) => (interceptedResolve = r));
    const releaseGate = new Promise<void>((r) => (releaseResolve = r));
    let postCount = 0;
    await page.route(/onboarding\/forms/, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      postCount += 1;
      interceptedResolve();
      await releaseGate;
      await route.continue();
    });
    // waitForResponse BEFORE unrouteAll — removing the route mid-hold
    // leaves the request hanging (route.continue races the route's
    // teardown), so the response gate is awaited first.
    const responseDone = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/onboarding/forms/"),
    );
    try {
      await page.getByTestId("save-draft").click();
      await intercepted; // the write is genuinely in flight
      // Every mutation-capable control is inert while the write is in
      // flight — edits, adds, removes, reorders, options, name, save.
      for (const testid of [
        "form-name",
        "field-label-0",
        "add-field-shortText",
        "add-field-singleChoice",
        "save-draft",
      ]) {
        await expect(page.getByTestId(testid)).toBeDisabled();
      }
      await expect(page.getByLabel("Remove field 1")).toBeDisabled();
    } finally {
      releaseResolve();
      await responseDone;
      await page.unrouteAll();
    }
    // Exactly ONE write was attempted for the single press.
    expect(postCount).toBe(1);
    // Clean after save: metadata enabled, save disabled until new edits.
    await expect(page.getByTestId("save-draft")).toBeDisabled();
    await expect(page.getByTestId("field-label-0")).toBeEnabled();
    await expect
      .poll(async () => {
        const f = await prisma.onboardingForm.findUniqueOrThrow({
          where: { id: form.id },
        });
        return f.draftRevision;
      })
      .toBe(2);
    // A fresh edit re-arms the button.
    await page.getByTestId("field-label-0").fill("Edited again");
    await expect(page.getByTestId("save-draft")).toBeEnabled();
  });

  test("stale revision surfaces a safe inline alert and preserves unsaved edits", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8 SaveStale", {
      draft: seedDefinition("E2E P8 SaveStale"),
    });
    await signIn(page, E2E.coach);
    await page.goto(`/workspace/${wsId}/onboarding/forms/${form.id}`);
    await page.getByTestId("field-label-0").fill("Unsaved local edit");
    const storageBefore = await storageSnapshot(page);
    const dbBefore = await prisma.onboardingForm.findUniqueOrThrow({
      where: { id: form.id },
    });
    const auditsBefore = await prisma.auditEvent.count({
      where: { resourceType: "onboarding_form" },
    });
    // Another actor saved first — the mounted revision is now stale. This
    // is the ONE intentional external write; everything else must be a
    // zero delta — no stale overwrite of draft, name, stamps or audit.
    await prisma.onboardingForm.update({
      where: { id: form.id },
      data: { draftRevision: 2 },
    });
    await page.getByTestId("save-draft").click();
    // Safe scoped inline alert — the stale_revision typed message, no
    // code, no payload echo.
    await expect(
      page.getByTestId("onboarding-form-editor").getByRole("alert"),
    ).toContainText(
      "This form changed while you were editing. Reload and try again.",
    );
    // The unsaved edit is preserved, save re-enables, and the server draft
    // was NOT overwritten by the rejected attempt — the only difference
    // from the pre-save row is the external revision bump itself.
    await expect(page.getByTestId("field-label-0")).toHaveValue(
      "Unsaved local edit",
    );
    await expect(page.getByTestId("save-draft")).toBeEnabled();
    const after = await prisma.onboardingForm.findUniqueOrThrow({
      where: { id: form.id },
    });
    expect(after.draft).toEqual(dbBefore.draft);
    expect(after.name).toBe(dbBefore.name);
    expect(after.draftRevision).toBe(2);
    expect(after.draftSavedByMemberId).toBe(dbBefore.draftSavedByMemberId);
    expect(
      await prisma.auditEvent.count({
        where: { resourceType: "onboarding_form" },
      }),
    ).toBe(auditsBefore);
    expect(await storageSnapshot(page)).toBe(storageBefore);
  });

  test("aborted save transport preserves unsaved edits; explicit retry succeeds once", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8 SaveAbort", {
      draft: seedDefinition("E2E P8 SaveAbort"),
    });
    await signIn(page, E2E.coach);
    await page.goto(`/workspace/${wsId}/onboarding/forms/${form.id}`);
    await page.getByTestId("field-label-0").fill("Edit before abort");
    const storageBefore = await storageSnapshot(page);
    const before = await workspaceSnapshot();
    // Abort the action POST before delivery — zero mutation is provable;
    // an unknown outcome is never blindly retried (user must re-press).
    await page.route(/onboarding\/forms/, async (route) => {
      if (route.request().method() === "POST") return route.abort();
      return route.continue();
    });
    await page.getByTestId("save-draft").click();
    await expect(
      page.getByTestId("onboarding-form-editor").getByRole("alert"),
    ).toContainText("Something went wrong. Please try again in a moment.");
    await expect(page.getByTestId("field-label-0")).toHaveValue(
      "Edit before abort",
    );
    await expect(page.getByTestId("save-draft")).toBeEnabled();
    // A before-delivery abort is a PROVEN zero mutation — the complete
    // workspace state is byte-identical, not merely the revision.
    expect(await workspaceSnapshot()).toEqual(before);
    expect(await storageSnapshot(page)).toBe(storageBefore);
    // Explicit user retry — exactly one mutation, revision 2.
    await page.unrouteAll();
    const retry = trackNonGet(page);
    await page.getByTestId("save-draft").click();
    await expect
      .poll(async () => {
        const f = await prisma.onboardingForm.findUniqueOrThrow({
          where: { id: form.id },
        });
        return f.draftRevision;
      })
      .toBe(2);
    expect(retry.filter((r) => r.startsWith("POST"))).toHaveLength(1);
  });

  test("committed-but-lost response reconciles safely — stale retry cannot double-apply", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8 SaveLost", {
      draft: seedDefinition("E2E P8 SaveLost"),
    });
    await signIn(page, E2E.coach);
    await page.goto(`/workspace/${wsId}/onboarding/forms/${form.id}`);
    await page.getByTestId("field-label-0").fill("Committed then lost");
    const auditsBefore = await prisma.auditEvent.count({
      where: { resourceType: "onboarding_form" },
    });
    // The server COMMITS the save, then the response is dropped — the
    // client sees a failure for a mutation that actually landed (the
    // genuinely unknown outcome, not a before-delivery abort).
    await page.route(/onboarding\/forms/, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fetch();
      return route.abort();
    });
    await page.getByTestId("save-draft").click();
    await expect(
      page.getByTestId("onboarding-form-editor").getByRole("alert"),
    ).toContainText("Something went wrong. Please try again in a moment.");
    await page.unrouteAll();
    // The mutation DID land: revision 2 committed server-side despite the
    // failure surfaced to the user.
    await expect
      .poll(async () => {
        const f = await prisma.onboardingForm.findUniqueOrThrow({
          where: { id: form.id },
        });
        return f.draftRevision;
      })
      .toBe(2);
    // The client still believes the mounted revision (1) — its explicit
    // retry must CONFLICT SAFELY on the stale guard: a second typed
    // rejection, no duplicate write, no second audit event. Reconciliation
    // is the revision check — a second press does NOT intrinsically
    // prevent a double-apply.
    await page.getByTestId("save-draft").click();
    await expect(
      page.getByTestId("onboarding-form-editor").getByRole("alert"),
    ).toContainText(
      "This form changed while you were editing. Reload and try again.",
    );
    const after = await prisma.onboardingForm.findUniqueOrThrow({
      where: { id: form.id },
    });
    expect(after.draftRevision).toBe(2);
    expect(
      (after.draft as { fields: { label: string }[] }).fields[0].label,
    ).toBe("Committed then lost");
    expect(
      await prisma.auditEvent.count({
        where: { resourceType: "onboarding_form" },
      }),
    ).toBe(auditsBefore + 1);
  });

  // ES-3 prep pin (Apollo release 2e49379d / Orion advance-contract):
  // a save triggered by ONLY a field edit must keep the seeded name —
  // the payload always carries the mounted name, never an empty title.
  test("a field-only save preserves the seeded form name — never an empty name", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8 FieldOnly", {
      draft: seedDefinition("E2E P8 FieldOnly"),
    });
    await signIn(page, E2E.coach);
    await page.goto(`/workspace/${wsId}/onboarding/forms/${form.id}`);
    await expect(page.getByTestId("onboarding-form-editor")).toBeVisible();
    // Edit ONLY a field label; the name input is never touched.
    await page.getByTestId("field-label-0").fill("Renamed question only");
    await page.getByTestId("save-draft").click();
    await expect
      .poll(async () => {
        const f = await prisma.onboardingForm.findUniqueOrThrow({
          where: { id: form.id },
        });
        return f.draftRevision;
      })
      .toBe(2);
    const row = await prisma.onboardingForm.findUniqueOrThrow({
      where: { id: form.id },
    });
    // Row name and draft title both keep the seeded name — a blank
    // title would have emptied the saved row name.
    expect(row.name).toBe("E2E P8 FieldOnly");
    expect((row.draft as { title: string }).title).toBe("E2E P8 FieldOnly");
    await expect(page.getByTestId("form-name")).toHaveValue("E2E P8 FieldOnly");
    expect((row.draft as { fields: { label: string }[] }).fields[0].label).toBe(
      "Renamed question only",
    );
  });

  test("dirty edits are discarded on reload — persisted state renders, nothing auto-saves", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8 SaveReload", {
      draft: seedDefinition("E2E P8 SaveReload"),
    });
    await signIn(page, E2E.coach);
    await page.goto(`/workspace/${wsId}/onboarding/forms/${form.id}`);
    await page.getByTestId("field-label-0").fill("Never-saved edit");
    // The edit must genuinely be dirty client-side BEFORE the reload —
    // save enabled proves the editor registered it, so the post-reload
    // assertion cannot be satisfied by an edit that never took.
    await expect(page.getByTestId("save-draft")).toBeEnabled();
    const storageBefore = await storageSnapshot(page);
    const before = await workspaceSnapshot();
    const mutating = trackNonGet(page);
    await page.reload();
    await expect(page.getByTestId("draft-editor")).toBeVisible();
    // Reload renders the last persisted draft — the unsaved edit is gone
    // and nothing was auto-saved (no requests, zero DB or storage delta).
    // NOTE: this proves fresh-mount renders persisted state; the
    // revalidated-props-while-dirty clobber contract is pinned by the
    // pure seam (tests/unit/onboarding-draft-editor.test.ts) AND the
    // real-component DOM harness (onboarding-draft-editor.dom.test.tsx).
    await expect(page.getByTestId("field-label-0")).toHaveValue("Full name");
    expect(mutating).toEqual([]);
    expect(await workspaceSnapshot()).toEqual(before);
    expect(await storageSnapshot(page)).toBe(storageBefore);
  });

  // Dedicated gap-1 checkpoint: clicking a choice-kind add control must
  // create exactly ONE blank option input. This MUST fail on the inert
  // scaffold by the missing option row — never a missing route/module.
  for (const kind of ["singleChoice", "multiChoice"] as const) {
    test(`adding a ${kind} field seeds exactly one blank option input`, async ({
      page,
    }) => {
      const form = await seedForm(`E2E P8 BlankOpt ${kind}`, {
        draft: seedDefinition(`E2E P8 BlankOpt ${kind}`),
      });
      await signIn(page, E2E.coach);
      await page.goto(`/workspace/${wsId}/onboarding/forms/${form.id}`);
      await expect(page.getByTestId("onboarding-form-editor")).toBeVisible();
      // The seeded draft has one shortText field at index 0 — the new
      // choice field lands at index 1 with its single blank option.
      await page.getByTestId(`add-field-${kind}`).click();
      const options = page
        .getByTestId("field-options-1")
        .getByPlaceholder("Option label");
      await expect(options).toHaveCount(1);
      await expect(options.first()).toHaveValue("");
    });
  }

  for (const width of [1440, 834, 390] as const) {
    test(`editing + save round-trips with no overflow at ${width}px`, async ({
      page,
    }) => {
      const form = await seedForm(`E2E P8 Save ${width}`, {
        draft: seedDefinition(`E2E P8 Save ${width}`),
      });
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, E2E.coach);
      await page.goto(`/workspace/${wsId}/onboarding/forms/${form.id}`);
      await page.getByTestId("add-field-multiChoice").click();
      await page.getByTestId("field-label-1").fill(`Width ${width} choice`);
      await page
        .getByTestId("field-options-1")
        .getByPlaceholder("Option label")
        .fill("Opt");
      await page.getByTestId("save-draft").click();
      await expect
        .poll(async () => {
          const f = await prisma.onboardingForm.findUniqueOrThrow({
            where: { id: form.id },
          });
          return f.draftRevision;
        })
        .toBe(2);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        ),
      ).toBe(false);
    });
  }
});

test("owner creates, edits, publishes, reopens, v2, and archives", async ({
  page,
}) => {
  const mutating: string[] = [];
  page.on("request", (req) => {
    if (req.method() !== "GET") mutating.push(`${req.method()} ${req.url()}`);
  });

  await signIn(page, E2E.owner);
  await page.goto(`/workspace/${wsId}/onboarding/forms`);
  await page.getByTestId("new-onboarding-form").click();
  await page.getByTestId("form-name-input").fill("E2E P8 Intake");
  await page.getByRole("button", { name: "Create form" }).click();
  await expect(page.getByTestId("onboarding-form-editor")).toBeVisible();

  // Add a short-text field + a single-choice field, then save.
  await page.getByTestId("add-field-shortText").click();
  await page.getByTestId("field-label-0").fill("Full name");
  await page.getByTestId("add-field-singleChoice").click();
  await page.getByTestId("field-label-1").fill("Goal");
  await page
    .getByTestId("field-options-1")
    .getByPlaceholder("Option label")
    .first()
    .fill("Fat loss");
  await page.getByTestId("add-option-1").click();
  await page
    .getByTestId("field-options-1")
    .getByPlaceholder("Option label")
    .nth(1)
    .fill("Muscle");
  await page.getByTestId("save-draft").click();
  // Save completed when the draft revision bumps server-side.
  await expect
    .poll(async () => {
      const f = await prisma.onboardingForm.findFirst({
        where: { workspaceId: wsId, name: "E2E P8 Intake" },
      });
      return f?.draftRevision;
    })
    .toBe(2);
  const form = await prisma.onboardingForm.findFirstOrThrow({
    where: { workspaceId: wsId, name: "E2E P8 Intake" },
  });
  const draftIds = (form.draft as { fields: { fieldId: string }[] }).fields.map(
    (f) => f.fieldId,
  );
  expect(draftIds).toHaveLength(2);

  // Second save (rename) — field IDs must round-trip unchanged server-side.
  await page.getByTestId("field-label-0").fill("Your full name");
  await page.getByTestId("save-draft").click();
  await expect
    .poll(async () => {
      const f = await prisma.onboardingForm.findUnique({
        where: { id: form.id },
      });
      return f?.draftRevision;
    })
    .toBe(3);
  const afterSecond = await prisma.onboardingForm.findUniqueOrThrow({
    where: { id: form.id },
  });
  expect(
    (afterSecond.draft as { fields: { fieldId: string }[] }).fields.map(
      (f) => f.fieldId,
    ),
  ).toEqual(draftIds);

  // Draft preview shows the open draft and persists nothing.
  const storageBefore = await storageSnapshot(page);
  const versionsBefore = await prisma.onboardingFormVersion.count({
    where: { formId: form.id },
  });
  mutating.length = 0;
  await page.getByTestId("preview-draft-link").click();
  await expect(page.getByTestId("onboarding-form-preview")).toBeVisible();
  await expect(page.getByTestId("preview-source")).toContainText("draft");
  await expect(page.getByText("Your full name")).toBeVisible();
  expect(
    await page
      .getByTestId("preview-fields")
      .locator("input[disabled], textarea[disabled], fieldset[disabled]")
      .count(),
  ).toBeGreaterThan(0);
  await expect(
    page.getByTestId("onboarding-form-preview").locator("form"),
  ).toHaveCount(0);
  await expect(
    page
      .getByTestId("onboarding-form-preview")
      .locator("input:not([disabled])"),
  ).toHaveCount(0);
  expect(mutating).toEqual([]); // no POST/PATCH/PUT/DELETE from the preview
  expect(await storageSnapshot(page)).toBe(storageBefore);
  expect(
    await prisma.onboardingFormVersion.count({ where: { formId: form.id } }),
  ).toBe(versionsBefore);

  // Publish → immutable v1; editor flips to the closed-draft branch.
  await page.goto(`/workspace/${wsId}/onboarding/forms/${form.id}`);
  await page.getByTestId("publish-form").click();
  await expect
    .poll(async () =>
      prisma.onboardingFormVersion.count({ where: { formId: form.id } }),
    )
    .toBe(1);
  await expect(page.getByTestId("no-draft")).toBeVisible();

  // Version preview renders the frozen v1 snapshot.
  await page.getByTestId("preview-version-link").click();
  await expect(page.getByTestId("preview-source")).toContainText("version 1");
  await expect(page.getByText("Your full name")).toBeVisible();

  // Reopen creates a draft seeded from v1; edit + publish → v2.
  await page.goto(`/workspace/${wsId}/onboarding/forms/${form.id}`);
  await page.getByTestId("open-draft").click();
  await expect(page.getByTestId("draft-editor")).toBeVisible();
  await expect(page.getByTestId("field-label-0")).toHaveValue("Your full name");
  await page.getByTestId("field-label-0").fill("Legal name");
  await page.getByTestId("save-draft").click();
  // Publish does NOT bump draftRevision (v1 froze rev 3); reopen seeded the
  // draft at 4; this save lands at 5.
  await expect
    .poll(async () => {
      const f = await prisma.onboardingForm.findUnique({
        where: { id: form.id },
      });
      return f?.draftRevision;
    })
    .toBe(5);
  await page.getByTestId("publish-form").click();
  await expect
    .poll(async () =>
      prisma.onboardingFormVersion.count({ where: { formId: form.id } }),
    )
    .toBe(2);

  // Archive → list shows ARCHIVED.
  await page.goto(`/workspace/${wsId}/onboarding/forms/${form.id}`);
  await page.getByTestId("archive-form").click();
  await expect(page).toHaveURL(/onboarding\/forms$/);
  await expect(
    page.getByTestId("onboarding-forms-table").getByText("ARCHIVED"),
  ).toBeVisible();
});

test("editor controls disable while a mutation is in flight (no mid-save clobber)", async ({
  page,
}) => {
  // Slow every server-action POST so the pending window is observable.
  await page.route(/onboarding\/forms/, async (route) => {
    if (route.request().method() === "POST")
      await new Promise((r) => setTimeout(r, 900));
    await route.continue();
  });
  await signIn(page, E2E.owner);
  await page.goto(`/workspace/${wsId}/onboarding/forms`);
  await page.getByTestId("new-onboarding-form").click();
  await page.getByTestId("form-name-input").fill("E2E P8 pending");
  await page.getByRole("button", { name: "Create form" }).click();
  await expect(page.getByTestId("onboarding-form-editor")).toBeVisible();

  await page.getByTestId("add-field-shortText").click();
  await page.getByTestId("field-label-0").fill("Pending test");
  await page.getByTestId("save-draft").click();
  // While the save is in flight the editor must not accept further edits —
  // a returned snapshot could otherwise silently overwrite them.
  await expect(page.getByTestId("field-label-0")).toBeDisabled();
  await expect(page.getByTestId("add-field-number")).toBeDisabled();
  await expect(page.getByTestId("publish-form")).toBeDisabled();
  await expect(page.getByTestId("archive-form")).toBeDisabled();
  // After settlement the controls re-enable and the saved label stands.
  await expect(page.getByTestId("field-label-0")).toBeEnabled();
  await expect(page.getByTestId("field-label-0")).toHaveValue("Pending test");
});

/**
 * Full editor lifecycle exercised identically at every supported width:
 * all six field kinds + options (add AND remove), rename, reorder, repeated
 * saves asserting stable field/option IDs in the database, draft-vs-version
 * preview while the draft differs from the frozen version,
 * publish→reopen→v2→archive, keyboard focusability, and no horizontal
 * overflow on editor AND both preview pages.
 */
async function fullLifecycle(page: Page, tag: string, width: number) {
  const mutating: string[] = [];
  page.on("request", (req) => {
    if (req.method() !== "GET") mutating.push(`${req.method()} ${req.url()}`);
  });

  const name = `E2E P8 ${tag} ${Date.now()}`;
  await page.goto(`/workspace/${wsId}/onboarding/forms`);
  await page.getByTestId("new-onboarding-form").click();
  await page.getByTestId("form-name-input").fill(name);
  await page.getByRole("button", { name: "Create form" }).click();
  await expect(page.getByTestId("onboarding-form-editor")).toBeVisible();

  // Keyboard: the name input is focusable and Tab reaches the next control.
  await page.getByTestId("form-name").focus();
  await expect(page.getByTestId("form-name")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await page.keyboard.press("Escape");

  // All six field kinds.
  for (const [i, kind] of [
    "shortText",
    "longText",
    "number",
    "date",
    "singleChoice",
    "multiChoice",
  ].entries()) {
    await page.getByTestId(`add-field-${kind}`).click();
    await page.getByTestId(`field-label-${i}`).fill(`${tag} ${kind}`);
  }
  await page
    .getByTestId("field-options-4")
    .getByPlaceholder("Option label")
    .fill("Opt A");
  await page.getByTestId("add-option-4").click();
  await page
    .getByTestId("field-options-4")
    .getByPlaceholder("Option label")
    .nth(1)
    .fill("Opt B");
  // Option removal: drop "Opt B" again — the draft must persist one option.
  await page
    .getByTestId("field-options-4")
    .getByLabel("Remove option 2")
    .click();
  await expect(
    page.getByTestId("field-options-4").getByPlaceholder("Option label"),
  ).toHaveCount(1);
  await page
    .getByTestId("field-options-5")
    .getByPlaceholder("Option label")
    .fill("Opt X");
  // Reorder: move the last field up once.
  await page.getByLabel("Move field 6 up").click();
  // No horizontal overflow on the populated editor at this width.
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(width + 1);
  await page.getByTestId("save-draft").click();
  await expect
    .poll(async () => {
      const f = await prisma.onboardingForm.findFirst({
        where: { workspaceId: wsId, name },
      });
      return f?.draftRevision;
    })
    .toBe(2);
  const form = await prisma.onboardingForm.findFirstOrThrow({
    where: { workspaceId: wsId, name },
  });
  const savedIds = (
    form.draft as {
      fields: { fieldId: string; options?: { optionId: string }[] }[];
    }
  ).fields.map((f) => ({
    fieldId: f.fieldId,
    optionIds: (f.options ?? []).map((o) => o.optionId),
  }));
  expect(savedIds).toHaveLength(6);
  // The removed option stayed removed server-side.
  expect(savedIds.flatMap((s) => s.optionIds)).toHaveLength(2);

  // Rename + save again — every field/option ID round-trips unchanged.
  await page.getByTestId("field-label-0").fill(`${tag} renamed`);
  await page.getByTestId("save-draft").click();
  await expect
    .poll(async () => {
      const f = await prisma.onboardingForm.findUnique({
        where: { id: form.id },
      });
      return f?.draftRevision;
    })
    .toBe(3);
  const afterSecond = await prisma.onboardingForm.findUniqueOrThrow({
    where: { id: form.id },
  });
  expect(
    (
      afterSecond.draft as {
        fields: { fieldId: string; options?: { optionId: string }[] }[];
      }
    ).fields.map((f) => ({
      fieldId: f.fieldId,
      optionIds: (f.options ?? []).map((o) => o.optionId),
    })),
  ).toEqual(savedIds);

  // Draft preview while a draft is open — proves nothing persists. Delta
  // covers storage key→values, serialized draft JSON, draftRevision, form
  // name, version count AND audit events.
  const storageBefore = await storageSnapshot(page);
  const formBefore = await prisma.onboardingForm.findUniqueOrThrow({
    where: { id: form.id },
  });
  const formJsonBefore = JSON.stringify([
    formBefore.draft,
    formBefore.draftRevision,
    formBefore.name,
  ]);
  const versionsBefore = await prisma.onboardingFormVersion.count({
    where: { formId: form.id },
  });
  const auditsBefore = await prisma.auditEvent.count({
    where: { resourceType: "onboarding_form", resourceId: form.id },
  });
  mutating.length = 0;
  await page.getByTestId("preview-draft-link").click();
  await expect(page.getByTestId("preview-source")).toContainText("draft");
  // Every rendered control is disabled — input, textarea AND choice fieldset —
  // and there is no form element to submit.
  const previewFields = page.getByTestId("preview-fields");
  await expect(previewFields.locator("input[disabled]")).toHaveCount(
    await previewFields.locator("input").count(),
  );
  await expect(previewFields.locator("textarea[disabled]")).toHaveCount(
    await previewFields.locator("textarea").count(),
  );
  await expect(previewFields.locator("fieldset[disabled]")).toHaveCount(2);
  await expect(previewFields.locator("input:not([disabled])")).toHaveCount(0);
  await expect(previewFields.locator("textarea:not([disabled])")).toHaveCount(
    0,
  );
  await expect(
    page.getByTestId("onboarding-form-preview").locator("form"),
  ).toHaveCount(0);
  // No horizontal overflow on the draft preview at this width.
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(width + 1);
  await page.keyboard.press("Enter"); // must not submit anything
  expect(mutating).toEqual([]);
  expect(await storageSnapshot(page)).toBe(storageBefore);
  const formAfter = await prisma.onboardingForm.findUniqueOrThrow({
    where: { id: form.id },
  });
  expect(
    JSON.stringify([formAfter.draft, formAfter.draftRevision, formAfter.name]),
  ).toBe(formJsonBefore);
  expect(
    await prisma.onboardingFormVersion.count({ where: { formId: form.id } }),
  ).toBe(versionsBefore);
  expect(
    await prisma.auditEvent.count({
      where: { resourceType: "onboarding_form", resourceId: form.id },
    }),
  ).toBe(auditsBefore);

  // Publish v1 → draft preview of a CHANGED draft still shows the draft,
  // version preview still shows frozen v1.
  await page.goto(`/workspace/${wsId}/onboarding/forms/${form.id}`);
  await page.getByTestId("publish-form").click();
  await expect
    .poll(async () =>
      prisma.onboardingFormVersion.count({ where: { formId: form.id } }),
    )
    .toBe(1);
  await expect(page.getByTestId("no-draft")).toBeVisible();
  await page.getByTestId("preview-version-link").click();
  await expect(page.getByTestId("preview-source")).toContainText("version 1");
  await expect(page.getByText(`${tag} renamed`)).toBeVisible();
  // No horizontal overflow on the version preview at this width.
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(width + 1);

  // Reopen, diverge from v1, save, publish v2.
  await page.goto(`/workspace/${wsId}/onboarding/forms/${form.id}`);
  await page.getByTestId("open-draft").click();
  await expect(page.getByTestId("draft-editor")).toBeVisible();
  await expect(page.getByTestId("field-label-0")).toHaveValue(`${tag} renamed`);
  await page.getByTestId("field-label-0").fill(`${tag} v2 label`);
  await page.getByTestId("save-draft").click();
  // Same fixture sequence: create1 → save2 → save3 → publish stays 3 →
  // reopen4 → this save lands at 5 (publish never bumps draftRevision).
  await expect
    .poll(async () => {
      const f = await prisma.onboardingForm.findUnique({
        where: { id: form.id },
      });
      return f?.draftRevision;
    })
    .toBe(5);
  // The changed draft previews differently than frozen v1.
  await page.getByTestId("preview-draft-link").click();
  await expect(page.getByTestId("preview-source")).toContainText("draft");
  await expect(page.getByText(`${tag} v2 label`)).toBeVisible();
  await page.goto(
    `/workspace/${wsId}/onboarding/forms/${form.id}/preview?src=version`,
  );
  await expect(page.getByTestId("preview-source")).toContainText("version 1");
  await expect(page.getByText(`${tag} renamed`)).toBeVisible();
  await expect(page.getByText(`${tag} v2 label`)).toBeHidden();

  await page.goto(`/workspace/${wsId}/onboarding/forms/${form.id}`);
  await page.getByTestId("publish-form").click();
  await expect
    .poll(async () =>
      prisma.onboardingFormVersion.count({ where: { formId: form.id } }),
    )
    .toBe(2);
  await page.getByTestId("archive-form").click();
  await expect(page).toHaveURL(/onboarding\/forms$/);

  // No horizontal overflow on the archived library at this width.
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(width + 1);
}

test.describe("responsive + keyboard", () => {
  for (const [name, width] of [
    ["desktop", 1440],
    ["tablet", 834],
    ["mobile", 390],
  ] as const) {
    test(`${name}: full lifecycle at ${width}px`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, E2E.coach);
      await fullLifecycle(page, name, width);
    });
  }
});
