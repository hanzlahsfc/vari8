import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
  type Request,
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
 * assertion is therefore meaningful, not vacuous. Executed replays
 * (positive control + missing-Origin/XFH diagnostics) assert literal
 * raw RSC flight-text markers (`"ok":true`, via expectTypedSuccess)
 * backed by the single-save DB delta in expectSingleSaveDelta. Named
 * denial legs passed through expectTypedDenial assert literal raw
 * flight-text markers (`"ok":false` + the pinned DENIED message string)
 * backed by DB zero-write checks. These are substring checks on the raw
 * response text — NOT a formal flight decode and NOT structural
 * attribution to the action return value. The no-Origin companion
 * requests in the no-session and revoked-session legs are
 * observation-only for the response (status logged, no marker check);
 * the DB zero-write checks in those legs run after both requests.
 * Zero-write depth per leg:
 * FULL form/version/audit equality for hostile-Origin, no-session,
 * membership-revoked, denied-role, and malformed legs; the forged-cookie
 * leg asserts draftRevision only; the revoked-session leg asserts
 * draftRevision + audit rows; tamper arms assert draftRevision + empty
 * audits on the target form and formA revision/versions. The ES-5
 * follow-up foreign-ID arms (publish/openDraft/archive) assert FULL
 * per-form AND full workspace-scoped form/version/audit equality on both
 * workspaces, foreign-vs-ghost status parity, and an action-specific
 * write on the second-A positive replay; the createForm rebind arm
 * compares the full wsB collections, not just counts.
 *
 * Cookie/session handling (B7): `page.context().request` shares the
 * browser's HttpOnly cookie jar (authenticated probes); the bare
 * `request` fixture carries no cookies (no-session arm). Cookies,
 * action ids, and credential values are NEVER logged. Fixture/member
 * mutations are restored in `finally`. The `deactivated` fixture is a
 * user with NO membership (asserted fresh before use). The
 * `platform-admin` fixture is a PLATFORM_ADMIN user with NO workspace
 * membership — its denial proves the membership gate only. PD29
 * dual-role precedence IS asserted by the dedicated dual-role arms
 * in this file (guard fix at production 814620a).
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
let ownerUserId: string;
let wsBMemberId: string;
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

const seedFormAs = (
  name: string,
  workspaceId: string,
  createdByMemberId: string,
  extra: Omit<
    Prisma.OnboardingFormUncheckedCreateInput,
    "workspaceId" | "name" | "createdByMemberId"
  > = {},
) =>
  prisma.onboardingForm.create({
    data: {
      workspaceId,
      name,
      createdByMemberId,
      draftRevision: 1,
      draft: seedDefinition(name),
      ...extra,
    },
    select: { id: true },
  });

const seedForm = (
  name: string,
  workspaceId: string = wsAId,
  extra: Omit<
    Prisma.OnboardingFormUncheckedCreateInput,
    "workspaceId" | "name" | "createdByMemberId"
  > = {},
) => seedFormAs(name, workspaceId, ownerMemberId, extra);

/**
 * Published-and-closed fixture: draft cleared plus one frozen version row
 * — the state that mounts the closed-branch controls (openDraft/archive)
 * and satisfies the non-vacuous negative preconditions. Creator and
 * publisher stamps both belong to the SAME workspace member passed in
 * (a real wsB member for B targets — never the A-only coach).
 */
const seedClosedForm = async (
  name: string,
  workspaceId: string,
  memberId: string,
) => {
  const form = await seedFormAs(name, workspaceId, memberId, {
    draft: Prisma.DbNull,
  });
  await prisma.onboardingFormVersion.create({
    data: {
      formId: form.id,
      versionSeq: 1,
      definition: seedDefinition(name) as Prisma.InputJsonValue,
      publishOriginRevision: 1,
      publishedByMemberId: memberId,
    },
  });
  return form;
};

/** Full workspace-scoped collections — every onboarding form, its
 * version rows, and the workspace's onboarding_form audit rows. Used
 * for pre/post tamper equality, not just counts. */
const wsSnapshot = async (workspaceId: string) => ({
  forms: await prisma.onboardingForm.findMany({
    where: { workspaceId },
    orderBy: { id: "asc" },
  }),
  versions: await prisma.onboardingFormVersion.findMany({
    where: { form: { workspaceId } },
    orderBy: { id: "asc" },
  }),
  audits: await prisma.auditEvent.findMany({
    where: { workspaceId, resourceType: "onboarding_form" },
    orderBy: { id: "asc" },
  }),
});

async function removeSecurityFixtures() {
  const doomed = await prisma.onboardingForm.findMany({
    where: {
      workspaceId: { in: [wsAId, wsBId] },
      name: { startsWith: "E2E P8S" },
    },
    select: { id: true },
  });
  const ids = doomed.map((f) => f.id);
  await prisma.auditEvent.deleteMany({
    where: { resourceType: "onboarding_form", resourceId: { in: ids } },
  });
  await prisma.onboardingFormVersion.deleteMany({
    where: { formId: { in: ids } },
  });
  await prisma.onboardingForm.deleteMany({ where: { id: { in: ids } } });
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

/** Pinned boundary safe message for every authorization denial
 * (`actions.ts` DENIED / `forms-boundary.ts` DENIED_ERROR). */
const DENIED_MESSAGE = "You don't have access to do that.";

/** Literal raw-text marker assertions on the REAL RSC flight response
 * body: substring checks for `"ok":false` and the pinned DENIED message
 * string (and absence of `"ok":true`). This is NOT a formal flight
 * decode and does not structurally attribute the markers to the action
 * return value; callers pair it with DB zero-write checks. Status alone
 * is never taken as the denial evidence. */
const expectTypedDenial = async (res: APIResponse) => {
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).toContain('"ok":false');
  expect(text).toContain(`"message":"${DENIED_MESSAGE}"`);
  expect(text).not.toContain('"ok":true');
};

/** Literal raw-text marker counterpart: substring `"ok":true` present and
 * `"ok":false` absent — not a formal decode; paired with the DB delta. */
const expectTypedSuccess = async (res: APIResponse) => {
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).toContain('"ok":true');
  expect(text).not.toContain('"ok":false');
};

type FormState = Awaited<ReturnType<typeof formState>>;

/** Full-row delta for exactly ONE executed saveDraft by the owner:
 * every form column except the four the save path writes is
 * byte-identical (incl. `draft`, which the replay re-writes with the
 * identical captured content); draftRevision +1, draftSavedByMemberId
 * = owner member, draftUpdatedAt/updatedAt advance; version rows
 * identical; pre-existing audit rows identical and exactly one new
 * audit row with the pinned field values below. Audit `reason`, `ip`,
 * `meta`, `at` and `id` are NOT asserted. */
const expectSingleSaveDelta = (
  before: FormState,
  after: FormState,
  formId: string,
  ownerUserId: string,
) => {
  const {
    draftRevision: r0,
    draftSavedByMemberId: _s0,
    draftUpdatedAt: d0,
    updatedAt: u0,
    ...stable0
  } = before.form;
  const {
    draftRevision: r1,
    draftSavedByMemberId: s1,
    draftUpdatedAt: d1,
    updatedAt: u1,
    ...stable1
  } = after.form;
  void _s0;
  expect(stable1).toEqual(stable0);
  expect(r1).toBe(r0 + 1);
  expect(s1).toBe(ownerMemberId);
  expect(d1).not.toBeNull();
  expect(d1!.getTime()).toBeGreaterThan(d0?.getTime() ?? 0);
  expect(u1.getTime()).toBeGreaterThan(u0.getTime());
  expect(after.versions).toEqual(before.versions);
  const beforeIds = new Set(before.audits.map((a) => a.id));
  expect(after.audits.filter((a) => beforeIds.has(a.id))).toEqual(
    before.audits,
  );
  const added = after.audits.filter((a) => !beforeIds.has(a.id));
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({
    scope: "WORKSPACE",
    workspaceId: wsAId,
    actorUserId: ownerUserId,
    actorRole: "WORKSPACE_OWNER",
    action: "UPDATE",
    resourceType: "onboarding_form",
    resourceId: formId,
    result: "ALLOW",
    subjectUserId: null,
    subjectClientProfileId: null,
  });
};

/** Audit-row meta marker presence — e.g. {status:"PUBLISHED"} — without
 * asserting fields the writer never sets. */
const hasAuditMeta = (state: FormState, meta: Record<string, unknown>) =>
  state.audits.some((a) => {
    const m = a.meta as Record<string, unknown> | null;
    return m !== null && Object.entries(meta).every(([k, v]) => m[k] === v);
  });

/** Byte-preserving tamper on the captured multipart/RSC body — the
 * established latin1 text view + replaceAll approach; cuid-shaped ids
 * never overlap so replace order is inert. */
const rebindBody = (cap: ActionCapture, ...pairs: [string, string][]) =>
  Buffer.from(
    pairs.reduce(
      (text, [from, to]) => text.replaceAll(from, to),
      cap.body.toString("latin1"),
    ),
    "latin1",
  );

/** Fabricated but well-formed 25-char lowercase cuid-shaped form id —
 * asserted nonexistent in beforeAll; paired with the real foreign id
 * for non-disclosing status parity. */
const GHOST_FORM_ID = "csecuritynonexistentf0000";

/**
 * Drive ANY real UI lifecycle control and capture its genuine wire
 * protocol in the same production build — generalizing captureSaveDraft
 * for the non-saveDraft actions. EVERY action POST during the press is
 * collected and the exactly-one assertion pins the no-double-dispatch
 * contract: a `next-action` POST alone does not establish WHICH action
 * ran — that binding comes from the caller's `until` observation of the
 * action-specific write plus the second-target replay positives. Never
 * hardcodes action ids.
 */
async function captureAction(
  page: Page,
  path: string,
  press: () => Promise<void>,
  until: () => Promise<void>,
): Promise<ActionCapture> {
  await page.goto(path);
  const posts: ActionCapture[] = [];
  const onRequest = (req: Request) => {
    const nextAction = req.headers()["next-action"];
    if (req.method() !== "POST" || !nextAction) return;
    posts.push({
      url: req.url(),
      nextAction,
      headers: req.headers(),
      contentType: req.headers()["content-type"] ?? "",
      body: req.postDataBuffer() ?? Buffer.alloc(0),
    });
  };
  page.on("request", onRequest);
  try {
    await press();
    await until();
  } finally {
    page.off("request", onRequest);
  }
  expect(posts).toHaveLength(1);
  return posts[0];
}

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
    ownerUserId = ownerMember.userId;
    const coachMemberRow = await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsAId, role: "COACH", status: "ACTIVE" },
    });
    coachMember = {
      id: coachMemberRow.id,
      workspaceId: coachMemberRow.workspaceId,
      userId: coachMemberRow.userId,
    };
    // A REAL wsB member — B-fixture creator/publisher stamps must belong
    // to a genuine B member, never the A-only coach or an A member.
    const wsBOwnerMember = await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsBId, role: "WORKSPACE_OWNER" },
    });
    wsBMemberId = wsBOwnerMember.id;
    expect(
      await prisma.onboardingForm.findUnique({
        where: { id: GHOST_FORM_ID },
      }),
    ).toBeNull();
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
    await expectTypedSuccess(res);
    expectSingleSaveDelta(
      before,
      await formState(form.id),
      form.id,
      ownerUserId,
    );
  });

  test("Origin variants — hostile rejected, missing observed, XFH app-level diagnostic", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8S Origin");
    await signIn(page, E2E.owner);
    const cap = await captureSaveDraft(page, form.id);
    const ctx = page.context().request;

    // Hostile Origin, real Host: must produce ZERO writes. The
    // OBSERVED reject class is the framework-level HTTP 500 (server log:
    // "Invalid Server Actions request") — distinct from the typed-denial
    // channel, whose raw-text `"ok":false` markers expectTypedDenial checks.
    // Full-row snapshot equality pins zero writes, not just revision.
    await resetRevision(form.id);
    const hostileBefore = await formState(form.id);
    const hostile = await postCaptured(ctx, cap, {
      setHeaders: { origin: "https://evil.example" },
    });
    console.log(`observed hostile-origin status: ${hostile.status()}`);
    expect(hostile.status()).toBe(500);
    expect(await formState(form.id)).toEqual(hostileBefore);

    // Missing Origin — OBSERVED behavior in this build: the action
    // executes. Pinned via the raw-text `"ok":true` marker plus the
    // full-row single-save delta (expectSingleSaveDelta). Diagnostic
    // record of app-level behavior only — NOT an edge-safety claim.
    await resetRevision(form.id);
    const missingBefore = await formState(form.id);
    const missing = await postCaptured(ctx, cap, {
      dropHeaders: ["origin"],
    });
    console.log(`observed missing-origin status: ${missing.status()}`);
    await expectTypedSuccess(missing);
    expectSingleSaveDelta(
      missingBefore,
      await formState(form.id),
      form.id,
      ownerUserId,
    );

    // Hostile Origin + spoofed X-Forwarded-Host — APP-LEVEL diagnostic
    // only: the owned edge must strip/overwrite XFH; this records what
    // the app does if the spoof reaches it. OBSERVED: the action
    // executes — raw-text `"ok":true` marker + single-save delta. No
    // guard config is changed and NO public-edge safety is claimed.
    await resetRevision(form.id);
    const xfhBefore = await formState(form.id);
    const xfh = await postCaptured(ctx, cap, {
      setHeaders: {
        origin: "https://evil.example",
        "x-forwarded-host": "evil.example",
      },
    });
    console.log(`observed hostile-origin+xfh status: ${xfh.status()}`);
    await expectTypedSuccess(xfh);
    expectSingleSaveDelta(
      xfhBefore,
      await formState(form.id),
      form.id,
      ownerUserId,
    );
  });

  test("no-session, forged-cookie, and sessionVersion revocation all deny with zero writes", async ({
    page,
    request,
  }) => {
    const form = await seedForm("E2E P8S Session");
    await signIn(page, E2E.owner);
    const cap = await captureSaveDraft(page, form.id);

    // No-session arm: the bare `request` fixture carries no cookie jar.
    // Companion with Origin dropped is OBSERVATION-ONLY for the response
    // (status logged, no marker check); the full-row zero-write equality
    // below runs after both requests.
    await resetRevision(form.id);
    const before = await formState(form.id);
    const noSession = await postCaptured(request, cap);
    const noSessionNoOrigin = await postCaptured(request, cap, {
      dropHeaders: ["origin"],
    });
    console.log(
      `observed no-session status: ${noSession.status()} (no-origin: ${noSessionNoOrigin.status()})`,
    );
    // Typed-denial channel (noSession request only): raw flight text
    // carries the literal `"ok":false` + DENIED message markers —
    // distinct from the hostile-Origin framework 500 class.
    await expectTypedDenial(noSession);
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
    await expectTypedDenial(forged);
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
      // Marker check on `revoked` only; the no-Origin companion is
      // OBSERVATION-ONLY (status logged). DB checks run after both.
      const revoked = await postCaptured(page.context().request, cap);
      const revokedNoOrigin = await postCaptured(page.context().request, cap, {
        dropHeaders: ["origin"],
      });
      console.log(
        `observed revoked-session status: ${revoked.status()} (no-origin: ${revokedNoOrigin.status()})`,
      );
      await expectTypedDenial(revoked);
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
      await expectTypedDenial(res);
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
    const formB = await seedFormAs("E2E P8S Tamper B", wsBId, wsBMemberId);
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
    await expectTypedDenial(wsTampered);
    const afterArm1B = await formState(formB.id);
    expect(afterArm1B.form.draftRevision).toBe(1);
    expect(afterArm1B.audits).toEqual([]);

    // Arm 2 — foreign formId: workspaceId stays wsA (coach IS a
    // member), but the FormData formId points at wsB's form. The
    // scoped lookup must miss → identical non-disclosing denial to a
    // never-existent id. Pin both the deny AND status parity with a
    // fabricated cuid replay.
    const arm2 = Buffer.from(
      cap.body.toString("latin1").replaceAll(formA.id, formB.id),
      "latin1",
    );
    const arm2ghost = Buffer.from(
      cap.body.toString("latin1").replaceAll(formA.id, GHOST_FORM_ID),
      "latin1",
    );
    const foreign = await postCaptured(ctx, cap, { body: arm2 });
    const ghost = await postCaptured(ctx, cap, { body: arm2ghost });
    console.log(
      `observed formid-tamper status: ${foreign.status()} vs nonexistent: ${ghost.status()}`,
    );
    expect(foreign.status()).toBe(ghost.status());
    await expectTypedDenial(foreign);
    await expectTypedDenial(ghost);
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
      await expectTypedDenial(res);
      expect(await formState(form.id)).toEqual(legBefore);
    }
  });

  // PD29 dual-role repair (Apollo f88468e4, least privilege): a
  // PLATFORM_ADMIN account is denied onboarding form definitions EVEN WITH
  // an ACTIVE OWNER/COACH membership. Distinct from the no-membership leg
  // above (membership-gate only). platformRole + membership restored in
  // finally.
  test("PD29 dual-role arm A: owner flipped to PLATFORM_ADMIN (ACTIVE OWNER kept) is denied read + write", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8S DualRole Owner");
    await signIn(page, E2E.owner);
    const cap = await captureSaveDraft(page, form.id);
    const editorUrl = `/workspace/${wsAId}/onboarding/forms/${form.id}`;
    try {
      // The owner fixture itself becomes PLATFORM_ADMIN, keeping its
      // ACTIVE WORKSPACE_OWNER membership and its live session (the guard
      // re-reads platformRole from the DB on every call).
      await prisma.user.update({
        where: { id: ownerUserId },
        data: { platformRole: "PLATFORM_ADMIN" },
      });
      const ownerMembership = await prisma.workspaceMember.findUniqueOrThrow({
        where: { id: ownerMemberId },
      });
      expect(ownerMembership).toMatchObject({
        role: "WORKSPACE_OWNER",
        status: "ACTIVE",
      });
      const readA = await page.goto(editorUrl);
      console.log(`observed dual-role owner editor GET: ${readA?.status()}`);
      // Soft so the write leg below still runs and is observed.
      expect.soft(readA?.status()).toBe(403);
      await resetRevision(form.id);
      const beforeA = await formState(form.id);
      const writeA = await postCaptured(page.context().request, cap);
      console.log(`observed dual-role owner save status: ${writeA.status()}`);
      await expectTypedDenial(writeA);
      expect(await formState(form.id)).toEqual(beforeA);
    } finally {
      await prisma.user.update({
        where: { id: ownerUserId },
        data: { platformRole: "USER" },
      });
    }
  });

  test("PD29 dual-role arm B: PLATFORM_ADMIN fixture with a temporary ACTIVE COACH membership is denied read + write", async ({
    page,
  }) => {
    const form = await seedForm("E2E P8S DualRole Coach");
    await signIn(page, E2E.owner);
    const cap = await captureSaveDraft(page, form.id);
    const editorUrl = `/workspace/${wsAId}/onboarding/forms/${form.id}`;
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: PLATFORM_ADMIN_EMAIL },
    });
    let adminMemberId: string | null = null;
    try {
      // The platform-admin fixture gains a temporary ACTIVE COACH
      // membership in wsA, then signs in with its own session.
      expect(admin.platformRole).toBe("PLATFORM_ADMIN");
      const adminMember = await prisma.workspaceMember.create({
        data: {
          workspaceId: wsAId,
          userId: admin.id,
          role: "COACH",
          status: "ACTIVE",
        },
      });
      adminMemberId = adminMember.id;
      await signIn(page, PLATFORM_ADMIN_EMAIL);
      const readB = await page.goto(editorUrl);
      console.log(`observed dual-role coach editor GET: ${readB?.status()}`);
      // Soft so the write leg below still runs and is observed.
      expect.soft(readB?.status()).toBe(403);
      await resetRevision(form.id);
      const beforeB = await formState(form.id);
      const writeB = await postCaptured(page.context().request, cap);
      console.log(`observed dual-role coach save status: ${writeB.status()}`);
      await expectTypedDenial(writeB);
      expect(await formState(form.id)).toEqual(beforeB);
    } finally {
      if (adminMemberId) {
        await prisma.workspaceMember.delete({ where: { id: adminMemberId } });
      }
    }
    // The no-membership shape of the platform-admin fixture is restored.
    expect(
      await prisma.workspaceMember.count({ where: { userId: admin.id } }),
    ).toBe(0);
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
    // Framework-level parse reject (observed 500 "Unexpected end of
    // form") — same non-typed class as the hostile-Origin reject.
    expect(res.status()).toBe(500);
    const text = await res.text();
    // Safe failure must not echo internals — no stack/file/ORM markers
    // and never the seeded content.
    expect(text).not.toMatch(/prisma|node_modules|\.tsx?:|at [A-Z]/i);
    expect(text).not.toContain("E2E P8S Malformed");
    expect(await formState(form.id)).toEqual(before);
  });

  // ---- ES-5 follow-up (Orion-approved plan, tests 7ac83b9): real-HTTP
  // foreign-ID denials for the non-saveDraft actions — publishForm,
  // openDraft, archiveForm — plus bound-workspace rebinding for
  // createForm, all replayed as the wsA-only coach. Coverage of ALREADY
  // implemented authorization: expected immediate GREEN. An executed
  // write in any negative arm is a genuine RED and fails the test. Each
  // arm's B target is pre-armed so a bypass produces a REAL observable
  // write (never a vacuous domain error); the second-A replay positive
  // runs BEFORE any B probe and proves the captured encoding is live.

  test("publishForm — coach capture replays on a second wsA form but foreign wsB formId is denied with zero writes", async ({
    page,
  }) => {
    try {
      const capForm = await seedForm("E2E P8S PubCap");
      const okForm = await seedForm("E2E P8S PubOK");
      const bForm = await seedFormAs("E2E P8S PubDeny", wsBId, wsBMemberId);
      await signIn(page, E2E.coach);
      // Real UI publish press on the wsA draft: exactly one action POST;
      // observed write = frozen version, closed draft, PUBLISHED audit.
      const cap = await captureAction(
        page,
        `/workspace/${wsAId}/onboarding/forms/${capForm.id}`,
        async () => {
          await expect(page.getByTestId("publish-form")).toBeEnabled();
          await page.getByTestId("publish-form").click();
        },
        async () => {
          await expect
            .poll(
              async () =>
                (
                  await prisma.onboardingForm.findUniqueOrThrow({
                    where: { id: capForm.id },
                  })
                ).draft,
            )
            .toBeNull();
        },
      );
      const capAfter = await formState(capForm.id);
      expect(capAfter.versions).toHaveLength(1);
      expect(capAfter.versions[0].publishedByMemberId).toBe(coachMember.id);
      expect(
        hasAuditMeta(capAfter, { status: "PUBLISHED", version: "1" }),
      ).toBe(true);

      // Positive replay on a SECOND wsA form in identical pre-publish
      // state (open publishable draft at the captured revision 1, zero
      // versions): the exact captured encoding must mint a real version
      // — not take the idempotent replay path.
      const replayOk = await postCaptured(page.context().request, cap, {
        body: rebindBody(cap, [capForm.id, okForm.id]),
      });
      await expectTypedSuccess(replayOk);
      const okAfter = await formState(okForm.id);
      expect(okAfter.form.draft).toBeNull();
      expect(okAfter.versions).toHaveLength(1);
      expect(okAfter.versions[0].publishedByMemberId).toBe(coachMember.id);
      expect(hasAuditMeta(okAfter, { status: "PUBLISHED", version: "1" })).toBe(
        true,
      );

      // Non-vacuous B preconditions, asserted pre-arm: open publishable
      // draft at the captured expectedRevision (1), ZERO versions (no
      // idempotent publishOriginRevision match), creator stamp is a real
      // wsB member. A bypass would mint version 1 and close the draft.
      const bBefore = await formState(bForm.id);
      expect(bBefore.form.status).toBe("ACTIVE");
      expect(bBefore.form.draft).not.toBeNull();
      expect(bBefore.form.draftRevision).toBe(1);
      expect(bBefore.versions).toHaveLength(0);
      expect(bBefore.form.createdByMemberId).toBe(wsBMemberId);
      const aBefore = await wsSnapshot(wsAId);
      const bWsBefore = await wsSnapshot(wsBId);

      // Arm 1 — fully rebound target: bound workspaceId wsA→wsB AND
      // formId capForm→bForm genuinely addresses the wsB form.
      const wsTampered = await postCaptured(page.context().request, cap, {
        body: rebindBody(cap, [wsAId, wsBId], [capForm.id, bForm.id]),
      });
      console.log(`observed publish ws-tamper status: ${wsTampered.status()}`);
      await expectTypedDenial(wsTampered);

      // Arm 2 — foreign formId under wsA (coach IS a wsA member): the
      // scoped lookup must miss exactly like a never-existent id.
      const foreign = await postCaptured(page.context().request, cap, {
        body: rebindBody(cap, [capForm.id, bForm.id]),
      });
      const ghost = await postCaptured(page.context().request, cap, {
        body: rebindBody(cap, [capForm.id, GHOST_FORM_ID]),
      });
      console.log(
        `observed publish foreign status: ${foreign.status()} vs ghost: ${ghost.status()}`,
      );
      expect(foreign.status()).toBe(ghost.status());
      await expectTypedDenial(foreign);
      await expectTypedDenial(ghost);

      expect(await formState(bForm.id)).toEqual(bBefore);
      expect(await wsSnapshot(wsBId)).toEqual(bWsBefore);
      expect(await wsSnapshot(wsAId)).toEqual(aBefore);
    } finally {
      await removeSecurityFixtures();
    }
  });

  test("openDraft — coach capture replays on a second wsA form but foreign wsB formId is denied with zero writes", async ({
    page,
  }) => {
    try {
      const capForm = await seedClosedForm(
        "E2E P8S OpenCap",
        wsAId,
        ownerMemberId,
      );
      const okForm = await seedClosedForm(
        "E2E P8S OpenOK",
        wsAId,
        ownerMemberId,
      );
      const bForm = await seedClosedForm(
        "E2E P8S OpenDeny",
        wsBId,
        wsBMemberId,
      );
      await signIn(page, E2E.coach);
      // Real UI reopen press on the closed wsA form: exactly one action
      // POST; observed write = draft seeded from the latest version,
      // revision +1, UPDATE audit.
      const cap = await captureAction(
        page,
        `/workspace/${wsAId}/onboarding/forms/${capForm.id}`,
        () => page.getByTestId("open-draft").click(),
        async () => {
          await expect
            .poll(
              async () =>
                (
                  await prisma.onboardingForm.findUniqueOrThrow({
                    where: { id: capForm.id },
                  })
                ).draft !== null,
            )
            .toBe(true);
        },
      );
      const capAfter = await formState(capForm.id);
      expect(capAfter.form.draft).not.toBeNull();
      expect(capAfter.form.draftRevision).toBe(2);
      expect(capAfter.form.draftSavedByMemberId).toBe(coachMember.id);
      expect(capAfter.audits.some((a) => a.action === "UPDATE")).toBe(true);

      // Positive replay on a SECOND closed wsA form — a bypass-shaped
      // encoding must open a real draft, bumping the baseline revision.
      const okBaseline = await formState(okForm.id);
      expect(okBaseline.form.draft).toBeNull();
      const replayOk = await postCaptured(page.context().request, cap, {
        body: rebindBody(cap, [capForm.id, okForm.id]),
      });
      await expectTypedSuccess(replayOk);
      const okAfter = await formState(okForm.id);
      expect(okAfter.form.draft).not.toBeNull();
      expect(okAfter.form.draftRevision).toBe(
        okBaseline.form.draftRevision + 1,
      );
      expect(okAfter.form.draftSavedByMemberId).toBe(coachMember.id);
      expect(okAfter.audits.length).toBeGreaterThan(okBaseline.audits.length);

      // Non-vacuous B preconditions, asserted pre-arm: a published
      // version minted by a real wsB member, draft === null, baseline
      // revision recorded — a bypass would seed a draft + bump + audit,
      // not return an already-open draft.
      const bBefore = await formState(bForm.id);
      expect(bBefore.form.status).toBe("ACTIVE");
      expect(bBefore.form.draft).toBeNull();
      expect(bBefore.versions.length).toBeGreaterThanOrEqual(1);
      expect(
        bBefore.versions.every((v) => v.publishedByMemberId === wsBMemberId),
      ).toBe(true);
      expect(bBefore.form.createdByMemberId).toBe(wsBMemberId);
      const aBefore = await wsSnapshot(wsAId);
      const bWsBefore = await wsSnapshot(wsBId);

      const wsTampered = await postCaptured(page.context().request, cap, {
        body: rebindBody(cap, [wsAId, wsBId], [capForm.id, bForm.id]),
      });
      console.log(
        `observed openDraft ws-tamper status: ${wsTampered.status()}`,
      );
      await expectTypedDenial(wsTampered);

      const foreign = await postCaptured(page.context().request, cap, {
        body: rebindBody(cap, [capForm.id, bForm.id]),
      });
      const ghost = await postCaptured(page.context().request, cap, {
        body: rebindBody(cap, [capForm.id, GHOST_FORM_ID]),
      });
      console.log(
        `observed openDraft foreign status: ${foreign.status()} vs ghost: ${ghost.status()}`,
      );
      expect(foreign.status()).toBe(ghost.status());
      await expectTypedDenial(foreign);
      await expectTypedDenial(ghost);

      expect(await formState(bForm.id)).toEqual(bBefore);
      expect(await wsSnapshot(wsBId)).toEqual(bWsBefore);
      expect(await wsSnapshot(wsAId)).toEqual(aBefore);
    } finally {
      await removeSecurityFixtures();
    }
  });

  test("archiveForm — coach capture replays on a second wsA form but foreign wsB formId is denied with zero writes", async ({
    page,
  }) => {
    try {
      const capForm = await seedClosedForm(
        "E2E P8S ArchCap",
        wsAId,
        ownerMemberId,
      );
      const okForm = await seedClosedForm(
        "E2E P8S ArchOK",
        wsAId,
        ownerMemberId,
      );
      const bForm = await seedClosedForm(
        "E2E P8S ArchDeny",
        wsBId,
        wsBMemberId,
      );
      await signIn(page, E2E.coach);
      // Real UI archive press on the closed-branch control: exactly one
      // action POST; observed write = ARCHIVED status + stamps + audit.
      const cap = await captureAction(
        page,
        `/workspace/${wsAId}/onboarding/forms/${capForm.id}`,
        () => page.getByTestId("archive-form").click(),
        async () => {
          await expect
            .poll(
              async () =>
                (
                  await prisma.onboardingForm.findUniqueOrThrow({
                    where: { id: capForm.id },
                  })
                ).status,
            )
            .toBe("ARCHIVED");
        },
      );
      const capAfter = await formState(capForm.id);
      expect(capAfter.form.archivedAt).not.toBeNull();
      expect(capAfter.form.archivedByMemberId).toBe(coachMember.id);
      expect(hasAuditMeta(capAfter, { status: "ARCHIVED" })).toBe(true);

      // Positive replay on a SECOND ACTIVE wsA form — the captured
      // encoding must take the real archive path, not the already-
      // archived idempotent early return.
      const replayOk = await postCaptured(page.context().request, cap, {
        body: rebindBody(cap, [capForm.id, okForm.id]),
      });
      await expectTypedSuccess(replayOk);
      const okAfter = await formState(okForm.id);
      expect(okAfter.form.status).toBe("ARCHIVED");
      expect(okAfter.form.archivedAt).not.toBeNull();
      expect(okAfter.form.archivedByMemberId).toBe(coachMember.id);
      expect(hasAuditMeta(okAfter, { status: "ARCHIVED" })).toBe(true);

      // Non-vacuous B preconditions, asserted pre-arm: ACTIVE with null
      // archival stamps — a bypass would flip status/stamps and audit,
      // never the idempotent path. Creator/publisher stamps are a real
      // wsB member's.
      const bBefore = await formState(bForm.id);
      expect(bBefore.form.status).toBe("ACTIVE");
      expect(bBefore.form.archivedAt).toBeNull();
      expect(bBefore.form.archivedByMemberId).toBeNull();
      expect(bBefore.form.createdByMemberId).toBe(wsBMemberId);
      expect(
        bBefore.versions.every((v) => v.publishedByMemberId === wsBMemberId),
      ).toBe(true);
      const aBefore = await wsSnapshot(wsAId);
      const bWsBefore = await wsSnapshot(wsBId);

      const wsTampered = await postCaptured(page.context().request, cap, {
        body: rebindBody(cap, [wsAId, wsBId], [capForm.id, bForm.id]),
      });
      console.log(`observed archive ws-tamper status: ${wsTampered.status()}`);
      await expectTypedDenial(wsTampered);

      const foreign = await postCaptured(page.context().request, cap, {
        body: rebindBody(cap, [capForm.id, bForm.id]),
      });
      const ghost = await postCaptured(page.context().request, cap, {
        body: rebindBody(cap, [capForm.id, GHOST_FORM_ID]),
      });
      console.log(
        `observed archive foreign status: ${foreign.status()} vs ghost: ${ghost.status()}`,
      );
      expect(foreign.status()).toBe(ghost.status());
      await expectTypedDenial(foreign);
      await expectTypedDenial(ghost);

      expect(await formState(bForm.id)).toEqual(bBefore);
      expect(await wsSnapshot(wsBId)).toEqual(bWsBefore);
      expect(await wsSnapshot(wsAId)).toEqual(aBefore);
    } finally {
      await removeSecurityFixtures();
    }
  });

  test("createForm — bound-workspace wsA→wsB rebind denied; verbatim replay mints a second wsA form", async ({
    page,
  }) => {
    try {
      await signIn(page, E2E.coach);
      // Real UI submit on /new: exactly one action POST; observed write =
      // a wsA form row + CREATE audit stamped by the coach.
      const cap = await captureAction(
        page,
        `/workspace/${wsAId}/onboarding/forms/new`,
        async () => {
          await page.getByTestId("form-name-input").fill("E2E P8S CreateCap");
          await page.getByRole("button", { name: "Create form" }).click();
        },
        async () => {
          await expect
            .poll(async () =>
              prisma.onboardingForm.count({
                where: {
                  workspaceId: wsAId,
                  name: "E2E P8S CreateCap",
                },
              }),
            )
            .toBe(1);
        },
      );
      const created = await prisma.onboardingForm.findMany({
        where: { workspaceId: wsAId, name: "E2E P8S CreateCap" },
      });
      expect(created).toHaveLength(1);
      const createdAudits = await prisma.auditEvent.findMany({
        where: {
          resourceType: "onboarding_form",
          resourceId: created[0].id,
          action: "CREATE",
        },
      });
      expect(createdAudits).toHaveLength(1);
      expect(createdAudits[0].actorUserId).toBe(coachMember.userId);

      // Positive verbatim replay: the captured encoding adds a SECOND
      // wsA form + CREATE audit — the replay channel is genuinely live.
      const replayOk = await postCaptured(page.context().request, cap);
      await expectTypedSuccess(replayOk);
      const created2 = await prisma.onboardingForm.findMany({
        where: { workspaceId: wsAId, name: "E2E P8S CreateCap" },
      });
      expect(created2).toHaveLength(2);
      for (const f of created2) {
        expect(
          await prisma.auditEvent.count({
            where: {
              resourceType: "onboarding_form",
              resourceId: f.id,
              action: "CREATE",
            },
          }),
        ).toBe(1);
      }

      // Negative — rebind ONLY the bound workspaceId wsA→wsB. There is
      // no formId/ghost axis for create. A bypass would add a wsB row +
      // CREATE audit: compare the FULL wsB collections, not counts.
      const bBefore = await wsSnapshot(wsBId);
      const aBefore = await wsSnapshot(wsAId);
      const denied = await postCaptured(page.context().request, cap, {
        body: rebindBody(cap, [wsAId, wsBId]),
      });
      console.log(`observed create ws-rebind status: ${denied.status()}`);
      await expectTypedDenial(denied);
      expect(await wsSnapshot(wsBId)).toEqual(bBefore);
      expect(await wsSnapshot(wsAId)).toEqual(aBefore);
    } finally {
      await removeSecurityFixtures();
    }
  });
});
