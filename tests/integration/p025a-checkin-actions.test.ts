// P-025-A — Check-In server actions against the REAL boundary + guarded
// service on disposable PG. `auth()` is mocked ONLY to set the actor
// identity (labeled — not real authentication); all authorization inside
// the service is live and production-path. The feature resolver runs first
// — vitest sets NODE_ENV=test (trusted), so the flag alone gates.

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "../../auth";
import type * as Actions from "../../app/workspace/[workspaceId]/checkins/actions";

const mockedAuth = auth as unknown as {
  mockReset: () => void;
  mockResolvedValue: (value: unknown) => void;
};

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DENIED = "You don't have access to do that.";
const INVALID = "Check the form details and try again.";

describe.skipIf(!enabled)("P-025-A checkin actions (real PG)", () => {
  let prisma: PrismaClient;
  let actions: typeof Actions;
  let n = 0;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "checkin_form_version","checkin_form","audit_event","coach_profile","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
    actions =
      await import("../../app/workspace/[workspaceId]/checkins/actions");
    // Trusted dev/test runtime + flag "1" → the shared resolver opens.
    process.env.ENABLE_CHECK_INS = "1";
  });
  afterAll(async () => {
    delete process.env.ENABLE_CHECK_INS;
    await prisma?.$disconnect();
  });

  const uid = () => `p25ac${++n}_${Date.now()}`;
  async function user() {
    return prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: `Fixture ${uid()}`,
        platformRole: "USER",
        status: "ACTIVE",
      },
    });
  }
  async function ws_() {
    return prisma.workspace.create({
      data: { name: `WS ${uid()}`, slug: `p25ac-${uid()}`, status: "ACTIVE" },
    });
  }
  async function member(
    workspaceId: string,
    userId: string,
    role:
      "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT",
  ) {
    return prisma.workspaceMember.create({
      data: { workspaceId, userId, role, status: "ACTIVE" },
    });
  }
  const fd = (entries: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.append(k, v);
    return f;
  };
  const draftJson = (title = "T") =>
    JSON.stringify({
      title,
      fields: [{ kind: "shortText", label: "L", required: false, order: 0 }],
    });
  const auditCount = () =>
    prisma.auditEvent.count({
      where: { resourceType: "checkin_form" },
    });

  it("owner runs the full action lifecycle", async () => {
    const ws = await ws_();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    mockedAuth.mockResolvedValue({ user: { id: owner.id } });

    const created = await actions.createCheckInForm(
      ws.id,
      fd({ name: "Intake" }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const formId = created.value.formId;

    const saved = await actions.saveCheckInDraft(
      ws.id,
      fd({ formId, expectedRevision: "1", draftJson: draftJson() }),
    );
    expect(saved).toMatchObject({ ok: true, value: { revision: 2 } });

    const published = await actions.publishCheckInForm(
      ws.id,
      fd({ formId, expectedRevision: "2" }),
    );
    expect(published).toEqual({ ok: true, value: { versionSeq: 1 } });

    const reopened = await actions.openCheckInDraft(ws.id, fd({ formId }));
    expect(reopened).toMatchObject({ ok: true, value: { revision: 3 } });

    const archived = await actions.archiveCheckInForm(ws.id, fd({ formId }));
    expect(archived).toEqual({ ok: true, value: { formId } });
  });

  it.each(["ASSISTANT_COACH", "SUPPORT", "CLIENT"] as const)(
    "%s is denied at the action layer (live authz)",
    async (role) => {
      const ws = await ws_();
      const u = await user();
      await member(ws.id, u.id, role);
      mockedAuth.mockResolvedValue({ user: { id: u.id } });
      const before = await prisma.checkInForm.count();
      const audits = await auditCount();
      const res = await actions.createCheckInForm(ws.id, fd({ name: "N" }));
      expect(res).toEqual({ ok: false, message: DENIED });
      expect(await prisma.checkInForm.count()).toBe(before);
      expect(await auditCount()).toBe(audits);
    },
  );

  it("platform admin + nonmember are denied end-to-end", async () => {
    const ws = await ws_();
    const admin = await prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: "Admin",
        platformRole: "PLATFORM_ADMIN",
        status: "ACTIVE",
      },
    });
    const outsider = await user();
    mockedAuth.mockResolvedValue({ user: { id: admin.id } });
    expect(await actions.createCheckInForm(ws.id, fd({ name: "X" }))).toEqual({
      ok: false,
      message: DENIED,
    });
    // Dual-role PA: ACTIVE owner membership on the same account — still
    // denied (binding deny-set requirement).
    await member(ws.id, admin.id, "WORKSPACE_OWNER");
    expect(await actions.createCheckInForm(ws.id, fd({ name: "X" }))).toEqual({
      ok: false,
      message: DENIED,
    });
    mockedAuth.mockResolvedValue({ user: { id: outsider.id } });
    expect(await actions.createCheckInForm(ws.id, fd({ name: "X" }))).toEqual({
      ok: false,
      message: DENIED,
    });
  });

  it("forged workspaceId + cross-workspace formId are denied by the service", async () => {
    const wsA = await ws_();
    const wsB = await ws_();
    const owner = await user();
    await member(wsA.id, owner.id, "WORKSPACE_OWNER");
    await member(wsB.id, owner.id, "WORKSPACE_OWNER");
    mockedAuth.mockResolvedValue({ user: { id: owner.id } });
    const created = await actions.createCheckInForm(wsA.id, fd({ name: "F" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const audits = await auditCount();
    // Member of wsB but targets wsA's form via wsB's id.
    const res = await actions.saveCheckInDraft(
      wsB.id,
      fd({
        formId: created.value.formId,
        expectedRevision: "1",
        draftJson: draftJson(),
      }),
    );
    expect(res.ok).toBe(false);
    // Workspace the actor does not belong to at all.
    const wsC = await ws_();
    const res2 = await actions.publishCheckInForm(
      wsC.id,
      fd({ formId: created.value.formId, expectedRevision: "1" }),
    );
    expect(res2).toEqual({ ok: false, message: DENIED });
    expect(await auditCount()).toBe(audits);
  });

  it("feature flag off denies before session/input — zero writes", async () => {
    const ws = await ws_();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    mockedAuth.mockResolvedValue({ user: { id: owner.id } });
    const before = await prisma.checkInForm.count();
    const audits = await auditCount();
    delete process.env.ENABLE_CHECK_INS;
    try {
      for (const res of [
        await actions.createCheckInForm(ws.id, fd({ name: "X" })),
        await actions.archiveCheckInForm(ws.id, fd({ formId: "x" })),
        await actions.publishCheckInForm(
          ws.id,
          fd({ formId: "x", expectedRevision: "1" }),
        ),
      ]) {
        expect(res).toEqual({ ok: false, message: DENIED });
      }
      // Malformed values close too.
      process.env.ENABLE_CHECK_INS = "yes";
      expect(await actions.createCheckInForm(ws.id, fd({ name: "X" }))).toEqual(
        { ok: false, message: DENIED },
      );
    } finally {
      process.env.ENABLE_CHECK_INS = "1";
    }
    expect(await prisma.checkInForm.count()).toBe(before);
    expect(await auditCount()).toBe(audits);
  });

  it("bounded input contract: oversized draftJson + malformed fields rejected", async () => {
    const ws = await ws_();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    mockedAuth.mockResolvedValue({ user: { id: owner.id } });
    const created = await actions.createCheckInForm(ws.id, fd({ name: "F" }));
    if (!created.ok) return;

    const huge = JSON.stringify({
      title: "x".repeat(200_000),
      fields: [],
    });
    expect(
      await actions.saveCheckInDraft(
        ws.id,
        fd({
          formId: created.value.formId,
          expectedRevision: "1",
          draftJson: huge,
        }),
      ),
    ).toEqual({ ok: false, message: INVALID });

    // Non-integer / negative revision → INVALID before the service.
    expect(
      await actions.saveCheckInDraft(
        ws.id,
        fd({
          formId: created.value.formId,
          expectedRevision: "1.5",
          draftJson: draftJson(),
        }),
      ),
    ).toEqual({ ok: false, message: INVALID });

    // Malformed JSON body → INVALID, no mutation.
    expect(
      await actions.saveCheckInDraft(
        ws.id,
        fd({
          formId: created.value.formId,
          expectedRevision: "1",
          draftJson: "not json",
        }),
      ),
    ).toEqual({ ok: false, message: INVALID });
    const row = await prisma.checkInForm.findUniqueOrThrow({
      where: { id: created.value.formId },
    });
    expect(row.draftRevision).toBe(1);
  });
});
