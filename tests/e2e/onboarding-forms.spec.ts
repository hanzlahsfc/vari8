import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-008 onboarding form builder — real browser flows at desktop (1440px),
 * tablet (834px) and mobile (390px). Synthetic fixtures only; this slice has
 * no submission domain, and the preview must persist nothing.
 *
 * Provenance (TDD recovery): adapted TESTS-ONLY from the frozen read-only
 * candidate branch feature/p008-onboarding-form-builder @ d10d788, per the
 * recovery contract. These tests encode the reviewed contract; the
 * production implementation is rebuilt fresh on this branch.
 */

let prisma: PrismaClient;
let wsId: string;

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

test("non-member gets HTTP 403 on the form library", async ({ page }) => {
  await signIn(page, E2E.nonmember);
  const res = await page.goto(`/workspace/${wsId}/onboarding/forms`);
  expect(res?.status()).toBe(403);
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
  await signIn(page, E2E.owner);
  await page.goto(`/workspace/${wsId}`);
  await expect(
    page.locator(".shell__nav").getByText("Onboarding Forms"),
  ).toBeVisible();
  // Coach also sees it (read scope); a denied role does not.
  await page.goto(`/logout`);
  await signIn(page, E2E.assistant);
  const res = await page.goto(`/workspace/${wsId}`);
  if (res?.status() === 200) {
    await expect(
      page.locator(".shell__nav").getByText("Onboarding Forms"),
    ).not.toBeVisible();
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
    const res2 = await page.goto(`/workspace/${wsId}/onboarding/forms/new`);
    expect(res2?.status()).toBe(200);
    await expect(
      page.getByRole("button", { name: "Create form" }),
    ).toBeVisible();
    // No horizontal overflow at this width.
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    // Keyboard: name input reachable and focusable.
    const input = page.getByTestId("form-name-input");
    await input.focus();
    await expect(input).toBeFocused();
  });
}

for (const width of [1440, 834, 390] as const) {
  test(`empty list + controlled-pending create at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, E2E.owner);
    await page.goto(`/workspace/${wsId}/onboarding/forms`);
    await expect(page.getByTestId("onboarding-empty-state")).toBeVisible();
    await page.getByTestId("new-onboarding-form").click();
    await expect(page).toHaveURL(/onboarding\/forms\/new$/);
    await page.getByRole("button", { name: "Create form" }).click();
    // Empty name → safe validation message, stays on /new, no navigation.
    await expect(page).toHaveURL(/onboarding\/forms\/new$/);
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByTestId("form-name-input").fill(`E2E P8 5C1 ${width}`);

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
    await submit.click();
    // BOTH name input and submit are disabled while pending.
    await expect(submit).toBeDisabled();
    await expect(input).toBeDisabled();
    release();
    await expect(page).toHaveURL(/onboarding\/forms\/[A-Za-z0-9_-]+$/);
    // Exactly one form row for this name — double-submit cannot duplicate.
    const rows = await prisma.onboardingForm.count({
      where: { name: `E2E P8 5C1 ${width}` },
    });
    expect(rows).toBe(1);
  });
}

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
  // publish bumped revision to 4; reopen seeded draft at 5; this save → 6.
  await expect
    .poll(async () => {
      const f = await prisma.onboardingForm.findUnique({
        where: { id: form.id },
      });
      return f?.draftRevision;
    })
    .toBe(6);
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
  await expect
    .poll(async () => {
      const f = await prisma.onboardingForm.findUnique({
        where: { id: form.id },
      });
      return f?.draftRevision;
    })
    .toBe(6);
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
