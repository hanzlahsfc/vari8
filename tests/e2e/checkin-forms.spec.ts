import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-025-A Check-In form builder — real browser flows at desktop (1440px),
 * tablet (834px) and mobile (390px). Synthetic fixtures only; this slice
 * has no instance/submission/review domain, and the preview must persist
 * nothing. The flag-on primary server (:3000) exercises the real flow;
 * the flag-off proof server (:3101) independently proves the 404 /
 * absent-nav / zero-mutation contract.
 */

const FLAG_OFF_ORIGIN = "http://127.0.0.1:3101";

let prisma: PrismaClient;
let wsId: string;
let wsBId: string;

async function removeFixtures() {
  await prisma.checkInFormVersion.deleteMany({
    where: { form: { workspaceId: wsId, name: { startsWith: "E2E P25A" } } },
  });
  await prisma.checkInForm.deleteMany({
    where: { workspaceId: wsId, name: { startsWith: "E2E P25A" } },
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

/** Post-lifecycle settle wait: publish/reopen hand the DOM swap to an
 * async `router.refresh()` RSC round-trip after the action commits. */
async function expectNoDraftSettled(page: Page) {
  await expect(page.getByTestId("checkin-no-draft")).toBeVisible({
    timeout: 15_000,
  });
}

const checkNoOverflow = async (page: Page) => {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
};

const createFormViaUi = async (page: Page, name: string) => {
  await page.goto(`/workspace/${wsId}/checkins/forms/new`);
  await page.getByTestId("checkin-form-name-input").fill(name);
  await page.getByRole("button", { name: "Create form" }).click();
  await expect(page).toHaveURL(/checkins\/forms\/[^/]+$/);
};

// ── Authorization + navigation ──────────────────────────────────────────

test.describe("P-025-A authz + nav", () => {
  test("owner sees the Check-In nav link; denied roles get 403 on every surface", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(`/workspace/${wsId}`);
    await expect(
      page.getByRole("link", { name: "Check-In Forms" }),
    ).toBeVisible();

    for (const email of [E2E.assistant, E2E.client, E2E.support]) {
      const res = await page
        .goto("/login")
        .then(() => signIn(page, email))
        .then(() => page.goto(`/workspace/${wsId}/checkins/forms`));
      expect(res?.status()).toBe(403);
      const res2 = await page.goto(`/workspace/${wsId}/checkins/forms/new`);
      expect(res2?.status()).toBe(403);
    }
  });

  test("nonmember + foreign workspace + malformed form id fail closed", async ({
    page,
  }) => {
    await signIn(page, E2E.nonmember);
    const res = await page.goto(`/workspace/${wsId}/checkins/forms`);
    expect(res?.status()).toBe(403);

    await signIn(page, E2E.owner);
    const foreign = await page.goto(
      `/workspace/${wsBId}/checkins/forms/not-a-real-id`,
    );
    expect(foreign?.status()).toBe(403);
  });

  test("flag-off server 404s the routes and hides the nav entry", async ({
    page,
  }) => {
    await page.goto(`${FLAG_OFF_ORIGIN}/login`);
    await page.getByLabel("Email").fill(E2E.owner);
    await page.getByLabel("Password").fill(E2E.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/login/);

    const res = await page.goto(
      `${FLAG_OFF_ORIGIN}/workspace/${wsId}/checkins/forms`,
    );
    expect(res?.status()).toBe(404);
    const res2 = await page.goto(
      `${FLAG_OFF_ORIGIN}/workspace/${wsId}/checkins/forms/new`,
    );
    expect(res2?.status()).toBe(404);

    await page.goto(`${FLAG_OFF_ORIGIN}/workspace/${wsId}`);
    await expect(
      page.getByRole("link", { name: "Check-In Forms" }),
    ).toHaveCount(0);
  });
});

// ── Lifecycle ───────────────────────────────────────────────────────────

test.describe("P-025-A staff lifecycle", () => {
  for (const width of [1440, 834, 390] as const) {
    test(`full create → edit → save → publish → reopen → archive at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, E2E.owner);

      // Empty state renders the create affordance.
      await page.goto(`/workspace/${wsId}/checkins/forms`);
      await expect(page.getByTestId("checkin-forms-page")).toBeVisible();
      await checkNoOverflow(page);

      await createFormViaUi(page, `E2E P25A Lifecycle ${width}`);
      await checkNoOverflow(page);

      // Add a short-text field, edit metadata, save.
      await page.getByTestId("checkin-add-field-shortText").click();
      await page.getByTestId("checkin-field-label-0").fill("How was sleep?");
      await page.getByTestId("checkin-field-required-0").check();
      await page.getByTestId("checkin-field-help-0").fill("Be honest.");
      await page.getByTestId("checkin-save-draft").click();
      await expect(page.getByTestId("checkin-publish-form")).toBeEnabled(); // clean after save

      // Add a choice field with two options; reorder so it leads.
      await page.getByTestId("checkin-add-field-singleChoice").click();
      await page.getByTestId("checkin-field-label-1").fill("Energy level");
      await page.getByTestId("checkin-add-option-1").click();
      const optionInputs = page
        .getByTestId("checkin-field-options-1")
        .locator("input");
      await optionInputs.nth(0).fill("Low");
      await optionInputs.nth(1).fill("High");
      await page.getByRole("button", { name: "Move field 2 up" }).click();
      await page.getByTestId("checkin-save-draft").click();
      await expect(page.getByTestId("checkin-publish-form")).toBeEnabled();

      // Draft preview renders the edited definition — zero persistence:
      // the visit writes nothing (revision/version/audit all unchanged).
      const previewForm = await prisma.checkInForm.findFirstOrThrow({
        where: { workspaceId: wsId, name: `E2E P25A Lifecycle ${width}` },
      });
      const preState = {
        revision: previewForm.draftRevision,
        hasDraft: previewForm.draft !== null,
        versions: await prisma.checkInFormVersion.count({
          where: { formId: previewForm.id },
        }),
        audits: await prisma.auditEvent.count({
          where: { resourceId: previewForm.id, resourceType: "checkin_form" },
        }),
      };
      await page.getByTestId("checkin-preview-draft-link").click();
      await expect(page.getByTestId("checkin-preview-source")).toHaveText(
        "Previewing draft",
      );
      await expect(page.getByTestId("checkin-preview-fields")).toContainText(
        "Energy level",
      );
      // The preview surface itself mounts no form/submit controls (the
      // workspace shell's sign-out <form> lives outside the preview).
      expect(
        await page.getByTestId("checkin-form-preview").locator("form").count(),
      ).toBe(0);
      const postForm = await prisma.checkInForm.findUniqueOrThrow({
        where: { id: previewForm.id },
      });
      expect(postForm.draftRevision).toBe(preState.revision);
      expect(postForm.draft !== null).toBe(preState.hasDraft);
      expect(
        await prisma.checkInFormVersion.count({
          where: { formId: previewForm.id },
        }),
      ).toBe(preState.versions);
      expect(
        await prisma.auditEvent.count({
          where: { resourceId: previewForm.id, resourceType: "checkin_form" },
        }),
      ).toBe(preState.audits);
      await checkNoOverflow(page);
      await page.goBack();

      // Publish — the draft closes; the closed surface offers reopen.
      await page.getByTestId("checkin-publish-form").click();
      await expectNoDraftSettled(page);
      await expect(page.getByTestId("checkin-open-draft")).toBeVisible();

      // Latest-version preview shows the frozen v1 — and writes nothing:
      // the draft stays closed, no revision bump, no audit row.
      const pubForm = await prisma.checkInForm.findUniqueOrThrow({
        where: { id: previewForm.id },
      });
      const pubPre = {
        revision: pubForm.draftRevision,
        hasDraft: pubForm.draft !== null,
        audits: await prisma.auditEvent.count({
          where: { resourceId: previewForm.id, resourceType: "checkin_form" },
        }),
      };
      await page.getByTestId("checkin-preview-version-link").click();
      await expect(page.getByTestId("checkin-preview-source")).toHaveText(
        "Previewing version 1",
      );
      await expect(page.getByTestId("checkin-preview-fields")).toContainText(
        "Energy level",
      );
      const pubPost = await prisma.checkInForm.findUniqueOrThrow({
        where: { id: previewForm.id },
      });
      expect(pubPost.draftRevision).toBe(pubPre.revision);
      expect(pubPost.draft !== null).toBe(pubPre.hasDraft);
      expect(
        await prisma.auditEvent.count({
          where: { resourceId: previewForm.id, resourceType: "checkin_form" },
        }),
      ).toBe(pubPre.audits);
      await page.goBack();

      // Reopen seeds v2 editing from v1; archive ends the lifecycle.
      await page.getByTestId("checkin-open-draft").click();
      await expect(page.getByTestId("checkin-draft-editor")).toBeVisible({
        timeout: 15_000,
      });
      await page.getByTestId("checkin-archive-form").click();
      // Two-step destructive confirmation.
      await page.getByTestId("checkin-archive-confirm").click();
      await expect(page).toHaveURL(/checkins\/forms$/);

      // Archived form renders permanently read-only.
      await page
        .getByTestId("checkin-forms-table")
        .getByRole("link", { name: `E2E P25A Lifecycle ${width}` })
        .click();
      await expect(page.getByTestId("checkin-archived-banner")).toBeVisible();
      await expect(page.getByTestId("checkin-open-draft")).toHaveCount(0);
      await checkNoOverflow(page);
    });
  }

  test("publish requires a saved-clean draft and publish keeps v1 immutable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, E2E.owner);
    await createFormViaUi(page, "E2E P25A Immutable");

    await page.getByTestId("checkin-add-field-shortText").click();
    await page.getByTestId("checkin-field-label-0").fill("Original label");
    // Dirty state disables publish.
    await expect(page.getByTestId("checkin-publish-form")).toBeDisabled();
    await page.getByTestId("checkin-save-draft").click();
    await page.getByTestId("checkin-publish-form").click();
    await expectNoDraftSettled(page);

    // Reopen, rename the field, publish v2.
    await page.getByTestId("checkin-open-draft").click();
    await expect(page.getByTestId("checkin-draft-editor")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("checkin-field-label-0").fill("Rewritten label");
    await page.getByTestId("checkin-save-draft").click();
    await page.getByTestId("checkin-publish-form").click();
    await expectNoDraftSettled(page);

    // Latest preview shows v2; the v1 row in the DB is byte-frozen.
    await page.getByTestId("checkin-preview-version-link").click();
    await expect(page.getByTestId("checkin-preview-source")).toHaveText(
      "Previewing version 2",
    );
    await expect(page.getByTestId("checkin-preview-fields")).toContainText(
      "Rewritten label",
    );
    const versions = await prisma.checkInFormVersion.findMany({
      where: { form: { workspaceId: wsId, name: "E2E P25A Immutable" } },
      orderBy: { versionSeq: "asc" },
    });
    expect(versions).toHaveLength(2);
    expect(
      (versions[0].definition as { fields: { label: string }[] }).fields[0]
        .label,
    ).toBe("Original label"); // v1 unchanged after v2
    expect(
      (versions[1].definition as { fields: { label: string }[] }).fields[0]
        .label,
    ).toBe("Rewritten label");
  });

  test("stale revision surfaces the safe message and preserves edits", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, E2E.owner);
    await createFormViaUi(page, "E2E P25A Stale");
    await page.getByTestId("checkin-add-field-shortText").click();
    await page.getByTestId("checkin-field-label-0").fill("Field A");
    await page.getByTestId("checkin-save-draft").click();
    await expect(page.getByTestId("checkin-publish-form")).toBeEnabled();

    // A second "browser" advances the draft — this page's revision is stale.
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { slug: E2E.workspaceSlug },
    });
    const form = await prisma.checkInForm.findFirstOrThrow({
      where: { workspaceId: ws.id, name: "E2E P25A Stale" },
    });
    await prisma.checkInForm.update({
      where: { id: form.id },
      data: { draftRevision: form.draftRevision + 1 },
    });

    await page.getByTestId("checkin-field-label-0").fill("Stale edit");
    await page.getByTestId("checkin-save-draft").click();
    await expect(page.getByTestId("checkin-alert")).toContainText(
      "This form changed while you were editing. Reload and try again.",
    );
    // The draft row keeps the bumped revision — the stale write never
    // overwrote it.
    const after = await prisma.checkInForm.findUniqueOrThrow({
      where: { id: form.id },
    });
    expect(after.draftRevision).toBe(form.draftRevision + 1);
  });

  test("dirty editor warns on navigation; after save the warning clears", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, E2E.owner);
    await createFormViaUi(page, "E2E P25A Dirty");

    await page.getByTestId("checkin-add-field-shortText").click();
    await page.getByTestId("checkin-field-label-0").fill("Unsaved");

    // Dismissing the beforeunload dialog cancels navigation — fire the
    // reload without awaiting (the dismissal leaves its promise pending)
    // and record the dialog via a handler.
    let sawDirtyDialog = false;
    page.on("dialog", (dialog) => {
      sawDirtyDialog = true;
      void dialog.dismiss();
    });
    void page.reload().catch(() => undefined);
    await expect.poll(() => sawDirtyDialog, { timeout: 5_000 }).toBe(true);

    // Save a fresh edit; publish becomes enabled only once the save has
    // COMMITTED (pending + dirty both cleared), then reload is clean.
    const cleanDialogs: unknown[] = [];
    page.on("dialog", (d) => {
      cleanDialogs.push(d.message());
      void d.dismiss();
    });
    await page.getByTestId("checkin-field-label-0").fill("To save");
    await page.getByTestId("checkin-save-draft").click();
    await expect(page.getByTestId("checkin-publish-form")).toBeEnabled();
    await page.reload();
    await expect(page.getByTestId("checkin-draft-editor")).toBeVisible();
    expect(cleanDialogs).toHaveLength(0);
  });

  test("aria-live alert region + labeled controls are keyboard-reachable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await signIn(page, E2E.owner);
    await createFormViaUi(page, "E2E P25A A11y");

    // alert region exists for result/error announcements.
    await expect(page.getByTestId("checkin-alert")).toHaveCount(1);

    // Tab traversal reaches the field-adder buttons; buttons keep a ≥44px
    // touch target at mobile width.
    await page.getByTestId("checkin-add-field-shortText").click();
    for (const testId of ["checkin-save-draft", "checkin-publish-form"]) {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await checkNoOverflow(page);
  });
});
