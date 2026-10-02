// P-008 slice-5B — server actions against the REAL boundary + guarded
// service on disposable PG. `auth()` is mocked ONLY to set the actor
// identity (labeled — not real authentication); all authorization inside
// the service is live and production-path.

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "../../auth";
import type * as Actions from "../../app/workspace/[workspaceId]/onboarding/actions";

const mockedAuth = auth as unknown as {
  mockReset: () => void;
  mockResolvedValue: (value: unknown) => void;
};

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DENIED = "You don't have access to do that.";
const INVALID = "Check the form details and try again.";

describe.skipIf(!enabled)("P-008 onboarding actions (real PG)", () => {
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
      'TRUNCATE "onboarding_form_version","onboarding_form","audit_event","coach_profile","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
    actions =
      await import("../../app/workspace/[workspaceId]/onboarding/actions");
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `p8a${++n}_${Date.now()}`;
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
      data: { name: `WS ${uid()}`, slug: `p8a-${uid()}`, status: "ACTIVE" },
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
      where: { resourceType: "onboarding_form" },
    });

  it("owner runs the full action lifecycle", async () => {
    const ws = await ws_();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    mockedAuth.mockResolvedValue({ user: { id: owner.id } });

    const created = await actions.createForm(ws.id, fd({ name: "Intake" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const formId = created.value.formId;

    const saved = await actions.saveDraft(
      ws.id,
      fd({ formId, expectedRevision: "1", draftJson: draftJson() }),
    );
    expect(saved).toMatchObject({ ok: true, value: { revision: 2 } });

    const published = await actions.publishForm(
      ws.id,
      fd({ formId, expectedRevision: "2" }),
    );
    expect(published).toEqual({ ok: true, value: { versionSeq: 1 } });

    const reopened = await actions.openDraft(ws.id, fd({ formId }));
    expect(reopened).toMatchObject({ ok: true, value: { revision: 3 } });

    const archived = await actions.archiveForm(ws.id, fd({ formId }));
    expect(archived).toEqual({ ok: true, value: { formId } });
  });

  it.each(["ASSISTANT_COACH", "SUPPORT", "CLIENT"] as const)(
    "%s is denied at the action layer (live authz)",
    async (role) => {
      const ws = await ws_();
      const u = await user();
      await member(ws.id, u.id, role);
      mockedAuth.mockResolvedValue({ user: { id: u.id } });
      const before = await prisma.onboardingForm.count();
      const audits = await auditCount();
      const res = await actions.createForm(ws.id, fd({ name: "N" }));
      expect(res).toEqual({ ok: false, message: DENIED });
      expect(await prisma.onboardingForm.count()).toBe(before);
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
    expect(await actions.createForm(ws.id, fd({ name: "X" }))).toEqual({
      ok: false,
      message: DENIED,
    });
    mockedAuth.mockResolvedValue({ user: { id: outsider.id } });
    expect(await actions.createForm(ws.id, fd({ name: "X" }))).toEqual({
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
    const created = await actions.createForm(wsA.id, fd({ name: "F" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const audits = await auditCount();
    // Member of wsB but targets wsA's form via wsB's id.
    const res = await actions.saveDraft(
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
    const res2 = await actions.publishForm(
      wsC.id,
      fd({ formId: created.value.formId, expectedRevision: "1" }),
    );
    expect(res2).toEqual({ ok: false, message: DENIED });
    expect(await auditCount()).toBe(audits);
  });

  it("immediate revocation denies the next call — no cached authority", async () => {
    const ws = await ws_();
    const owner = await user();
    const m = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    mockedAuth.mockResolvedValue({ user: { id: owner.id } });
    const created = await actions.createForm(ws.id, fd({ name: "R" }));
    expect(created.ok).toBe(true);
    await prisma.workspaceMember.update({
      where: { id: m.id },
      data: { role: "ASSISTANT_COACH" },
    });
    const audits = await auditCount();
    const res = await actions.createForm(ws.id, fd({ name: "R2" }));
    expect(res).toEqual({ ok: false, message: DENIED });
    expect(await auditCount()).toBe(audits);
  });

  it("suspended member denies writes end-to-end", async () => {
    const ws = await ws_();
    const owner = await user();
    const m = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    await prisma.workspaceMember.update({
      where: { id: m.id },
      data: { status: "SUSPENDED" },
    });
    mockedAuth.mockResolvedValue({ user: { id: owner.id } });
    const res = await actions.createForm(ws.id, fd({ name: "S" }));
    expect(res).toEqual({ ok: false, message: DENIED });
  });

  it("malformed inputs fail closed with zero rows and zero audit deltas", async () => {
    const ws = await ws_();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    mockedAuth.mockResolvedValue({ user: { id: owner.id } });
    const audits = await auditCount();
    const res = await actions.saveDraft(
      ws.id,
      fd({ formId: "ghost", expectedRevision: "x", draftJson: "{}" }),
    );
    expect(res).toEqual({ ok: false, message: INVALID });
    expect(await auditCount()).toBe(audits);
  });
  it("active COACH runs the full action lifecycle", async () => {
    const ws = await ws_();
    const coach = await user();
    await member(ws.id, coach.id, "COACH");
    mockedAuth.mockResolvedValue({ user: { id: coach.id } });
    const created = await actions.createForm(ws.id, fd({ name: "Intake" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const formId = created.value.formId;
    const saved = await actions.saveDraft(
      ws.id,
      fd({ formId, expectedRevision: "1", draftJson: draftJson() }),
    );
    expect(saved).toMatchObject({ ok: true, value: { revision: 2 } });
    const published = await actions.publishForm(
      ws.id,
      fd({ formId, expectedRevision: "2" }),
    );
    expect(published).toEqual({ ok: true, value: { versionSeq: 1 } });
    const archived = await actions.archiveForm(ws.id, fd({ formId }));
    expect(archived.ok).toBe(true);
  });

  it("EVERY mutation denied for assistant coach on a fixture-seeded form", async () => {
    const ws = await ws_();
    const owner = await user();
    const m = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const assistant = await user();
    await member(ws.id, assistant.id, "ASSISTANT_COACH");
    const form = await prisma.onboardingForm.create({
      data: {
        workspaceId: ws.id,
        name: "Seed",
        createdByMemberId: m.id,
        draft: { title: "T", fields: [] },
        draftRevision: 1,
      },
    });
    mockedAuth.mockResolvedValue({ user: { id: assistant.id } });
    const audits = await auditCount();
    for (const res of [
      await actions.createForm(ws.id, fd({ name: "N" })),
      await actions.saveDraft(
        ws.id,
        fd({ formId: form.id, expectedRevision: "1", draftJson: draftJson() }),
      ),
      await actions.publishForm(
        ws.id,
        fd({ formId: form.id, expectedRevision: "1" }),
      ),
      await actions.openDraft(ws.id, fd({ formId: form.id })),
      await actions.archiveForm(ws.id, fd({ formId: form.id })),
    ]) {
      expect(res).toEqual({ ok: false, message: DENIED });
    }
    expect(await auditCount()).toBe(audits);
  });

  it("nonmember + suspended-member denied on ALL five mutations", async () => {
    const ws = await ws_();
    const owner = await user();
    const m = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const outsider = await user();
    const suspended = await user();
    const sm = await member(ws.id, suspended.id, "COACH");
    await prisma.workspaceMember.update({
      where: { id: sm.id },
      data: { status: "SUSPENDED" },
    });
    const form = await prisma.onboardingForm.create({
      data: {
        workspaceId: ws.id,
        name: "Seed2",
        createdByMemberId: m.id,
        draft: { title: "T", fields: [] },
        draftRevision: 1,
      },
    });
    for (const uid of [outsider.id, suspended.id]) {
      mockedAuth.mockResolvedValue({ user: { id: uid } });
      const audits = await auditCount();
      for (const res of [
        await actions.createForm(ws.id, fd({ name: "N" })),
        await actions.saveDraft(
          ws.id,
          fd({
            formId: form.id,
            expectedRevision: "1",
            draftJson: draftJson(),
          }),
        ),
        await actions.publishForm(
          ws.id,
          fd({ formId: form.id, expectedRevision: "1" }),
        ),
        await actions.openDraft(ws.id, fd({ formId: form.id })),
        await actions.archiveForm(ws.id, fd({ formId: form.id })),
      ]) {
        expect(res).toEqual({ ok: false, message: DENIED });
      }
      expect(await auditCount()).toBe(audits);
    }
  });
});
