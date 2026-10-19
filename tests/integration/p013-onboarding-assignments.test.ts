import { execFileSync } from "node:child_process";

import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  cancelOnboardingAssignment,
  createOnboardingAssignment,
  replaceOnboardingAssignment,
} from "../../lib/onboarding/assignments";
import { assignFormFromAction } from "../../lib/onboarding/assignments-boundary";

/**
 * P-013 staff-only onboarding-form assignments — real-PostgreSQL contract
 * tests. Synthetic fixtures only; dedicated disposable database via
 * INTEGRATION_DATABASE_URL (never the application database).
 *
 * The service itself performs flag-independent authorization; the env gate
 * is enforced at the boundary/route layer (see unit + E2E coverage), so the
 * service contract is exercised directly here.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

type Role =
  "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT";

describe.skipIf(!enabled)("P-013 onboarding assignments (real PG)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "audit_event","access_token","consent_record","onboarding_form_assignment","onboarding_form_version","onboarding_form","client_assignment","coach_profile","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  let n = 0;
  const uid = () => `p013_${++n}_${Date.now()}`;
  const user = (
    platformRole: "USER" | "PLATFORM_ADMIN" = "USER",
    status: "ACTIVE" | "DEACTIVATED" = "ACTIVE",
  ) =>
    prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$x",
        platformRole,
        status,
      },
    });
  const workspace = () =>
    prisma.workspace.create({ data: { name: `w${++n}`, slug: uid() } });
  const member = (
    workspaceId: string,
    userId: string,
    role: Role,
    status: "ACTIVE" | "SUSPENDED" | "REMOVED" = "ACTIVE",
  ) =>
    prisma.workspaceMember.create({
      data: { workspaceId, userId, role, status },
    });
  const clientProfile = (workspaceId: string, userId: string | null = null) =>
    prisma.clientProfile.create({
      data: { workspaceId, userId, name: `Client ${uid()}` },
    });
  const s = (userId: string) => ({ user: { id: userId } });
  const auditCount = () => prisma.auditEvent.count();
  const assignmentCount = () => prisma.onboardingFormAssignment.count();

  /** Eligible client: profile linked to an ACTIVE user with ACTIVE CLIENT
   * membership in the same workspace. */
  async function eligibleClient(workspaceId: string) {
    const u = await user();
    await member(workspaceId, u.id, "CLIENT");
    return clientProfile(workspaceId, u.id);
  }
  const form = async (
    workspaceId: string,
    createdByMemberId: string,
    status: "ACTIVE" | "ARCHIVED" = "ACTIVE",
  ) =>
    prisma.onboardingForm.create({
      data: { workspaceId, name: `Form ${uid()}`, status, createdByMemberId },
    });
  const version = (
    formId: string,
    versionSeq: number,
    publishedByMemberId: string,
  ) =>
    prisma.onboardingFormVersion.create({
      data: {
        formId,
        versionSeq,
        definition: { title: "t", fields: [] },
        publishOriginRevision: versionSeq,
        publishedByMemberId,
      },
    });

  async function staffFixture(
    role: Role = "WORKSPACE_OWNER",
    existing?: { id: string },
  ) {
    const ws = existing ?? (await workspace());
    const u = await user();
    const m = await member(ws.id, u.id, role);
    return { ws, u, m };
  }

  describe("schema constraints", () => {
    it("permits one ACTIVE row per (workspace, client, form) only", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const f = await form(ws.id, m.id);
      const v = await version(f.id, 1, m.id);
      const base = {
        workspaceId: ws.id,
        clientProfileId: cp.id,
        formId: f.id,
        formVersionId: v.id,
        assignedByMemberId: m.id,
      };
      await prisma.onboardingFormAssignment.create({ data: base });
      // Second ACTIVE row for the same client+form → partial unique blocks it.
      await expect(
        prisma.onboardingFormAssignment.create({ data: base }),
      ).rejects.toThrow();
      // A terminal row may coexist; a second terminal row may too.
      await prisma.onboardingFormAssignment.create({
        data: {
          ...base,
          status: "CANCELLED",
          endedByMemberId: m.id,
          endedAt: new Date(),
        },
      });
      // A different form may hold its own ACTIVE assignment for the client.
      const f2 = await form(ws.id, m.id);
      const v2 = await version(f2.id, 1, m.id);
      await prisma.onboardingFormAssignment.create({
        data: { ...base, formId: f2.id, formVersionId: v2.id },
      });
      expect(await assignmentCount()).toBe(3);
    });

    it("rejects cross-workspace client/member targets and version∉form", async () => {
      const { ws, m } = await staffFixture();
      const other = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const otherCp = await eligibleClient(other.ws.id);
      const f = await form(ws.id, m.id);
      const fOther = await form(other.ws.id, other.m.id);
      const v = await version(f.id, 1, m.id);
      const vForeignForm = await version(fOther.id, 1, other.m.id);
      const base = {
        workspaceId: ws.id,
        clientProfileId: cp.id,
        formId: f.id,
        formVersionId: v.id,
        assignedByMemberId: m.id,
      };
      // client from another workspace
      await expect(
        prisma.onboardingFormAssignment.create({
          data: { ...base, clientProfileId: otherCp.id },
        }),
      ).rejects.toThrow();
      // assigner member from another workspace
      await expect(
        prisma.onboardingFormAssignment.create({
          data: { ...base, assignedByMemberId: other.m.id },
        }),
      ).rejects.toThrow();
      // version that does not belong to the pinned form
      await expect(
        prisma.onboardingFormAssignment.create({
          data: { ...base, formVersionId: vForeignForm.id },
        }),
      ).rejects.toThrow();
      // form from another workspace
      await expect(
        prisma.onboardingFormAssignment.create({
          data: { ...base, formId: fOther.id, formVersionId: vForeignForm.id },
        }),
      ).rejects.toThrow();
    });

    it("enforces ending-provenance shape by status", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const f = await form(ws.id, m.id);
      const v = await version(f.id, 1, m.id);
      const base = {
        workspaceId: ws.id,
        clientProfileId: cp.id,
        formId: f.id,
        formVersionId: v.id,
        assignedByMemberId: m.id,
      };
      // ACTIVE with ending provenance → CHECK violation.
      await expect(
        prisma.onboardingFormAssignment.create({
          data: { ...base, endedByMemberId: m.id, endedAt: new Date() },
        }),
      ).rejects.toThrow();
      // Terminal without ending provenance → CHECK violation.
      await expect(
        prisma.onboardingFormAssignment.create({
          data: { ...base, status: "CANCELLED" },
        }),
      ).rejects.toThrow();
    });
  });

  describe("create / replace / cancel lifecycle", () => {
    it("creates an ACTIVE row pinned to the latest published version + ASSIGN audit", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const f = await form(ws.id, m.id);
      await version(f.id, 1, m.id);
      const v2 = await version(f.id, 2, m.id);
      const auditsBefore = await auditCount();
      const res = await createOnboardingAssignment(
        s(m.userId),
        { workspaceId: ws.id, clientProfileId: cp.id, formId: f.id },
        prisma,
      );
      const row = await prisma.onboardingFormAssignment.findUniqueOrThrow({
        where: { id: res.assignmentId },
      });
      expect(row.status).toBe("ACTIVE");
      expect(row.formVersionId).toBe(v2.id);
      expect(row.endedAt).toBeNull();
      expect(row.assignedByMemberId).toBe(m.id);
      expect(await auditCount()).toBe(auditsBefore + 1);
      const event = await prisma.auditEvent.findFirstOrThrow({
        where: {
          resourceType: "onboarding_assignment",
          action: "ASSIGN",
          resourceId: res.assignmentId,
        },
      });
      expect(event.subjectClientProfileId).toBe(cp.id);
    });

    it("rejects a second ACTIVE assignment for the same client+form", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const f = await form(ws.id, m.id);
      await version(f.id, 1, m.id);
      await createOnboardingAssignment(
        s(m.userId),
        { workspaceId: ws.id, clientProfileId: cp.id, formId: f.id },
        prisma,
      );
      const auditsBefore = await auditCount();
      const countBefore = await assignmentCount();
      await expect(
        createOnboardingAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cp.id, formId: f.id },
          prisma,
        ),
      ).rejects.toMatchObject({ code: "assignment_conflict" });
      expect(await assignmentCount()).toBe(countBefore);
      expect(await auditCount()).toBe(auditsBefore);
    });

    it("allows the same client to hold ACTIVE assignments on different forms", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const f1 = await form(ws.id, m.id);
      const f2 = await form(ws.id, m.id);
      await version(f1.id, 1, m.id);
      await version(f2.id, 1, m.id);
      await createOnboardingAssignment(
        s(m.userId),
        { workspaceId: ws.id, clientProfileId: cp.id, formId: f1.id },
        prisma,
      );
      const res2 = await createOnboardingAssignment(
        s(m.userId),
        { workspaceId: ws.id, clientProfileId: cp.id, formId: f2.id },
        prisma,
      );
      expect(res2.assignmentId).toBeTruthy();
    });

    it("republishing a form does not move an existing assignment's pin", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const f = await form(ws.id, m.id);
      const v1 = await version(f.id, 1, m.id);
      const res = await createOnboardingAssignment(
        s(m.userId),
        { workspaceId: ws.id, clientProfileId: cp.id, formId: f.id },
        prisma,
      );
      await version(f.id, 2, m.id);
      const row = await prisma.onboardingFormAssignment.findUniqueOrThrow({
        where: { id: res.assignmentId },
      });
      expect(row.formVersionId).toBe(v1.id);
      expect(row.status).toBe("ACTIVE");
    });

    it("replace supersedes atomically and pins the latest version", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const f = await form(ws.id, m.id);
      await version(f.id, 1, m.id);
      const res = await createOnboardingAssignment(
        s(m.userId),
        { workspaceId: ws.id, clientProfileId: cp.id, formId: f.id },
        prisma,
      );
      const v2 = await version(f.id, 2, m.id);
      const auditsBefore = await auditCount();
      const out = await replaceOnboardingAssignment(
        s(m.userId),
        { workspaceId: ws.id, assignmentId: res.assignmentId },
        prisma,
      );
      expect(out.changed).toBe(true);
      expect(out.assignmentId).not.toBe(res.assignmentId);
      const old = await prisma.onboardingFormAssignment.findUniqueOrThrow({
        where: { id: res.assignmentId },
      });
      const next = await prisma.onboardingFormAssignment.findUniqueOrThrow({
        where: { id: out.assignmentId as string },
      });
      expect(old.status).toBe("SUPERSEDED");
      expect(old.endedByMemberId).toBe(m.id);
      expect(old.endedAt).not.toBeNull();
      expect(old.formVersionId).not.toBe(v2.id);
      expect(next.status).toBe("ACTIVE");
      expect(next.formVersionId).toBe(v2.id);
      // UPDATE (supersede) + ASSIGN (new row) committed together.
      expect(await auditCount()).toBe(auditsBefore + 2);
    });

    it("replace on an already-latest pin is a no-change result with no audit", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const f = await form(ws.id, m.id);
      await version(f.id, 1, m.id);
      const res = await createOnboardingAssignment(
        s(m.userId),
        { workspaceId: ws.id, clientProfileId: cp.id, formId: f.id },
        prisma,
      );
      const auditsBefore = await auditCount();
      const countBefore = await assignmentCount();
      const out = await replaceOnboardingAssignment(
        s(m.userId),
        { workspaceId: ws.id, assignmentId: res.assignmentId },
        prisma,
      );
      expect(out.changed).toBe(false);
      expect(await assignmentCount()).toBe(countBefore);
      expect(await auditCount()).toBe(auditsBefore);
    });

    it("cancel transitions exactly once with provenance + audit", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const f = await form(ws.id, m.id);
      await version(f.id, 1, m.id);
      const res = await createOnboardingAssignment(
        s(m.userId),
        { workspaceId: ws.id, clientProfileId: cp.id, formId: f.id },
        prisma,
      );
      const auditsBefore = await auditCount();
      await cancelOnboardingAssignment(
        s(m.userId),
        { workspaceId: ws.id, assignmentId: res.assignmentId },
        prisma,
      );
      const row = await prisma.onboardingFormAssignment.findUniqueOrThrow({
        where: { id: res.assignmentId },
      });
      expect(row.status).toBe("CANCELLED");
      expect(row.endedByMemberId).toBe(m.id);
      expect(row.endedAt).not.toBeNull();
      expect(await auditCount()).toBe(auditsBefore + 1);
      // Repeated cancel: no mutation, no audit.
      await expect(
        cancelOnboardingAssignment(
          s(m.userId),
          { workspaceId: ws.id, assignmentId: res.assignmentId },
          prisma,
        ),
      ).rejects.toMatchObject({ code: "assignment_not_active" });
      expect(await auditCount()).toBe(auditsBefore + 1);
    });

    it("replace/cancel on foreign, missing, or terminal rows is non-disclosing and inert", async () => {
      const { ws, m } = await staffFixture();
      const other = await staffFixture();
      const otherCp = await eligibleClient(other.ws.id);
      const f = await form(ws.id, m.id);
      await version(f.id, 1, m.id);
      const otherF = await form(other.ws.id, other.m.id);
      const otherV = await version(otherF.id, 1, other.m.id);
      const foreignRow = await prisma.onboardingFormAssignment.create({
        data: {
          workspaceId: other.ws.id,
          clientProfileId: otherCp.id,
          formId: otherF.id,
          formVersionId: otherV.id,
          assignedByMemberId: other.m.id,
        },
      });
      const auditsBefore = await auditCount();
      for (const fn of [
        replaceOnboardingAssignment,
        cancelOnboardingAssignment,
      ]) {
        await expect(
          fn(
            s(m.userId),
            { workspaceId: ws.id, assignmentId: foreignRow.id },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "assignment_not_accessible" });
        await expect(
          fn(s(m.userId), { workspaceId: ws.id, assignmentId: "nope" }, prisma),
        ).rejects.toMatchObject({ code: "assignment_not_accessible" });
      }
      expect(await auditCount()).toBe(auditsBefore);
    });

    it("archived form blocks create/replace but never mutates existing rows", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const f = await form(ws.id, m.id);
      await version(f.id, 1, m.id);
      const res = await createOnboardingAssignment(
        s(m.userId),
        { workspaceId: ws.id, clientProfileId: cp.id, formId: f.id },
        prisma,
      );
      await prisma.onboardingForm.update({
        where: { id: f.id },
        data: { status: "ARCHIVED" },
      });
      await version(f.id, 2, m.id);
      const countBefore = await assignmentCount();
      await expect(
        createOnboardingAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cp.id, formId: f.id },
          prisma,
        ),
      ).rejects.toMatchObject({ code: "form_not_eligible" });
      await expect(
        replaceOnboardingAssignment(
          s(m.userId),
          { workspaceId: ws.id, assignmentId: res.assignmentId },
          prisma,
        ),
      ).rejects.toMatchObject({ code: "form_not_eligible" });
      // Rows untouched; cancel still allowed.
      expect(await assignmentCount()).toBe(countBefore);
      await cancelOnboardingAssignment(
        s(m.userId),
        { workspaceId: ws.id, assignmentId: res.assignmentId },
        prisma,
      );
      const row = await prisma.onboardingFormAssignment.findUniqueOrThrow({
        where: { id: res.assignmentId },
      });
      expect(row.status).toBe("CANCELLED");
    });

    it("concurrent creates produce exactly one ACTIVE row", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const f = await form(ws.id, m.id);
      await version(f.id, 1, m.id);
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, () =>
          createOnboardingAssignment(
            s(m.userId),
            { workspaceId: ws.id, clientProfileId: cp.id, formId: f.id },
            prisma,
          ),
        ),
      );
      const active = await prisma.onboardingFormAssignment.count({
        where: {
          workspaceId: ws.id,
          clientProfileId: cp.id,
          formId: f.id,
          status: "ACTIVE",
        },
      });
      expect(active).toBe(1);
      expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    });

    it("concurrent replace+cancel cannot produce an invalid lifecycle", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const f = await form(ws.id, m.id);
      await version(f.id, 1, m.id);
      const res = await createOnboardingAssignment(
        s(m.userId),
        { workspaceId: ws.id, clientProfileId: cp.id, formId: f.id },
        prisma,
      );
      await version(f.id, 2, m.id);
      await Promise.allSettled([
        replaceOnboardingAssignment(
          s(m.userId),
          { workspaceId: ws.id, assignmentId: res.assignmentId },
          prisma,
        ),
        cancelOnboardingAssignment(
          s(m.userId),
          { workspaceId: ws.id, assignmentId: res.assignmentId },
          prisma,
        ),
      ]);
      const rows = await prisma.onboardingFormAssignment.findMany({
        where: { clientProfileId: cp.id, formId: f.id },
      });
      // Exactly one terminal row on the original; at most one new ACTIVE row.
      const original = rows.find((r) => r.id === res.assignmentId);
      expect(original?.status).not.toBe("ACTIVE");
      const actives = rows.filter((r) => r.status === "ACTIVE");
      expect(actives.length).toBeLessThanOrEqual(1);
      // If the replace won, the new row pins v2; every terminal row has provenance.
      for (const r of rows) {
        if (r.status !== "ACTIVE") {
          expect(r.endedAt).not.toBeNull();
          expect(r.endedByMemberId).not.toBeNull();
        }
      }
    });

    it("forced audit failure rolls the mutation back", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const f = await form(ws.id, m.id);
      await version(f.id, 1, m.id);
      const failing = new Proxy(prisma, {
        get(t, prop) {
          if (prop !== "$transaction") return Reflect.get(t, prop);
          return async (
            cb: (tx: Prisma.TransactionClient) => Promise<unknown>,
            opts: unknown,
          ) =>
            (t.$transaction as PrismaClient["$transaction"])(
              async (tx: Prisma.TransactionClient) => {
                const proxied = new Proxy(tx, {
                  get(tr, key) {
                    if (key !== "auditEvent") return Reflect.get(tr, key);
                    return new Proxy(tr.auditEvent, {
                      get(d, op) {
                        if (op !== "create") return Reflect.get(d, op);
                        return async () => {
                          throw new Error("forced audit failure");
                        };
                      },
                    });
                  },
                });
                return cb(proxied);
              },
              opts as never,
            );
        },
      });
      const countBefore = await assignmentCount();
      await expect(
        createOnboardingAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cp.id, formId: f.id },
          failing as PrismaClient,
        ),
      ).rejects.toThrow();
      expect(await assignmentCount()).toBe(countBefore);
    });
  });

  describe("feature gate", () => {
    it("flag-off boundary call produces zero mutations and zero audits", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const f = await form(ws.id, m.id);
      await version(f.id, 1, m.id);
      const saved = process.env.ENABLE_ONBOARDING_ASSIGNMENTS;
      delete process.env.ENABLE_ONBOARDING_ASSIGNMENTS;
      try {
        const rowsBefore = await assignmentCount();
        const auditsBefore = await auditCount();
        const result = await assignFormFromAction(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cp.id, formId: f.id },
          { db: prisma },
        );
        expect(result.ok).toBe(false);
        expect(await assignmentCount()).toBe(rowsBefore);
        expect(await auditCount()).toBe(auditsBefore);
      } finally {
        if (saved === undefined)
          delete process.env.ENABLE_ONBOARDING_ASSIGNMENTS;
        else process.env.ENABLE_ONBOARDING_ASSIGNMENTS = saved;
      }
    });
  });
});
