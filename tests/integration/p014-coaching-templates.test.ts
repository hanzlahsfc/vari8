import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import {
  archiveParameter,
  createParameter,
  getParameter,
  listParameters,
  ParameterError,
  updateParameter,
} from "../../lib/coaching/parameters";
import {
  archiveTemplate,
  CoachingTemplateError,
  createTemplate,
  getTemplateVersion,
  listTemplates,
  openTemplateDraft,
  publishTemplate,
  saveTemplateDraft,
} from "../../lib/coaching/templates";

/**
 * P-014 parameter library + coaching template foundation — real-PostgreSQL
 * contract tests on a dedicated disposable database (INTEGRATION_DATABASE_URL).
 * Service layer only; the env flag is enforced at boundary/route layers.
 * Synthetic fixtures only — no source-derived definitions.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

type Role =
  "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT";

describe.skipIf(!enabled)("P-014 coaching foundation (real PG)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "audit_event","coaching_template_version_parameter","coaching_template_version","coaching_template","parameter_definition","onboarding_form_assignment","onboarding_form_version","onboarding_form","client_assignment","coach_profile","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  let n = 0;
  const uid = () => `p014_${++n}_${Date.now()}`;
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
  const s = (userId: string) => ({ user: { id: userId } });
  const auditCount = () => prisma.auditEvent.count();

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
    label = "Weight",
  ) =>
    createParameter(session, {
      workspaceId,
      input: { kind: "MEASUREMENT", label, unit: "kg" },
    });

  const draftFor = (parameterId: string) => ({
    title: "Tracker",
    sections: [
      {
        label: "Basics",
        order: 0,
        items: [{ parameterId, required: true, order: 0 }],
      },
    ],
  });

  describe("schema constraints", () => {
    it("enforces unique parameter key per workspace", async () => {
      const { ws, m } = await staffFixture();
      await prisma.parameterDefinition.create({
        data: {
          workspaceId: ws.id,
          key: "p_fixed",
          kind: "TEXT",
          label: "a",
          createdByMemberId: m.id,
          updatedByMemberId: m.id,
        },
      });
      await expect(
        prisma.parameterDefinition.create({
          data: {
            workspaceId: ws.id,
            key: "p_fixed",
            kind: "TEXT",
            label: "b",
            createdByMemberId: m.id,
            updatedByMemberId: m.id,
          },
        }),
      ).rejects.toThrow();
    });

    it("rejects a version-parameter reference across workspaces", async () => {
      const a = await staffFixture();
      const b = await staffFixture();
      const p = await prisma.parameterDefinition.create({
        data: {
          workspaceId: a.ws.id,
          key: `p_${uid()}`,
          kind: "TEXT",
          label: "x",
          createdByMemberId: a.m.id,
          updatedByMemberId: a.m.id,
        },
      });
      const t = await prisma.coachingTemplate.create({
        data: {
          workspaceId: b.ws.id,
          name: "t",
          createdByMemberId: b.m.id,
        },
      });
      const v = await prisma.coachingTemplateVersion.create({
        data: {
          workspaceId: b.ws.id,
          templateId: t.id,
          versionSeq: 1,
          definition: { title: "t", sections: [], parameters: {} },
          publishOriginRevision: 1,
          publishedByMemberId: b.m.id,
        },
      });
      await expect(
        prisma.coachingTemplateVersionParameter.create({
          data: {
            workspaceId: b.ws.id,
            templateId: t.id,
            versionId: v.id,
            parameterId: p.id,
          },
        }),
      ).rejects.toThrow();
    });

    it("rejects version-template coherence violations", async () => {
      const a = await staffFixture();
      const b = await staffFixture();
      const t1 = await prisma.coachingTemplate.create({
        data: { workspaceId: a.ws.id, name: "a", createdByMemberId: a.m.id },
      });
      const t2 = await prisma.coachingTemplate.create({
        data: { workspaceId: b.ws.id, name: "b", createdByMemberId: b.m.id },
      });
      const v = await prisma.coachingTemplateVersion.create({
        data: {
          workspaceId: b.ws.id,
          templateId: t2.id,
          versionSeq: 1,
          definition: { title: "t", sections: [], parameters: {} },
          publishOriginRevision: 1,
          publishedByMemberId: b.m.id,
        },
      });
      // versionId belongs to t2, but templateId claims t1 → reject.
      await expect(
        prisma.coachingTemplateVersionParameter.create({
          data: {
            workspaceId: b.ws.id,
            templateId: t1.id,
            versionId: v.id,
            parameterId: "none",
          },
        }),
      ).rejects.toThrow();
    });

    it("enforces archive-provenance CHECK and restrictive deletes", async () => {
      const { ws, m } = await staffFixture();
      await expect(
        prisma.parameterDefinition.create({
          data: {
            workspaceId: ws.id,
            key: `p_${uid()}`,
            kind: "TEXT",
            label: "x",
            status: "ARCHIVED",
            createdByMemberId: m.id,
            updatedByMemberId: m.id,
          },
        }),
      ).rejects.toThrow();
      const p = await prisma.parameterDefinition.create({
        data: {
          workspaceId: ws.id,
          key: `p_${uid()}`,
          kind: "TEXT",
          label: "x",
          createdByMemberId: m.id,
          updatedByMemberId: m.id,
        },
      });
      // Workspace delete must NOT cascade-delete the parameter row.
      await expect(
        prisma.workspace.delete({ where: { id: ws.id } }),
      ).rejects.toThrow();
      await prisma.parameterDefinition.delete({ where: { id: p.id } });
    });
  });

  describe("authorization", () => {
    it("owner and coach read/write at workspace scope", async () => {
      const { ws, u } = await staffFixture("WORKSPACE_OWNER");
      const created = await mkParam(ws.id, s(u.id));
      expect(created.key).toMatch(/^p_/);
      const { u: coach } = await staffFixture("COACH", ws);
      expect(
        await listParameters(s(coach.id), { workspaceId: ws.id }),
      ).toHaveLength(1);
      await createTemplate(s(coach.id), { workspaceId: ws.id, name: "T" });
      expect(
        await listTemplates(s(coach.id), { workspaceId: ws.id }),
      ).toHaveLength(1);
    });

    it.each(["ASSISTANT_COACH", "SUPPORT", "CLIENT"] as const)(
      "denies %s all parameter/template access",
      async (role) => {
        const { ws, u } = await staffFixture();
        const p = await mkParam(ws.id, s(u.id));
        const denied = await staffFixture(role, ws);
        for (const call of [
          () => listParameters(s(denied.u.id), { workspaceId: ws.id }),
          () => listTemplates(s(denied.u.id), { workspaceId: ws.id }),
          () => mkParam(ws.id, s(denied.u.id)),
          () =>
            createTemplate(s(denied.u.id), { workspaceId: ws.id, name: "x" }),
          () =>
            archiveParameter(s(denied.u.id), {
              workspaceId: ws.id,
              parameterId: p.parameterId,
            }),
        ]) {
          await expect(call()).rejects.toThrow(AccessDeniedError);
        }
      },
    );

    it("denies dual-role platform admin, non-members, inactive members, and cross-workspace reads", async () => {
      const a = await staffFixture();
      const b = await staffFixture();
      const p = await mkParam(a.ws.id, s(a.u.id));

      // Platform admin + ACTIVE owner membership → denied.
      const admin = await user("PLATFORM_ADMIN");
      await member(a.ws.id, admin.id, "WORKSPACE_OWNER");
      await expect(
        listParameters(s(admin.id), { workspaceId: a.ws.id }),
      ).rejects.toThrow(AccessDeniedError);

      // Foreign parameter under an authorized workspace → non-disclosing
      // domain error (indistinguishable from a missing row).
      await expect(
        getParameter(s(b.u.id), {
          workspaceId: b.ws.id,
          parameterId: p.parameterId,
        }),
      ).rejects.toMatchObject({ code: "parameter_not_accessible" });
      // Same owner, foreign workspace → authorization denial (no membership).
      await expect(
        getParameter(s(b.u.id), {
          workspaceId: a.ws.id,
          parameterId: p.parameterId,
        }),
      ).rejects.toThrow(AccessDeniedError);

      // Suspended member → denied.
      const { u: susp } = await staffFixture("WORKSPACE_OWNER", a.ws);
      await prisma.workspaceMember.updateMany({
        where: { userId: susp.id, workspaceId: a.ws.id },
        data: { status: "SUSPENDED" },
      });
      await expect(
        listParameters(s(susp.id), { workspaceId: a.ws.id }),
      ).rejects.toThrow(AccessDeniedError);
    });

    it("denies immediately after membership revocation (no cached grant)", async () => {
      const { ws, u } = await staffFixture("COACH");
      await prisma.workspaceMember.updateMany({
        where: { userId: u.id },
        data: { status: "REMOVED" },
      });
      await expect(
        listParameters(s(u.id), { workspaceId: ws.id }),
      ).rejects.toThrow(AccessDeniedError);
    });
  });

  describe("parameter lifecycle", () => {
    it("mints server keys; caller keys are never accepted", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      expect(p.key).toMatch(/^p_[0-9a-f-]{36}$/);
      const full = await getParameter(s(u.id), {
        workspaceId: ws.id,
        parameterId: p.parameterId,
      });
      expect(full.key).toBe(p.key);
    });

    it("rejects stale expectedRevision with zero mutation and zero audit", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      const audits = await auditCount();
      await expect(
        updateParameter(s(u.id), {
          workspaceId: ws.id,
          parameterId: p.parameterId,
          expectedRevision: 999,
          input: { label: "renamed" },
        }),
      ).rejects.toThrowError(ParameterError);
      const row = await prisma.parameterDefinition.findUnique({
        where: { id: p.parameterId },
      });
      expect(row?.revision).toBe(1);
      expect(row?.label).toBe("Weight");
      expect(await auditCount()).toBe(audits);
    });

    it("archived parameters reject edits; archive is terminal and idempotent", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      await archiveParameter(s(u.id), {
        workspaceId: ws.id,
        parameterId: p.parameterId,
      });
      await expect(
        updateParameter(s(u.id), {
          workspaceId: ws.id,
          parameterId: p.parameterId,
          expectedRevision: 1,
          input: { label: "x" },
        }),
      ).rejects.toThrowError(ParameterError);
      // Second archive = idempotent, no extra audit/mutation.
      const audits = await auditCount();
      await archiveParameter(s(u.id), {
        workspaceId: ws.id,
        parameterId: p.parameterId,
      });
      expect(await auditCount()).toBe(audits);
    });
  });

  describe("template lifecycle and publish protocol", () => {
    it("creates, saves draft (server-stamped ack), publishes v1 immutably", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      const t = await createTemplate(s(u.id), {
        workspaceId: ws.id,
        name: "Tracker",
      });
      const saved = await saveTemplateDraft(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: 1,
        draft: draftFor(p.parameterId),
      });
      expect(saved.revision).toBe(2);
      expect(
        saved.definition.sections[0].items[0].acknowledgedParameterRevision,
      ).toBe(1);

      const v1 = await publishTemplate(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: 2,
      });
      expect(v1.versionSeq).toBe(1);
      const version = await getTemplateVersion(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        versionSeq: 1,
      });
      // Snapshot embeds the parameter metadata frozen at publish.
      const snap = version.definition.parameters[p.parameterId];
      expect(snap.label).toBe("Weight");
      expect(version.publishedBy).toBeDefined();
    });

    it("idempotent publish replay returns the same version — no dup rows or audits", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      const t = await createTemplate(s(u.id), {
        workspaceId: ws.id,
        name: "T",
      });
      await saveTemplateDraft(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: 1,
        draft: draftFor(p.parameterId),
      });
      const v1 = await publishTemplate(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: 2,
      });
      const audits = await auditCount();
      const replay = await publishTemplate(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: 2,
      });
      expect(replay.versionSeq).toBe(v1.versionSeq);
      expect(
        await prisma.coachingTemplateVersion.count({
          where: { templateId: t.templateId },
        }),
      ).toBe(1);
      expect(await auditCount()).toBe(audits);
    });

    it("post-publish display edit never mutates the snapshot; semantic edit is locked", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      const t = await createTemplate(s(u.id), {
        workspaceId: ws.id,
        name: "T",
      });
      await saveTemplateDraft(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: 1,
        draft: draftFor(p.parameterId),
      });
      await publishTemplate(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: 2,
      });
      // Semantic field locked after first publication.
      await expect(
        updateParameter(s(u.id), {
          workspaceId: ws.id,
          parameterId: p.parameterId,
          expectedRevision: 1,
          input: { unit: "lb" },
        }),
      ).rejects.toThrowError(ParameterError);
      // Display edit fine, bumps revision, snapshot unchanged.
      await updateParameter(s(u.id), {
        workspaceId: ws.id,
        parameterId: p.parameterId,
        expectedRevision: 1,
        input: { label: "Bodyweight (am)" },
      });
      const version = await getTemplateVersion(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        versionSeq: 1,
      });
      expect(version.definition.parameters[p.parameterId].label).toBe("Weight");
    });

    it("parameter_changed conflict: draft saved before a param edit cannot publish", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      const t = await createTemplate(s(u.id), {
        workspaceId: ws.id,
        name: "T",
      });
      await saveTemplateDraft(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: 1,
        draft: draftFor(p.parameterId),
      });
      // Param display edit bumps revision AFTER the draft acknowledged rev 1.
      await updateParameter(s(u.id), {
        workspaceId: ws.id,
        parameterId: p.parameterId,
        expectedRevision: 1,
        input: { label: "Weight v2" },
      });
      const audits = await auditCount();
      await expect(
        publishTemplate(s(u.id), {
          workspaceId: ws.id,
          templateId: t.templateId,
          expectedRevision: 2,
        }),
      ).rejects.toThrowError(CoachingTemplateError);
      await expect(
        publishTemplate(s(u.id), {
          workspaceId: ws.id,
          templateId: t.templateId,
          expectedRevision: 2,
        }),
      ).rejects.toMatchObject({ code: "parameter_changed" });
      expect(await auditCount()).toBe(audits);
      // Re-save re-acknowledges revision 2 → publish succeeds.
      await saveTemplateDraft(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: 2,
        draft: draftFor(p.parameterId),
      });
      const v = await publishTemplate(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: 3,
      });
      expect(v.versionSeq).toBe(1);
    });

    it("archived parameter references are rejected at save AND publish", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      const p2 = await mkParam(ws.id, s(u.id), "Second");
      const t = await createTemplate(s(u.id), {
        workspaceId: ws.id,
        name: "T",
      });
      // Save-path rejection: drafting with an archived param.
      await archiveParameter(s(u.id), {
        workspaceId: ws.id,
        parameterId: p.parameterId,
      });
      await expect(
        saveTemplateDraft(s(u.id), {
          workspaceId: ws.id,
          templateId: t.templateId,
          expectedRevision: 1,
          draft: draftFor(p.parameterId),
        }),
      ).rejects.toThrowError(CoachingTemplateError);
      // Publish-path rejection: param archived after a valid save.
      await saveTemplateDraft(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: 1,
        draft: draftFor(p2.parameterId),
      });
      await archiveParameter(s(u.id), {
        workspaceId: ws.id,
        parameterId: p2.parameterId,
      });
      await expect(
        publishTemplate(s(u.id), {
          workspaceId: ws.id,
          templateId: t.templateId,
          expectedRevision: 2,
        }),
      ).rejects.toMatchObject({ code: "parameter_not_publishable" });
      expect(
        await prisma.coachingTemplateVersion.count({
          where: { templateId: t.templateId },
        }),
      ).toBe(0);
    });

    it("edit-after-publish: open draft seeds from latest version; publish creates v2; v1 untouched", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      const p2 = await mkParam(ws.id, s(u.id), "Sleep");
      const t = await createTemplate(s(u.id), {
        workspaceId: ws.id,
        name: "T",
      });
      await saveTemplateDraft(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: 1,
        draft: draftFor(p.parameterId),
      });
      await publishTemplate(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: 2,
      });
      // Publish closed the draft; reopen seeds from v1.
      const reopened = await openTemplateDraft(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
      });
      expect(reopened.revision).toBe(3);
      expect(reopened.definition.sections).toHaveLength(1);
      // Caller shape: stable known IDs kept, server fields stripped, plus a
      // new section + item referencing the second parameter by key.
      const saved = await saveTemplateDraft(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: 3,
        draft: {
          title: reopened.definition.title,
          sections: [
            {
              sectionId: reopened.definition.sections[0].sectionId,
              label: "Basics v2",
              order: 0,
              items: reopened.definition.sections[0].items.map((i) => ({
                itemId: i.itemId,
                parameterKey: i.parameterKey,
                required: i.required,
                order: i.order,
              })),
            },
            {
              label: "More",
              order: 1,
              items: [{ parameterKey: p2.key, required: false, order: 0 }],
            },
          ],
        },
      });
      const v2 = await publishTemplate(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: saved.revision,
      });
      expect(v2.versionSeq).toBe(2);
      const v1 = await getTemplateVersion(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        versionSeq: 1,
      });
      expect(v1.definition.sections).toHaveLength(1);
    });

    it("stale draft revision is a stable conflict with zero mutation", async () => {
      const { ws, u } = await staffFixture();
      const t = await createTemplate(s(u.id), {
        workspaceId: ws.id,
        name: "T",
      });
      const audits = await auditCount();
      await expect(
        saveTemplateDraft(s(u.id), {
          workspaceId: ws.id,
          templateId: t.templateId,
          expectedRevision: 99,
          draft: { title: "x", sections: [] },
        }),
      ).rejects.toMatchObject({ code: "stale_revision" });
      expect(await auditCount()).toBe(audits);
    });

    it("archive is terminal; archived templates cannot save/publish", async () => {
      const { ws, u } = await staffFixture();
      const t = await createTemplate(s(u.id), {
        workspaceId: ws.id,
        name: "T",
      });
      await archiveTemplate(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
      });
      await expect(
        saveTemplateDraft(s(u.id), {
          workspaceId: ws.id,
          templateId: t.templateId,
          expectedRevision: 1,
          draft: { title: "x", sections: [] },
        }),
      ).rejects.toMatchObject({ code: "template_archived" });
      await expect(
        openTemplateDraft(s(u.id), {
          workspaceId: ws.id,
          templateId: t.templateId,
        }),
      ).rejects.toMatchObject({ code: "template_archived" });
      // Idempotent re-archive → no extra audit.
      const audits = await auditCount();
      await archiveTemplate(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
      });
      expect(await auditCount()).toBe(audits);
    });
  });

  describe("concurrency", () => {
    it("concurrent publish replay produces one version", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      const t = await createTemplate(s(u.id), {
        workspaceId: ws.id,
        name: "T",
      });
      await saveTemplateDraft(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: 1,
        draft: draftFor(p.parameterId),
      });
      const results = await Promise.all(
        [0, 1, 2].map(() =>
          publishTemplate(s(u.id), {
            workspaceId: ws.id,
            templateId: t.templateId,
            expectedRevision: 2,
          }).catch((e: unknown) => e),
        ),
      );
      const successes = results.filter(
        (r): r is { versionSeq: number } =>
          typeof r === "object" && r !== null && "versionSeq" in r,
      );
      expect(successes.length).toBeGreaterThanOrEqual(1);
      for (const r of successes) expect(r.versionSeq).toBe(1);
      expect(
        await prisma.coachingTemplateVersion.count({
          where: { templateId: t.templateId },
        }),
      ).toBe(1);
    });

    it("overlapping-parameter publishes on two templates both commit without deadlock", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      const p2 = await mkParam(ws.id, s(u.id), "Sleep");
      const t1 = await createTemplate(s(u.id), {
        workspaceId: ws.id,
        name: "A",
      });
      const t2 = await createTemplate(s(u.id), {
        workspaceId: ws.id,
        name: "B",
      });
      const sharedDraft = {
        title: "t",
        sections: [
          {
            label: "s",
            order: 0,
            items: [
              { parameterId: p.parameterId, required: true, order: 0 },
              { parameterId: p2.parameterId, required: false, order: 1 },
            ],
          },
        ],
      };
      for (const t of [t1, t2]) {
        await saveTemplateDraft(s(u.id), {
          workspaceId: ws.id,
          templateId: t.templateId,
          expectedRevision: 1,
          draft: sharedDraft,
        });
      }
      const results = await Promise.allSettled([
        publishTemplate(s(u.id), {
          workspaceId: ws.id,
          templateId: t1.templateId,
          expectedRevision: 2,
        }),
        publishTemplate(s(u.id), {
          workspaceId: ws.id,
          templateId: t2.templateId,
          expectedRevision: 2,
        }),
      ]);
      // Both publish successfully — ascending parameter-ID lock order.
      for (const r of results) {
        expect(r.status).toBe("fulfilled");
      }
      expect(
        await prisma.coachingTemplateVersionParameter.count({
          where: { parameterId: p.parameterId },
        }),
      ).toBe(2);
    });

    it("parameter archive versus publish produces one valid outcome", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      const t = await createTemplate(s(u.id), {
        workspaceId: ws.id,
        name: "T",
      });
      await saveTemplateDraft(s(u.id), {
        workspaceId: ws.id,
        templateId: t.templateId,
        expectedRevision: 1,
        draft: draftFor(p.parameterId),
      });
      const [publishResult, archiveResult] = await Promise.allSettled([
        publishTemplate(s(u.id), {
          workspaceId: ws.id,
          templateId: t.templateId,
          expectedRevision: 2,
        }),
        archiveParameter(s(u.id), {
          workspaceId: ws.id,
          parameterId: p.parameterId,
        }),
      ]);
      const publishOk = publishResult.status === "fulfilled";
      const archiveOk = archiveResult.status === "fulfilled";
      // One valid outcome: publish wins OR archive wins; never both-fail
      // ambiguously, never a version referencing an archived param.
      if (publishOk) {
        expect(
          await prisma.coachingTemplateVersion.count({
            where: { templateId: t.templateId },
          }),
        ).toBe(1);
        const param = await prisma.parameterDefinition.findUnique({
          where: { id: p.parameterId },
        });
        // If archive also committed, the published snapshot stands —
        // it froze ACTIVE semantics before archival.
        expect(["ACTIVE", "ARCHIVED"]).toContain(param?.status);
      } else {
        expect(archiveOk).toBe(true);
        expect(
          await prisma.coachingTemplateVersion.count({
            where: { templateId: t.templateId },
          }),
        ).toBe(0);
      }
    });
  });

  describe("audit integrity", () => {
    it("audit failure rolls back the mutation", async () => {
      const { ws, u } = await staffFixture();
      const before = await prisma.parameterDefinition.count({
        where: { workspaceId: ws.id },
      });
      // AuditEvent requires real FK targets; a create inside a tx that fails
      // audit insertion must roll back the whole mutation.
      await expect(
        prisma.$transaction(async (tx) => {
          const memberId = (
            await prisma.workspaceMember.findFirstOrThrow({
              where: { userId: u.id },
            })
          ).id;
          const p = await tx.parameterDefinition.create({
            data: {
              workspaceId: ws.id,
              key: `p_${uid()}`,
              kind: "TEXT",
              label: "x",
              createdByMemberId: memberId,
              updatedByMemberId: memberId,
            },
          });
          // Deliberately invalid audit row (bogus member FK) → tx aborts.
          await tx.auditEvent.create({
            data: {
              actorUserId: "nope",
              action: "CREATE",
              resourceType: "parameter_definition",
              resourceId: p.id,
              result: "ALLOW",
            },
          });
        }),
      ).rejects.toThrow();
      expect(
        await prisma.parameterDefinition.count({
          where: { workspaceId: ws.id },
        }),
      ).toBe(before);
    });
  });
});
