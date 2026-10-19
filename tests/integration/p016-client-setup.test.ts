import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";


/**
 * P-016 C1 client setup / template assignments — real-PostgreSQL contract
 * tests (product-decisions #49–#57). Synthetic fixtures only; dedicated
 * disposable database via INTEGRATION_DATABASE_URL (never the application
 * database).
 *
 * The service itself performs flag-independent authorization; the env gate
 * is enforced at the boundary/route layer (see unit + E2E coverage), so the
 * service contract is exercised directly here.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

type Role =
  "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT";

describe.skipIf(!enabled)(
  "P-016 client setup / template assignments (real PG)",
  () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
      execFileSync("npx", ["prisma", "migrate", "deploy"], {
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: url as string },
      });
      prisma = new PrismaClient({
        datasources: { db: { url: url as string } },
      });
      await prisma.$executeRawUnsafe(
        'TRUNCATE "audit_event","access_token","consent_record","client_setup_pin","client_setup","coaching_template_version_parameter","coaching_template_version","coaching_template","parameter_definition","onboarding_form_assignment","onboarding_form_version","onboarding_form","client_assignment","coach_profile","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
      );
    });
    afterAll(async () => {
      await prisma?.$disconnect();
    });

    let n = 0;
    const uid = () => `p016_${++n}_${Date.now()}`;
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
    const pinCount = (workspaceId: string) =>
      prisma.clientSetupPin.count({ where: { workspaceId } });

    /** Eligible client: profile linked to an ACTIVE user with ACTIVE CLIENT
     * membership in the same workspace. */
    async function eligibleClient(workspaceId: string) {
      const u = await user();
      await member(workspaceId, u.id, "CLIENT");
      return clientProfile(workspaceId, u.id);
    }
    const template = async (
      workspaceId: string,
      createdByMemberId: string,
      status: "ACTIVE" | "ARCHIVED" = "ACTIVE",
    ) =>
      prisma.coachingTemplate.create({
        data: {
          workspaceId,
          name: `Template ${uid()}`,
          status,
          createdByMemberId,
          // P-014 provenance CHECK: ARCHIVED requires archivedAt/archivedBy.
          ...(status === "ARCHIVED"
            ? { archivedAt: new Date(), archivedByMemberId: createdByMemberId }
            : {}),
        },
      });
    const version = (
      workspaceId: string,
      templateId: string,
      versionSeq: number,
      publishedByMemberId: string,
    ) =>
      prisma.coachingTemplateVersion.create({
        data: {
          workspaceId,
          templateId,
          versionSeq,
          definition: { title: "t", sections: [] },
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
      it("permits one setup per (workspace, client) and one ACTIVE pin per setup", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const setup = await prisma.clientSetup.create({
          data: { workspaceId: ws.id, clientProfileId: cp.id },
        });
        // Second setup row for the same (workspace, client) → unique blocks it.
        await expect(
          prisma.clientSetup.create({
            data: { workspaceId: ws.id, clientProfileId: cp.id },
          }),
        ).rejects.toThrow();

        const t = await template(ws.id, m.id);
        const v = await version(ws.id, t.id, 1, m.id);
        const base = {
          clientSetupId: setup.id,
          workspaceId: ws.id,
          clientProfileId: cp.id,
          seq: 1,
          templateId: t.id,
          templateVersionId: v.id,
          assignedByMemberId: m.id,
        };
        await prisma.clientSetupPin.create({ data: base });
        // Second ACTIVE pin for the same setup → partial unique blocks it.
        await expect(
          prisma.clientSetupPin.create({ data: { ...base, seq: 2 } }),
        ).rejects.toThrow();
        // A terminal pin may coexist; another terminal pin may too.
        await prisma.clientSetupPin.create({
          data: {
            ...base,
            seq: 2,
            status: "CANCELLED",
            endedByMemberId: m.id,
            endedAt: new Date(),
          },
        });
        // A different client's setup may hold its own ACTIVE pin.
        const cp2 = await eligibleClient(ws.id);
        const setup2 = await prisma.clientSetup.create({
          data: { workspaceId: ws.id, clientProfileId: cp2.id },
        });
        await prisma.clientSetupPin.create({
          data: {
            ...base,
            clientSetupId: setup2.id,
            clientProfileId: cp2.id,
            seq: 1,
          },
        });
        expect(await pinCount(ws.id)).toBe(3);
      });

      it("rejects cross-workspace, wrong-setup, and version∉template targets", async () => {
        const { ws, m } = await staffFixture();
        const other = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const otherCp = await eligibleClient(other.ws.id);
        const setup = await prisma.clientSetup.create({
          data: { workspaceId: ws.id, clientProfileId: cp.id },
        });
        const otherSetup = await prisma.clientSetup.create({
          data: { workspaceId: other.ws.id, clientProfileId: otherCp.id },
        });
        const t = await template(ws.id, m.id);
        const tOther = await template(other.ws.id, other.m.id);
        const v = await version(ws.id, t.id, 1, m.id);
        const vForeign = await version(other.ws.id, tOther.id, 1, other.m.id);
        const base = {
          clientSetupId: setup.id,
          workspaceId: ws.id,
          clientProfileId: cp.id,
          seq: 1,
          templateId: t.id,
          templateVersionId: v.id,
          assignedByMemberId: m.id,
        };
        // client from another workspace
        await expect(
          prisma.clientSetupPin.create({
            data: { ...base, clientProfileId: otherCp.id },
          }),
        ).rejects.toThrow();
        // setup from another workspace
        await expect(
          prisma.clientSetupPin.create({
            data: { ...base, clientSetupId: otherSetup.id },
          }),
        ).rejects.toThrow();
        // assigner member from another workspace
        await expect(
          prisma.clientSetupPin.create({
            data: { ...base, assignedByMemberId: other.m.id },
          }),
        ).rejects.toThrow();
        // version that does not belong to the pinned template
        await expect(
          prisma.clientSetupPin.create({
            data: { ...base, templateVersionId: vForeign.id },
          }),
        ).rejects.toThrow();
        // template from another workspace
        await expect(
          prisma.clientSetupPin.create({
            data: {
              ...base,
              templateId: tOther.id,
              templateVersionId: vForeign.id,
            },
          }),
        ).rejects.toThrow();
        // pin client differs from its setup's client
        const cp3 = await eligibleClient(ws.id);
        await expect(
          prisma.clientSetupPin.create({
            data: { ...base, clientProfileId: cp3.id },
          }),
        ).rejects.toThrow();
      });

      it("enforces ending-provenance shape and (setup, seq) uniqueness", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const setup = await prisma.clientSetup.create({
          data: { workspaceId: ws.id, clientProfileId: cp.id },
        });
        const t = await template(ws.id, m.id);
        const v = await version(ws.id, t.id, 1, m.id);
        const base = {
          clientSetupId: setup.id,
          workspaceId: ws.id,
          clientProfileId: cp.id,
          templateId: t.id,
          templateVersionId: v.id,
          assignedByMemberId: m.id,
        };
        // ACTIVE with ending provenance → CHECK violation.
        await expect(
          prisma.clientSetupPin.create({
            data: {
              ...base,
              seq: 1,
              endedByMemberId: m.id,
              endedAt: new Date(),
            },
          }),
        ).rejects.toThrow();
        // Terminal without ending provenance → CHECK violation.
        await expect(
          prisma.clientSetupPin.create({
            data: { ...base, seq: 1, status: "CANCELLED" },
          }),
        ).rejects.toThrow();
        // Duplicate seq within one setup → unique violation (even for a
        // terminal pin with valid provenance).
        const first = await prisma.clientSetupPin.create({
          data: {
            ...base,
            seq: 7,
            status: "CANCELLED",
            endedByMemberId: m.id,
            endedAt: new Date(),
          },
        });
        await expect(
          prisma.clientSetupPin.create({
            data: {
              ...base,
              seq: first.seq,
              status: "CANCELLED",
              endedByMemberId: m.id,
              endedAt: new Date(),
            },
          }),
        ).rejects.toThrow();
      });
    });

  },
);
