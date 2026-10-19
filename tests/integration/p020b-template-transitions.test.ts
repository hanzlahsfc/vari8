import { execFileSync } from "node:child_process";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listClientSetupPinIds } from "../../lib/coaching/client-setup";
import {
  executeClientSetupTransition,
  getTransitionTargets,
  reviewClientSetupTransition,
} from "../../lib/coaching/client-setup-transition";
import { serializeTransitionReview } from "../../lib/coaching/client-setup-transition-boundary";
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
import type { ProviderSet } from "../../lib/coaching/transition-impact";

/**
 * P-020B — C2 template-version transitions contract tests on a dedicated
 * disposable PostgreSQL database (INTEGRATION_DATABASE_URL; never the app
 * database). Synthetic fixtures only.
 *
 * Service calls bypass the env gate deliberately (the gate lives at the
 * action/boundary layers — flag-off zero-write proofs use the real boundary
 * functions with the env toggled).
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

type Role =
  "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT";

describe.skipIf(!enabled)("P-020B template transitions (real PG)", () => {
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
  const uid = () => `p020b_${++n}_${Date.now()}`;
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
  const auditsFor = (resourceId: string) =>
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

  async function mkParam(wsId: string, session: { user: { id: string } }) {
    const p = await createParameter(session, {
      workspaceId: wsId,
      input: { kind: "MEASUREMENT", label: `P${++n}`, unit: "kg" },
    });
    const row = await prisma.parameterDefinition.findUniqueOrThrow({
      where: { id: p.parameterId },
      select: { key: true, revision: true },
    });
    return { id: p.parameterId, key: row.key, revision: row.revision };
  }

  async function classify(
    session: { user: { id: string } },
    wsId: string,
    parameterId: string,
  ) {
    const { ids, fingerprint } = await listClassifiableParameterIds(session, {
      workspaceId: wsId,
    });
    const row = await prisma.parameterDefinition.findUniqueOrThrow({
      where: { id: parameterId },
      select: { revision: true },
    });
    await classifyParameter(session, {
      workspaceId: wsId,
      parameterIndex: ids.indexOf(parameterId),
      expectedRevision: row.revision,
      fingerprint,
      classification: "GENERAL_HEALTH",
    });
  }

  type DraftItemInput = {
    itemId?: string;
    parameterKey: string;
    parameterId?: string;
    required?: boolean;
    order: number;
  };

  /** Publish version 1 of a fresh template from caller-shape items. */
  async function templateWithV1(
    wsId: string,
    session: { user: { id: string } },
    items: DraftItemInput[],
  ) {
    const { templateId } = await createTemplate(session, {
      workspaceId: wsId,
      name: `T-${uid()}`,
    });
    await saveTemplateDraft(session, {
      workspaceId: wsId,
      templateId,
      expectedRevision: 1,
      draft: {
        title: "T",
        sections: [
          {
            label: "S",
            order: 0,
            items: items.map((i) => ({ required: false, ...i })),
          },
        ],
      },
    });
    const { versionSeq } = await publishTemplate(session, {
      workspaceId: wsId,
      templateId,
      expectedRevision: 2,
    });
    return { templateId, versionSeq };
  }

  /** Publish the next version: seeds a draft from the frozen latest version
   * (stable itemIds survive) then saves + publishes the caller's edit. */
  async function publishNextVersion(
    wsId: string,
    session: { user: { id: string } },
    templateId: string,
    mutate: (
      sections: Array<{
        sectionId: string;
        label: string;
        order: number;
        items: Array<{
          itemId: string;
          parameterKey: string;
          parameterId: string;
          required: boolean;
          order: number;
        }>;
      }>,
    ) => Array<{
      label: string;
      order: number;
      sectionId?: string;
      items: DraftItemInput[];
    }>,
  ) {
    const open = await openTemplateDraft(session, {
      workspaceId: wsId,
      templateId,
    });
    const sections = mutate(open.definition.sections).map((sec) => ({
      ...sec,
      items: sec.items.map((i) => {
        // Server-stamped draft fields are not caller-presentable input.
        const caller = { ...(i as DraftItemInput) } as Record<string, unknown>;
        delete caller.acknowledgedParameterRevision;
        return { required: false, ...caller } as DraftItemInput;
      }),
    }));
    const saved = await saveTemplateDraft(session, {
      workspaceId: wsId,
      templateId,
      expectedRevision: open.revision,
      draft: { title: "T", sections },
    });
    const { versionSeq } = await publishTemplate(session, {
      workspaceId: wsId,
      templateId,
      expectedRevision: saved.revision,
    });
    return { versionSeq };
  }

  const eligibleClient = async (workspaceId: string) => {
    const u = await user();
    await member(workspaceId, u.id, "CLIENT");
    return clientProfile(workspaceId, u.id);
  };
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

  /** Creates a setup + ACTIVE pin directly (C1 semantics — no lineage). */
  async function pinOn(
    wsId: string,
    clientProfileId: string,
    templateId: string,
    versionSeq: number,
    memberId: string,
  ) {
    const setup = await prisma.clientSetup.create({
      data: { workspaceId: wsId, clientProfileId },
    });
    const v = await prisma.coachingTemplateVersion.findFirstOrThrow({
      where: { templateId, versionSeq },
    });
    const pin = await prisma.clientSetupPin.create({
      data: {
        clientSetupId: setup.id,
        workspaceId: wsId,
        clientProfileId,
        seq: 1,
        templateId,
        templateVersionId: v.id,
        assignedByMemberId: memberId,
        status: "ACTIVE",
      },
    });
    return { setup, pin, version: v };
  }

  async function reviewArgs(session: { user: { id: string } }, wsId: string) {
    const { ids, fingerprint } = await listClientSetupPinIds(session, {
      workspaceId: wsId,
    });
    return { ids, rowFingerprint: fingerprint };
  }

  const validSummary = (direction: "UPGRADE" | "ROLLBACK") => ({
    schemaVersion: 1,
    direction,
    categories: {
      added: 0,
      removed: 0,
      rebound: 0,
      moved: 0,
      required: 0,
      display: 0,
    },
    reasonCodes: [],
  });

  // ── Schema / migration invariants ──────────────────────────────────────

  describe("migration + lineage invariants", () => {
    it("pre-migration C1 pins (all-NULL lineage) remain valid", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const p = await mkParam(ws.id, s(m.userId));
      const { templateId } = await templateWithV1(ws.id, s(m.userId), [
        { parameterKey: p.key, order: 0 },
      ]);
      const { pin } = await pinOn(ws.id, cp.id, templateId, 1, m.id);
      const row = await prisma.clientSetupPin.findUniqueOrThrow({
        where: { id: pin.id },
      });
      expect(row.supersedesPinId).toBeNull();
      expect(row.transitionKind).toBeNull();
      expect(row.transitionSummary).toBeNull();
      expect(row.status).toBe("ACTIVE");
    });

    it("enforces the coupled lineage CHECK (partial NULL rejected)", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const p = await mkParam(ws.id, s(m.userId));
      const { templateId } = await templateWithV1(ws.id, s(m.userId), [
        { parameterKey: p.key, order: 0 },
      ]);
      const { setup, pin } = await pinOn(ws.id, cp.id, templateId, 1, m.id);
      const v = await prisma.coachingTemplateVersion.findFirstOrThrow({
        where: { templateId, versionSeq: 1 },
      });
      const base = {
        clientSetupId: setup.id,
        workspaceId: ws.id,
        clientProfileId: cp.id,
        seq: 2,
        templateId,
        templateVersionId: v.id,
        assignedByMemberId: m.id,
        status: "ACTIVE" as const,
      };
      // lineage kind without supersedes/summary → rejected
      await expect(
        prisma.clientSetupPin.create({
          data: { ...base, transitionKind: "UPGRADE" },
        }),
      ).rejects.toThrow();
      // summary without the rest → rejected
      await expect(
        prisma.clientSetupPin.create({
          data: {
            ...base,
            transitionKind: "UPGRADE",
            transitionSummary: validSummary("UPGRADE"),
          },
        }),
      ).rejects.toThrow();
      // supersedes without kind/summary → rejected
      await expect(
        prisma.clientSetupPin.create({
          data: { ...base, supersedesPinId: pin.id },
        }),
      ).rejects.toThrow();
    });

    it("enforces supersedes uniqueness, self-reference, and same-setup composite FK", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const cp2 = await eligibleClient(ws.id);
      const p = await mkParam(ws.id, s(m.userId));
      const { templateId } = await templateWithV1(ws.id, s(m.userId), [
        { parameterKey: p.key, order: 0 },
      ]);
      const { setup, pin } = await pinOn(ws.id, cp.id, templateId, 1, m.id);
      const setup2 = await prisma.clientSetup.create({
        data: { workspaceId: ws.id, clientProfileId: cp2.id },
      });
      const pin2 = await prisma.clientSetupPin.create({
        data: {
          clientSetupId: setup2.id,
          workspaceId: ws.id,
          clientProfileId: cp2.id,
          seq: 1,
          templateId,
          templateVersionId: pin.templateVersionId,
          assignedByMemberId: m.id,
        },
      });
      const v = await prisma.coachingTemplateVersion.findFirstOrThrow({
        where: { id: pin.templateVersionId },
      });
      const base = {
        clientSetupId: setup.id,
        workspaceId: ws.id,
        clientProfileId: cp.id,
        templateId,
        templateVersionId: v.id,
        assignedByMemberId: m.id,
        transitionKind: "UPGRADE" as const,
        transitionSummary: validSummary("UPGRADE"),
      };
      // Self-reference → no_self_supersede CHECK
      await expect(
        prisma.clientSetupPin.create({
          data: {
            ...base,
            seq: 2,
            id: "selfref",
            supersedesPinId: "selfref",
          },
        }),
      ).rejects.toThrow();
      // supersedes a pin from a DIFFERENT setup → composite FK rejects
      await expect(
        prisma.clientSetupPin.create({
          data: { ...base, seq: 2, supersedesPinId: pin2.id },
        }),
      ).rejects.toThrow();
      // Supersede the old pin first (one-ACTIVE-per-setup invariant), then
      // a single successor is allowed.
      await prisma.clientSetupPin.update({
        where: { id: pin.id },
        data: {
          status: "SUPERSEDED",
          endedByMemberId: m.id,
          endedAt: new Date(),
        },
      });
      const succ = await prisma.clientSetupPin.create({
        data: { ...base, seq: 2, supersedesPinId: pin.id, status: "ACTIVE" },
      });
      // Second successor to the same pin → unique rejects (anti-branching)
      await expect(
        prisma.clientSetupPin.create({
          data: {
            ...base,
            seq: 3,
            supersedesPinId: pin.id,
            status: "CANCELLED",
            endedByMemberId: m.id,
            endedAt: new Date(),
          },
        }),
      ).rejects.toThrow();
      await prisma.clientSetupPin.delete({ where: { id: succ.id } });
      await prisma.clientSetupPin.delete({ where: { id: pin2.id } });
      await prisma.clientSetupPin.delete({ where: { id: pin.id } });
      await prisma.clientSetup.deleteMany({
        where: { id: { in: [setup.id, setup2.id] } },
      });
    });

    it("rejects direction mismatch between enum and summary at DB level", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const p = await mkParam(ws.id, s(m.userId));
      const { templateId } = await templateWithV1(ws.id, s(m.userId), [
        { parameterKey: p.key, order: 0 },
      ]);
      const { setup, pin } = await pinOn(ws.id, cp.id, templateId, 1, m.id);
      await expect(
        prisma.clientSetupPin.create({
          data: {
            clientSetupId: setup.id,
            workspaceId: ws.id,
            clientProfileId: cp.id,
            seq: 2,
            templateId,
            templateVersionId: pin.templateVersionId,
            assignedByMemberId: m.id,
            status: "CANCELLED",
            endedByMemberId: m.id,
            endedAt: new Date(),
            supersedesPinId: pin.id,
            transitionKind: "UPGRADE",
            // JSON direction disagrees with the enum → CHECK rejects.
            transitionSummary: validSummary("ROLLBACK"),
          },
        }),
      ).rejects.toThrow();
    });

    it("rejects malformed summaries at DB level", async () => {
      const { ws, m } = await staffFixture();
      const cp = await eligibleClient(ws.id);
      const p = await mkParam(ws.id, s(m.userId));
      const { templateId } = await templateWithV1(ws.id, s(m.userId), [
        { parameterKey: p.key, order: 0 },
      ]);
      const { setup, pin } = await pinOn(ws.id, cp.id, templateId, 1, m.id);
      const base = {
        clientSetupId: setup.id,
        workspaceId: ws.id,
        clientProfileId: cp.id,
        templateId,
        templateVersionId: pin.templateVersionId,
        assignedByMemberId: m.id,
        status: "CANCELLED" as const,
        endedByMemberId: m.id,
        endedAt: new Date(),
        supersedesPinId: pin.id,
        transitionKind: "UPGRADE" as const,
      };
      let seq = 10;
      for (const bad of [
        "not an object",
        { ...validSummary("UPGRADE"), schemaVersion: 2 },
        { ...validSummary("UPGRADE"), schemaVersion: "1" },
        {
          ...validSummary("UPGRADE"),
          categories: {
            added: -1,
            removed: 0,
            rebound: 0,
            moved: 0,
            required: 0,
            display: 0,
          },
        },
        {
          ...validSummary("UPGRADE"),
          categories: { added: 0 },
        },
        { ...validSummary("UPGRADE"), reasonCodes: "REMOVED" },
        { schemaVersion: 1, direction: "UPGRADE" },
      ]) {
        await expect(
          prisma.clientSetupPin.create({
            data: {
              ...base,
              seq: seq++,
              transitionSummary: bad as Prisma.InputJsonValue,
            },
          }),
        ).rejects.toThrow();
        await prisma.clientSetupPin.deleteMany({
          where: { clientSetupId: setup.id, seq: seq - 1 },
        });
      }
    });
  });

  // ── Review + execution ─────────────────────────────────────────────────

  describe("review + execute", () => {
    async function upgradedFixture(options: { classify?: boolean } = {}) {
      const { ws, u, m } = await staffFixture();
      const sess = s(u.id);
      const p1 = await mkParam(ws.id, sess);
      const p2 = await mkParam(ws.id, sess);
      if (options.classify !== false) {
        await classify(sess, ws.id, p1.id);
        await classify(sess, ws.id, p2.id);
      }
      const { templateId } = await templateWithV1(ws.id, sess, [
        { parameterKey: p1.key, order: 0 },
      ]);
      await publishNextVersion(ws.id, sess, templateId, (sections) => [
        {
          label: "S",
          order: 0,
          sectionId: sections[0].sectionId,
          items: [...sections[0].items, { parameterKey: p2.key, order: 1 }],
        },
      ]);
      const cp = await eligibleClient(ws.id);
      const { setup, pin } = await pinOn(ws.id, cp.id, templateId, 1, m.id);
      return { ws, u, m, sess, p1, p2, templateId, cp, setup, pin };
    }

    it("owner reviews and executes an upgrade to the server-selected latest version", async () => {
      const f = await upgradedFixture();
      const { ids, rowFingerprint } = await reviewArgs(f.sess, f.ws.id);
      const pinIndex = ids.indexOf(f.pin.id);

      const targets = await getTransitionTargets(f.sess, {
        workspaceId: f.ws.id,
        pinIndex,
        rowFingerprint,
      });
      expect(targets.canUpgrade).toBe(true);
      expect(targets.latestVersionSeq).toBe(2);
      expect(targets.currentVersionSeq).toBe(1);

      const review = await reviewClientSetupTransition(f.sess, {
        workspaceId: f.ws.id,
        pinIndex,
        rowFingerprint,
        direction: "UPGRADE",
      });
      expect(review.direction).toBe("UPGRADE");
      expect(review.currentVersionSeq).toBe(1);
      expect(review.targetVersionSeq).toBe(2);
      expect(review.eligible).toBe(true);
      expect(review.blockedReasonCodes).toEqual([]);
      expect(review.diff.categories.added).toBe(1);
      expect(review.providersDeclared).toBe(1);
      expect(review.reviewFingerprint).toMatch(/^[0-9a-f]{64}$/);

      const applied = await executeClientSetupTransition(f.sess, {
        workspaceId: f.ws.id,
        pinIndex,
        rowFingerprint,
        direction: "UPGRADE",
        reviewFingerprint: review.reviewFingerprint,
      });
      expect(applied.direction).toBe("UPGRADE");

      const oldPin = await prisma.clientSetupPin.findUniqueOrThrow({
        where: { id: f.pin.id },
      });
      expect(oldPin.status).toBe("SUPERSEDED");
      expect(oldPin.endedAt).not.toBeNull();
      const pins = await prisma.clientSetupPin.findMany({
        where: { clientSetupId: f.setup.id },
        orderBy: { seq: "asc" },
      });
      expect(pins).toHaveLength(2);
      const next = pins[1];
      expect(next.status).toBe("ACTIVE");
      expect(next.seq).toBe(2);
      expect(next.supersedesPinId).toBe(f.pin.id);
      expect(next.transitionKind).toBe("UPGRADE");
      const summary = next.transitionSummary as Record<string, unknown>;
      expect(summary.schemaVersion).toBe(1);
      expect(summary.direction).toBe("UPGRADE");
      expect((summary.categories as Record<string, number>).added).toBe(1);

      const oldAudits = await auditsFor(f.pin.id);
      const newAudits = await auditsFor(next.id);
      expect(oldAudits.map((a) => a.action)).toEqual(["UPDATE"]);
      expect(newAudits.map((a) => a.action)).toEqual(["CREATE"]);
      expect(newAudits[0].meta).toEqual({
        changed: true,
        version: "v2",
        count: 0,
      });
    });

    it("assigned coach reviews and executes an upgrade; assignment untouched", async () => {
      const f = await upgradedFixture();
      const coach = await staffFixture("COACH", f.ws);
      const assignment = await assignCoach(f.ws.id, f.cp.id, coach.m.id);
      const sess = s(coach.u.id);

      // Complete-row preservation fixture: capture every persisted column
      // (identity, status, coach/client/workspace linkage, timestamps) plus
      // the total row set before the transition.
      const before = await prisma.clientAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
      });
      const countBefore = await prisma.clientAssignment.count();

      const { ids, rowFingerprint } = await reviewArgs(sess, f.ws.id);
      const pinIndex = ids.indexOf(f.pin.id);
      const review = await reviewClientSetupTransition(sess, {
        workspaceId: f.ws.id,
        pinIndex,
        rowFingerprint,
        direction: "UPGRADE",
      });
      await executeClientSetupTransition(sess, {
        workspaceId: f.ws.id,
        pinIndex,
        rowFingerprint,
        direction: "UPGRADE",
        reviewFingerprint: review.reviewFingerprint,
      });
      const next = await prisma.clientSetupPin.findFirstOrThrow({
        where: { clientSetupId: f.setup.id, status: "ACTIVE" },
      });
      expect(next.transitionKind).toBe("UPGRADE");
      // No ClientAssignment insert/update/delete/timestamp change occurred.
      const after = await prisma.clientAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
      });
      expect(after).toEqual(before);
      expect(await prisma.clientAssignment.count()).toBe(countBefore);
    });

    it("rollback reaches an earlier retained version positionally", async () => {
      const f = await upgradedFixture();
      const { ids, rowFingerprint } = await reviewArgs(f.sess, f.ws.id);
      const pinIndex = ids.indexOf(f.pin.id);

      const targets = await getTransitionTargets(f.sess, {
        workspaceId: f.ws.id,
        pinIndex,
        rowFingerprint,
      });
      expect(targets.canUpgrade).toBe(true);
      expect(targets.rollbackTargets).toEqual([]);

      const review = await reviewClientSetupTransition(f.sess, {
        workspaceId: f.ws.id,
        pinIndex,
        rowFingerprint,
        direction: "UPGRADE",
      });
      await executeClientSetupTransition(f.sess, {
        workspaceId: f.ws.id,
        pinIndex,
        rowFingerprint,
        direction: "UPGRADE",
        reviewFingerprint: review.reviewFingerprint,
      });

      // Now on v2 — earlier retained version v1 is offered positionally.
      const active = await prisma.clientSetupPin.findFirstOrThrow({
        where: { clientSetupId: f.setup.id, status: "ACTIVE" },
      });
      const after = await reviewArgs(f.sess, f.ws.id);
      const idx = after.ids.indexOf(active.id);
      const targets2 = await getTransitionTargets(f.sess, {
        workspaceId: f.ws.id,
        pinIndex: idx,
        rowFingerprint: after.rowFingerprint,
      });
      expect(targets2.canUpgrade).toBe(false);
      expect(targets2.rollbackTargets.map((t) => t.versionSeq)).toEqual([1]);

      const review2 = await reviewClientSetupTransition(f.sess, {
        workspaceId: f.ws.id,
        pinIndex: idx,
        rowFingerprint: after.rowFingerprint,
        direction: "ROLLBACK",
        targetIndex: 0,
      });
      expect(review2.direction).toBe("ROLLBACK");
      expect(review2.targetVersionSeq).toBe(1);
      // v2→v1 removes the added parameter — warn entry + summary code.
      expect(review2.diff.categories.removed).toBe(1);
      expect(review2.summary.reasonCodes).toContain("REMOVED");

      await executeClientSetupTransition(f.sess, {
        workspaceId: f.ws.id,
        pinIndex: idx,
        rowFingerprint: after.rowFingerprint,
        direction: "ROLLBACK",
        targetIndex: 0,
        reviewFingerprint: review2.reviewFingerprint,
      });
      const final = await prisma.clientSetupPin.findFirstOrThrow({
        where: { clientSetupId: f.setup.id, status: "ACTIVE" },
      });
      expect(final.transitionKind).toBe("ROLLBACK");
      expect(final.supersedesPinId).toBe(active.id);
      const v = await prisma.coachingTemplateVersion.findUniqueOrThrow({
        where: { id: final.templateVersionId },
      });
      expect(v.versionSeq).toBe(1);
      // Append-only history: 3 pins total for this setup.
      expect(
        await prisma.clientSetupPin.count({
          where: { clientSetupId: f.setup.id },
        }),
      ).toBe(3);
    });

    it("rejects upgrades when none exists, rollback of same/absent index, and archived templates", async () => {
      const { ws, u, m } = await staffFixture();
      const sess = s(u.id);
      const p = await mkParam(ws.id, sess);
      await classify(sess, ws.id, p.id);
      const { templateId } = await templateWithV1(ws.id, sess, [
        { parameterKey: p.key, order: 0 },
      ]);
      const cp = await eligibleClient(ws.id);
      const { pin } = await pinOn(ws.id, cp.id, templateId, 1, m.id);
      const { ids, rowFingerprint } = await reviewArgs(sess, ws.id);
      const pinIndex = ids.indexOf(pin.id);

      // No later version → no_upgrade_available.
      await expect(
        reviewClientSetupTransition(sess, {
          workspaceId: ws.id,
          pinIndex,
          rowFingerprint,
          direction: "UPGRADE",
        }),
      ).rejects.toMatchObject({ code: "no_upgrade_available" });
      // No earlier version → positional index out of range.
      await expect(
        reviewClientSetupTransition(sess, {
          workspaceId: ws.id,
          pinIndex,
          rowFingerprint,
          direction: "ROLLBACK",
          targetIndex: 0,
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });

      // Archived template → frozen, no transitions.
      await prisma.coachingTemplate.update({
        where: { id: templateId },
        data: {
          status: "ARCHIVED",
          archivedAt: new Date(),
          archivedByMemberId: m.id,
        },
      });
      await expect(
        reviewClientSetupTransition(sess, {
          workspaceId: ws.id,
          pinIndex,
          rowFingerprint,
          direction: "ROLLBACK",
          targetIndex: 0,
        }),
      ).rejects.toMatchObject({ code: "transition_not_available" });
      await expect(
        getTransitionTargets(sess, {
          workspaceId: ws.id,
          pinIndex,
          rowFingerprint,
        }),
      ).rejects.toMatchObject({ code: "transition_not_available" });
    });

    it("a version published after review makes the review stale (zero writes)", async () => {
      const f = await upgradedFixture();
      const { ids, rowFingerprint } = await reviewArgs(f.sess, f.ws.id);
      const pinIndex = ids.indexOf(f.pin.id);
      const review = await reviewClientSetupTransition(f.sess, {
        workspaceId: f.ws.id,
        pinIndex,
        rowFingerprint,
        direction: "UPGRADE",
      });
      // Publish v3 between review and execution.
      await publishNextVersion(f.ws.id, f.sess, f.templateId, (sections) => [
        {
          label: "S",
          order: 0,
          sectionId: sections[0].sectionId,
          items: sections[0].items,
        },
      ]);
      const auditsBefore = await prisma.auditEvent.count();
      await expect(
        executeClientSetupTransition(f.sess, {
          workspaceId: f.ws.id,
          pinIndex,
          rowFingerprint,
          direction: "UPGRADE",
          reviewFingerprint: review.reviewFingerprint,
        }),
      ).rejects.toMatchObject({ code: "stale_selection" });
      const pin = await prisma.clientSetupPin.findUniqueOrThrow({
        where: { id: f.pin.id },
      });
      expect(pin.status).toBe("ACTIVE");
      expect(await prisma.auditEvent.count()).toBe(auditsBefore);
    });

    it("a tampered or mismatched fingerprint is stale", async () => {
      const f = await upgradedFixture();
      const { ids, rowFingerprint } = await reviewArgs(f.sess, f.ws.id);
      const pinIndex = ids.indexOf(f.pin.id);
      await expect(
        executeClientSetupTransition(f.sess, {
          workspaceId: f.ws.id,
          pinIndex,
          rowFingerprint,
          direction: "UPGRADE",
          reviewFingerprint: "0".repeat(64),
        }),
      ).rejects.toMatchObject({ code: "stale_selection" });
      // A different actor's review is stale for the executor.
      const other = await staffFixture("WORKSPACE_OWNER", f.ws);
      const reviewByOther = await reviewClientSetupTransition(s(other.u.id), {
        workspaceId: f.ws.id,
        pinIndex,
        rowFingerprint,
        direction: "UPGRADE",
      });
      await expect(
        executeClientSetupTransition(f.sess, {
          workspaceId: f.ws.id,
          pinIndex,
          rowFingerprint,
          direction: "UPGRADE",
          reviewFingerprint: reviewByOther.reviewFingerprint,
        }),
      ).rejects.toMatchObject({ code: "stale_selection" });
    });

    it("resubmission after commit fails stale with zero additional writes", async () => {
      const f = await upgradedFixture();
      const { ids, rowFingerprint } = await reviewArgs(f.sess, f.ws.id);
      const pinIndex = ids.indexOf(f.pin.id);
      const review = await reviewClientSetupTransition(f.sess, {
        workspaceId: f.ws.id,
        pinIndex,
        rowFingerprint,
        direction: "UPGRADE",
      });
      await executeClientSetupTransition(f.sess, {
        workspaceId: f.ws.id,
        pinIndex,
        rowFingerprint,
        direction: "UPGRADE",
        reviewFingerprint: review.reviewFingerprint,
      });
      const auditsBefore = await prisma.auditEvent.count();
      const pinsBefore = await prisma.clientSetupPin.count({
        where: { clientSetupId: f.setup.id },
      });
      // The pin list changed → the row fingerprint is stale on re-resolve.
      await expect(
        executeClientSetupTransition(f.sess, {
          workspaceId: f.ws.id,
          pinIndex,
          rowFingerprint,
          direction: "UPGRADE",
          reviewFingerprint: review.reviewFingerprint,
        }),
      ).rejects.toMatchObject({ code: "stale_selection" });
      expect(await prisma.auditEvent.count()).toBe(auditsBefore);
      expect(
        await prisma.clientSetupPin.count({
          where: { clientSetupId: f.setup.id },
        }),
      ).toBe(pinsBefore);
    });

    it("ineligible target blocks the review and refuses execution", async () => {
      // No classification → target snapshot carries unclassified params →
      // P-020A eligibility fails → TARGET_INELIGIBLE.
      const f = await upgradedFixture({ classify: false });
      const { ids, rowFingerprint } = await reviewArgs(f.sess, f.ws.id);
      const pinIndex = ids.indexOf(f.pin.id);
      const review = await reviewClientSetupTransition(f.sess, {
        workspaceId: f.ws.id,
        pinIndex,
        rowFingerprint,
        direction: "UPGRADE",
      });
      expect(review.eligible).toBe(false);
      expect(review.blockedReasonCodes).toEqual(["TARGET_INELIGIBLE"]);
      await expect(
        executeClientSetupTransition(f.sess, {
          workspaceId: f.ws.id,
          pinIndex,
          rowFingerprint,
          direction: "UPGRADE",
          reviewFingerprint: review.reviewFingerprint,
        }),
      ).rejects.toMatchObject({ code: "transition_blocked" });
      const pin = await prisma.clientSetupPin.findUniqueOrThrow({
        where: { id: f.pin.id },
      });
      expect(pin.status).toBe("ACTIVE");
    });

    it("rejects review + execution for every denied role before any output", async () => {
      const f = await upgradedFixture();
      const { ids, rowFingerprint } = await reviewArgs(f.sess, f.ws.id);
      const pinIndex = ids.indexOf(f.pin.id);
      const auditsBefore = await prisma.auditEvent.count();

      for (const role of ["ASSISTANT_COACH", "SUPPORT", "CLIENT"] as const) {
        const denied = await staffFixture(role, f.ws);
        await expect(
          getTransitionTargets(s(denied.u.id), {
            workspaceId: f.ws.id,
            pinIndex,
            rowFingerprint,
          }),
        ).rejects.toThrow();
        await expect(
          reviewClientSetupTransition(s(denied.u.id), {
            workspaceId: f.ws.id,
            pinIndex,
            rowFingerprint,
            direction: "UPGRADE",
          }),
        ).rejects.toThrow();
        await expect(
          executeClientSetupTransition(s(denied.u.id), {
            workspaceId: f.ws.id,
            pinIndex,
            rowFingerprint,
            direction: "UPGRADE",
            reviewFingerprint: "0".repeat(64),
          }),
        ).rejects.toThrow();
      }
      // Assigned assistant still denied (read-only scope).
      const assistant = await staffFixture("ASSISTANT_COACH", f.ws);
      await assignCoach(f.ws.id, f.cp.id, assistant.m.id);
      await expect(
        reviewClientSetupTransition(s(assistant.u.id), {
          workspaceId: f.ws.id,
          pinIndex,
          rowFingerprint,
          direction: "UPGRADE",
        }),
      ).rejects.toThrow();
      // Dual-role platform admin denied.
      const admin = await user("PLATFORM_ADMIN");
      await member(f.ws.id, admin.id, "WORKSPACE_OWNER");
      await expect(
        reviewClientSetupTransition(s(admin.id), {
          workspaceId: f.ws.id,
          pinIndex,
          rowFingerprint,
          direction: "UPGRADE",
        }),
      ).rejects.toThrow();
      // Unassigned coach denied.
      const stranger = await staffFixture("COACH", f.ws);
      await expect(
        reviewClientSetupTransition(s(stranger.u.id), {
          workspaceId: f.ws.id,
          pinIndex,
          rowFingerprint,
          direction: "UPGRADE",
        }),
      ).rejects.toThrow();
      // Cross-workspace actor denied.
      const foreign = await staffFixture("WORKSPACE_OWNER");
      await expect(
        reviewClientSetupTransition(s(foreign.u.id), {
          workspaceId: f.ws.id,
          pinIndex,
          rowFingerprint,
          direction: "UPGRADE",
        }),
      ).rejects.toThrow();

      expect(await prisma.auditEvent.count()).toBe(auditsBefore);
      const pin = await prisma.clientSetupPin.findUniqueOrThrow({
        where: { id: f.pin.id },
      });
      expect(pin.status).toBe("ACTIVE");
    });

    it("serialized review strips every raw database id", async () => {
      const f = await upgradedFixture();
      const { ids, rowFingerprint } = await reviewArgs(f.sess, f.ws.id);
      const pinIndex = ids.indexOf(f.pin.id);
      const review = await reviewClientSetupTransition(f.sess, {
        workspaceId: f.ws.id,
        pinIndex,
        rowFingerprint,
        direction: "UPGRADE",
      });
      const payload = serializeTransitionReview(review);
      const json = JSON.stringify(payload);
      for (const secret of [
        f.pin.id,
        f.setup.id,
        f.cp.id,
        f.ws.id,
        f.templateId,
        f.p1.id,
        f.p2.id,
        review.currentVersionId,
        review.targetVersionId,
        review.actorMemberId,
      ]) {
        expect(json).not.toContain(secret);
      }
      expect(payload.providersDeclared).toBe(1);
      expect(payload.requiresConfirmation).toBe(true);
    });
  });

  // ── Provider framework on a real transaction ───────────────────────────

  describe("synthetic provider behavior", () => {
    async function removalFixture() {
      // v1 binds p1+p2; v2 drops p2 → a REMOVED diff entry providers may
      // report impacts for.
      const { ws, u, m } = await staffFixture();
      const sess = s(u.id);
      const p1 = await mkParam(ws.id, sess);
      const p2 = await mkParam(ws.id, sess);
      await classify(sess, ws.id, p1.id);
      await classify(sess, ws.id, p2.id);
      const { templateId } = await templateWithV1(ws.id, sess, [
        { parameterKey: p1.key, order: 0 },
        { parameterKey: p2.key, order: 1 },
      ]);
      await publishNextVersion(ws.id, sess, templateId, (sections) => [
        {
          label: "S",
          order: 0,
          sectionId: sections[0].sectionId,
          items: [sections[0].items[0]],
        },
      ]);
      const cp = await eligibleClient(ws.id);
      const { setup, pin } = await pinOn(ws.id, cp.id, templateId, 1, m.id);
      return { ws, u, m, sess, p1, p2, templateId, cp, setup, pin };
    }

    const synthetic = (
      evaluate: (input: {
        direction: string;
        removed: { parameterId: string; parameterKey: string }[];
      }) => unknown,
    ): ProviderSet => ({
      declarations: [
        { consumerKey: "history", contractVersion: 1, outputSchemaVersion: 1 },
      ],
      providers: {
        history: { evaluate: (i) => evaluate(i) as never },
      },
    });

    it("a synthetic provider surfaces parameter-keyed impacts for removed entries", async () => {
      const f = await removalFixture();
      const { ids, rowFingerprint } = await reviewArgs(f.sess, f.ws.id);
      const pinIndex = ids.indexOf(f.pin.id);
      const review = await reviewClientSetupTransition(
        f.sess,
        {
          workspaceId: f.ws.id,
          pinIndex,
          rowFingerprint,
          direction: "UPGRADE",
        },
        prisma,
        synthetic((input) => {
          expect(input.direction).toBe("UPGRADE");
          expect(input.removed.map((p) => p.parameterId)).toEqual([f.p2.id]);
          return {
            consumerKey: "history",
            contractVersion: 1,
            affectedParameters: input.removed.map((p) => ({
              parameterId: p.parameterId,
              parameterKey: p.parameterKey,
              impactRole: "REMOVED",
              count: "9007199254740993",
              earliestDate: "2020-01-01",
              latestDate: "2026-01-01",
              reasonCode: "REMOVED_WITH_HISTORY",
            })),
            blockedReasonCodes: [],
          };
        }),
      );
      expect(review.providerImpacts).toHaveLength(1);
      expect(review.providerImpacts[0].affectedParameters[0]).toMatchObject({
        parameterKey: f.p2.key,
        impactRole: "REMOVED",
        count: "9007199254740993",
      });
      expect(review.blockedReasonCodes).toEqual([]);
      // The persisted summary is structural-only — provider output (counts,
      // dates, history claims) never lands on the pin.
      await executeClientSetupTransition(
        f.sess,
        {
          workspaceId: f.ws.id,
          pinIndex,
          rowFingerprint,
          direction: "UPGRADE",
          reviewFingerprint: review.reviewFingerprint,
        },
        prisma,
        synthetic((input) => ({
          consumerKey: "history",
          contractVersion: 1,
          affectedParameters: input.removed.map((p) => ({
            parameterId: p.parameterId,
            parameterKey: p.parameterKey,
            impactRole: "REMOVED",
            count: "9007199254740993",
            earliestDate: "2020-01-01",
            latestDate: "2026-01-01",
            reasonCode: "REMOVED_WITH_HISTORY",
          })),
          blockedReasonCodes: [],
        })),
      );
      const next = await prisma.clientSetupPin.findFirstOrThrow({
        where: { clientSetupId: f.setup.id, status: "ACTIVE" },
      });
      const summary = next.transitionSummary as Record<string, unknown>;
      expect((summary.categories as Record<string, number>).removed).toBe(1);
      expect(JSON.stringify(summary)).not.toContain("9007199254740993");
      expect(summary.reasonCodes).toEqual(["REMOVED"]);
    });

    it("synthetic provider failure/block/malformed outputs block execution", async () => {
      for (const [name, evaluate, expected] of [
        [
          "exception",
          () => {
            throw new Error("boom");
          },
          "PROVIDER_EXECUTION_FAILED",
        ],
        [
          "reported-block",
          () => ({
            consumerKey: "history",
            contractVersion: 1,
            affectedParameters: [],
            blockedReasonCodes: ["PROVIDER_UNAVAILABLE"],
          }),
          "PROVIDER_REPORTED_BLOCK",
        ],
        [
          "malformed",
          () => ({
            consumerKey: "history",
            contractVersion: 1,
            affectedParameters: [{ count: "not-canonical" }],
            blockedReasonCodes: [],
          }),
          "PROVIDER_OUTPUT_INVALID",
        ],
      ] as const) {
        const f = await removalFixture();
        const { ids, rowFingerprint } = await reviewArgs(f.sess, f.ws.id);
        const pinIndex = ids.indexOf(f.pin.id);
        const review = await reviewClientSetupTransition(
          f.sess,
          {
            workspaceId: f.ws.id,
            pinIndex,
            rowFingerprint,
            direction: "UPGRADE",
          },
          prisma,
          synthetic(evaluate as never),
        );
        expect(review.blockedReasonCodes).toEqual([expected]);
        await expect(
          executeClientSetupTransition(
            f.sess,
            {
              workspaceId: f.ws.id,
              pinIndex,
              rowFingerprint,
              direction: "UPGRADE",
              reviewFingerprint: review.reviewFingerprint,
            },
            prisma,
            synthetic(evaluate as never),
          ).catch((e) => {
            throw e;
          }),
        ).rejects.toMatchObject({ code: "transition_blocked" });
        const pin = await prisma.clientSetupPin.findUniqueOrThrow({
          where: { id: f.pin.id },
        });
        expect(pin.status).toBe("ACTIVE");
        void name;
      }
    });
  });

  // ── Concurrency + atomicity ────────────────────────────────────────────

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
  }

  type TxHooks = {
    onAdvisoryIssued?: () => void;
    beforePinUpdate?: () => Promise<void> | void;
    onPinLockIssued?: () => void;
    /** Fired before the tx's workspaceMember authorize read — lets the
     * loser be held back until the winner already holds the lock chain. */
    onMemberRead?: () => Promise<void> | void;
    failAudit?: boolean;
  };

  function instrumentedClient(base: PrismaClient, hooks: TxHooks) {
    const wrapTx = (tx: Prisma.TransactionClient) =>
      new Proxy(tx, {
        get(t, k) {
          if (k === "$executeRawUnsafe" || k === "$queryRawUnsafe") {
            return async (query: unknown, ...rest: unknown[]) => {
              const q = String(query);
              if (q.includes("pg_advisory_xact_lock"))
                hooks.onAdvisoryIssued?.();
              if (q.includes('"client_setup_pin"') && q.includes("FOR UPDATE"))
                hooks.onPinLockIssued?.();
              return (
                t[k as "$queryRawUnsafe"] as (
                  ...a: unknown[]
                ) => Promise<unknown>
              ).call(t, query, ...rest);
            };
          }
          if (k === "workspaceMember") {
            const delegate = t.workspaceMember;
            return new Proxy(delegate, {
              get(d, m) {
                if (m === "findUnique" || m === "findFirst") {
                  return async (...args: unknown[]) => {
                    if (hooks.onMemberRead) await hooks.onMemberRead();
                    return Reflect.apply(
                      delegate[m as "findUnique"],
                      delegate,
                      args as never[],
                    );
                  };
                }
                return Reflect.get(d, m);
              },
            });
          }
          if (k === "clientSetupPin") {
            const delegate = t.clientSetupPin;
            return new Proxy(delegate, {
              get(d, m) {
                if (m === "update") {
                  return async (...args: unknown[]) => {
                    if (hooks.beforePinUpdate) await hooks.beforePinUpdate();
                    return Reflect.apply(
                      delegate.update,
                      delegate,
                      args as never[],
                    );
                  };
                }
                return Reflect.get(d, m);
              },
            });
          }
          if (k === "auditEvent" && hooks.failAudit) {
            const delegate = t.auditEvent;
            return new Proxy(delegate, {
              get(d, m) {
                if (m === "create") {
                  return async () => {
                    throw new Error("audit sink failure");
                  };
                }
                return Reflect.get(d, m);
              },
            });
          }
          return Reflect.get(t, k);
        },
      });
    return new Proxy(base, {
      get(target, k) {
        if (k !== "$transaction") return Reflect.get(target, k);
        return (
          callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options?: Parameters<PrismaClient["$transaction"]>[1],
        ) =>
          target.$transaction((tx) => callback(wrapTx(tx)), options as never);
      },
    });
  }

  describe("concurrency + atomicity", () => {
    async function raceFixture() {
      const { ws, u, m } = await staffFixture();
      const sess = s(u.id);
      const p1 = await mkParam(ws.id, sess);
      const p2 = await mkParam(ws.id, sess);
      await classify(sess, ws.id, p1.id);
      await classify(sess, ws.id, p2.id);
      const { templateId } = await templateWithV1(ws.id, sess, [
        { parameterKey: p1.key, order: 0 },
      ]);
      await publishNextVersion(ws.id, sess, templateId, (sections) => [
        {
          label: "S",
          order: 0,
          sectionId: sections[0].sectionId,
          items: [...sections[0].items, { parameterKey: p2.key, order: 1 }],
        },
      ]);
      const cp = await eligibleClient(ws.id);
      const { setup, pin } = await pinOn(ws.id, cp.id, templateId, 1, m.id);
      return { ws, u, m, sess, setup, pin };
    }

    it("concurrent transitions: exactly one winner; loser gets zero writes", async () => {
      const f = await raceFixture();
      const { ids, rowFingerprint } = await reviewArgs(f.sess, f.ws.id);
      const pinIndex = ids.indexOf(f.pin.id);
      const review = await reviewClientSetupTransition(f.sess, {
        workspaceId: f.ws.id,
        pinIndex,
        rowFingerprint,
        direction: "UPGRADE",
      });
      const auditsBefore = await prisma.auditEvent.count();

      const winnerHeld = deferred();
      const releaseWinner = deferred();
      const loserInFlight = deferred();
      const winnerDb = instrumentedClient(prisma, {
        beforePinUpdate: () => {
          winnerHeld.resolve();
          return releaseWinner.promise;
        },
      });
      // The loser cannot reach its advisory lock until the winner already
      // holds the full lock chain — deterministic arrival order.
      const loserDb = instrumentedClient(prisma, {
        onMemberRead: () => winnerHeld.promise,
        onAdvisoryIssued: () => loserInFlight.resolve(),
      });

      const args = {
        workspaceId: f.ws.id,
        pinIndex,
        rowFingerprint,
        direction: "UPGRADE" as const,
        reviewFingerprint: review.reviewFingerprint,
      };
      const winnerP = executeClientSetupTransition(f.sess, args, winnerDb);
      const loserP = executeClientSetupTransition(f.sess, args, loserDb);
      // Prove literal overlap: winner holds the advisory+row locks while
      // the loser's advisory-lock request is already issued and queued.
      await winnerHeld.promise;
      await loserInFlight.promise;
      releaseWinner.resolve();

      const results = await Promise.allSettled([winnerP, loserP]);
      const ok = results.filter((r) => r.status === "fulfilled");
      const bad = results.filter((r) => r.status === "rejected");
      expect(ok).toHaveLength(1);
      expect(bad).toHaveLength(1);
      const pins = await prisma.clientSetupPin.findMany({
        where: { clientSetupId: f.setup.id },
      });
      expect(pins.filter((p) => p.status === "ACTIVE")).toHaveLength(1);
      expect(pins.filter((p) => p.status === "SUPERSEDED")).toHaveLength(1);
      // Exactly the winning pair of audits.
      expect(await prisma.auditEvent.count()).toBe(auditsBefore + 2);
    });

    it("audit failure rolls the whole transition back", async () => {
      const f = await raceFixture();
      const { ids, rowFingerprint } = await reviewArgs(f.sess, f.ws.id);
      const pinIndex = ids.indexOf(f.pin.id);
      const review = await reviewClientSetupTransition(f.sess, {
        workspaceId: f.ws.id,
        pinIndex,
        rowFingerprint,
        direction: "UPGRADE",
      });
      const failingDb = instrumentedClient(prisma, { failAudit: true });
      await expect(
        executeClientSetupTransition(
          f.sess,
          {
            workspaceId: f.ws.id,
            pinIndex,
            rowFingerprint,
            direction: "UPGRADE",
            reviewFingerprint: review.reviewFingerprint,
          },
          failingDb,
        ),
      ).rejects.toThrow();
      const pin = await prisma.clientSetupPin.findUniqueOrThrow({
        where: { id: f.pin.id },
      });
      expect(pin.status).toBe("ACTIVE");
      expect(pin.endedAt).toBeNull();
      expect(
        await prisma.clientSetupPin.count({
          where: { clientSetupId: f.setup.id },
        }),
      ).toBe(1);
    });
  });

  // ── Flag-off zero writes (real boundary) ───────────────────────────────
});
