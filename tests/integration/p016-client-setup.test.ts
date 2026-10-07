import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import {
  cancelClientSetupAssignment,
  computeSelectionFingerprint,
  createClientSetupAssignment,
  listAssignableSetupClients,
  listAssignableTemplates,
  listClientSetupPinIds,
  listClientSetups,
  resolveAssignSelection,
  resolveCancelSelection,
} from "../../lib/coaching/client-setup";
import {
  assignTemplateFromAction,
  cancelSetupAssignmentFromAction,
  listAssignFormChoices,
  listClientSetupsForWorkspace,
} from "../../lib/coaching/client-setup-boundary";

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
    const s = (userId: string) => ({ user: { id: userId } });
    const auditCount = () => prisma.auditEvent.count();
    const pinCount = (workspaceId: string) =>
      prisma.clientSetupPin.count({ where: { workspaceId } });
    const setupCount = (workspaceId: string) =>
      prisma.clientSetup.count({ where: { workspaceId } });

    /** Eligible client: profile linked to an ACTIVE user with ACTIVE CLIENT
     * membership in the same workspace. */
    async function eligibleClient(workspaceId: string) {
      const u = await user();
      await member(workspaceId, u.id, "CLIENT");
      return clientProfile(workspaceId, u.id);
    }
    const assignCoach = (
      workspaceId: string,
      clientProfileId: string,
      coachMemberId: string,
    ) =>
      prisma.clientAssignment.create({
        data: {
          workspaceId,
          clientProfileId,
          coachMemberId,
          role: "COACH",
          status: "ACTIVE",
        },
      });
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
    const archiveTemplate = (templateId: string, archivedByMemberId: string) =>
      prisma.coachingTemplate.update({
        where: { id: templateId },
        data: {
          status: "ARCHIVED",
          archivedAt: new Date(),
          archivedByMemberId,
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

    describe("authorization", () => {
      it("owner sees all pins; coach sees only assigned clients'", async () => {
        const { ws, m } = await staffFixture("WORKSPACE_OWNER");
        const coachU = await user();
        const coachM = await member(ws.id, coachU.id, "COACH");
        const cpA = await eligibleClient(ws.id);
        const cpB = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        await assignCoach(ws.id, cpA.id, coachM.id);
        await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cpA.id, templateId: t.id },
          prisma,
        );
        await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cpB.id, templateId: t.id },
          prisma,
        );
        const ownerList = await listClientSetups(
          s(m.userId),
          { workspaceId: ws.id },
          prisma,
        );
        expect(ownerList.items).toHaveLength(2);
        const coachList = await listClientSetups(
          s(coachU.id),
          { workspaceId: ws.id },
          prisma,
        );
        expect(coachList.items).toHaveLength(1);
        expect(coachList.items[0].clientName).toContain("Client");
      });

      it("assistant reads assigned scope but cannot write", async () => {
        const { ws, m } = await staffFixture("WORKSPACE_OWNER");
        const asU = await user();
        const asM = await member(ws.id, asU.id, "ASSISTANT_COACH");
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        await assignCoach(ws.id, cp.id, asM.id);
        const list = await listClientSetups(
          s(asU.id),
          { workspaceId: ws.id },
          prisma,
        );
        expect(list.items).toHaveLength(0);
        await expect(
          createClientSetupAssignment(
            s(asU.id),
            { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
            prisma,
          ),
        ).rejects.toBeInstanceOf(AccessDeniedError);
      });

      it.each(["CLIENT", "SUPPORT"] as const)(
        "%s is denied reads and writes",
        async (role) => {
          const { ws, m } = await staffFixture("WORKSPACE_OWNER");
          const u = await user();
          await member(ws.id, u.id, role);
          const cp = await eligibleClient(ws.id);
          const t = await template(ws.id, m.id);
          await version(ws.id, t.id, 1, m.id);
          await expect(
            listClientSetups(s(u.id), { workspaceId: ws.id }, prisma),
          ).rejects.toBeInstanceOf(AccessDeniedError);
          await expect(
            createClientSetupAssignment(
              s(u.id),
              { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
              prisma,
            ),
          ).rejects.toBeInstanceOf(AccessDeniedError);
        },
      );

      it("platform admin (incl. dual-role), non-member, inactive member, cross-workspace all denied", async () => {
        const { ws, m } = await staffFixture("WORKSPACE_OWNER");
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const admin = await user("PLATFORM_ADMIN");
        // Dual-role: the platform admin also holds an ACTIVE owner membership —
        // the resource-level denial must still win (decision #54).
        const dual = await prisma.workspaceMember.create({
          data: {
            workspaceId: ws.id,
            userId: admin.id,
            role: "WORKSPACE_OWNER",
            status: "ACTIVE",
          },
        });
        expect(dual.id).toBeTruthy();
        const nonmember = await user();
        const otherWs = await workspace();
        const otherU = await user();
        await member(otherWs.id, otherU.id, "WORKSPACE_OWNER");
        for (const u of [admin, nonmember, otherU]) {
          await expect(
            listClientSetups(s(u.id), { workspaceId: ws.id }, prisma),
          ).rejects.toBeInstanceOf(AccessDeniedError);
          await expect(
            createClientSetupAssignment(
              s(u.id),
              { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
              prisma,
            ),
          ).rejects.toBeInstanceOf(AccessDeniedError);
        }
        const suspU = await user();
        await member(ws.id, suspU.id, "COACH", "SUSPENDED");
        await expect(
          listClientSetups(s(suspU.id), { workspaceId: ws.id }, prisma),
        ).rejects.toBeInstanceOf(AccessDeniedError);
      });

      it("coach revocation fails closed mid-flight: assign then revoke then cancel denied uniformly", async () => {
        const { ws, m } = await staffFixture("WORKSPACE_OWNER");
        const coachU = await user();
        const coachM = await member(ws.id, coachU.id, "COACH");
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const ca = await assignCoach(ws.id, cp.id, coachM.id);
        const created = await createClientSetupAssignment(
          s(coachU.id),
          { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
          prisma,
        );
        expect(created.assignmentId).toBeTruthy();
        await prisma.clientAssignment.update({
          where: { id: ca.id },
          data: { status: "REMOVED" },
        });
        // Denied mutation surfaces the uniform non-disclosing error — the
        // authorization failure is real but existence is never revealed.
        await expect(
          cancelClientSetupAssignment(
            s(coachU.id),
            { workspaceId: ws.id, pinId: created.assignmentId },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "assignment_not_accessible" });
        const list = await listClientSetups(
          s(coachU.id),
          { workspaceId: ws.id },
          prisma,
        );
        expect(list.items).toHaveLength(0);
      });

      it("a second ACTIVE assigned coach may cancel (D-11 — not PRIMARY-only)", async () => {
        const { ws, m } = await staffFixture("WORKSPACE_OWNER");
        const c1U = await user();
        const c2U = await user();
        const c1M = await member(ws.id, c1U.id, "COACH");
        const c2M = await member(ws.id, c2U.id, "COACH");
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        await assignCoach(ws.id, cp.id, c1M.id);
        // c2 assigned as PRIMARY — c1 as COACH. Either may manage (decision #52).
        await prisma.clientAssignment.create({
          data: {
            workspaceId: ws.id,
            clientProfileId: cp.id,
            coachMemberId: c2M.id,
            role: "PRIMARY",
            status: "ACTIVE",
          },
        });
        const created = await createClientSetupAssignment(
          s(c2U.id),
          { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
          prisma,
        );
        await cancelClientSetupAssignment(
          s(c1U.id),
          { workspaceId: ws.id, pinId: created.assignmentId },
          prisma,
        );
        const pin = await prisma.clientSetupPin.findUniqueOrThrow({
          where: { id: created.assignmentId },
        });
        expect(pin.status).toBe("CANCELLED");
      });
    });

    describe("eligibility", () => {
      it("lists only eligible clients per scope", async () => {
        const { ws, m } = await staffFixture("WORKSPACE_OWNER");
        const coachU = await user();
        const coachM = await member(ws.id, coachU.id, "COACH");
        const ok = await eligibleClient(ws.id);
        const ok2 = await eligibleClient(ws.id);
        await clientProfile(ws.id, null);
        const deadUser = await user("USER", "DEACTIVATED");
        await member(ws.id, deadUser.id, "CLIENT");
        await clientProfile(ws.id, deadUser.id);
        const suspUser = await user();
        await member(ws.id, suspUser.id, "CLIENT", "SUSPENDED");
        await clientProfile(ws.id, suspUser.id);
        await assignCoach(ws.id, ok.id, coachM.id);

        const all = await listAssignableSetupClients(
          s(m.userId),
          { workspaceId: ws.id },
          prisma,
        );
        expect(all.map((i) => i.id).sort()).toEqual([ok.id, ok2.id].sort());
        const coachList = await listAssignableSetupClients(
          s(coachU.id),
          { workspaceId: ws.id },
          prisma,
        );
        expect(coachList.map((i) => i.id)).toEqual([ok.id]);
      });

      it("lists only ACTIVE templates with a published version", async () => {
        const { ws, m } = await staffFixture();
        const pub = await template(ws.id, m.id);
        await version(ws.id, pub.id, 1, m.id);
        await version(ws.id, pub.id, 2, m.id);
        await template(ws.id, m.id); // no versions
        const archived = await template(ws.id, m.id, "ARCHIVED");
        await version(ws.id, archived.id, 1, m.id);
        const list = await listAssignableTemplates(
          s(m.userId),
          { workspaceId: ws.id },
          prisma,
        );
        expect(list).toHaveLength(1);
        expect(list[0].id).toBe(pub.id);
        expect(list[0].latestVersionSeq).toBe(2);
      });
    });

    describe("create / cancel lifecycle", () => {
      it("creates the stable setup + seq-1 ACTIVE pin on the latest published version + ASSIGN audit", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const v2 = await version(ws.id, t.id, 2, m.id);
        const auditsBefore = await auditCount();
        const res = await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
          prisma,
        );
        const pin = await prisma.clientSetupPin.findUniqueOrThrow({
          where: { id: res.assignmentId },
        });
        expect(pin.status).toBe("ACTIVE");
        expect(pin.seq).toBe(1);
        expect(pin.templateVersionId).toBe(v2.id);
        expect(pin.assignedByMemberId).toBe(m.id);
        expect(pin.endedAt).toBeNull();
        const setup = await prisma.clientSetup.findUniqueOrThrow({
          where: { id: pin.clientSetupId },
        });
        expect(setup.clientProfileId).toBe(cp.id);
        expect(await setupCount(ws.id)).toBe(1);
        expect(await auditCount()).toBe(auditsBefore + 1);
        const event = await prisma.auditEvent.findFirstOrThrow({
          where: {
            resourceType: "client_setup_pin",
            action: "ASSIGN",
            resourceId: pin.id,
          },
        });
        expect(event.subjectClientProfileId).toBe(cp.id);
        // Audit version marker = pinned template versionSeq, never pin seq.
        expect(event.meta).toMatchObject({ changed: true, version: "v2" });
      });

      it("rejects a second current assignment while one is ACTIVE — zero mutation, zero audit", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
          prisma,
        );
        const auditsBefore = await auditCount();
        const pinsBefore = await pinCount(ws.id);
        await expect(
          createClientSetupAssignment(
            s(m.userId),
            { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "assignment_conflict" });
        expect(await pinCount(ws.id)).toBe(pinsBefore);
        expect(await auditCount()).toBe(auditsBefore);
      });

      it("cancel transitions exactly once with provenance + audit; repeat is inert", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const res = await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
          prisma,
        );
        const auditsBefore = await auditCount();
        await cancelClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, pinId: res.assignmentId },
          prisma,
        );
        const pin = await prisma.clientSetupPin.findUniqueOrThrow({
          where: { id: res.assignmentId },
        });
        expect(pin.status).toBe("CANCELLED");
        expect(pin.endedByMemberId).toBe(m.id);
        expect(pin.endedAt).not.toBeNull();
        expect(await auditCount()).toBe(auditsBefore + 1);
        await expect(
          cancelClientSetupAssignment(
            s(m.userId),
            { workspaceId: ws.id, pinId: res.assignmentId },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "assignment_not_active" });
        expect(await auditCount()).toBe(auditsBefore + 1);
      });

      it("reassignment after cancellation reuses the stable setup and appends seq+1", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const res1 = await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
          prisma,
        );
        await cancelClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, pinId: res1.assignmentId },
          prisma,
        );
        const res2 = await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
          prisma,
        );
        const pin1 = await prisma.clientSetupPin.findUniqueOrThrow({
          where: { id: res1.assignmentId },
        });
        const pin2 = await prisma.clientSetupPin.findUniqueOrThrow({
          where: { id: res2.assignmentId },
        });
        // Stable aggregate identity — the same setup row holds both pins.
        expect(pin2.clientSetupId).toBe(pin1.clientSetupId);
        expect(pin2.seq).toBe(pin1.seq + 1);
        expect(await setupCount(ws.id)).toBe(1);
        const list = await listClientSetups(
          s(m.userId),
          { workspaceId: ws.id },
          prisma,
        );
        expect(list.items).toHaveLength(2);
      });

      it("cancel needs no eligibility: works on archived template and on a client whose profile became ineligible", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const res = await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
          prisma,
        );
        await archiveTemplate(t.id, m.id);
        // Existing pin stays ACTIVE and visible after archive (decision #53).
        const list = await listClientSetups(
          s(m.userId),
          { workspaceId: ws.id },
          prisma,
        );
        expect(list.items[0].status).toBe("ACTIVE");
        // Authorized cancel still works (decision #51).
        await cancelClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, pinId: res.assignmentId },
          prisma,
        );
      });

      it("archived template cannot be newly assigned (decision #53)", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        await archiveTemplate(t.id, m.id);
        const auditsBefore = await auditCount();
        await expect(
          createClientSetupAssignment(
            s(m.userId),
            { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "template_not_eligible" });
        expect(await auditCount()).toBe(auditsBefore);
        expect(await pinCount(ws.id)).toBe(0);
      });

      it("a later published version never moves an existing pin", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        const v1 = await version(ws.id, t.id, 1, m.id);
        const res = await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
          prisma,
        );
        await version(ws.id, t.id, 2, m.id);
        const pin = await prisma.clientSetupPin.findUniqueOrThrow({
          where: { id: res.assignmentId },
        });
        expect(pin.templateVersionId).toBe(v1.id);
        expect(pin.status).toBe("ACTIVE");
      });

      it("cancel on foreign, missing, or cross-workspace pins is non-disclosing and inert", async () => {
        const { ws, m } = await staffFixture();
        const other = await staffFixture();
        const otherCp = await eligibleClient(other.ws.id);
        const t = await template(other.ws.id, other.m.id);
        await version(other.ws.id, t.id, 1, other.m.id);
        const foreign = await createClientSetupAssignment(
          s(other.m.userId),
          {
            workspaceId: other.ws.id,
            clientProfileId: otherCp.id,
            templateId: t.id,
          },
          prisma,
        );
        const auditsBefore = await auditCount();
        await expect(
          cancelClientSetupAssignment(
            s(m.userId),
            { workspaceId: ws.id, pinId: foreign.assignmentId },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "assignment_not_accessible" });
        await expect(
          cancelClientSetupAssignment(
            s(m.userId),
            { workspaceId: ws.id, pinId: "nope" },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "assignment_not_accessible" });
        expect(await auditCount()).toBe(auditsBefore);
      });

      it("ineligible client and template-less template reject before any mutation", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id); // no published version
        await expect(
          createClientSetupAssignment(
            s(m.userId),
            { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "template_not_eligible" });
        const t2 = await template(ws.id, m.id);
        await version(ws.id, t2.id, 1, m.id);
        const orphan = await clientProfile(ws.id, null); // no linked user
        await expect(
          createClientSetupAssignment(
            s(m.userId),
            {
              workspaceId: ws.id,
              clientProfileId: orphan.id,
              templateId: t2.id,
            },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "client_not_eligible" });
        expect(await pinCount(ws.id)).toBe(0);
        expect(await setupCount(ws.id)).toBe(0);
      });

      it("concurrent creates for one client commit exactly one ACTIVE pin and one audit", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const auditsBefore = await auditCount();
        const results = await Promise.allSettled(
          Array.from({ length: 4 }, () =>
            createClientSetupAssignment(
              s(m.userId),
              { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
              prisma,
            ),
          ),
        );
        const activePins = await prisma.clientSetupPin.count({
          where: { workspaceId: ws.id, status: "ACTIVE" },
        });
        expect(activePins).toBe(1);
        expect(await setupCount(ws.id)).toBe(1);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(await auditCount()).toBe(auditsBefore + 1);
      });

      it("concurrent cancels produce exactly one transition with a single writer's provenance", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const res = await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
          prisma,
        );
        const auditsBefore = await auditCount();
        const results = await Promise.allSettled(
          Array.from({ length: 3 }, () =>
            cancelClientSetupAssignment(
              s(m.userId),
              { workspaceId: ws.id, pinId: res.assignmentId },
              prisma,
            ),
          ),
        );
        const fulfilled = results.filter((r) => r.status === "fulfilled");
        expect(fulfilled.length).toBe(1);
        const pin = await prisma.clientSetupPin.findUniqueOrThrow({
          where: { id: res.assignmentId },
        });
        expect(pin.status).toBe("CANCELLED");
        expect(pin.endedByMemberId).toBe(m.id);
        expect(await auditCount()).toBe(auditsBefore + 1);
      });

      it("assign vs archive race serializes deterministically with no torn state", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const auditsBefore = await auditCount();
        const [assign] = await Promise.allSettled([
          createClientSetupAssignment(
            s(m.userId),
            { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
            prisma,
          ),
          archiveTemplate(t.id, m.id),
        ]);
        const tpl = await prisma.coachingTemplate.findUniqueOrThrow({
          where: { id: t.id },
        });
        const pins = await prisma.clientSetupPin.findMany({
          where: { workspaceId: ws.id },
        });
        expect(tpl.status).toBe("ARCHIVED");
        // Exactly two legal outcomes: assignment committed then archive (pin
        // survives, per decision #53), or archive first → not_eligible. Never
        // a torn intermediate.
        if (assign.status === "fulfilled") {
          expect(pins).toHaveLength(1);
          expect(pins[0].status).toBe("ACTIVE");
        } else {
          expect(pins).toHaveLength(0);
        }
        expect(await auditCount()).toBeLessThanOrEqual(auditsBefore + 1);
      });

      it("no C1 path ever writes SUPERSEDED", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const v2 = await version(ws.id, t.id, 2, m.id);
        const res = await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
          prisma,
        );
        await cancelClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, pinId: res.assignmentId },
          prisma,
        );
        const res2 = await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
          prisma,
        );
        await cancelClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, pinId: res2.assignmentId },
          prisma,
        );
        const statuses = await prisma.clientSetupPin.findMany({
          select: { status: true },
        });
        expect(statuses.every((p) => p.status !== "SUPERSEDED")).toBe(true);
        // Reassignment pinned the newer latest version (v2) with seq 2.
        const pin2 = await prisma.clientSetupPin.findUniqueOrThrow({
          where: { id: res2.assignmentId },
        });
        expect(pin2.templateVersionId).toBe(v2.id);
        expect(pin2.seq).toBe(2);
      });

      it("owner cancellation still succeeds after the client's linked user is deactivated", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const res = await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
          prisma,
        );
        // Deactivate the client's linked user — new assignment would now be
        // ineligible, but cancellation requires no eligibility (decision #51).
        await prisma.user.update({
          where: { id: cp.userId as string },
          data: { status: "DEACTIVATED" },
        });
        await cancelClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, pinId: res.assignmentId },
          prisma,
        );
        const pin = await prisma.clientSetupPin.findUniqueOrThrow({
          where: { id: res.assignmentId },
        });
        expect(pin.status).toBe("CANCELLED");
      });

      it("a coach with no ClientAssignment is denied even for a client they could name", async () => {
        const { ws, m } = await staffFixture("WORKSPACE_OWNER");
        const otherCoachU = await user();
        await member(ws.id, otherCoachU.id, "COACH");
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        await expect(
          createClientSetupAssignment(
            s(otherCoachU.id),
            {
              workspaceId: ws.id,
              clientProfileId: cp.id,
              templateId: t.id,
            },
            prisma,
          ),
        ).rejects.toBeInstanceOf(AccessDeniedError);
        const list = await listClientSetups(
          s(otherCoachU.id),
          { workspaceId: ws.id },
          prisma,
        );
        expect(list.items).toHaveLength(0);
      });

      it("assistant scope collapses immediately after ClientAssignment removal", async () => {
        const { ws, m } = await staffFixture("WORKSPACE_OWNER");
        const asU = await user();
        const asM = await member(ws.id, asU.id, "ASSISTANT_COACH");
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const ca = await assignCoach(ws.id, cp.id, asM.id);
        await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
          prisma,
        );
        expect(
          (await listClientSetups(s(asU.id), { workspaceId: ws.id }, prisma))
            .items,
        ).toHaveLength(1);
        await prisma.clientAssignment.update({
          where: { id: ca.id },
          data: { status: "REMOVED" },
        });
        expect(
          (await listClientSetups(s(asU.id), { workspaceId: ws.id }, prisma))
            .items,
        ).toHaveLength(0);
      });

      it("forced audit failure rolls the entire mutation back — no setup, pin, or audit", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const failing = new Proxy(prisma, {
          get(target, property) {
            if (property !== "$transaction")
              return Reflect.get(target, property);
            return async (
              callback: (
                tx: import("@prisma/client").Prisma.TransactionClient,
              ) => Promise<unknown>,
              options: unknown,
            ) =>
              target.$transaction(
                async (tx) => {
                  const txClient = new Proxy(tx, {
                    get(transaction, key) {
                      if (key !== "auditEvent")
                        return Reflect.get(transaction, key);
                      return new Proxy(transaction.auditEvent, {
                        get(delegate, operation) {
                          if (operation !== "create")
                            return Reflect.get(delegate, operation);
                          return async () => {
                            throw new Error("forced audit failure");
                          };
                        },
                      });
                    },
                  });
                  return callback(txClient);
                },
                options as Parameters<typeof target.$transaction>[1],
              );
          },
        });
        const auditsBefore = await auditCount();
        await expect(
          createClientSetupAssignment(
            s(m.userId),
            { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
            failing as PrismaClient,
          ),
        ).rejects.toThrow("audit_write_failed");
        expect(await pinCount(ws.id)).toBe(0);
        expect(await setupCount(ws.id)).toBe(0);
        expect(await auditCount()).toBe(auditsBefore);
      });
    });

    describe("P-016-R2 positional selection + fingerprint resolution", () => {
      /** Renders the assign form the way the boundary would (server-side
       * lists + one fingerprint over both ordered id lists). */
      const renderAssignForm = async (
        session: { user: { id: string } },
        workspaceId: string,
      ) => {
        const [clients, templates] = await Promise.all([
          listAssignableSetupClients(session, { workspaceId }, prisma),
          listAssignableTemplates(session, { workspaceId }, prisma),
        ]);
        return {
          clients,
          templates,
          fingerprint: computeSelectionFingerprint(
            clients.map((c) => c.id),
            templates.map((t) => t.id),
          ),
        };
      };

      it("resolveAssignSelection maps a valid index+fingerprint to the right identities", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const form = await renderAssignForm(s(m.userId), ws.id);
        const resolved = await resolveAssignSelection(
          s(m.userId),
          {
            workspaceId: ws.id,
            clientIndex: form.clients.findIndex((c) => c.id === cp.id),
            templateIndex: form.templates.findIndex((x) => x.id === t.id),
            fingerprint: form.fingerprint,
          },
          prisma,
        );
        expect(resolved).toEqual({
          clientProfileId: cp.id,
          templateId: t.id,
        });
      });

      it("a client-list change between render and submit fails stale with zero writes", async () => {
        const { ws, m } = await staffFixture();
        await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const form = await renderAssignForm(s(m.userId), ws.id);
        // A new eligible client appears between render and submit.
        await eligibleClient(ws.id);
        const auditsBefore = await auditCount();
        await expect(
          resolveAssignSelection(
            s(m.userId),
            {
              workspaceId: ws.id,
              clientIndex: 0,
              templateIndex: 0,
              fingerprint: form.fingerprint,
            },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "stale_selection" });
        expect(await pinCount(ws.id)).toBe(0);
        expect(await auditCount()).toBe(auditsBefore);
      });

      it("a template archived between render and submit fails stale", async () => {
        const { ws, m } = await staffFixture();
        await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const form = await renderAssignForm(s(m.userId), ws.id);
        await archiveTemplate(t.id, m.id);
        await expect(
          resolveAssignSelection(
            s(m.userId),
            {
              workspaceId: ws.id,
              clientIndex: 0,
              templateIndex: 0,
              fingerprint: form.fingerprint,
            },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "stale_selection" });
      });

      it("a client becoming ineligible between render and submit fails stale", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const form = await renderAssignForm(s(m.userId), ws.id);
        await prisma.user.update({
          where: {
            id: (
              await prisma.clientProfile.findUniqueOrThrow({
                where: { id: cp.id },
                select: { userId: true },
              })
            ).userId!,
          },
          data: { status: "DEACTIVATED" },
        });
        await expect(
          resolveAssignSelection(
            s(m.userId),
            {
              workspaceId: ws.id,
              clientIndex: 0,
              templateIndex: 0,
              fingerprint: form.fingerprint,
            },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "stale_selection" });
      });

      it("a coach's revoked scope leaves a different list — stale fails closed", async () => {
        const { ws, m } = await staffFixture();
        const coachU = await user();
        const coachM = await member(ws.id, coachU.id, "COACH");
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const ca = await assignCoach(ws.id, cp.id, coachM.id);
        const form = await renderAssignForm(s(coachU.id), ws.id);
        await prisma.clientAssignment.update({
          where: { id: ca.id },
          data: { status: "REMOVED" },
        });
        await expect(
          resolveAssignSelection(
            s(coachU.id),
            {
              workspaceId: ws.id,
              clientIndex: 0,
              templateIndex: 0,
              fingerprint: form.fingerprint,
            },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "stale_selection" });
      });

      it("a tampered index against a valid fingerprint fails without mutation", async () => {
        const { ws, m } = await staffFixture();
        await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const form = await renderAssignForm(s(m.userId), ws.id);
        const auditsBefore = await auditCount();
        // Valid fingerprint, but the client index is out of range.
        await expect(
          resolveAssignSelection(
            s(m.userId),
            {
              workspaceId: ws.id,
              clientIndex: 99,
              templateIndex: 0,
              fingerprint: form.fingerprint,
            },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "invalid_input" });
        await expect(
          resolveAssignSelection(
            s(m.userId),
            {
              workspaceId: ws.id,
              clientIndex: -1,
              templateIndex: 0,
              fingerprint: form.fingerprint,
            },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "invalid_input" });
        expect(await pinCount(ws.id)).toBe(0);
        expect(await auditCount()).toBe(auditsBefore);
      });

      it("a fingerprint from another workspace cannot resolve here", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        // Second workspace whose owner is a different user entirely.
        const other = await staffFixture();
        const cpB = await eligibleClient(other.ws.id);
        const tB = await template(other.ws.id, other.m.id);
        await version(other.ws.id, tB.id, 1, other.m.id);
        const formB = await renderAssignForm(s(other.m.userId), other.ws.id);
        // Using B's fingerprint inside A's workspace: A's owner is not a
        // member of B (and vice versa), so the call either denies outright
        // or recomputes a different fingerprint — never resolves an id.
        await expect(
          resolveAssignSelection(
            s(other.m.userId),
            {
              workspaceId: ws.id,
              clientIndex: 0,
              templateIndex: 0,
              fingerprint: formB.fingerprint,
            },
            prisma,
          ),
        ).rejects.toBeInstanceOf(AccessDeniedError);
        await expect(
          resolveAssignSelection(
            s(m.userId),
            {
              workspaceId: ws.id,
              clientIndex: 0,
              templateIndex: 0,
              fingerprint: formB.fingerprint,
            },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "stale_selection" });
        void cp;
        void cpB;
      });

      it("listClientSetups rows carry absolute positional indices over the full ordered list", async () => {
        const { ws, m } = await staffFixture();
        const cpA = await eligibleClient(ws.id);
        const cpB = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cpA.id, templateId: t.id },
          prisma,
        );
        await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cpB.id, templateId: t.id },
          prisma,
        );
        const { ids, fingerprint } = await listClientSetupPinIds(
          s(m.userId),
          { workspaceId: ws.id },
          prisma,
        );
        expect(ids).toHaveLength(2);
        const list = await listClientSetups(
          s(m.userId),
          { workspaceId: ws.id },
          prisma,
        );
        expect(list.fingerprint).toBe(fingerprint);
        // Each displayed row's index is its absolute position in the
        // ordered authorized id list — never a raw id.
        const seen = list.items.map((r) => r.index).sort();
        expect(seen).toEqual([0, 1]);
        expect(
          list.items.every(
            (r) => !Object.keys(r).some((k) => /(^|_)id$/i.test(k)),
          ),
        ).toBe(true);
      });

      it("resolveCancelSelection resolves the indexed pin; a changed row list fails stale", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        const created = await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
          prisma,
        );
        const { ids, fingerprint } = await listClientSetupPinIds(
          s(m.userId),
          { workspaceId: ws.id },
          prisma,
        );
        const resolved = await resolveCancelSelection(
          s(m.userId),
          {
            workspaceId: ws.id,
            pinIndex: ids.indexOf(created.assignmentId),
            fingerprint,
          },
          prisma,
        );
        expect(resolved).toEqual({ pinId: created.assignmentId });

        // A second assignment elsewhere in the list rewrites the ordered
        // id list → the old fingerprint is stale.
        const cpB = await eligibleClient(ws.id);
        await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cpB.id, templateId: t.id },
          prisma,
        );
        const auditsBefore = await auditCount();
        await expect(
          resolveCancelSelection(
            s(m.userId),
            { workspaceId: ws.id, pinIndex: 0, fingerprint },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "stale_selection" });
        expect(await auditCount()).toBe(auditsBefore);
      });

      it("a tampered cancel index cannot reach another client's pin", async () => {
        const { ws, m } = await staffFixture();
        const coachU = await user();
        const coachM = await member(ws.id, coachU.id, "COACH");
        const cpA = await eligibleClient(ws.id); // coach's client
        const cpB = await eligibleClient(ws.id); // owner's other client
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        await assignCoach(ws.id, cpA.id, coachM.id);
        const mine = await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cpA.id, templateId: t.id },
          prisma,
        );
        const other = await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cpB.id, templateId: t.id },
          prisma,
        );
        // The coach's authorized ordered list contains only cpA's pin —
        // index 1 (the other client's position in the owner's full list)
        // resolves nothing.
        const coachIds = await listClientSetupPinIds(
          s(coachU.id),
          { workspaceId: ws.id },
          prisma,
        );
        expect(coachIds.ids).toEqual([mine.assignmentId]);
        const auditsBefore = await auditCount();
        await expect(
          resolveCancelSelection(
            s(coachU.id),
            {
              workspaceId: ws.id,
              pinIndex: 1,
              fingerprint: coachIds.fingerprint,
            },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "invalid_input" });
        expect(
          await prisma.clientSetupPin.findUniqueOrThrow({
            where: { id: other.assignmentId },
            select: { status: true },
          }),
        ).toMatchObject({ status: "ACTIVE" });
        expect(await auditCount()).toBe(auditsBefore);
      });

      it("a concurrent cancel leaves a safe no-change result, not a wrong-target write", async () => {
        const { ws, m } = await staffFixture();
        const cp = await eligibleClient(ws.id);
        const t = await template(ws.id, m.id);
        await version(ws.id, t.id, 1, m.id);
        await createClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, clientProfileId: cp.id, templateId: t.id },
          prisma,
        );
        const { ids, fingerprint } = await listClientSetupPinIds(
          s(m.userId),
          { workspaceId: ws.id },
          prisma,
        );
        const { pinId } = await resolveCancelSelection(
          s(m.userId),
          { workspaceId: ws.id, pinIndex: 0, fingerprint },
          prisma,
        );
        // The status set is unchanged (ids identical) so the fingerprint
        // still matches — the resolved pin is the SAME row, and the second
        // cancel surfaces assignment_not_active rather than a blind write.
        expect(ids).toHaveLength(1);
        await cancelClientSetupAssignment(
          s(m.userId),
          { workspaceId: ws.id, pinId },
          prisma,
        );
        const resolved2 = await resolveCancelSelection(
          s(m.userId),
          { workspaceId: ws.id, pinIndex: 0, fingerprint },
          prisma,
        );
        expect(resolved2.pinId).toBe(pinId);
        const auditsBefore = await auditCount();
        await expect(
          cancelClientSetupAssignment(
            s(m.userId),
            { workspaceId: ws.id, pinId: resolved2.pinId },
            prisma,
          ),
        ).rejects.toMatchObject({ code: "assignment_not_active" });
        expect(await auditCount()).toBe(auditsBefore);
      });

      it("the full boundary contract: index+fingerprint assign/cancel preserves behavior", async () => {
        process.env.ENABLE_CLIENT_SETUP = "1";
        try {
          const { ws, m } = await staffFixture();
          const cp = await eligibleClient(ws.id);
          const t = await template(ws.id, m.id);
          await version(ws.id, t.id, 1, m.id);
          const choices = await listAssignFormChoices(
            s(m.userId),
            { workspaceId: ws.id },
            { db: prisma },
          );
          expect(choices.ok).toBe(true);
          if (!choices.ok) return;
          expect(choices.value.clients).toEqual([{ name: cp.name }]);
          const created = await assignTemplateFromAction(
            s(m.userId),
            {
              workspaceId: ws.id,
              clientIndex: 0,
              templateIndex: 0,
              listFingerprint: choices.value.listFingerprint,
            },
            { db: prisma },
          );
          expect(created.ok).toBe(true);
          expect(await pinCount(ws.id)).toBe(1);

          const rows = await listClientSetupsForWorkspace(
            s(m.userId),
            { workspaceId: ws.id },
            { db: prisma },
          );
          expect(rows.ok).toBe(true);
          if (!rows.ok) return;
          expect(rows.value.items[0].index).toBe(0);
          const cancelled = await cancelSetupAssignmentFromAction(
            s(m.userId),
            {
              workspaceId: ws.id,
              pinIndex: 0,
              rowFingerprint: rows.value.fingerprint,
            },
            { db: prisma },
          );
          expect(cancelled).toEqual({ ok: true, value: { cancelled: true } });
          expect(
            await prisma.clientSetupPin.count({
              where: {
                clientSetup: { workspaceId: ws.id },
                status: "CANCELLED",
              },
            }),
          ).toBe(1);
        } finally {
          delete process.env.ENABLE_CLIENT_SETUP;
        }
      });

      it("the boundary surfaces a safe message for a stale form", async () => {
        process.env.ENABLE_CLIENT_SETUP = "1";
        try {
          const { ws, m } = await staffFixture();
          await eligibleClient(ws.id);
          const t = await template(ws.id, m.id);
          await version(ws.id, t.id, 1, m.id);
          const choices = await listAssignFormChoices(
            s(m.userId),
            { workspaceId: ws.id },
            { db: prisma },
          );
          expect(choices.ok).toBe(true);
          if (!choices.ok) return;
          await archiveTemplate(t.id, m.id);
          const auditsBefore = await auditCount();
          const result = await assignTemplateFromAction(
            s(m.userId),
            {
              workspaceId: ws.id,
              clientIndex: 0,
              templateIndex: 0,
              listFingerprint: choices.value.listFingerprint,
            },
            { db: prisma },
          );
          expect(result).toEqual({
            ok: false,
            message:
              "The list changed while you were working — refresh and try again.",
          });
          expect(await pinCount(ws.id)).toBe(0);
          expect(await auditCount()).toBe(auditsBefore);
        } finally {
          delete process.env.ENABLE_CLIENT_SETUP;
        }
      });
    });
  },
);
