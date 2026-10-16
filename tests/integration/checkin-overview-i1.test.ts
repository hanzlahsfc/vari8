// CHECK-IN-OVERVIEW-I1 — bounded staff "awaiting review" overview
// (approved CHECK-IN-OVERVIEW-P2 contract; bounded W09 subset) against
// disposable PostgreSQL. Real schema, real transactions, real
// authorization: sessions are only labeled identities; membership,
// role, workspace, and assignment state are re-resolved in each call.
//
// Contract under test:
//   - awaiting-review ≡ checkin_submission exists AND no checkin_review
//   - authorizeCollection(checkinsCoachReviews/read): owner workspace;
//     coach/assistant assigned; CLIENT/SUPPORT/nonmember/dual-role
//     PLATFORM_ADMIN denied — denial is never an empty page
//   - predicates (scope + awaiting + cursor) in SQL BEFORE take
//   - submittedAt ASC,id ASC keyset; N+1 → truthful nextCursor
//   - header-only projection; zero audits; canReview derived per row

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import { createStaticConsentPolicy } from "../../lib/consent";
import {
  createCheckInForm,
  publishCheckInForm,
  saveCheckInFormDraft,
} from "../../lib/checkin/forms";
import {
  CheckInInstanceError,
  listCheckInReviewQueue,
  markCheckInSubmissionReviewed,
} from "../../lib/checkin/instances";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DEV_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: "check-in-dev-privacy-v1",
  HEALTH_DATA: "check-in-dev-health-v1",
});

type Role =
  | "WORKSPACE_OWNER"
  | "COACH"
  | "ASSISTANT_COACH"
  | "SUPPORT"
  | "CLIENT";

describe.skipIf(!enabled)("CHECK-IN-OVERVIEW-I1 review queue (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "checkin_feedback","checkin_review","checkin_submission_answer","checkin_submission","checkin_instance","checkin_form_version","checkin_form","consent_record","audit_event","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `cio1${++n}_${Date.now()}`;
  const session = (userId: string) => ({ user: { id: userId } });
  const deps = () => ({ db: prisma as never, registry: DEV_REGISTRY });

  async function user(platformRole: "USER" | "PLATFORM_ADMIN" = "USER") {
    return prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: `Fixture ${uid()}`,
        platformRole,
        status: "ACTIVE",
      },
    });
  }
  async function ws() {
    return prisma.workspace.create({
      data: { name: `WS ${uid()}`, slug: `cio1-${uid()}`, status: "ACTIVE" },
    });
  }
  async function member(workspaceId: string, userId: string, role: Role) {
    return prisma.workspaceMember.create({
      data: { workspaceId, userId, role, status: "ACTIVE" },
    });
  }
  async function profile(workspaceId: string, userId: string, name?: string) {
    return prisma.clientProfile.create({
      data: { workspaceId, userId, name: name ?? `Client ${uid()}` },
    });
  }
  async function consent(clientProfileId: string) {
    for (const [kind, version] of [
      ["PRIVACY_NOTICE", "check-in-dev-privacy-v1"],
      ["HEALTH_DATA", "check-in-dev-health-v1"],
    ] as const)
      await prisma.consentRecord.create({
        data: { clientProfileId, kind, version },
      });
  }
  async function assignment(
    workspaceId: string,
    clientProfileId: string,
    coachMemberId: string,
    role: "PRIMARY" | "COACH" = "PRIMARY",
  ) {
    return prisma.clientAssignment.create({
      data: {
        workspaceId,
        clientProfileId,
        coachMemberId,
        role,
        status: "ACTIVE",
      },
    });
  }

  const draftJson = () => ({
    title: "Weekly",
    fields: [
      { kind: "shortText", label: "How are you?", required: true, order: 0 },
    ],
  });

  async function publishedForm(ownerId: string, workspaceId: string) {
    const created = await createCheckInForm(
      session(ownerId),
      { workspaceId, name: `Form ${uid()}` },
      prisma,
    );
    const saved = await saveCheckInFormDraft(
      session(ownerId),
      {
        workspaceId,
        formId: created.formId,
        expectedRevision: 1,
        draft: draftJson(),
      },
      prisma,
    );
    const published = await publishCheckInForm(
      session(ownerId),
      { workspaceId, formId: created.formId, expectedRevision: saved.revision },
      prisma,
    );
    const version = await prisma.checkInFormVersion.findUniqueOrThrow({
      where: {
        formId_versionSeq: {
          formId: created.formId,
          versionSeq: published.versionSeq,
        },
      },
      select: { id: true, formId: true },
    });
    return { formId: created.formId, versionId: version.id };
  }

  /** Workspace + owner member + client profile + consent + published form. */
  async function setup() {
    const w = await ws();
    const owner = await user();
    const ownerMember = await member(w.id, owner.id, "WORKSPACE_OWNER");
    const clientUser = await user();
    const clientMember = await member(w.id, clientUser.id, "CLIENT");
    const cp = await profile(w.id, clientUser.id);
    await consent(cp.id);
    const form = await publishedForm(owner.id, w.id);
    return { w, owner, ownerMember, clientUser, clientMember, cp, ...form };
  }

  /** Direct seed: instance + submission (+ optional review) — mirrors the
   * service output shape without paying the full protocol cost per row. */
  async function seedSubmission(
    s: Awaited<ReturnType<typeof setup>>,
    opts: {
      clientProfileId?: string;
      dueAt?: Date;
      submittedAt?: Date;
      reviewedByMemberId?: string;
    } = {},
  ) {
    const cpId = opts.clientProfileId ?? s.cp.id;
    const instance = await prisma.checkInInstance.create({
      data: {
        workspaceId: s.w.id,
        clientProfileId: cpId,
        formId: s.formId,
        formVersionId: s.versionId,
        dueAt: opts.dueAt ?? new Date("2030-06-01T09:00:00.000Z"),
        scheduledByMemberId: s.ownerMember.id,
      },
    });
    const submission = await prisma.checkInSubmission.create({
      data: {
        workspaceId: s.w.id,
        clientProfileId: cpId,
        formId: s.formId,
        formVersionId: s.versionId,
        instanceId: instance.id,
        submittedByUserId: s.clientUser.id,
        submittedByMemberId: s.clientMember.id,
        ...(opts.submittedAt ? { submittedAt: opts.submittedAt } : {}),
      },
    });
    if (opts.reviewedByMemberId)
      await prisma.checkInReview.create({
        data: {
          workspaceId: s.w.id,
          clientProfileId: cpId,
          submissionId: submission.id,
          reviewedByMemberId: opts.reviewedByMemberId,
        },
      });
    return { instance, submission };
  }

  const audits = (workspaceId: string) =>
    prisma.auditEvent.findMany({ where: { workspaceId } });

  // ── Predicate + workspace scope ──────────────────────────────────────

  it("owner sees every unreviewed submission workspace-wide; reviewed rows are excluded", async () => {
    const s = await setup();
    const cp2 = await profile(s.w.id, (await user()).id, "Second Client");
    const a = await seedSubmission(s, {
      submittedAt: new Date("2030-01-01T00:00:00.000Z"),
    });
    const b = await seedSubmission(s, {
      clientProfileId: cp2.id,
      dueAt: new Date("2030-06-02T09:00:00.000Z"),
      submittedAt: new Date("2030-01-02T00:00:00.000Z"),
    });
    await seedSubmission(s, {
      dueAt: new Date("2030-06-03T09:00:00.000Z"),
      submittedAt: new Date("2030-01-03T00:00:00.000Z"),
      reviewedByMemberId: s.ownerMember.id,
    });
    // SCHEDULED (no submission) must not appear either.
    await prisma.checkInInstance.create({
      data: {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        formId: s.formId,
        formVersionId: s.versionId,
        dueAt: new Date("2030-06-04T09:00:00.000Z"),
        scheduledByMemberId: s.ownerMember.id,
      },
    });

    const result = await listCheckInReviewQueue(
      session(s.owner.id),
      { workspaceId: s.w.id },
      deps(),
    );
    expect(result.items.map((i) => i.submissionId)).toEqual([
      a.submission.id,
      b.submission.id,
    ]);
    expect(result.nextCursor).toBeNull();
    expect(result.items[1].clientName).toBe("Second Client");
  });

  it("rows carry only the header projection — no answers, feedback, or consent-gated data", async () => {
    const s = await setup();
    await seedSubmission(s);
    const result = await listCheckInReviewQueue(
      session(s.owner.id),
      { workspaceId: s.w.id },
      deps(),
    );
    expect(result.items).toHaveLength(1);
    const keys = Object.keys(result.items[0]).sort();
    expect(keys).toEqual([
      "canReview",
      "clientName",
      "clientProfileId",
      "dueAt",
      "formName",
      "instanceId",
      "late",
      "submissionId",
      "submittedAt",
      "versionSeq",
    ]);
  });

  it("the list writes zero audit events (header-only read, sibling precedent)", async () => {
    const s = await setup();
    await seedSubmission(s);
    const before = (await audits(s.w.id)).length;
    await listCheckInReviewQueue(
      session(s.owner.id),
      { workspaceId: s.w.id },
      deps(),
    );
    expect((await audits(s.w.id)).length).toBe(before);
  });

  // ── Assigned scope + read-only/actionable labelling ──────────────────

  it("assigned coach sees only their clients' rows with canReview true; unassigned coach sees none", async () => {
    const s = await setup();
    const cp2 = await profile(s.w.id, (await user()).id);
    const a = await seedSubmission(s);
    await seedSubmission(s, {
      clientProfileId: cp2.id,
      dueAt: new Date("2030-06-02T09:00:00.000Z"),
    });
    const coach = await user();
    const coachMember = await member(s.w.id, coach.id, "COACH");
    await assignment(s.w.id, s.cp.id, coachMember.id);
    const otherCoach = await user();
    await member(s.w.id, otherCoach.id, "COACH");

    const mine = await listCheckInReviewQueue(
      session(coach.id),
      { workspaceId: s.w.id },
      deps(),
    );
    expect(mine.items.map((i) => i.submissionId)).toEqual([a.submission.id]);
    expect(mine.items[0].canReview).toBe(true);

    const none = await listCheckInReviewQueue(
      session(otherCoach.id),
      { workspaceId: s.w.id },
      deps(),
    );
    expect(none.items).toEqual([]);
    expect(none.nextCursor).toBeNull();
  });

  it("assistant sees assigned rows read-only (canReview false); owner canReview is per-row by assignment", async () => {
    const s = await setup();
    const cp2 = await profile(s.w.id, (await user()).id);
    const a = await seedSubmission(s);
    const b = await seedSubmission(s, {
      clientProfileId: cp2.id,
      dueAt: new Date("2030-06-02T09:00:00.000Z"),
    });
    const assistant = await user();
    const assistantMember = await member(s.w.id, assistant.id, "ASSISTANT_COACH");
    await assignment(s.w.id, s.cp.id, assistantMember.id, "COACH");
    // Owner assigned ONLY to cp (Solo-Coach #111 write path).
    await assignment(s.w.id, s.cp.id, s.ownerMember.id, "PRIMARY");

    const asst = await listCheckInReviewQueue(
      session(assistant.id),
      { workspaceId: s.w.id },
      deps(),
    );
    expect(asst.items.map((i) => i.submissionId)).toEqual([a.submission.id]);
    expect(asst.items[0].canReview).toBe(false);

    const own = await listCheckInReviewQueue(
      session(s.owner.id),
      { workspaceId: s.w.id },
      deps(),
    );
    const byId = new Map(own.items.map((i) => [i.submissionId, i]));
    expect(byId.get(a.submission.id)?.canReview).toBe(true);
    expect(byId.get(b.submission.id)?.canReview).toBe(false);
  });

  // ── Denials fail closed — never an empty page ────────────────────────

  it.each([
    ["CLIENT member", async (s: Awaited<ReturnType<typeof setup>>) => s.clientUser.id],
    ["SUPPORT member", async (s: Awaited<ReturnType<typeof setup>>) => {
      const u = await user();
      await member(s.w.id, u.id, "SUPPORT");
      return u.id;
    }],
    ["non-member", async () => (await user()).id],
  ])("%s is denied, not shown an empty queue", async (_label, getUserId) => {
    const s = await setup();
    await seedSubmission(s);
    await expect(
      listCheckInReviewQueue(
        session(await getUserId(s)),
        { workspaceId: s.w.id },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("dual-role PLATFORM_ADMIN with ACTIVE membership + assignment is denied by the deny-set", async () => {
    const s = await setup();
    await seedSubmission(s);
    const admin = await user("PLATFORM_ADMIN");
    const adminMember = await member(s.w.id, admin.id, "COACH");
    await assignment(s.w.id, s.cp.id, adminMember.id);
    await expect(
      listCheckInReviewQueue(
        session(admin.id),
        { workspaceId: s.w.id },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("cross-tenant: foreign-workspace rows are never listed", async () => {
    const s = await setup();
    const other = await setup();
    await seedSubmission(other);
    const result = await listCheckInReviewQueue(
      session(s.owner.id),
      { workspaceId: s.w.id },
      deps(),
    );
    expect(result.items).toEqual([]);
    // And the foreign owner cannot read this workspace at all.
    await expect(
      listCheckInReviewQueue(
        session(other.owner.id),
        { workspaceId: s.w.id },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  // ── Predicate before limit + pagination ──────────────────────────────

  it("predicate-before-limit: qualifying rows beyond a page of excluded rows are still returned", async () => {
    const s = await setup();
    // 60 reviewed submissions fill the naive first page; the 2 truly
    // awaiting rows sort AFTER them (later submittedAt). A
    // cap-then-filter implementation silently returns zero.
    for (let i = 0; i < 60; i++)
      await seedSubmission(s, {
        // distinct dueAt per row — (workspace,client,form,dueAt) is unique
        dueAt: new Date(Date.UTC(2030, 6, 1 + i, 9)),
        submittedAt: new Date(Date.UTC(2030, 0, 1, 0, 0, i)),
        reviewedByMemberId: s.ownerMember.id,
      });
    const a = await seedSubmission(s, {
      dueAt: new Date("2030-10-01T09:00:00.000Z"),
      submittedAt: new Date("2030-02-01T00:00:00.000Z"),
    });
    const b = await seedSubmission(s, {
      dueAt: new Date("2030-10-02T09:00:00.000Z"),
      submittedAt: new Date("2030-02-02T00:00:00.000Z"),
    });

    const result = await listCheckInReviewQueue(
      session(s.owner.id),
      { workspaceId: s.w.id },
      deps(),
    );
    expect(result.items.map((i) => i.submissionId)).toEqual([
      a.submission.id,
      b.submission.id,
    ]);
    expect(result.nextCursor).toBeNull();
  });

  it("51 unreviewed → page 1 returns 50 + nextCursor; page 2 returns the last row + null", async () => {
    const s = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 51; i++) {
      const { submission } = await seedSubmission(s, {
        dueAt: new Date(Date.UTC(2030, 8, 1 + i, 9)),
        submittedAt: new Date(Date.UTC(2030, 0, 10, 0, 0, i)),
      });
      ids.push(submission.id);
    }
    const p1 = await listCheckInReviewQueue(
      session(s.owner.id),
      { workspaceId: s.w.id },
      deps(),
    );
    expect(p1.items).toHaveLength(50);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await listCheckInReviewQueue(
      session(s.owner.id),
      { workspaceId: s.w.id, cursor: p1.nextCursor! },
      deps(),
    );
    expect(p2.items).toHaveLength(1);
    expect(p2.nextCursor).toBeNull();
    // Disjoint + ordered coverage.
    const seen = new Set([
      ...p1.items.map((i) => i.submissionId),
      ...p2.items.map((i) => i.submissionId),
    ]);
    expect(seen.size).toBe(51);
  });

  it("same-submittedAt ties across the page boundary lose nothing", async () => {
    const s = await setup();
    const tied = new Date("2030-03-01T00:00:00.000Z");
    const ids: string[] = [];
    for (let i = 0; i < 51; i++) {
      const { submission } = await seedSubmission(s, {
        dueAt: new Date(Date.UTC(2030, 9, 1 + i, 9)),
        submittedAt: tied,
      });
      ids.push(submission.id);
    }
    const sorted = [...ids].sort();
    const p1 = await listCheckInReviewQueue(
      session(s.owner.id),
      { workspaceId: s.w.id },
      deps(),
    );
    expect(p1.items.map((i) => i.submissionId)).toEqual(sorted.slice(0, 50));
    const p2 = await listCheckInReviewQueue(
      session(s.owner.id),
      { workspaceId: s.w.id, cursor: p1.nextCursor! },
      deps(),
    );
    expect(p2.items.map((i) => i.submissionId)).toEqual(sorted.slice(50));
    expect(p2.nextCursor).toBeNull();
  });

  it("malformed cursor rejects invalid_input; a foreign-shaped valid cursor cannot leak rows", async () => {
    const s = await setup();
    const other = await setup();
    const foreign = await seedSubmission(other, {
      submittedAt: new Date("2030-01-01T00:00:00.000Z"),
    });
    await seedSubmission(s, {
      submittedAt: new Date("2030-02-01T00:00:00.000Z"),
    });
    await expect(
      listCheckInReviewQueue(
        session(s.owner.id),
        { workspaceId: s.w.id, cursor: "not-a-cursor" },
        deps(),
      ),
    ).rejects.toThrowError(CheckInInstanceError);
    // A well-formed cursor built from another workspace's row only
    // repositions inside THIS workspace's authorized set.
    const cursor = `${foreign.submission.submittedAt.toISOString()}|${foreign.submission.id}`;
    const result = await listCheckInReviewQueue(
      session(s.owner.id),
      { workspaceId: s.w.id, cursor },
      deps(),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].submissionId).not.toBe(foreign.submission.id);
  });

  // ── Revocation + stale rows ──────────────────────────────────────────

  it("assignment revocation between listing and refetch removes the rows", async () => {
    const s = await setup();
    await seedSubmission(s);
    const coach = await user();
    const coachMember = await member(s.w.id, coach.id, "COACH");
    const asn = await assignment(s.w.id, s.cp.id, coachMember.id);

    const before = await listCheckInReviewQueue(
      session(coach.id),
      { workspaceId: s.w.id },
      deps(),
    );
    expect(before.items).toHaveLength(1);

    await prisma.clientAssignment.update({
      where: { id: asn.id },
      data: { status: "REMOVED" },
    });
    const after = await listCheckInReviewQueue(
      session(coach.id),
      { workspaceId: s.w.id },
      deps(),
    );
    expect(after.items).toEqual([]);
  });

  it("a row reviewed after the snapshot disappears on refetch (stale-row contract)", async () => {
    const s = await setup();
    const { submission } = await seedSubmission(s);
    const p1 = await listCheckInReviewQueue(
      session(s.owner.id),
      { workspaceId: s.w.id },
      deps(),
    );
    expect(p1.items).toHaveLength(1);

    await prisma.checkInReview.create({
      data: {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        submissionId: submission.id,
        reviewedByMemberId: s.ownerMember.id,
      },
    });
    const p2 = await listCheckInReviewQueue(
      session(s.owner.id),
      { workspaceId: s.w.id },
      deps(),
    );
    expect(p2.items).toEqual([]);
  });

  // ── Index ────────────────────────────────────────────────────────────

  it("the ordered workspace keyset scan uses the new index (no Sort node)", async () => {
    const s = await setup();
    await seedSubmission(s);
    // The index must EXIST and must be capable of serving the ordered
    // workspace keyset scan without a Sort node. The planner is
    // cost-based: on a workspace with a handful of rows it legitimately
    // prefers bitmap-scan+sort — so the plan check runs with bitmap
    // scans disabled (SET LOCAL inside a rolled-back transaction), which
    // is the honest capability assertion, not a claim the planner always
    // picks this index.
    const idx = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'checkin_submission'
         AND indexname = 'checkin_submission_workspace_id_submitted_at_id_idx'`,
    );
    expect(idx).toHaveLength(1);
    const plan = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL enable_bitmapscan = off`,
      );
      return tx.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
        `EXPLAIN SELECT "id" FROM "checkin_submission" s
         WHERE s."workspace_id" = $1
           AND NOT EXISTS (SELECT 1 FROM "checkin_review" r
                           WHERE r."submission_id" = s."id")
         ORDER BY s."submitted_at" ASC, s."id" ASC
         LIMIT 51`,
        s.w.id,
      );
    });
    const text = plan.map((p) => p["QUERY PLAN"]).join("\n");
    expect(text).toContain(
      "checkin_submission_workspace_id_submitted_at_id_idx",
    );
    expect(text).not.toContain("Sort");
  });
});
