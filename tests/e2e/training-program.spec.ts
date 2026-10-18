import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * TRAINING-I1A (PROMPT 244) — real-browser synthetic journey on the
 * production build: assigned coach creates a week-based program → adds
 * sessions/exercises → saves → confirms timezone → publishes → client
 * views the prescribed week (verbatim values); a scheduled replacement
 * is labelled and cancellable; flag-off server 404s both surfaces.
 * Synthetic deterministic fixtures only (ti1a_*).
 */

const BASE = "http://127.0.0.1:3000";
const FLAG_OFF = "http://127.0.0.1:3101";

let prisma: PrismaClient;
let wsId: string;
let profileId = "";
let profileCreated = false;
let coachMemberId: string;

async function signIn(page: Page, email: string, base = BASE) {
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

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test.beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { slug: E2E.workspaceSlug },
  });
  wsId = ws.id;
  const [coachMember, clientUser] = await Promise.all([
    prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsId, user: { email: E2E.coach } },
    }),
    prisma.user.findUniqueOrThrow({ where: { email: E2E.client } }),
  ]);
  coachMemberId = coachMember.id;
  profileId = `ti1a_e2e_client`;
  const existing = await prisma.clientProfile.findUnique({
    where: { id: profileId },
  });
  if (!existing) {
    await prisma.clientProfile.create({
      data: {
        id: profileId,
        workspaceId: wsId,
        userId: clientUser.id,
        name: "TI1A Fixture Client",
      },
    });
    profileCreated = true;
  }
  await prisma.clientAssignment.upsert({
    where: {
      clientProfileId_coachMemberId: {
        clientProfileId: profileId,
        coachMemberId,
      },
    },
    update: { status: "ACTIVE", role: "PRIMARY" },
    create: {
      workspaceId: wsId,
      clientProfileId: profileId,
      coachMemberId,
      role: "PRIMARY",
      status: "ACTIVE",
    },
  });
  for (const [kind, version] of [
    ["PRIVACY_NOTICE", "training-plan-dev-privacy-v1"],
    ["HEALTH_DATA", "training-plan-dev-health-v1"],
  ] as const) {
    const existing = await prisma.consentRecord.findFirst({
      where: { clientProfileId: profileId, kind, version },
    });
    if (existing) {
      await prisma.consentRecord.update({
        where: { id: existing.id },
        data: { revokedAt: null },
      });
    } else {
      await prisma.consentRecord.create({
        data: {
          clientProfileId: profileId,
          kind,
          version,
          grantedByUserId: clientUser.id,
          source: "CLIENT_SELF",
        },
      });
    }
  }
});

test.afterAll(async () => {
  const programs = await prisma.trainingProgram
    .findMany({ where: { clientProfileId: profileId }, select: { id: true } })
    .catch(() => [] as { id: string }[]);
  const programIds = programs.map((p) => p.id);
  const versions = programIds.length
    ? await prisma.trainingProgramVersion.findMany({
        where: { programId: { in: programIds } },
        select: { id: true },
      })
    : [];
  await prisma.auditEvent
    .deleteMany({
      where: {
        OR: [
          {
            resourceType: "training_program",
            resourceId: { in: programIds.length ? programIds : ["-"] },
          },
          {
            resourceType: "training_program_version",
            resourceId: { in: versions.map((v) => v.id).concat(["-"]) },
          },
          {
            resourceType: "training_program",
            subjectClientProfileId: profileId,
          },
          {
            resourceType: "training_program_version",
            subjectClientProfileId: profileId,
          },
        ],
      },
    })
    .catch(() => {});
  await prisma.trainingProgramVersion
    .deleteMany({
      where: { programId: { in: programIds.length ? programIds : ["-"] } },
    })
    .catch(() => {});
  await prisma.trainingProgram
    .deleteMany({ where: { clientProfileId: profileId } })
    .catch(() => {});
  await prisma.clientAssignment
    .deleteMany({ where: { clientProfileId: profileId } })
    .catch(() => {});
  await prisma.consentRecord
    .deleteMany({
      where: {
        clientProfileId: profileId,
        version: { startsWith: "training-plan-dev" },
      },
    })
    .catch(() => {});
  if (profileCreated)
    await prisma.clientProfile
      .delete({ where: { id: profileId } })
      .catch(() => {});
  await prisma.$disconnect();
});

test("coach authors → publishes → client views prescribed week", async ({
  page,
}) => {
  const listUrl = `${BASE}/workspace/${wsId}/clients/${profileId}/training-program`;
  await signIn(page, E2E.coach);
  await page.goto(listUrl);
  await expect(page.getByTestId("staff-training-page")).toBeVisible();

  // Create a program starting today.
  await page.getByTestId("tp-create-title").fill("E2E Base Block");
  await page.getByTestId("tp-create-start").fill(today());
  await page.getByTestId("tp-create-weeks").fill("4");
  await page.getByTestId("tp-create-tz").fill("UTC");
  await page.getByTestId("tp-create-submit").click();
  await expect(page.getByTestId("staff-training-detail")).toBeVisible();

  // Add a session + exercise + prescription in week 1.
  await page.getByTestId("tp-session-add").click();
  const sessionFieldset = page.locator("fieldset[data-testid^='tp-session-']");
  await expect(sessionFieldset.first()).toBeVisible();
  await sessionFieldset
    .first()
    .getByTestId(/tp-exercise-add-/)
    .click();
  const exercise = sessionFieldset
    .first()
    .locator("fieldset[data-testid^='tp-exercise-']")
    .first();
  await exercise.getByTestId(/tp-ex-name-/).fill("Back squat");
  await exercise.getByTestId(/tp-cell-.*-sets/).fill("4");
  await exercise.getByTestId(/tp-cell-.*-reps/).fill("6");
  await page.getByTestId("tp-save-draft").click();
  await expect(page.getByTestId("training-status")).toContainText(/saved/i);

  // Publish v1 (effective at the program start date).
  await page.getByTestId("tp-effective").fill(today());
  await page.getByTestId("tp-publish").click();
  await expect(page.getByTestId("training-status")).toContainText(/published/i);
  await checkNoOverflow(page);

  // Client views week 1 verbatim.
  await signIn(page, E2E.client);
  await page.goto(`${BASE}/workspace/${wsId}/training-program`);
  await expect(page.getByTestId("client-training-page")).toBeVisible();
  await expect(page.getByTestId("training-current")).toContainText(
    "E2E Base Block",
  );
  await expect(page.getByTestId("training-current")).toContainText(
    "Back squat",
  );
  await expect(page.getByTestId("training-current")).toContainText("Sets: 4");
  await expect(page.getByTestId("training-current")).toContainText("Reps: 6");
  // No write affordance exists for the client.
  await expect(page.getByTestId("tp-save-draft")).toHaveCount(0);
  await checkNoOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await checkNoOverflow(page);
});

test("scheduled replacement is labelled and cancellable", async ({ page }) => {
  const listUrl = `${BASE}/workspace/${wsId}/clients/${profileId}/training-program`;
  await signIn(page, E2E.coach);
  await page.goto(listUrl);
  await expect(page.getByTestId("staff-training-page")).toBeVisible();

  // Create the replacement program starting in 4 weeks.
  await page.getByTestId("tp-create-title").fill("E2E Next Block");
  await page.getByTestId("tp-create-start").fill(inDays(28));
  await page.getByTestId("tp-create-weeks").fill("4");
  await page.getByTestId("tp-create-tz").fill("UTC");
  await page.getByTestId("tp-create-submit").click();
  await expect(page.getByTestId("staff-training-detail")).toBeVisible();

  // Minimum complete draft (session + exercise + prescription), save, then
  // publish claiming the current program.
  await page.getByTestId("tp-session-add").click();
  const fieldset = page.locator("fieldset[data-testid^='tp-session-']");
  await fieldset
    .first()
    .getByTestId(/tp-exercise-add-/)
    .click();
  const exercise = fieldset
    .first()
    .locator("fieldset[data-testid^='tp-exercise-']")
    .first();
  await exercise.getByTestId(/tp-ex-name-/).fill("Leg press");
  await exercise.getByTestId(/tp-cell-.*-sets/).fill("3");
  await exercise.getByTestId(/tp-cell-.*-reps/).fill("10");
  await page.getByTestId("tp-save-draft").click();
  await expect(page.getByTestId("training-status")).toContainText(/saved/i);
  await page.getByTestId("tp-predecessor").selectOption({ index: 1 });
  await page.getByTestId("tp-effective").fill(inDays(28));
  await page.getByTestId("tp-publish").click();
  await expect(page.getByTestId("training-status")).toContainText(/published/i);

  // The pending replacement offers cancellation.
  await expect(page.getByTestId("tp-cancel")).toBeVisible();
  await page.getByTestId("tp-cancel").click();
  await expect(page.getByTestId("training-status")).toContainText(/cancelled/i);

  // Client still sees only the current program — nothing leaked.
  await signIn(page, E2E.client);
  await page.goto(`${BASE}/workspace/${wsId}/training-program`);
  await expect(page.getByTestId("training-current")).toBeVisible();
  await expect(page.getByTestId("training-current")).not.toContainText(
    "E2E Next Block",
  );
});

test("replacement takeover then v2 publishes through the UI", async ({
  page,
}) => {
  const listUrl = `${BASE}/workspace/${wsId}/clients/${profileId}/training-program`;
  await signIn(page, E2E.coach);
  await page.goto(listUrl);
  await expect(page.getByTestId("staff-training-page")).toBeVisible();

  // ── Root regression: a later version on the non-replacement root ──
  await page
    .locator("a[data-testid^='tp-program-link-']", {
      hasText: "E2E Base Block",
    })
    .click();
  await expect(page.getByTestId("staff-training-detail")).toBeVisible();
  const rootEx = page.locator("fieldset[data-testid^='tp-exercise-']").first();
  await rootEx.getByTestId(/tp-cell-.*-reps/).fill("8");
  await page.getByTestId("tp-save-draft").click();
  await expect(page.getByTestId("training-status")).toContainText(/saved/i);
  await page.getByTestId("tp-effective").fill(today());
  await page.getByTestId("tp-publish").click();
  await expect(page.getByTestId("training-status")).toContainText(
    "Published version 2.",
  );
  // Identical retry at the same revision (root, no claim involved):
  // idempotent replay — no new version, same success message.
  await page.getByTestId("tp-publish").click();
  await expect(page.getByTestId("training-status")).toContainText(
    "Published version 2.",
  );

  // ── Replacement v1 through the UI (immediate takeover + ack) ──
  await page.goto(listUrl);
  // One-week replacement: after takeover the client is in the final
  // week — the page must render the prescription, not "has ended".
  await page.getByTestId("tp-create-title").fill("E2E Chain R3");
  await page.getByTestId("tp-create-start").fill(today());
  await page.getByTestId("tp-create-weeks").fill("1");
  await page.getByTestId("tp-create-tz").fill("UTC");
  await page.getByTestId("tp-create-submit").click();
  await expect(page.getByTestId("staff-training-detail")).toBeVisible();
  await page.getByTestId("tp-session-add").click();
  const fieldset = page.locator("fieldset[data-testid^='tp-session-']");
  await fieldset
    .first()
    .getByTestId(/tp-exercise-add-/)
    .click();
  const exercise = fieldset
    .first()
    .locator("fieldset[data-testid^='tp-exercise-']")
    .first();
  await exercise.getByTestId(/tp-ex-name-/).fill("Hack squat");
  await exercise.getByTestId(/tp-cell-.*-sets/).fill("3");
  await exercise.getByTestId(/tp-cell-.*-reps/).fill("10");
  await page.getByTestId("tp-save-draft").click();
  await expect(page.getByTestId("training-status")).toContainText(/saved/i);
  await page
    .getByTestId("tp-predecessor")
    .selectOption({ label: "E2E Base Block" });
  await page.getByTestId("tp-ack-takeover").check();
  await page.getByTestId("tp-effective").fill(today());
  await page.getByTestId("tp-publish").click();
  await expect(page.getByTestId("training-status")).toContainText(
    "Published version 1.",
  );

  // ── Final-week client view (acceptance defect D1) ──
  await signIn(page, E2E.client);
  await page.goto(`${BASE}/workspace/${wsId}/training-program`);
  await expect(page.getByTestId("training-current")).toBeVisible();
  await expect(page.getByTestId("training-current")).toContainText(
    "E2E Chain R3",
  );
  await expect(page.getByTestId("training-current")).toContainText(
    "Hack squat",
  );
  await expect(page.getByTestId("training-current")).toContainText("Sets: 3");
  await expect(page.getByTestId("training-completed")).toHaveCount(0);

  // ── The defect: a second version on the replacement through the UI ──
  await signIn(page, E2E.coach);
  await page.goto(listUrl);
  const r3Link = page.locator("a[data-testid^='tp-program-link-']", {
    hasText: "E2E Chain R3",
  });
  const r3Href = await r3Link.getAttribute("href");
  // Fresh mount via real navigation: after publish the Replaces control
  // is hidden; the publish must not resubmit the predecessor claim
  // (service rejects later-version claims).
  await page.goto(`${BASE}${r3Href}`);
  await expect(page.getByTestId("staff-training-detail")).toBeVisible();
  await expect(page.getByTestId("tp-predecessor")).toHaveCount(0);

  // ── F1: identical retry of the committed v1 across a remount ──
  // Simulates a lost v1 publish response: same revision, no draft edit.
  // The replay must reproduce the original request (incl. its
  // predecessor claim) and return the committed version — not error.
  const versionsBefore = await prisma.trainingProgramVersion.count({
    where: {
      program: { clientProfileId: profileId, title: "E2E Chain R3" },
    },
  });
  await page.getByTestId("tp-publish").click();
  await expect(page.getByTestId("training-status")).toContainText(
    "Published version 1.",
  );
  const versionsAfterReplay = await prisma.trainingProgramVersion.count({
    where: {
      program: { clientProfileId: profileId, title: "E2E Chain R3" },
    },
  });
  expect(versionsAfterReplay).toBe(versionsBefore);

  // A changed effective date is a different request — still rejected.
  await page.getByTestId("tp-effective").fill(inDays(2));
  await page.getByTestId("tp-publish").click();
  await expect(page.getByTestId("training-status")).toContainText(
    /already published/i,
  );

  const ex2 = page.locator("fieldset[data-testid^='tp-exercise-']").first();
  await ex2.getByTestId(/tp-cell-.*-reps/).fill("12");
  await page.getByTestId("tp-save-draft").click();
  await expect(page.getByTestId("training-status")).toContainText(/saved/i);
  await page.getByTestId("tp-effective").fill(inDays(1));
  await page.getByTestId("tp-publish").click();
  await expect(page.getByTestId("training-status")).toContainText(
    "Published version 2.",
  );

  // Persisted proof: two committed versions carrying the v2 content.
  const prog = await prisma.trainingProgram.findFirstOrThrow({
    where: { clientProfileId: profileId, title: "E2E Chain R3" },
  });
  const versions = await prisma.trainingProgramVersion.findMany({
    where: { programId: prog.id },
    orderBy: { versionSeq: "asc" },
    select: { id: true, versionSeq: true, payload: true },
  });
  expect(versions.map((v) => v.versionSeq)).toEqual([1, 2]);
  const v2 = versions[1].payload as {
    weeks: {
      week: number;
      sessions: { exercises: { reps?: string }[] }[];
    }[];
  };
  expect(v2.weeks[0]?.sessions[0]?.exercises[0]?.reps).toBe("12");
  const createAudits = await prisma.auditEvent.count({
    where: {
      action: "CREATE",
      resourceType: "training_program_version",
      resourceId: { in: versions.map((v) => v.id) },
    },
  });
  expect(createAudits).toBe(2);
});

test("evergreen program: ongoing authoring, post-week-1 update, client view", async ({
  page,
}) => {
  const listUrl = `${BASE}/workspace/${wsId}/clients/${profileId}/training-program`;
  await signIn(page, E2E.coach);
  await page.goto(listUrl);
  await expect(page.getByTestId("staff-training-page")).toBeVisible();

  // Create an ongoing program via the mode select — no week count shown.
  await page.getByTestId("tp-create-title").fill("E2E Ongoing Block");
  await page.getByTestId("tp-create-start").fill(today());
  await page.getByTestId("tp-create-mode").selectOption("EVERGREEN");
  await expect(page.getByTestId("tp-create-weeks")).toHaveCount(0);
  await page.getByTestId("tp-create-tz").fill("UTC");
  await page.getByTestId("tp-create-submit").click();
  await expect(page.getByTestId("staff-training-detail")).toBeVisible();

  // Evergreen editor: no week navigation, single ongoing prescription.
  await expect(page.getByTestId("tp-week")).toHaveCount(0);
  await expect(page.getByTestId("tp-weeks")).toHaveCount(0);
  await page.getByTestId("tp-session-add").click();
  const fieldset = page.locator("fieldset[data-testid^='tp-session-']");
  await fieldset
    .first()
    .getByTestId(/tp-exercise-add-/)
    .click();
  const exercise = fieldset
    .first()
    .locator("fieldset[data-testid^='tp-exercise-']")
    .first();
  await exercise.getByTestId(/tp-ex-name-/).fill("Deadlift");
  await exercise.getByTestId(/tp-cell-.*-sets/).fill("3");
  await exercise.getByTestId(/tp-cell-.*-reps/).fill("5");
  await page.getByTestId("tp-save-draft").click();
  await expect(page.getByTestId("training-status")).toContainText(/saved/i);
  // Evergreen is a replacement of the current week-based program —
  // the single-root rule forbids a second root. Immediate takeover.
  await page
    .getByTestId("tp-predecessor")
    .selectOption({ label: "E2E Chain R3" });
  await page.getByTestId("tp-ack-takeover").check();
  await page.getByTestId("tp-effective").fill(today());
  await page.getByTestId("tp-publish").click();
  await expect(page.getByTestId("training-status")).toContainText(
    "Published version 1.",
  );

  // Client: ongoing label, prescription verbatim, no "has ended".
  await signIn(page, E2E.client);
  await page.goto(`${BASE}/workspace/${wsId}/training-program`);
  await expect(page.getByTestId("training-mode")).toContainText(
    "ongoing program",
  );
  await expect(page.getByTestId("training-current")).toContainText("Deadlift");
  await expect(page.getByTestId("training-completed")).toHaveCount(0);

  // Seeded prerequisite (disclosed): age the program 30 days so the next
  // save/publish crosses the old seven-day lock + `program_ended` bounds.
  const prog = await prisma.trainingProgram.findFirstOrThrow({
    where: { clientProfileId: profileId, title: "E2E Ongoing Block" },
    include: { versions: true },
  });
  const agedStart = new Date(Date.now() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  await prisma.trainingProgram.update({
    where: { id: prog.id },
    data: { startDate: new Date(`${agedStart}T00:00:00Z`) },
  });
  for (const v of prog.versions)
    await prisma.trainingProgramVersion.update({
      where: { id: v.id },
      data: {
        effectiveDate: new Date(`${agedStart}T00:00:00Z`),
        activationInstant: new Date(`${agedStart}T00:00:00Z`),
      },
    });

  // UI: draft edit + save at "day 30" — no locked-week rejection.
  await signIn(page, E2E.coach);
  await page.goto(
    `${BASE}/workspace/${wsId}/clients/${profileId}/training-program/${prog.id}`,
  );
  await expect(page.getByTestId("staff-training-detail")).toBeVisible();
  await expect(page.getByTestId("tp-mode-locked")).toContainText("Ongoing");
  const ex2 = page.locator("fieldset[data-testid^='tp-exercise-']").first();
  await ex2.getByTestId(/tp-cell-.*-reps/).fill("8");
  await page.getByTestId("tp-save-draft").click();
  await expect(page.getByTestId("training-status")).toContainText(/saved/i);
  // Publish v2 today — no `program_ended`.
  await page.getByTestId("tp-effective").fill(today());
  await page.getByTestId("tp-publish").click();
  await expect(page.getByTestId("training-status")).toContainText(
    "Published version 2.",
  );

  // Client sees the prospective update + the updated marker.
  await signIn(page, E2E.client);
  await page.goto(`${BASE}/workspace/${wsId}/training-program`);
  await expect(page.getByTestId("training-current")).toContainText("Reps: 8");
  await expect(page.getByTestId("training-marker")).toContainText("Updated");
  await checkNoOverflow(page);
});

test("unassigned owner sees a read-only list", async ({ page }) => {
  await signIn(page, E2E.owner);
  await page.goto(
    `${BASE}/workspace/${wsId}/clients/${profileId}/training-program`,
  );
  await expect(page.getByTestId("staff-training-page")).toBeVisible();
  await expect(page.getByTestId("tp-create-submit")).toHaveCount(0);
});

test("flag-off server: staff and client routes return 404", async ({
  page,
}) => {
  await signIn(page, E2E.coach, FLAG_OFF);
  const staffResp = await page.goto(
    `${FLAG_OFF}/workspace/${wsId}/clients/${profileId}/training-program`,
  );
  expect(staffResp?.status()).toBe(404);
  await signIn(page, E2E.client, FLAG_OFF);
  const clientResp = await page.goto(
    `${FLAG_OFF}/workspace/${wsId}/training-program`,
  );
  expect(clientResp?.status()).toBe(404);
});
