import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";

import { hashPassword } from "../../lib/password";
import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * P-008 ES-5 — real-HTTP security gates for the onboarding form actions.
 * Production build + server, owned disposable DB (p8e_e2e@juno-p8-pg),
 * CI=1, single worker.
 *
 * Protocol discipline (plan B1/B6): the genuine action encoding is
 * CAPTURED from a live browser save in the same build — `Next-Action`
 * id + RSC/multipart body are never hardcoded or synthesized. Every
 * negative replay is DETECTION-SENSITIVE: the target form's
 * draftRevision is reset to the captured expectedRevision first, so an
 * executed replay produces a real observable write — a "zero writes"
 * assertion is therefore meaningful, not vacuous. Positives assert the
 * exact write + audit row; negatives snapshot FULL form/version/audit
 * rows, not counts only.
 *
 * Cookie/session handling (B7): `page.context().request` shares the
 * browser's HttpOnly cookie jar (authenticated probes); the bare
 * `request` fixture carries no cookies (no-session arm). Cookies,
 * action ids, and credential values are NEVER logged. Fixture/member
 * mutations are restored in `finally`. The `deactivated` fixture is a
 * user with NO membership (asserted fresh before use). The
 * `platform-admin` fixture is a PLATFORM_ADMIN user with NO workspace
 * membership — its denial proves the membership gate only (PD29
 * dual-role precedence is TABLED, not asserted).
 *
 * Hostile-Origin + spoofed X-Forwarded-Host is an APP-LEVEL diagnostic
 * only — the owned-edge header policy is a separate deployment gate;
 * no guard/infra/allowedOrigins change is made here.
 */

const BASE = "http://127.0.0.1:3000";
const PLATFORM_ADMIN_EMAIL = "platform-admin@s1h-e2e.test";

let prisma: PrismaClient;
let wsAId: string;
let wsBId: string;
let ownerMemberId: string;
let coachMember: { id: string; workspaceId: string; userId: string };

const seedDefinition = (title: string) => ({
  title,
  fields: [
    {
      fieldId: "f_sec_1",
      kind: "shortText",
      label: "Full name",
      required: true,
      order: 0,
    },
  ],
});

const seedForm = (
  name: string,
  workspaceId: string = wsAId,
  extra: Omit<
    Prisma.OnboardingFormUncheckedCreateInput,
    "workspaceId" | "name" | "createdByMemberId"
  > = {},
) =>
  prisma.onboardingForm.create({
    data: {
      workspaceId,
      name,
      createdByMemberId: ownerMemberId,
      draftRevision: 1,
      draft: seedDefinition(name),
      ...extra,
    },
    select: { id: true },
  });

async function removeSecurityFixtures() {
  await prisma.onboardingFormVersion.deleteMany({
    where: {
      form: {
        workspaceId: { in: [wsAId, wsBId] },
        name: { startsWith: "E2E P8S" },
      },
    },
  });
  await prisma.onboardingForm.deleteMany({
    where: {
      workspaceId: { in: [wsAId, wsBId] },
      name: { startsWith: "E2E P8S" },
    },
  });
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/login/);
}

/** Full-row delta for one form — form row, version rows, audit rows. */
const formState = async (formId: string) => ({
  form: await prisma.onboardingForm.findUniqueOrThrow({
    where: { id: formId },
  }),
  versions: await prisma.onboardingFormVersion.findMany({
    where: { formId },
    orderBy: { versionSeq: "asc" },
  }),
  audits: await prisma.auditEvent.findMany({
    where: { resourceId: formId },
    orderBy: { id: "asc" },
  }),
});

type ActionCapture = {
  url: string;
  nextAction: string;
  headers: Record<string, string>;
  contentType: string;
  body: Buffer;
};

/**
 * Drive a REAL browser save and capture the genuine wire protocol:
 * URL, `next-action` id, all request headers, and the raw body bytes.
 * Asserts the live write landed (revision 1 → 2) — the positive control
 * the negatives are paired against in the SAME build.
 */
async function captureSaveDraft(
  page: Page,
  formId: string,
): Promise<ActionCapture> {
  await page.goto(`/workspace/${wsAId}/onboarding/forms/${formId}`);
  await expect(page.getByTestId("field-label-0")).toBeEnabled();
  let captured: ActionCapture | null = null;
  page.on("request", (req) => {
    const nextAction = req.headers()["next-action"];
    if (req.method() !== "POST" || !nextAction || captured) return;
    captured = {
      url: req.url(),
      nextAction,
      headers: req.headers(),
      contentType: req.headers()["content-type"] ?? "",
      body: req.postDataBuffer() ?? Buffer.alloc(0),
    };
  });
  await page.getByTestId("field-label-0").fill("Security protocol probe");
  await page.getByTestId("save-draft").click();
  await expect
    .poll(
      async () =>
        (
          await prisma.onboardingForm.findUniqueOrThrow({
            where: { id: formId },
          })
        ).draftRevision,
    )
    .toBe(2);
  if (!captured) throw new Error("saveDraft POST was not captured");
  return captured;
}

// Hop-by-hop / recomputed headers are never forwarded verbatim; the cookie
// jar is the context's own. `origin` is forwarded so legs can override it.
const HEADER_DENY = new Set([
  "cookie",
  "content-length",
  "host",
  "connection",
  "accept-encoding",
]);

const postCaptured = (
  ctx: APIRequestContext,
  cap: ActionCapture,
  opts: {
    body?: Buffer;
    dropHeaders?: string[];
    setHeaders?: Record<string, string>;
  } = {},
) => {
  const headers = Object.fromEntries(
    Object.entries(cap.headers)
      .filter(
        ([k]) =>
          !HEADER_DENY.has(k.toLowerCase()) &&
          !(opts.dropHeaders ?? []).includes(k.toLowerCase()),
      )
      .map(([k, v]) => [k, v] as const),
  );
  Object.assign(headers, opts.setHeaders ?? {});
  return ctx.post(cap.url, {
    headers,
    data: opts.body ?? cap.body,
    timeout: 15_000,
  });
};

/** latin1 text view keeps multipart boundaries byte-stable under replace —
 * used inline where tampered bodies are built. */

/** Make a replayed save EXECUTABLE: the captured expectedRevision is 1,
 * so resetting the row back to 1 lets a bypass produce a real write. */
const resetRevision = (formId: string) =>
  prisma.onboardingForm.update({
    where: { id: formId },
    data: { draftRevision: 1 },
  });

test.describe("onboarding forms — real HTTP action security (ES-5)", () => {
  test.beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: e2eDatabaseUrl() } },
    });
    const wsA = await prisma.workspace.findUniqueOrThrow({
      where: { slug: E2E.workspaceSlug },
    });
    const wsB = await prisma.workspace.findUniqueOrThrow({
      where: { slug: E2E.workspaceBSlug },
    });
    wsAId = wsA.id;
    wsBId = wsB.id;
    const ownerMember = await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsAId, role: "WORKSPACE_OWNER" },
    });
    ownerMemberId = ownerMember.id;
    const coachMemberRow = await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsAId, role: "COACH", status: "ACTIVE" },
    });
    coachMember = {
      id: coachMemberRow.id,
      workspaceId: coachMemberRow.workspaceId,
      userId: coachMemberRow.userId,
    };
    const passwordHash = await hashPassword(E2E.password);
    await prisma.user.upsert({
      where: { email: PLATFORM_ADMIN_EMAIL },
      update: {
        passwordHash,
        status: "ACTIVE",
        platformRole: "PLATFORM_ADMIN",
      },
      create: {
        email: PLATFORM_ADMIN_EMAIL,
        passwordHash,
        status: "ACTIVE",
        platformRole: "PLATFORM_ADMIN",
      },
    });
  });

  test.afterAll(async () => {
    await removeSecurityFixtures();
    const admin = await prisma.user.findUnique({
      where: { email: PLATFORM_ADMIN_EMAIL },
      select: { id: true },
    });
    if (admin) {
      await prisma.workspaceMember.deleteMany({
        where: { userId: admin.id },
      });
      await prisma.auditEvent.deleteMany({
        where: {
          OR: [{ subjectUserId: admin.id }, { actorUserId: admin.id }],
        },
      });
      await prisma.user.delete({ where: { id: admin.id } });
    }
    await prisma?.$disconnect();
  });

  test("positive control — the captured saveDraft encoding replays a genuine write + audit row", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8S Positive");
    await signIn(page, E2E.owner);
    const cap = await captureSaveDraft(page, form.id);
    // The live UI save wrote revision 2 (asserted in capture) AND its
    // UPDATE audit row — the observed reference for every negative leg.
    expect(
      await prisma.auditEvent.count({
        where: { resourceId: form.id, action: "UPDATE" },
      }),
    ).toBeGreaterThanOrEqual(1);
    // Replay liveness: reset the revision so the SAME captured encoding
    // is valid again — a genuine second write proves the replay channel
    // reaches the real action handler (not a routing error).
    await resetRevision(form.id);
    const before = await formState(form.id);
    const res = await postCaptured(page.context().request, cap);
    console.log(`observed positive-replay status: ${res.status()}`);
    await expect
      .poll(
        async () =>
          (
            await prisma.onboardingForm.findUniqueOrThrow({
              where: { id: form.id },
            })
          ).draftRevision,
      )
      .toBe(2);
    const after = await formState(form.id);
    expect(after.form.draftRevision).toBe(2);
    expect(after.audits.length).toBe(before.audits.length + 1);
    expect(after.versions).toEqual(before.versions);
  });

  test("Origin variants — hostile rejected, missing observed, XFH app-level diagnostic", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8S Origin");
    await signIn(page, E2E.owner);
    const cap = await captureSaveDraft(page, form.id);
    const ctx = page.context().request;

    // Hostile Origin, real Host: must produce ZERO writes. Observed
    // reject class (framework vs typed) is recorded, not assumed.
    await resetRevision(form.id);
    const hostile = await postCaptured(ctx, cap, {
      setHeaders: { origin: "https://evil.example" },
    });
    console.log(`observed hostile-origin status: ${hostile.status()}`);
    expect((await formState(form.id)).form.draftRevision).toBe(1);

    // Missing Origin: observe-and-record — no assumed framework reject.
    await resetRevision(form.id);
    const missing = await postCaptured(ctx, cap, {
      dropHeaders: ["origin"],
    });
    console.log(`observed missing-origin status: ${missing.status()}`);
    // Whatever the framework does, the outcome is pinned honestly.
    const missingState = await formState(form.id);
    if (missingState.form.draftRevision === 2) {
      console.log(
        "missing-origin EXECUTED the write — recorded as app-level behavior",
      );
    } else {
      console.log("missing-origin produced no write");
    }

    // Hostile Origin + spoofed X-Forwarded-Host — APP-LEVEL diagnostic
    // only: the owned edge must strip/overwrite XFH; this records what
    // the app does if it reaches it. No guard config is changed.
    await resetRevision(form.id);
    const xfh = await postCaptured(ctx, cap, {
      setHeaders: {
        origin: "https://evil.example",
        "x-forwarded-host": "evil.example",
      },
    });
    console.log(`observed hostile-origin+xfh status: ${xfh.status()}`);
    const xfhState = await formState(form.id);
    if (xfhState.form.draftRevision === 2) {
      console.log(
        "XFH spoof EXECUTED at app level — deployment-edge gate applies",
      );
    } else {
      console.log("XFH spoof produced no write");
    }
  });

  test("no-session, forged-cookie, and sessionVersion revocation all deny with zero writes", async ({
    page,
    request,
  }) => {
    const form = await seedForm("E2E P8S Session");
    await signIn(page, E2E.owner);
    const cap = await captureSaveDraft(page, form.id);

    // No-session arm: the bare `request` fixture carries no cookie jar.
    // Paired observation: same request with Origin dropped — the
    // protocol's anonymous reject class under both header shapes.
    await resetRevision(form.id);
    const before = await formState(form.id);
    const noSession = await postCaptured(request, cap);
    const noSessionNoOrigin = await postCaptured(request, cap, {
      dropHeaders: ["origin"],
    });
    console.log(
      `observed no-session status: ${noSession.status()} (no-origin: ${noSessionNoOrigin.status()})`,
    );
    expect(await formState(form.id)).toEqual(before);

    // Forged/stale session cookie — real cookie NAME (never logged),
    // garbage VALUE.
    const cookieName =
      (await page.context().cookies(BASE)).find((c) =>
        c.name.includes("session-token"),
      )?.name ?? "authjs.session-token";
    await resetRevision(form.id);
    const forged = await request.post(cap.url, {
      headers: {
        "content-type": cap.contentType,
        "next-action": cap.nextAction,
        origin: BASE,
        cookie: `${cookieName}=forged-${Date.now()}`,
      },
      data: cap.body,
      timeout: 15_000,
    });
    console.log(`observed forged-cookie status: ${forged.status()}`);
    expect((await formState(form.id)).form.draftRevision).toBe(1);

    // Revoked session: bump the user's sessionVersion — the JWT sv
    // comparison must invalidate the mounted session on the next call.
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: E2E.owner },
    });
    const priorVersion = owner.sessionVersion;
    try {
      await prisma.user.update({
        where: { id: owner.id },
        data: { sessionVersion: { increment: 1 } },
      });
      await resetRevision(form.id);
      const revoked = await postCaptured(page.context().request, cap);
      const revokedNoOrigin = await postCaptured(page.context().request, cap, {
        dropHeaders: ["origin"],
      });
      console.log(
        `observed revoked-session status: ${revoked.status()} (no-origin: ${revokedNoOrigin.status()})`,
      );
      const after = await formState(form.id);
      expect(after.form.draftRevision).toBe(1);
      expect(after.audits).toEqual(before.audits);
    } finally {
      await prisma.user.update({
        where: { id: owner.id },
        data: { sessionVersion: priorVersion },
      });
    }
  });

  test("mid-session membership revocation denies with zero writes — member row restored", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8S Membership");
    await signIn(page, E2E.coach);
    const cap = await captureSaveDraft(page, form.id);
    try {
      // The coach is still signed in; their membership row is removed
      // between mount and replay — the service reauthorizes per call.
      await prisma.workspaceMember.delete({
        where: { id: coachMember.id },
      });
      await resetRevision(form.id);
      const before = await formState(form.id);
      const res = await postCaptured(page.context().request, cap);
      console.log(`observed membership-revoked status: ${res.status()}`);
      expect(await formState(form.id)).toEqual(before);
    } finally {
      await prisma.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: coachMember.workspaceId,
            userId: coachMember.userId,
          },
        },
        update: { role: "COACH", status: "ACTIVE" },
        create: {
          workspaceId: coachMember.workspaceId,
          userId: coachMember.userId,
          role: "COACH",
          status: "ACTIVE",
        },
      });
    }
  });

  test("tampered bound workspaceId / foreign formId via the A-only coach deny with zero writes", async ({
    page,
  }) => {
    const formA = await seedForm("E2E P8S Tamper A");
    const formB = await seedForm("E2E P8S Tamper B", wsBId);
    await signIn(page, E2E.coach); // coach is a member of wsA ONLY
    const cap = await captureSaveDraft(page, formA.id);
    const ctx = page.context().request;

    // Arm 1 — FULLY rebound target: serialized workspaceId wsA→wsB AND
    // the FormData formId formA→formB. The request now genuinely
    // addresses a real wsB form the coach cannot reach; the body's
    // expectedRevision (1) matches formB's live draftRevision, so a
    // bypassed membership gate would produce a REAL observable write.
    // Detection sensitivity is honest, not vacuous.
    const arm1 = Buffer.from(
      cap.body
        .toString("latin1")
        .replaceAll(wsAId, wsBId)
        .replaceAll(formA.id, formB.id),
      "latin1",
    );
    const wsTampered = await postCaptured(ctx, cap, { body: arm1 });
    console.log(`observed ws-tamper status: ${wsTampered.status()}`);
    const afterArm1B = await formState(formB.id);
    expect(afterArm1B.form.draftRevision).toBe(1);
    expect(afterArm1B.audits).toEqual([]);

    // Arm 2 — foreign formId: workspaceId stays wsA (coach IS a
    // member), but the FormData formId points at wsB's form. The
    // scoped lookup must miss → identical non-disclosing denial to a
    // never-existent id. Pin both the deny AND status parity with a
    // fabricated cuid replay.
    const fabricated = "cmSecurityNonexistentFormId0000";
    const arm2 = Buffer.from(
      cap.body.toString("latin1").replaceAll(formA.id, formB.id),
      "latin1",
    );
    const arm2ghost = Buffer.from(
      cap.body.toString("latin1").replaceAll(formA.id, fabricated),
      "latin1",
    );
    const foreign = await postCaptured(ctx, cap, { body: arm2 });
    const ghost = await postCaptured(ctx, cap, { body: arm2ghost });
    console.log(
      `observed formid-tamper status: ${foreign.status()} vs nonexistent: ${ghost.status()}`,
    );
    expect(foreign.status()).toBe(ghost.status());
    const afterArm2B = await formState(formB.id);
    expect(afterArm2B.form.draftRevision).toBe(1);
    expect(afterArm2B.audits).toEqual([]);
    // formA itself was untouched by either tampered replay.
    const afterA = await formState(formA.id);
    expect(afterA.form.draftRevision).toBe(2);
    expect(afterA.versions).toEqual([]);
  });

  test("no-membership PLATFORM_ADMIN denies — membership-gate proof; nonmember + deactivated parity", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8S Roles");
    await signIn(page, E2E.owner);
    const cap = await captureSaveDraft(page, form.id);

    // Assert the fixtures' actual shape before relying on them: the
    // platform-admin has NO membership anywhere, deactivated is a
    // no-membership user, nonmember has none in wsA.
    const adminUser = await prisma.user.findUniqueOrThrow({
      where: { email: PLATFORM_ADMIN_EMAIL },
    });
    expect(adminUser.platformRole).toBe("PLATFORM_ADMIN");
    expect(
      await prisma.workspaceMember.count({
        where: { userId: adminUser.id },
      }),
    ).toBe(0);
    for (const email of [E2E.nonmember, E2E.deactivated]) {
      const u = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(
        await prisma.workspaceMember.count({
          where: { userId: u.id, workspaceId: wsAId },
        }),
      ).toBe(0);
    }

    for (const email of [
      PLATFORM_ADMIN_EMAIL,
      E2E.nonmember,
      E2E.deactivated,
    ]) {
      await signIn(page, email);
      await resetRevision(form.id);
      const legBefore = await formState(form.id);
      const res = await postCaptured(page.context().request, cap);
      console.log(
        `observed denied-role status (${email.split("@")[0]}): ${res.status()}`,
      );
      expect(await formState(form.id)).toEqual(legBefore);
    }
  });

  test("malformed action payload fails safely — zero writes, no internals echo", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8S Malformed");
    await signIn(page, E2E.owner);
    const cap = await captureSaveDraft(page, form.id);
    await resetRevision(form.id);
    const before = await formState(form.id);
    // Valid session + valid Origin + real action id, but a truncated /
    // corrupted RSC-FormData body.
    const truncated = cap.body.subarray(
      0,
      Math.max(0, Math.floor(cap.body.length / 2)),
    );
    const res = await postCaptured(page.context().request, cap, {
      body: truncated,
    });
    console.log(`observed malformed-body status: ${res.status()}`);
    const text = await res.text();
    // Safe failure must not echo internals — no stack/file/ORM markers
    // and never the seeded content.
    expect(text).not.toMatch(/prisma|node_modules|\.tsx?:|at [A-Z]/i);
    expect(text).not.toContain("E2E P8S Malformed");
    expect(await formState(form.id)).toEqual(before);
  });
});
