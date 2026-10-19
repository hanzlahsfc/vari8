import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-025-B Check-In instances + client submissions — real browser flows on
 * the production build: staff scheduling/cancellation, client
 * list/detail/submit, derived states, late marking, consent withdrawal,
 * beforeunload lifecycle, no-store, and the flag-off 404 contract.
 * Synthetic deterministic fixtures only (p025b_* namespace).
 */

const BASE = "http://127.0.0.1:3000";
const FLAG_OFF = "http://127.0.0.1:3101";

const FORM_ID = "p025b_e2e_form";
const VERSION_ID = "p025b_e2e_version";

const DEF = {
  title: "Weekly Check-In",
  fields: [
    {
      fieldId: "f_summary",
      kind: "shortText",
      label: "How was your week?",
      required: true,
      order: 0,
    },
    {
      fieldId: "f_notes",
      kind: "longText",
      label: "Notes",
      required: false,
      order: 1,
    },
    {
      fieldId: "f_weight",
      kind: "number",
      label: "Weight",
      required: false,
      order: 2,
    },
    {
      fieldId: "f_energy",
      kind: "singleChoice",
      label: "Energy",
      required: true,
      order: 3,
      options: [
        { optionId: "o_high", label: "High" },
        { optionId: "o_low", label: "Low" },
      ],
    },
    {
      fieldId: "f_tags",
      kind: "multiChoice",
      label: "Tags",
      required: false,
      order: 4,
      options: [
        { optionId: "o_good_sleep", label: "Good sleep" },
        { optionId: "o_trained", label: "Trained" },
      ],
    },
  ],
};

let prisma: PrismaClient;
let wsId: string;
let wsBId: string;
let profileId: string;
let profileCreated = false;
let ownerMemberId: string;
let coachMemberId: string;

async function signIn(page: Page, email: string, base = "") {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/login/);
}

const checkNoOverflow = async (page: Page) => {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
};

/** Delete every p025b-namespaced instance/submission (children first). */
async function removeInstances() {
  const stale = await prisma.checkInInstance.findMany({
    where: { formId: FORM_ID },
    select: { id: true },
  });
  await prisma.checkInSubmissionAnswer.deleteMany({
    where: {
      submission: { instanceId: { in: stale.map((s) => s.id) } },
    },
  });
  await prisma.checkInSubmission.deleteMany({
    where: { instanceId: { in: stale.map((s) => s.id) } },
  });
  await prisma.checkInInstance.deleteMany({
    where: { formId: FORM_ID },
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

  const [ownerMember, coachMember, clientUser] = await Promise.all([
    prisma.workspaceMember.findFirstOrThrow({
      where: {
        workspaceId: wsId,
        user: { email: E2E.owner },
      },
    }),
    prisma.workspaceMember.findFirstOrThrow({
      where: {
        workspaceId: wsId,
        user: { email: E2E.coach },
      },
    }),
    prisma.user.findUniqueOrThrow({ where: { email: E2E.client } }),
  ]);
  ownerMemberId = ownerMember.id;
  coachMemberId = coachMember.id;

  // Reuse the client's own profile if another spec created one
  // (unique (workspaceId,userId)); otherwise create the P-025-B profile.
  const existing = await prisma.clientProfile.findFirst({
    where: { workspaceId: wsId, userId: clientUser.id },
  });
  const profile =
    existing ??
    (await prisma.clientProfile.create({
      data: {
        workspaceId: wsId,
        userId: clientUser.id,
        name: "P025B E2E Client",
      },
    }));
  profileId = profile.id;
  // Owned iff the profile is THIS spec's namespaced fixture — a reused
  // p023 fixture is managed by its own spec's cleanup.
  profileCreated = existing === null || existing.name === "P025B E2E Client";

  // Tear down stale fixtures (children before parents).
  await removeInstances();
  await prisma.clientAssignment.deleteMany({
    where: { clientProfileId: profileId },
  });
  await prisma.checkInFormVersion.deleteMany({ where: { formId: FORM_ID } });
  await prisma.checkInForm.deleteMany({ where: { id: FORM_ID } });
  await prisma.consentRecord.deleteMany({
    where: {
      clientProfileId: profileId,
      version: { startsWith: "check-in-dev" },
    },
  });

  // Published v1 definition.
  await prisma.checkInForm.create({
    data: {
      id: FORM_ID,
      workspaceId: wsId,
      name: "P025B Weekly",
      status: "ACTIVE",
      createdByMemberId: ownerMemberId,
    },
  });
  await prisma.checkInFormVersion.create({
    data: {
      id: VERSION_ID,
      workspaceId: wsId,
      formId: FORM_ID,
      versionSeq: 1,
      definition: DEF as never,
      publishOriginRevision: 1,
      publishedByMemberId: ownerMemberId,
    },
  });
  // ACTIVE assignment: coach → the shared E2E client profile.
  await prisma.clientAssignment.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      coachMemberId,
      role: "PRIMARY",
      status: "ACTIVE",
    },
  });
  // Synthetic dev consent rows for the check-in consent map.
  for (const [kind, version] of [
    ["PRIVACY_NOTICE", "check-in-dev-privacy-v1"],
    ["HEALTH_DATA", "check-in-dev-health-v1"],
  ] as const)
    await prisma.consentRecord.create({
      data: { clientProfileId: profileId, kind, version },
    });
});

test.afterAll(async () => {
  await removeInstances().catch(() => {});
  await prisma.checkInFormVersion
    .deleteMany({ where: { formId: FORM_ID } })
    .catch(() => {});
  await prisma.checkInForm
    .deleteMany({ where: { id: FORM_ID } })
    .catch(() => {});
  await prisma.clientAssignment
    .deleteMany({ where: { clientProfileId: profileId } })
    .catch(() => {});
  await prisma.consentRecord
    .deleteMany({
      where: {
        clientProfileId: profileId,
        version: { startsWith: "check-in-dev" },
      },
    })
    .catch(() => {});
  if (profileCreated)
    await prisma.clientProfile
      .delete({ where: { id: profileId } })
      .catch(() => {});
  await prisma?.$disconnect();
});

/** Schedule an instance directly through the service-independent fixture
 * (a row shaped exactly like the service output). */
async function fixtureInstance(
  dueAt: Date,
  opts: { cancelled?: boolean } = {},
) {
  return prisma.checkInInstance.create({
    data: {
      workspaceId: wsId,
      clientProfileId: profileId,
      formId: FORM_ID,
      formVersionId: VERSION_ID,
      dueAt,
      scheduledByMemberId: ownerMemberId,
      ...(opts.cancelled
        ? { cancelledAt: new Date(), cancelledByMemberId: ownerMemberId }
        : {}),
    },
  });
}

const staffUrl = () =>
  `${BASE}/workspace/${wsId}/clients/${profileId}/checkins`;
const clientListUrl = () => `${BASE}/workspace/${wsId}/check-ins`;
const clientDetailUrl = (id: string) =>
  `${BASE}/workspace/${wsId}/check-ins/${id}`;

// ── Flag-off contract ──────────────────────────────────────────────────

test("flag-off server 404s every P-025-B route; no rows or audits", async ({
  page,
}) => {
  await signIn(page, E2E.owner, FLAG_OFF);
  const staff = await page.goto(
    `${FLAG_OFF}/workspace/${wsId}/clients/${profileId}/checkins`,
  );
  expect(staff?.status()).toBe(404);

  await signIn(page, E2E.client, FLAG_OFF);
  const list = await page.goto(`${FLAG_OFF}/workspace/${wsId}/check-ins`);
  expect(list?.status()).toBe(404);
  const detail = await page.goto(
    `${FLAG_OFF}/workspace/${wsId}/check-ins/fake`,
  );
  expect(detail?.status()).toBe(404);
  expect(
    await prisma.auditEvent.count({
      where: {
        resourceType: { in: ["checkin_instance", "checkin_submission"] },
      },
    }),
  ).toBe(0);
});

// ── Staff scheduling + cancellation ────────────────────────────────────

test("owner schedules via the UI; roster Check-Ins link is flag-gated", async ({
  page,
}) => {
  await signIn(page, E2E.owner);
  await page.goto(`/workspace/${wsId}/clients`);
  await page
    .getByRole("row", { name: /P025B E2E Client/ })
    .getByRole("link", { name: "Check-Ins" })
    .click();
  await expect(page).toHaveURL(/clients\/[^/]+\/checkins/);
  await expect(page.getByTestId("staff-checkins-empty")).toBeVisible();

  // Positional select — option values are indices, never internal IDs.
  const optionValues = await page
    .getByTestId("checkin-schedule-version")
    .locator("option")
    .allTextContents();
  expect(optionValues.join(" ")).toContain("P025B Weekly");
  const rawValues = await page
    .getByTestId("checkin-schedule-version")
    .locator("option")
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
  for (const v of rawValues) expect(v).toMatch(/^\d+$/);

  await page.getByTestId("checkin-schedule-due").fill("2031-03-15T09:30");
  await page.getByTestId("checkin-schedule-submit").click();
  await expect(page.getByText("Check-In scheduled.")).toBeVisible();
  await expect(
    page.getByTestId("staff-checkin-scheduled").first(),
  ).toBeVisible();
  // no-store on the GET + action POST responses.
  const staffRes = await page.goto(staffUrl());
  expect(staffRes?.headers()["cache-control"]).toContain("no-store");
});

test("assigned coach schedules and cancels with two-step confirmation", async ({
  page,
}) => {
  await signIn(page, E2E.coach);
  await page.goto(staffUrl());
  await page.getByTestId("checkin-schedule-due").fill("2031-04-01T10:00");
  await page.getByTestId("checkin-schedule-submit").click();
  await expect(page.getByText("Check-In scheduled.")).toBeVisible();

  const row = page.getByTestId("staff-checkin-scheduled").last();
  await row.getByTestId("checkin-cancel-arm").click();
  await expect(row.getByTestId("checkin-cancel-confirm")).toBeVisible();
  await row.getByTestId("checkin-cancel-abort").click();
  await expect(row.getByTestId("checkin-cancel-arm")).toBeVisible();
  await row.getByTestId("checkin-cancel-arm").click();
  await row.getByTestId("checkin-cancel-confirm").click();
  await expect(page.getByTestId("staff-checkin-cancelled")).toBeVisible({
    timeout: 15_000,
  });
});

test("assistant without a matching assignment gets no write controls", async ({
  page,
}) => {
  // Assistant has no assignment to the E2E client — a denied view.
  await signIn(page, E2E.assistant);
  const res = await page.goto(staffUrl());
  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("checkins-denied")).toBeVisible();
  await expect(page.getByTestId("checkin-schedule-form")).toHaveCount(0);
});

test("client and support cannot reach the staff surface", async ({ page }) => {
  for (const email of [E2E.client, E2E.support]) {
    await signIn(page, email);
    const res = await page.goto(staffUrl());
    // CLIENT/SUPPORT never reach the page — the staff layout 403s first.
    expect(res?.status()).toBe(403);
  }
});

// ── Client list/detail/submission ──────────────────────────────────────

test("client sees the Check-Ins nav link, list, detail; submits once", async ({
  page,
}) => {
  const instance = await fixtureInstance(new Date("2031-05-01T12:00:00.000Z"));
  await signIn(page, E2E.client);
  await page.goto(`/workspace/${wsId}/daily`);
  await page.getByRole("link", { name: "Check-Ins" }).click();
  await expect(page).toHaveURL(/check-ins$/);
  await expect(
    page.getByTestId("checkin-item-scheduled").first(),
  ).toBeVisible();
  const listRes = await page.goto(clientListUrl());
  expect(listRes?.headers()["cache-control"]).toContain("no-store");

  await page.getByTestId("checkin-item-scheduled").first().click();
  await expect(page).toHaveURL(/check-ins\/[a-z0-9]+$/i);
  await expect(page.getByTestId("checkin-fill-form")).toBeVisible();
  await page.goto(clientDetailUrl(instance.id));

  // beforeunload fires ONLY while dirty — evaluate-driven reload avoids
  // the unresolved-navigation promise a dismissed dialog leaves behind.
  let dialogSeen = false;
  page.on("dialog", async (d) => {
    dialogSeen = true;
    await d.dismiss();
  });
  await page.goto(clientListUrl()); // untouched form → free navigation
  expect(dialogSeen).toBe(false);
  await page.goto(clientDetailUrl(instance.id));
  await page.locator("#ci-f-f_summary").fill("Solid week");
  const [dialog] = await Promise.all([
    page.waitForEvent("dialog"),
    page.evaluate(() => window.location.reload()).catch(() => {}),
  ]);
  expect(dialog.type()).toBe("beforeunload");
  // Dialog dismissed — refill the field after the reload settled.
  await page.locator("#ci-f-f_summary").fill("Solid week");

  // Required validation summary lists still-missing required fields…
  await expect(page.getByTestId("checkin-validation-summary")).toBeVisible();
  await page.locator("#ci-f-f_energy").selectOption("o_high");
  // …and clears once all required answers are present.
  await expect(page.getByTestId("checkin-validation-summary")).toHaveCount(0);

  await page.locator("#ci-f-f_tags-o_good_sleep").check();
  await page.locator("#ci-f-f_weight").fill("71.2");

  const submitResponsePromise = page.waitForResponse(
    (r) =>
      r.url().includes(`/workspace/${wsId}/check-ins/`) &&
      r.request().method() === "POST",
  );
  await page.getByTestId("checkin-submit").click();
  const submitResponse = await submitResponsePromise;
  expect(submitResponse.headers()["cache-control"]).toContain("no-store");

  // After commit: submitted state renders, answers visible, beforeunload
  // handler removed (no dialog on navigation).
  dialogSeen = false;
  await expect(page.getByTestId("checkin-submitted-state")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Solid week")).toBeVisible();
  const answers = await prisma.checkInSubmissionAnswer.findMany({
    where: {
      submission: { instanceId: instance.id },
    },
  });
  expect(answers).toHaveLength(4);
  const submissions = await prisma.checkInSubmission.findMany({
    where: { instanceId: instance.id },
  });
  expect(submissions).toHaveLength(1);
  // beforeunload gone — navigating away raises no dialog.
  await page.goto(clientListUrl());
  await expect(
    page.getByTestId("checkin-item-submitted").first(),
  ).toBeVisible();
  expect(dialogSeen).toBe(false);
});

test("late Check-In shows the overdue marker and still submits (#93)", async ({
  page,
}) => {
  const instance = await fixtureInstance(new Date("2020-01-01T00:00:00.000Z"));
  await signIn(page, E2E.client);
  await page.goto(clientListUrl());
  const item = page.getByTestId("checkin-item-scheduled").first();
  await expect(item).toContainText("Late");
  await page.goto(clientDetailUrl(instance.id));
  await expect(page.getByTestId("checkin-overdue-note")).toBeVisible();

  await page.locator("#ci-f-f_summary").fill("Late but done");
  await page.locator("#ci-f-f_energy").selectOption("o_low");
  await page.getByTestId("checkin-submit").click();
  await expect(page.getByTestId("checkin-submitted-state")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("(late)")).toBeVisible();
});

test("cancelled instance detail is non-disclosing and cannot be submitted", async ({
  page,
}) => {
  const instance = await fixtureInstance(new Date("2031-06-01T00:00:00.000Z"), {
    cancelled: true,
  });
  await signIn(page, E2E.client);
  await page.goto(clientDetailUrl(instance.id));
  await expect(page.getByTestId("checkin-cancelled-state")).toBeVisible();
  await expect(page.getByTestId("checkin-fill-form")).toHaveCount(0);
  // Staff cannot cancel again — no control on a CANCELLED row.
  await signIn(page, E2E.owner);
  await page.goto(staffUrl());
  await expect(
    page.getByTestId("staff-checkin-cancelled").first(),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("staff-checkin-cancelled")
      .getByTestId("checkin-cancel-arm"),
  ).toHaveCount(0);
});

test("foreign client gets non-disclosing denial; submitted instance offers no cancel", async ({
  page,
}) => {
  const instance = await fixtureInstance(new Date("2031-07-01T00:00:00.000Z"));
  // Submit through the service so the row exists, then prove staff lose
  // the cancel control on a SUBMITTED instance.
  await signIn(page, E2E.client);
  await page.goto(clientDetailUrl(instance.id));
  await page.locator("#ci-f-f_summary").fill("Done");
  await page.locator("#ci-f-f_energy").selectOption("o_high");
  await page.getByTestId("checkin-submit").click();
  await expect(page.getByTestId("checkin-submitted-state")).toBeVisible({
    timeout: 15_000,
  });

  await signIn(page, E2E.owner);
  await page.goto(staffUrl());
  const submitted = page.getByTestId("staff-checkin-submitted").first();
  await expect(submitted).toBeVisible();
  await expect(submitted.getByTestId("checkin-cancel-arm")).toHaveCount(0);

  // A foreign-profile tuple on a workspace the owner CAN reach surfaces a
  // non-disclosing failure — no instance list, no usable schedule target.
  await page.goto(`${BASE}/workspace/${wsBId}/clients/${profileId}/checkins`);
  await expect(page.getByTestId("staff-checkins-list")).toHaveCount(0);
  await expect(page.getByText("This Check-In isn’t available.")).toBeVisible();
});

test("consent withdrawal denies submitted answer detail; list keeps metadata", async ({
  page,
}) => {
  const instance = await fixtureInstance(new Date("2031-08-01T00:00:00.000Z"));
  await signIn(page, E2E.client);
  await page.goto(clientDetailUrl(instance.id));
  await page.locator("#ci-f-f_summary").fill("Consent test");
  await page.locator("#ci-f-f_energy").selectOption("o_high");
  await page.getByTestId("checkin-submit").click();
  await expect(page.getByTestId("checkin-submitted-state")).toBeVisible({
    timeout: 15_000,
  });

  // Withdraw — detail fails closed; the bounded list still renders.
  await prisma.consentRecord.updateMany({
    where: { clientProfileId: profileId },
    data: { revokedAt: new Date() },
  });
  await page.goto(clientDetailUrl(instance.id));
  await expect(page.getByText(/isn’t available|not available/i)).toBeVisible();
  await expect(page.getByText("Consent test")).toHaveCount(0);
  await page.goto(clientListUrl());
  await expect(
    page.getByTestId("checkin-item-submitted").first(),
  ).toBeVisible();

  // A fresh submission is also blocked while withdrawn.
  const second = await fixtureInstance(new Date("2031-09-01T00:00:00.000Z"));
  await page.goto(clientDetailUrl(second.id));
  await page.locator("#ci-f-f_summary").fill("Second");
  await page.locator("#ci-f-f_energy").selectOption("o_high");
  await page.getByTestId("checkin-submit").click();
  await expect(page.getByText(/isn’t available|not available/i)).toBeVisible();
  expect(
    await prisma.checkInSubmission.count({
      where: { instanceId: second.id },
    }),
  ).toBe(0);

  // Restore for suite hygiene.
  await prisma.consentRecord.updateMany({
    where: { clientProfileId: profileId },
    data: { revokedAt: null },
  });
});

// ── Responsive + accessibility ─────────────────────────────────────────

for (const [name, width] of [
  ["desktop", 1440],
  ["tablet", 834],
  ["mobile", 390],
] as const) {
  test(`staff + client Check-In surfaces at ${name} (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixtureInstance(
      new Date(
        `2031-10-0${width === 1440 ? 1 : width === 834 ? 2 : 3}T00:00:00.000Z`,
      ),
    );

    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    await checkNoOverflow(page);
    const submit = page.getByTestId("checkin-schedule-submit");
    const box = await submit.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);

    await signIn(page, E2E.client);
    await page.goto(clientListUrl());
    await checkNoOverflow(page);
    await page.getByTestId("checkin-item-scheduled").first().click();
    await checkNoOverflow(page);
    // Keyboard reachability — the submit control accepts focus once
    // enabled (it is pending/disabled while required answers are missing).
    await page.locator("#ci-f-f_summary").fill("a11y");
    await page.locator("#ci-f-f_energy").selectOption("o_high");
    await page.getByTestId("checkin-submit").focus();
    expect(
      await page.evaluate(() =>
        document.activeElement?.getAttribute("data-testid"),
      ),
    ).toBe("checkin-submit");
  });
}

// ── No P-025-C surface ─────────────────────────────────────────────────

test("client surfaces carry no review/acknowledgement metadata (P-025-C bounds it staff-side)", async ({
  page,
}) => {
  const instance = await fixtureInstance(new Date("2031-11-01T00:00:00.000Z"));
  await signIn(page, E2E.client);
  await page.goto(clientDetailUrl(instance.id));
  await page.locator("#ci-f-f_summary").fill("Done");
  await page.locator("#ci-f-f_energy").selectOption("o_high");
  await page.getByTestId("checkin-submit").click();
  await expect(page.getByTestId("checkin-submitted-state")).toBeVisible({
    timeout: 15_000,
  });

  // The client's own list + detail never mention review — the
  // acknowledgement is staff-internal workflow state (#91).
  await page.goto(clientListUrl());
  await expect(page.getByText(/review/i)).toHaveCount(0);
  await page.goto(clientDetailUrl(instance.id));
  await expect(page.getByText(/review/i)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /acknowledge|review/i }),
  ).toHaveCount(0);
});

// ── beforeunload post-success window (R1 P3-4) ─────────────────────────

test("beforeunload is suppressed immediately on success — inside the pre-unmount window", async ({
  page,
}) => {
  const instance = await fixtureInstance(new Date("2032-02-01T00:00:00.000Z"));
  await signIn(page, E2E.client);
  await page.goto(clientDetailUrl(instance.id));
  await expect(page.getByTestId("checkin-fill-form")).toBeVisible();

  // Dispatch a real cancelable beforeunload and inspect defaultPrevented —
  // behavioral probe, no internal-flag access.
  const wouldWarn = () =>
    page.evaluate(() => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
  expect(await wouldWarn()).toBe(false); // untouched form → no handler
  await page.locator("#ci-f-f_summary").fill("Window probe");
  expect(await wouldWarn()).toBe(true); // dirty → handler installed

  // Stretch the post-response window: hold the router.refresh RSC GET so
  // the dirty form stays mounted AFTER the action resolves. A successful
  // submit must suppress the prompt in THIS window — not only when the
  // submitted-state unmount eventually removes the listener.
  let releaseRefresh!: () => void;
  const gate = new Promise<void>((r) => {
    releaseRefresh = r;
  });
  await page.route("**/*", async (route, request) => {
    if (request.method() === "GET" && request.headers()["rsc"] === "1") {
      await gate;
    }
    return route.continue();
  });

  const actionDone = page.waitForResponse(
    (r) =>
      r.url().includes(`/workspace/${wsId}/check-ins/`) &&
      r.request().method() === "POST",
  );
  await page.locator("#ci-f-f_energy").selectOption("o_high");
  await page.getByTestId("checkin-submit").click();
  await actionDone;

  // The fill form is STILL mounted (refresh is held) — yet the dirty
  // handler must already be suppressed. A mutation that leaves the
  // listener active after success keeps defaultPrevented true here.
  await expect.poll(async () => wouldWarn(), { timeout: 8_000 }).toBe(false);

  // Release the refresh → submitted state mounts → listener removed for
  // real; navigating away immediately raises no dialog.
  releaseRefresh();
  // "wait" lets the gate-held handler finish its route.continue() before
  // the route is removed — unrouting mid-hold lets the server auto-continue
  // the in-flight request and the handler's continue then throws
  // "Route is already handled!".
  await page.unrouteAll({ behavior: "wait" });
  let dialogSeen = false;
  page.on("dialog", async (d) => {
    dialogSeen = true;
    await d.dismiss();
  });
  await expect(page.getByTestId("checkin-submitted-state")).toBeVisible({
    timeout: 15_000,
  });
  await page.goto(clientListUrl());
  await expect(
    page.getByTestId("checkin-item-submitted").first(),
  ).toBeVisible();
  expect(dialogSeen).toBe(false);
});
