import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import {
  archiveParameter,
  classifyParameter,
  createParameter,
  listClassifiableParameterIds,
  resolveClassifySelection,
} from "../../lib/coaching/parameters";
import {
  createTemplate,
  getTemplateVersion,
  openTemplateDraft,
  publishTemplate,
  saveTemplateDraft,
} from "../../lib/coaching/templates";

/**
 * P-020A — parameter data-classification foundation (product-decisions #64,
 * #73, #78 + P-020 binding constraints) on a dedicated disposable PostgreSQL
 * database (INTEGRATION_DATABASE_URL). Synthetic fixtures only. Service layer
 * exercised directly; the exact-match flag is enforced at the action/route
 * layers (covered by unit + E2E).
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

type Role =
  "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT";

describe.skipIf(!enabled)("P-020A parameter classification (real PG)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "audit_event","client_setup_pin","client_setup","coaching_template_version_parameter","coaching_template_version","coaching_template","parameter_definition","onboarding_form_assignment","onboarding_form_version","onboarding_form","client_assignment","coach_profile","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  let n = 0;
  const uid = () => `p020a_${++n}_${Date.now()}`;
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
    status: "SUSPENDED" | "REMOVED" | "ACTIVE" = "ACTIVE",
  ) =>
    prisma.workspaceMember.create({
      data: { workspaceId, userId, role, status },
    });
  const s = (userId: string) => ({ user: { id: userId } });
  const auditRows = (resourceId: string) =>
    prisma.auditEvent.findMany({
      where: { resourceId },
      orderBy: { at: "asc" },
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
  const mkParam = (
    workspaceId: string,
    session: { user: { id: string } },
    label = `Param ${uid()}`,
  ) =>
    createParameter(session, {
      workspaceId,
      input: { kind: "MEASUREMENT", label, unit: "kg" },
    });
  const classify = async (
    session: { user: { id: string } },
    workspaceId: string,
    parameterId: string,
    expectedRevision: number,
    classification: "GENERAL_HEALTH" | "CYCLE" | "BLOODWORK" | "PED_HRT",
  ) => {
    const { ids, fingerprint } = await listClassifiableParameterIds(session, {
      workspaceId,
    });
    const parameterIndex = ids.indexOf(parameterId);
    expect(parameterIndex).toBeGreaterThanOrEqual(0);
    return classifyParameter(session, {
      workspaceId,
      parameterIndex,
      expectedRevision,
      fingerprint,
      classification,
    });
  };

  describe("schema + migration", () => {
    it("leaves existing rows NULL and accepts no implicit default", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      const row = await prisma.parameterDefinition.findUniqueOrThrow({
        where: { id: p.parameterId },
      });
      expect(row.dataClassification).toBeNull();
    });
  });

  describe("classifyParameter authority + transitions", () => {
    it("owner classifies NULL → GENERAL_HEALTH with revision+1 + audit", async () => {
      const { ws, u } = await staffFixture("WORKSPACE_OWNER");
      const p = await mkParam(ws.id, s(u.id));
      const before = await prisma.parameterDefinition.findUniqueOrThrow({
        where: { id: p.parameterId },
      });
      const r = await classify(
        s(u.id),
        ws.id,
        p.parameterId,
        before.revision,
        "GENERAL_HEALTH",
      );
      expect(r.revision).toBe(before.revision + 1);
      const after = await prisma.parameterDefinition.findUniqueOrThrow({
        where: { id: p.parameterId },
      });
      expect(after.dataClassification).toBe("GENERAL_HEALTH");
      expect(after.updatedByMemberId).toBe(
        await prisma.workspaceMember
          .findUniqueOrThrow({
            where: { workspaceId_userId: { workspaceId: ws.id, userId: u.id } },
          })
          .then((m) => m.id),
      );
      const audits = await auditRows(p.parameterId);
      const last = audits[audits.length - 1];
      expect(last.action).toBe("UPDATE");
      expect(last.resourceType).toBe("parameter_definition");
      expect(last.meta).toEqual({
        changed: true,
        version: String(before.revision + 1),
      });
    });

    it("coach classifies NULL → CYCLE", async () => {
      const { ws, u } = await staffFixture("COACH");
      const p = await mkParam(ws.id, s(u.id));
      const row = await prisma.parameterDefinition.findUniqueOrThrow({
        where: { id: p.parameterId },
      });
      await classify(s(u.id), ws.id, p.parameterId, row.revision, "CYCLE");
      expect(
        (
          await prisma.parameterDefinition.findUniqueOrThrow({
            where: { id: p.parameterId },
          })
        ).dataClassification,
      ).toBe("CYCLE");
    });

    it.each(["BLOODWORK", "PED_HRT"] as const)(
      "rejects reserved classification %s for authorized managers",
      async (cls) => {
        for (const role of ["WORKSPACE_OWNER", "COACH"] as const) {
          const { ws, u } = await staffFixture(role);
          const p = await mkParam(
            ws.id,
            s((await staffFixture("WORKSPACE_OWNER", ws)).u.id),
          );
          const row = await prisma.parameterDefinition.findUniqueOrThrow({
            where: { id: p.parameterId },
          });
          const auditsBefore = (await auditRows(p.parameterId)).length;
          await expect(
            classify(s(u.id), ws.id, p.parameterId, row.revision, cls),
          ).rejects.toMatchObject({ code: "classification_not_permitted" });
          expect(
            (
              await prisma.parameterDefinition.findUniqueOrThrow({
                where: { id: p.parameterId },
              })
            ).dataClassification,
          ).toBeNull();
          expect((await auditRows(p.parameterId)).length).toBe(auditsBefore);
        }
      },
    );

    it.each(["BLOODWORK", "PED_HRT"] as const)(
      "denies reserved classification %s to every non-manager role",
      async (cls) => {
        for (const role of ["ASSISTANT_COACH", "SUPPORT", "CLIENT"] as const) {
          const { ws, u } = await staffFixture(role);
          const p = await mkParam(
            ws.id,
            s((await staffFixture("WORKSPACE_OWNER", ws)).u.id),
          );
          // The reserved value never reaches the transaction: the caller
          // fails authorization, zero mutation.
          await expect(
            classify(s(u.id), ws.id, p.parameterId, 1, cls),
          ).rejects.toBeInstanceOf(AccessDeniedError);
          expect(
            (
              await prisma.parameterDefinition.findUniqueOrThrow({
                where: { id: p.parameterId },
              })
            ).dataClassification,
          ).toBeNull();
        }
      },
    );

    it("denies every non-manager role and dual-role platform admin", async () => {
      for (const role of ["ASSISTANT_COACH", "SUPPORT", "CLIENT"] as const) {
        const { ws, u } = await staffFixture(role);
        const p = await mkParam(
          ws.id,
          s((await staffFixture("WORKSPACE_OWNER", ws)).u.id),
        );
        await expect(
          classify(s(u.id), ws.id, p.parameterId, 1, "GENERAL_HEALTH"),
        ).rejects.toBeInstanceOf(AccessDeniedError);
      }
      // Dual-role: PLATFORM_ADMIN user + ACTIVE WORKSPACE_OWNER membership.
      const ws = await workspace();
      const admin = await user("PLATFORM_ADMIN");
      await member(ws.id, admin.id, "WORKSPACE_OWNER");
      const p = await mkParam(
        ws.id,
        s((await staffFixture("WORKSPACE_OWNER", ws)).u.id),
      );
      await expect(
        classify(s(admin.id), ws.id, p.parameterId, 1, "GENERAL_HEALTH"),
      ).rejects.toThrow();
    });

    it("rejects reclassification and non-NULL transitions", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      await classify(s(u.id), ws.id, p.parameterId, 1, "GENERAL_HEALTH");
      await expect(
        classify(s(u.id), ws.id, p.parameterId, 2, "CYCLE"),
      ).rejects.toMatchObject({ code: "already_classified" });
      expect(
        (
          await prisma.parameterDefinition.findUniqueOrThrow({
            where: { id: p.parameterId },
          })
        ).dataClassification,
      ).toBe("GENERAL_HEALTH");
    });

    it("rejects archived parameters with parameter_archived", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      await archiveParameter(s(u.id), {
        workspaceId: ws.id,
        parameterId: p.parameterId,
      });
      const auditsBefore = (await auditRows(p.parameterId)).length;
      await expect(
        classify(s(u.id), ws.id, p.parameterId, 1, "GENERAL_HEALTH"),
      ).rejects.toMatchObject({ code: "parameter_archived" });
      const row = await prisma.parameterDefinition.findUniqueOrThrow({
        where: { id: p.parameterId },
      });
      expect(row.dataClassification).toBeNull();
      expect(row.revision).toBe(1);
      expect((await auditRows(p.parameterId)).length).toBe(auditsBefore);
    });

    it("fails on stale revision and foreign workspace", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      await expect(
        classify(s(u.id), ws.id, p.parameterId, 999, "GENERAL_HEALTH"),
      ).rejects.toMatchObject({ code: "stale_revision" });
      const other = await staffFixture();
      await expect(
        classify(s(other.u.id), ws.id, p.parameterId, 1, "GENERAL_HEALTH"),
      ).rejects.toThrow();
    });

    it("concurrent classifications yield one success and one failure", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      const results = await Promise.allSettled([
        classify(s(u.id), ws.id, p.parameterId, 1, "GENERAL_HEALTH"),
        classify(s(u.id), ws.id, p.parameterId, 1, "CYCLE"),
      ]);
      const ok = results.filter((r) => r.status === "fulfilled");
      const bad = results.filter((r) => r.status === "rejected");
      expect(ok).toHaveLength(1);
      expect(bad).toHaveLength(1);
      expect(
        (
          await prisma.parameterDefinition.findUniqueOrThrow({
            where: { id: p.parameterId },
          })
        ).revision,
      ).toBe(2);
    });
  });

  describe("classify vs archive race", () => {
    it("archive-first: classification fails with parameter_archived, zero mutation/audit", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      await archiveParameter(s(u.id), {
        workspaceId: ws.id,
        parameterId: p.parameterId,
      });
      const auditsBefore = (await auditRows(p.parameterId)).length;
      await expect(
        classify(s(u.id), ws.id, p.parameterId, 1, "GENERAL_HEALTH"),
      ).rejects.toMatchObject({ code: "parameter_archived" });
      const row = await prisma.parameterDefinition.findUniqueOrThrow({
        where: { id: p.parameterId },
      });
      expect(row.dataClassification).toBeNull();
      expect((await auditRows(p.parameterId)).length).toBe(auditsBefore);
    });

    it("classify-first: archive preserves classification", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      await classify(s(u.id), ws.id, p.parameterId, 1, "CYCLE");
      await archiveParameter(s(u.id), {
        workspaceId: ws.id,
        parameterId: p.parameterId,
      });
      const row = await prisma.parameterDefinition.findUniqueOrThrow({
        where: { id: p.parameterId },
      });
      expect(row.status).toBe("ARCHIVED");
      expect(row.dataClassification).toBe("CYCLE");
    });
  });

  describe("classify vs publish race + snapshot persistence", () => {
    const draftWith = (parameterId: string) => ({
      title: "Tracker",
      sections: [
        {
          label: "Basics",
          order: 0,
          items: [{ parameterId, required: false, order: 0 }],
        },
      ],
    });

    async function openDraftWith(
      session: { user: { id: string } },
      workspaceId: string,
      templateId: string,
      parameterId: string,
    ) {
      await openTemplateDraft(session, { workspaceId, templateId });
      const t = await prisma.coachingTemplate.findUniqueOrThrow({
        where: { id: templateId },
      });
      await saveTemplateDraft(session, {
        workspaceId,
        templateId,
        expectedRevision: t.draftRevision,
        draft: draftWith(parameterId),
      });
      return prisma.coachingTemplate.findUniqueOrThrow({
        where: { id: templateId },
      });
    }

    it("publish before classification snapshots NULL classification", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      const t = await createTemplate(s(u.id), {
        workspaceId: ws.id,
        name: `T ${uid()}`,
      });
      const d = await openDraftWith(
        s(u.id),
        ws.id,
        t.templateId,
        p.parameterId,
      );
      const pub = await publishTemplate(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: d.draftRevision,
      });
      const v = await getTemplateVersion(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        versionSeq: pub.versionSeq,
      });
      const snap = (v.definition.parameters as Record<string, unknown>)[
        p.parameterId
      ] as Record<string, unknown>;
      expect(snap.dataClassification).toBeNull();
      // Classify after publish — live row changes; published snapshot intact.
      const row = await prisma.parameterDefinition.findUniqueOrThrow({
        where: { id: p.parameterId },
      });
      await classify(
        s(u.id),
        ws.id,
        p.parameterId,
        row.revision,
        "GENERAL_HEALTH",
      );
      const v2 = await getTemplateVersion(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        versionSeq: pub.versionSeq,
      });
      expect(
        JSON.stringify(v2.definition) === JSON.stringify(v.definition),
      ).toBe(true);
    });

    it("publish after classification snapshots the classification and revision", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      await classify(s(u.id), ws.id, p.parameterId, 1, "GENERAL_HEALTH");
      const row = await prisma.parameterDefinition.findUniqueOrThrow({
        where: { id: p.parameterId },
      });
      const t = await createTemplate(s(u.id), {
        workspaceId: ws.id,
        name: `T ${uid()}`,
      });
      const d = await openDraftWith(
        s(u.id),
        ws.id,
        t.templateId,
        p.parameterId,
      );
      const pub = await publishTemplate(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: d.draftRevision,
      });
      const v = await getTemplateVersion(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        versionSeq: pub.versionSeq,
      });
      const snap = (v.definition.parameters as Record<string, unknown>)[
        p.parameterId
      ] as Record<string, unknown>;
      expect(snap.dataClassification).toBe("GENERAL_HEALTH");
      expect(snap.revision).toBe(row.revision);
    });
  });

  describe("universal duplicate-parameter publish rejection (#64)", () => {
    it("rejects a draft referencing the same parameter twice, zero writes/audit", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      const t = await createTemplate(s(u.id), {
        workspaceId: ws.id,
        name: `T ${uid()}`,
      });
      await openTemplateDraft(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
      });
      const opened = await prisma.coachingTemplate.findUniqueOrThrow({
        where: { id: t.templateId },
      });
      await saveTemplateDraft(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: opened.draftRevision,
        draft: {
          title: "Dup",
          sections: [
            {
              label: "A",
              order: 0,
              items: [
                { parameterId: p.parameterId, required: false, order: 0 },
              ],
            },
            {
              label: "B",
              order: 1,
              items: [{ parameterId: p.parameterId, required: true, order: 0 }],
            },
          ],
        },
      });
      const withDraft = await prisma.coachingTemplate.findUniqueOrThrow({
        where: { id: t.templateId },
      });
      const auditsBefore = await prisma.auditEvent.count();
      const versionsBefore = await prisma.coachingTemplateVersion.count({
        where: { templateId: t.templateId },
      });
      await expect(
        publishTemplate(s(u.id), {
          workspaceId: ws.id,
          templateId: t.templateId,
          expectedRevision: withDraft.draftRevision,
        }),
      ).rejects.toMatchObject({ code: "duplicate_parameter" });
      expect(await prisma.auditEvent.count()).toBe(auditsBefore);
      expect(
        await prisma.coachingTemplateVersion.count({
          where: { templateId: t.templateId },
        }),
      ).toBe(versionsBefore);
      // Draft remains stored — not silently repaired.
      const after = await prisma.coachingTemplate.findUniqueOrThrow({
        where: { id: t.templateId },
      });
      expect(after.draft).not.toBeNull();
    });
  });

  describe("positional selection + fingerprint", () => {
    it("resolves an authorized positional selection to a parameter id", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      const { ids, fingerprint } = await listClassifiableParameterIds(s(u.id), {
        workspaceId: ws.id,
      });
      const idx = ids.indexOf(p.parameterId);
      expect(idx).toBeGreaterThanOrEqual(0);
      const resolved = await resolveClassifySelection(s(u.id), {
        workspaceId: ws.id,
        parameterIndex: idx,
        fingerprint,
      });
      expect(resolved.parameterId).toBe(p.parameterId);
    });

    it("fails closed on stale fingerprint and out-of-range index", async () => {
      const { ws, u } = await staffFixture();
      await mkParam(ws.id, s(u.id));
      const { fingerprint, ids } = await listClassifiableParameterIds(s(u.id), {
        workspaceId: ws.id,
      });
      await mkParam(ws.id, s(u.id));
      await expect(
        resolveClassifySelection(s(u.id), {
          workspaceId: ws.id,
          parameterIndex: 0,
          fingerprint,
        }),
      ).rejects.toMatchObject({ code: "stale_selection" });
      const fresh = await listClassifiableParameterIds(s(u.id), {
        workspaceId: ws.id,
      });
      await expect(
        resolveClassifySelection(s(u.id), {
          workspaceId: ws.id,
          parameterIndex: fresh.ids.length + 10,
          fingerprint: fresh.fingerprint,
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
      void ids;
    });
  });
});
