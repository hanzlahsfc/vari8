import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  classifyParameter,
  createParameter,
  listClassifiableParameterIds,
} from "../../lib/coaching/parameters";
import {
  createTemplate,
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

  describe("positional selection + fingerprint (in-transaction)", () => {
    it("a positional selection resolves to the parameter inside the mutation transaction", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      const { ids, fingerprint } = await listClassifiableParameterIds(s(u.id), {
        workspaceId: ws.id,
      });
      const idx = ids.indexOf(p.parameterId);
      expect(idx).toBeGreaterThanOrEqual(0);
      const r = await classifyParameter(
        s(u.id),
        {
          workspaceId: ws.id,
          parameterIndex: idx,
          expectedRevision: 1,
          fingerprint,
          classification: "GENERAL_HEALTH",
        },
        prisma,
      );
      expect(r.revision).toBe(2);
      expect(
        (
          await prisma.parameterDefinition.findUniqueOrThrow({
            where: { id: p.parameterId },
          })
        ).dataClassification,
      ).toBe("GENERAL_HEALTH");
    });

    it("fails closed in-transaction on stale fingerprint and out-of-range index", async () => {
      const { ws, u } = await staffFixture();
      const p = await mkParam(ws.id, s(u.id));
      const stale = await listClassifiableParameterIds(s(u.id), {
        workspaceId: ws.id,
      });
      await mkParam(ws.id, s(u.id));
      await expect(
        classifyParameter(
          s(u.id),
          {
            workspaceId: ws.id,
            parameterIndex: 0,
            expectedRevision: 1,
            fingerprint: stale.fingerprint,
            classification: "GENERAL_HEALTH",
          },
          prisma,
        ),
      ).rejects.toMatchObject({ code: "stale_selection" });
      const fresh = await listClassifiableParameterIds(s(u.id), {
        workspaceId: ws.id,
      });
      await expect(
        classifyParameter(
          s(u.id),
          {
            workspaceId: ws.id,
            parameterIndex: fresh.ids.length + 10,
            expectedRevision: 1,
            fingerprint: fresh.fingerprint,
            classification: "GENERAL_HEALTH",
          },
          prisma,
        ),
      ).rejects.toMatchObject({ code: "invalid_input" });
      // Zero mutation under both failures.
      expect(
        (
          await prisma.parameterDefinition.findUniqueOrThrow({
            where: { id: p.parameterId },
          })
        ).dataClassification,
      ).toBeNull();
    });
  });
});
