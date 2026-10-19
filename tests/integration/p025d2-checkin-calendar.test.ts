
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  listCheckInInstancesForClient,
  listOwnCheckInInstances,
} from "../../lib/checkin/instances";
import { createStaticConsentPolicy } from "../../lib/consent";

/**
 * P-025-D2 — Check-In calendar data contract (decision #104): the
 * bounded instant-range variant of the existing answer-free header
 * lists. Same authorization protocol, scopes, consent, ordering, and
 * zero-READ-audit contract — a range only narrows the bounded set.
 */

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const CHECKIN_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: "chk-dev-privacy-v1",
  HEALTH_DATA: "chk-dev-health-v1",
});

const OCT = {
  from: "2026-10-01T00:00:00.000Z",
  to: "2026-11-01T00:00:00.000Z",
};

// ── P-025-D2-I1-R2 — overflow detection (P2-1 repair) ──────────────────

describe.skipIf(!enabled)("P-025-D2 R2 truncation signal (real PG)", () => {
  let prisma2: PrismaClient;
  let n2 = 0;

  beforeAll(async () => {
    prisma2 = new PrismaClient({ datasources: { db: { url: url as string } } });
  });
  afterAll(async () => {
    await prisma2?.$disconnect();
  });

  const uid2 = () => `p25d2r2${++n2}_${Date.now()}`;
  const session2 = (userId: string) => ({ user: { id: userId } });
  const deps2 = () => ({ db: prisma2 as never, registry: CHECKIN_REGISTRY });

  /** 200+ instances inside one range via createMany (direct Prisma — the
   *  seed volume only; reads go through the production services). */
  async function denseFixture(opts: {
    extraInRange?: number;
    extraOut?: number;
  }) {
    const w = await prisma2.workspace.create({
      data: {
        name: `WS ${uid2()}`,
        slug: `p25d2r2-${uid2()}`,
        status: "ACTIVE",
      },
    });
    const ownerU = await prisma2.user.create({
      data: {
        email: `${uid2()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: `Fixture ${uid2()}`,
        platformRole: "USER",
        status: "ACTIVE",
      },
    });
    const ownerM = await prisma2.workspaceMember.create({
      data: {
        workspaceId: w.id,
        userId: ownerU.id,
        role: "WORKSPACE_OWNER",
        status: "ACTIVE",
      },
    });
    const clientU = await prisma2.user.create({
      data: {
        email: `${uid2()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: `Client ${uid2()}`,
        platformRole: "USER",
        status: "ACTIVE",
      },
    });
    await prisma2.workspaceMember.create({
      data: {
        workspaceId: w.id,
        userId: clientU.id,
        role: "CLIENT",
        status: "ACTIVE",
      },
    });
    const cp = await prisma2.clientProfile.create({
      data: { workspaceId: w.id, userId: clientU.id, name: `Client ${uid2()}` },
    });
    const form = await prisma2.checkInForm.create({
      data: {
        workspaceId: w.id,
        name: `F ${uid2()}`,
        status: "ACTIVE",
        createdByMemberId: ownerM.id,
      },
    });
    const version = await prisma2.checkInFormVersion.create({
      data: {
        workspaceId: w.id,
        formId: form.id,
        versionSeq: 1,
        definition: {
          title: "F",
          fields: [{ kind: "shortText", label: "Q", required: true, order: 0 }],
        } as never,
        publishOriginRevision: 1,
        publishedByMemberId: ownerM.id,
      },
    });
    const base = Date.UTC(2026, 9, 1, 9); // 2026-10-01T09:00Z
    const rows = [];
    for (let i = 0; i < 200; i++)
      rows.push({
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.id,
        formVersionId: version.id,
        dueAt: new Date(base + i * 60_000), // 200 minutes ≈ 3.3h — same window
        scheduledByMemberId: ownerM.id,
      });
    for (let i = 0; i < (opts.extraInRange ?? 0); i++)
      rows.push({
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.id,
        formVersionId: version.id,
        dueAt: new Date(base + (200 + i) * 60_000),
        scheduledByMemberId: ownerM.id,
      });
    for (let i = 0; i < (opts.extraOut ?? 0); i++)
      rows.push({
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.id,
        formVersionId: version.id,
        dueAt: new Date(Date.UTC(2026, 11, 1) + i * 60_000), // December — out of range
        scheduledByMemberId: ownerM.id,
      });
    await prisma2.checkInInstance.createMany({ data: rows });
    return { w, cp, owner: session2(ownerU.id), client: session2(clientU.id) };
  }

  it("exactly 200 eligible → 200 items, truncated false", async () => {
    const s = await denseFixture({ extraOut: 5 });
    const r = await listCheckInInstancesForClient(
      s.owner,
      { workspaceId: s.w.id, clientProfileId: s.cp.id, range: OCT },
      deps2(),
    );
    expect(r.items).toHaveLength(200);
    expect(r.truncated).toBe(false);
  });

  it("201 eligible → first 200 items, truncated true; range and scope rows do not count", async () => {
    const s = await denseFixture({ extraInRange: 1, extraOut: 5 });
    const r = await listCheckInInstancesForClient(
      s.owner,
      { workspaceId: s.w.id, clientProfileId: s.cp.id, range: OCT },
      deps2(),
    );
    expect(r.items).toHaveLength(200);
    expect(r.truncated).toBe(true);
    // Deterministic dueAt asc, id asc subset.
    const dues = r.items.map((i) => i.dueAt);
    expect([...dues].sort()).toEqual(dues);
    // The December instances never enter the set.
    expect(dues.every((d) => d < "2026-11-01")).toBe(true);
    // Instances on a DIFFERENT client in the same workspace don't count.
    const otherU = await prisma2.user.create({
      data: {
        email: `${uid2()}@example.test`,
        passwordHash: "x",
        name: "x",
        status: "ACTIVE",
      },
    });
    const other = await prisma2.clientProfile.create({
      data: { workspaceId: s.w.id, userId: otherU.id, name: `Other ${uid2()}` },
    });
    const otherForm = await prisma2.checkInForm.findFirstOrThrow({
      where: { workspaceId: s.w.id },
    });
    const otherVersion = await prisma2.checkInFormVersion.findFirstOrThrow({
      where: { formId: otherForm.id },
    });
    const ownerMember = await prisma2.workspaceMember.findFirstOrThrow({
      where: { workspaceId: s.w.id },
    });
    await prisma2.checkInInstance.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        workspaceId: s.w.id,
        clientProfileId: other.id,
        formId: otherForm.id,
        formVersionId: otherVersion.id,
        dueAt: new Date(Date.UTC(2026, 9, 1) + i * 60_000),
        scheduledByMemberId: ownerMember.id,
      })),
    });
    const r2 = await listCheckInInstancesForClient(
      s.owner,
      { workspaceId: s.w.id, clientProfileId: s.cp.id, range: OCT },
      deps2(),
    );
    expect(r2.items).toHaveLength(200);
    expect(r2.truncated).toBe(true); // not 250 — foreign rows invisible
  });

  it("client own list carries the same truncation metadata; unbounded callers keep the legacy shape", async () => {
    const s = await denseFixture({ extraInRange: 1 });
    const own = await listOwnCheckInInstances(
      s.client,
      { workspaceId: s.w.id, range: OCT },
      deps2(),
    );
    expect(own.items).toHaveLength(200);
    expect(own.truncated).toBe(true);
    // No range → legacy {items} shape (no truncation contract).
    const legacy = await listOwnCheckInInstances(
      s.client,
      { workspaceId: s.w.id },
      deps2(),
    );
    expect(legacy.items).toHaveLength(200);
    expect("truncated" in legacy).toBe(false);
  });

  it("empty range → empty items, truncated false", async () => {
    const s = await denseFixture({});
    const r = await listCheckInInstancesForClient(
      s.owner,
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        range: {
          from: "2027-03-01T00:00:00.000Z",
          to: "2027-04-01T00:00:00.000Z",
        },
      },
      deps2(),
    );
    expect(r.items).toHaveLength(0);
    expect(r.truncated).toBe(false);
  });
});
