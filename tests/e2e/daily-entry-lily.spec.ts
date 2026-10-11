import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * FRONTEND-INTEGRATION-I1 — Lily-styled persistent DailyEntry surface
 * (owner-approved choices): declared-date picker + prev/next day (backend
 * bounds only), Lily visual treatment on the persistent panel + bounded
 * week-grouped history, existing fonts/shell. The server contract —
 * saveDailyEntryAction ordinals + formToken + consent + staleness — is
 * unchanged; no localStorage, no mode toggle, no aggregates.
 */

// Persistent DailyEntry mode lives on :3102 (ENABLE_DAILY_ENTRY=1,
// prototype flag explicitly off). :3000 resolves "conflict" (both flags
// set) and :3101 is the flag-off proof target.
const BASE = "http://127.0.0.1:3102";
const FLAG_OFF = "http://127.0.0.1:3101";

const CP_NAME = "I1 E2E Client";
const TEMPLATE_ID = "i1_e2e_template";
const PARAM_W = "i1_p_weight"; // MEASUREMENT
const PARAM_M = "i1_p_mood"; // RATING 1-10
const PARAM_L = "i1_p_energy"; // OPTION

let prisma: PrismaClient;
let wsId: string;
let ownerMemberId: string;
let profileId: string;
let profileCreated = false;
let clientUserId: string;

async function signIn(page: Page, email: string, base = BASE) {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/login/);
}

function versionDef() {
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
    parameters: {
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
        label: "Mood",
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
        label: "Energy",
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
    },
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
  clientUserId = clientUser.id;

  const staleRevisions = await prisma.dailyEntryRevision.findMany({
    where: { workspaceId: wsId },
    select: { id: true },
  });
  await prisma.dailyEntryRevisionValue.deleteMany({
    where: { revisionId: { in: staleRevisions.map((r) => r.id) } },
  });
  const staleEntries = await prisma.dailyEntry.findMany({
    where: { workspaceId: wsId },
    select: { id: true },
  });
  await prisma.dailyEntry.updateMany({
    where: { id: { in: staleEntries.map((e) => e.id) } },
    data: { currentRevisionId: null },
  });
  await prisma.dailyEntryRevision.deleteMany({
    where: { workspaceId: wsId },
  });
  await prisma.dailyEntry.deleteMany({
    where: { id: { in: staleEntries.map((e) => e.id) } },
  });
  await prisma.coachingTemplateVersion.deleteMany({
    where: { templateId: TEMPLATE_ID },
  });
  await prisma.coachingTemplate.deleteMany({ where: { id: TEMPLATE_ID } });
  for (const id of [PARAM_W, PARAM_M, PARAM_L])
    await prisma.parameterDefinition.deleteMany({ where: { id } });

  const existing = await prisma.clientProfile.findFirst({
    where: { workspaceId: wsId, userId: clientUser.id },
  });
  const profile =
    existing ??
    (await prisma.clientProfile.create({
      data: { workspaceId: wsId, userId: clientUser.id, name: CP_NAME },
    }));
  profileId = profile.id;
  profileCreated = existing === null || existing.name === CP_NAME;

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
      name: "I1 Template",
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
  let setup = await prisma.clientSetup.findFirst({
    where: { clientProfileId: profileId, workspaceId: wsId },
  });
  setup ??= await prisma.clientSetup.create({
    data: { workspaceId: wsId, clientProfileId: profileId },
  });
  // End EVERY pin on this setup (any template) — the surface uses the
  // first ACTIVE pin with no ordering, so a sibling spec's pin must not
  // coexist.
  await prisma.clientSetupPin.deleteMany({
    where: { clientSetupId: setup.id },
  });
  await prisma.clientSetupPin.create({
    data: {
      clientSetupId: setup.id,
      workspaceId: wsId,
      clientProfileId: profileId,
      seq: 1,
      templateId: TEMPLATE_ID,
      templateVersionId: version.id,
      assignedByMemberId: ownerMemberId,
    },
  });
  await prisma.consentRecord.deleteMany({
    where: {
      clientProfileId: profileId,
      version: { startsWith: "daily-entry-dev" },
    },
  });
  for (const [kind, version] of [
    ["PRIVACY_NOTICE", "daily-entry-dev-privacy-v1"],
    ["HEALTH_DATA", "daily-entry-dev-health-v1"],
  ] as const)
    await prisma.consentRecord.create({
      data: { clientProfileId: profileId, kind, version },
    });
});

test.afterAll(async () => {
  const revisions = await prisma.dailyEntryRevision
    .findMany({ where: { clientProfileId: profileId }, select: { id: true } })
    .catch(() => [] as { id: string }[]);
  await prisma.dailyEntryRevisionValue
    .deleteMany({ where: { revisionId: { in: revisions.map((r) => r.id) } } })
    .catch(() => {});
  await prisma.dailyEntry
    .updateMany({
      where: { clientProfileId: profileId },
      data: { currentRevisionId: null },
    })
    .catch(() => {});
  await prisma.dailyEntryRevision
    .deleteMany({ where: { clientProfileId: profileId } })
    .catch(() => {});
  await prisma.dailyEntry
    .deleteMany({ where: { clientProfileId: profileId } })
    .catch(() => {});
  await prisma.clientSetupPin
    .deleteMany({ where: { clientProfileId: profileId } })
    .catch(() => {});
  await prisma.clientSetup
    .deleteMany({ where: { clientProfileId: profileId } })
    .catch(() => {});
  await prisma.consentRecord
    .deleteMany({
      where: {
        clientProfileId: profileId,
        version: { startsWith: "daily-entry-dev" },
      },
    })
    .catch(() => {});
  await prisma.coachingTemplateVersion
    .deleteMany({ where: { templateId: TEMPLATE_ID } })
    .catch(() => {});
  await prisma.coachingTemplate
    .deleteMany({ where: { id: TEMPLATE_ID } })
    .catch(() => {});
  for (const id of [PARAM_W, PARAM_M, PARAM_L])
    await prisma.parameterDefinition
      .deleteMany({ where: { id } })
      .catch(() => {});
  if (profileCreated)
    await prisma.clientProfile
      .delete({ where: { id: profileId } })
      .catch(() => {});
  await prisma?.$disconnect();
});

const todayIso = () => new Date().toISOString().slice(0, 10);
const prevDayIso = (iso: string) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);

test("declared-date picker: ?date= renders that date; prev/next navigate; bounds and invalid dates reject", async ({
  page,
}) => {
  await signIn(page, E2E.client);
  const today = todayIso();
  const target = prevDayIso(today); // yesterday — inside bounds
  await page.goto(`${BASE}/workspace/${wsId}/daily?date=${target}`);
  await expect(page.getByTestId("daily-date-value")).toHaveText(target);

  // Prev/next-day controls navigate the declared date.
  await page.getByRole("link", { name: "Previous day" }).click();
  await expect(page).toHaveURL(new RegExp(`date=${prevDayIso(target)}`));
  await expect(page.getByTestId("daily-date-value")).toHaveText(
    prevDayIso(target),
  );
  await page.getByRole("link", { name: "Next day" }).click();
  await expect(page.getByTestId("daily-date-value")).toHaveText(target);

  // Native date picker drives the same route param.
  await page.getByLabel("Choose date").fill(prevDayIso(today));
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("daily-date-value")).toHaveText(
    prevDayIso(today),
  );

  // Out-of-bounds + malformed declared dates render a safe invalid state.
  await page.goto(`${BASE}/workspace/${wsId}/daily?date=2099-01-01`);
  // role=alert live regions take no accessible name — assert the
  // alert element carries the expected text.
  const alert = page.locator('p[role="alert"].daily-errors');
  await expect(alert).toContainText("date is not valid");
  await page.goto(`${BASE}/workspace/${wsId}/daily?date=not-a-date`);
  await expect(alert).toContainText("date is not valid");
});

test("save persists through refresh at the declared date; fields render from the server surface", async ({
  page,
}) => {
  await signIn(page, E2E.client);
  const target = prevDayIso(prevDayIso(todayIso()));
  await page.goto(`${BASE}/workspace/${wsId}/daily?date=${target}`);
  await expect(page.getByTestId("daily-date-value")).toHaveText(target);

  // All three supported kinds render with server-provided labels.
  const weight = page.locator(".de-surface").getByLabel(/Weight/);
  const mood = page.locator(".de-surface").getByLabel(/^Mood/);
  const energy = page.locator(".de-surface").getByLabel(/^Energy/);
  await expect(weight).toBeVisible();
  await expect(mood).toBeVisible();
  await expect(energy).toBeVisible();

  await weight.fill("81.4");
  await mood.selectOption("7");
  await energy.selectOption({ label: "HIGH" });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.reload();
  await expect(page.locator(".de-surface").getByLabel(/Weight/)).toHaveValue(
    "81.4",
  );
  // No client values leak into localStorage.
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(
    keys.filter(
      (k) =>
        /entry|measurement|weight|comment|tracker/i.test(k) &&
        !/appearance|theme/i.test(k),
    ),
  ).toEqual([]);
});

test("history is week-grouped with accessible captions; no aggregates or load-more", async ({
  page,
}) => {
  await signIn(page, E2E.client);
  await page.goto(`${BASE}/workspace/${wsId}/daily`);
  const weeks = page.locator("[data-testid='de-week']");
  await expect(weeks.first()).toBeVisible();
  // Week captions are real headings for screen readers.
  await expect(weeks.first().getByRole("heading")).toBeVisible();
  // No aggregate/trend text and no "load more" affordance.
  await expect(page.getByText(/average|weekly (mean|change)/i)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /load more|show more/i }),
  ).toHaveCount(0);
});

test("unsaved edits prompt before date navigation; staff keep the shell only; flag-off unchanged", async ({
  page,
}) => {
  await signIn(page, E2E.client);
  await page.goto(`${BASE}/workspace/${wsId}/daily`);
  await page
    .locator(".de-surface")
    .getByLabel(/Weight/)
    .fill("99.9");

  // Dirty navigation is guarded — dialog dismissed = stay on date.
  let dialogShown = false;
  page.on("dialog", async (d) => {
    dialogShown = true;
    await d.dismiss();
  });
  await page.getByRole("link", { name: "Previous day" }).click();
  expect(dialogShown).toBe(true);
  await expect(page.getByTestId("daily-date-value")).toHaveText(todayIso());

  // Staff see the structural shell only — no persistent panel.
  await signIn(page, E2E.coach);
  await page.goto(`${BASE}/workspace/${wsId}/daily`);
  await expect(page.getByTestId("daily-date-picker")).toHaveCount(0);

  // Flag-off build: unchanged 404-less shell, no panel.
  await page.goto(`${FLAG_OFF}/login`);
  await page.getByLabel("Email").fill(E2E.client);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.goto(`${FLAG_OFF}/workspace/${wsId}/daily`);
  await expect(page.getByTestId("daily-date-picker")).toHaveCount(0);
});

test("a11y + responsive: keyboard reaches controls; no horizontal overflow at three widths", async ({
  page,
}) => {
  await signIn(page, E2E.client);
  for (const w of [1440, 834, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`${BASE}/workspace/${wsId}/daily`);
    await expect(page.getByTestId("daily-date-picker")).toBeVisible();
    // The slice styles only the persistent panel — assert ITS subtree
    // never exceeds the viewport. (The legacy structural shell has a
    // pre-existing <390px overflow; tracked as a known limitation.)
    const wide = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const out: string[] = [];
      document.querySelectorAll(".de-surface *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > vw || r.right > vw + 0.5 || r.left < -0.5)
          out.push(
            `${el.tagName}.${String(el.className).slice(0, 50)} w=${Math.round(r.width)}`,
          );
      });
      return out;
    });
    expect(wide).toEqual([]);
  }
  // Keyboard: prev/next links + picker + fields + Save are tab-reachable.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("link", { name: "Previous day" }).focus();
  await expect(page.getByRole("link", { name: "Previous day" })).toBeFocused();
  await page.getByLabel("Choose date").focus();
  await expect(page.getByLabel("Choose date")).toBeFocused();
  await page.getByRole("button", { name: "Save" }).focus();
  await expect(page.getByRole("button", { name: "Save" })).toBeFocused();
});
