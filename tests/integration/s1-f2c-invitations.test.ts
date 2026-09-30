import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import { hashAccessToken } from "../../lib/tokens/crypto";
import { verifyPassword } from "../../lib/password";
import {
  acceptWorkspaceInvitation,
  createWorkspaceInvitation,
  InvitationError,
  listWorkspaceInvitations,
  revokeWorkspaceInvitation,
} from "../../lib/workspace/invitations";

/**
 * S1-F2C invitation orchestration against real PostgreSQL — production
 * services + the real Prisma-backed guard. Synthetic fixtures only.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const PASSWORD = "acceptance-test-password!";

describe.skipIf(!enabled)("S1-F2C invitation orchestration (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "audit_event","coach_profile","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `f2c${++n}_${Date.now()}`;
  async function user(
    opts: {
      platformRole?: "USER" | "PLATFORM_ADMIN";
      status?: "ACTIVE" | "DEACTIVATED" | "INVITED";
      email?: string;
    } = {},
  ) {
    return prisma.user.create({
      data: {
        email: opts.email ?? `${uid()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: `Fixture ${uid()}`,
        platformRole: opts.platformRole ?? "USER",
        status: opts.status ?? "ACTIVE",
      },
    });
  }
  async function workspace(status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
    return prisma.workspace.create({
      data: { name: `w${n}`, slug: `ws-${uid()}`, status },
    });
  }
  async function member(
    workspaceId: string,
    userId: string,
    role:
      "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT",
    status: "INVITED" | "ACTIVE" | "SUSPENDED" | "REMOVED" = "ACTIVE",
  ) {
    return prisma.workspaceMember.create({
      data: { workspaceId, userId, role, status },
    });
  }
  const session = (userId: string) => ({ user: { id: userId } });

  /** Owner + workspace fixture; returns the owner's session. */
  async function ownerFixture(status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
    const ws = await workspace(status);
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    return { ws, owner, session: session(owner.id) };
  }

  const invite = (
    sess: { user: { id: string } },
    workspaceId: string,
    targetEmail: string,
    intendedRole: "COACH" | "ASSISTANT_COACH" | "CLIENT",
  ) =>
    createWorkspaceInvitation(sess, { workspaceId, targetEmail, intendedRole });

  const activeTokensFor = (workspaceId: string, email: string) =>
    prisma.accessToken.findMany({
      where: {
        workspaceId,
        intendedRole: "CLIENT",
        targetEmail: email.toLowerCase(),
        purpose: "WORKSPACE_INVITE",
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

  // --- A/B: authorization + create/replace ------------------------------------

  it("owner can create COACH, ASSISTANT_COACH, and CLIENT invitations", async () => {
    const { ws, session: sess } = await ownerFixture();
    for (const role of ["COACH", "ASSISTANT_COACH", "CLIENT"] as const) {
      const r = await invite(sess, ws.id, `i-${role}@example.test`, role);
      expect(r.delivery.kind).toBe("workspace_invite");
      expect(r.delivery.to).toBe(`i-${role.toLowerCase()}@example.test`);
      expect(r.delivery.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(r.delivery.workspaceId).toBe(ws.id);
      const row = await prisma.accessToken.findUniqueOrThrow({
        where: { id: r.invitationId },
      });
      // Raw token is NEVER persisted — hash only.
      expect(row.tokenHash).toBe(hashAccessToken(r.delivery.rawToken));
      expect(JSON.stringify(row)).not.toContain(r.delivery.rawToken);
    }
  });

  it("coach may invite CLIENT only; staff invites are denied", async () => {
    const { ws } = await ownerFixture();
    const coach = await user();
    await member(ws.id, coach.id, "COACH");
    const ok = await invite(
      session(coach.id),
      ws.id,
      "c-client@example.test",
      "CLIENT",
    );
    expect(ok.invitationId).toBeTruthy();
    for (const role of ["COACH", "ASSISTANT_COACH"] as const) {
      await expect(
        invite(session(coach.id), ws.id, `c-${role}@example.test`, role),
      ).rejects.toThrow(AccessDeniedError);
    }
  });

  it("assistant/client/support/platform-admin cannot create invitations", async () => {
    const { ws } = await ownerFixture();
    for (const role of ["ASSISTANT_COACH", "SUPPORT", "CLIENT"] as const) {
      const u = await user();
      await member(ws.id, u.id, role);
      for (const target of ["CLIENT", "COACH"] as const) {
        await expect(
          invite(session(u.id), ws.id, `deny-${role}@example.test`, target),
        ).rejects.toThrow(AccessDeniedError);
      }
    }
    const admin = await user({ platformRole: "PLATFORM_ADMIN" });
    await expect(
      invite(session(admin.id), ws.id, "admin@example.test", "CLIENT"),
    ).rejects.toThrow();
  });

  it("inactive users, memberships, and workspaces are denied", async () => {
    const { ws, owner } = await ownerFixture();
    const dead = await user({ status: "DEACTIVATED" });
    await member(ws.id, dead.id, "WORKSPACE_OWNER");
    await expect(
      invite(session(dead.id), ws.id, "x@example.test", "CLIENT"),
    ).rejects.toThrow(AccessDeniedError);
    const suspended = await user();
    await member(ws.id, suspended.id, "WORKSPACE_OWNER", "SUSPENDED");
    await expect(
      invite(session(suspended.id), ws.id, "x@example.test", "CLIENT"),
    ).rejects.toThrow(AccessDeniedError);
    const deadWs = await workspace("SUSPENDED");
    await expect(
      invite(session(owner.id), deadWs.id, "x@example.test", "CLIENT"),
    ).rejects.toThrow(AccessDeniedError);
    void owner;
  });

  it("replacement revokes only the exact active tuple; audit failure rolls back", async () => {
    const { ws, session: sess } = await ownerFixture();
    const first = await invite(sess, ws.id, "R@Example.Test", "CLIENT");
    // Different email/role/workspace invitations stay active.
    await invite(sess, ws.id, "other@example.test", "CLIENT");
    await invite(sess, ws.id, "r@example.test", "COACH");
    const second = await invite(sess, ws.id, "r@example.test", "CLIENT");
    expect(second.invitationId).not.toBe(first.invitationId);
    const active = await activeTokensFor(ws.id, "r@example.test");
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(second.invitationId);
    expect((await activeTokensFor(ws.id, "other@example.test")).length).toBe(1);
    // Same workspace, same email, DIFFERENT role: untouched by the replacement.
    const coachRow = await prisma.accessToken.findMany({
      where: {
        workspaceId: ws.id,
        targetEmail: "r@example.test",
        intendedRole: "COACH",
        revokedAt: null,
        consumedAt: null,
      },
    });
    expect(coachRow).toHaveLength(1);

    // Forced audit failure: the replacement revocation rolls back too.
    const prev = await invite(sess, ws.id, "rollback@example.test", "CLIENT");
    await prisma.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION f2c_audit_fail() RETURNS trigger AS $$
         BEGIN RAISE EXCEPTION 'forced'; END; $$ LANGUAGE plpgsql`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER f2c_audit_fail BEFORE INSERT ON "audit_event"
         FOR EACH ROW WHEN (NEW.action = 'INVITE')
         EXECUTE FUNCTION f2c_audit_fail()`,
    );
    try {
      await expect(
        invite(sess, ws.id, "rollback@example.test", "CLIENT"),
      ).rejects.toThrow();
      const stillActive = await activeTokensFor(ws.id, "rollback@example.test");
      expect(stillActive.map((r) => r.id)).toEqual([prev.invitationId]);
      // And no partial replacement row survived.
      const all = await prisma.accessToken.findMany({
        where: { workspaceId: ws.id, targetEmail: "rollback@example.test" },
      });
      expect(all).toHaveLength(1);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER f2c_audit_fail ON "audit_event"',
      );
    }
  });

  it("concurrent replacements leave exactly one active matching invitation", async () => {
    const { ws, session: sess } = await ownerFixture();
    const [a, b] = await Promise.allSettled([
      invite(sess, ws.id, "race@example.test", "CLIENT"),
      invite(sess, ws.id, "race@example.test", "CLIENT"),
    ]);
    const succeeded = [a, b].filter((r) => r.status === "fulfilled");
    expect(succeeded.length).toBeGreaterThan(0);
    const active = await activeTokensFor(ws.id, "race@example.test");
    expect(active).toHaveLength(1);
  });

  it("audit metadata contains no email/name/hash/password/token", async () => {
    const { ws, session: sess, owner } = await ownerFixture();
    const r = await invite(sess, ws.id, "MetaCheck@Example.Test", "CLIENT");
    const events = await prisma.auditEvent.findMany({
      where: { workspaceId: ws.id, action: "INVITE" },
    });
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.scope).toBe("WORKSPACE");
      expect(e.actorUserId).toBe(owner.id);
      expect(e.resourceType).toBe("access_token");
      expect(e.resourceId).toBe(r.invitationId);
      const blob = JSON.stringify(e);
      expect(blob).not.toContain("metacheck@example.test");
      expect(blob).not.toContain(r.delivery.rawToken);
      expect(blob).not.toContain(hashAccessToken(r.delivery.rawToken));
    }
  });

  // --- D: listing ---------------------------------------------------------------

  it("listing is owner-only, bounded, cursor-paginated, tenant-scoped", async () => {
    const { ws, session: sess } = await ownerFixture();
    const coach = await user();
    await member(ws.id, coach.id, "COACH");
    for (let i = 0; i < 30; i++) {
      await invite(sess, ws.id, `l${i}@example.test`, "CLIENT");
    }
    const first = await listWorkspaceInvitations(sess, { workspaceId: ws.id });
    expect(first.items.length).toBe(25);
    expect(first.nextCursor).not.toBeNull();
    const rest = await listWorkspaceInvitations(sess, {
      workspaceId: ws.id,
      limit: 100,
      cursor: first.nextCursor!,
    });
    expect(rest.items.length).toBe(5);
    expect(rest.items[0].status).toBe("active");
    // Minimal fields only — never hash/raw/bound user id.
    for (const item of rest.items) {
      expect(Object.keys(item).sort()).toEqual([
        "expiresAt",
        "id",
        "intendedRole",
        "status",
        "targetEmail",
      ]);
    }
    await expect(
      listWorkspaceInvitations(session(coach.id), { workspaceId: ws.id }),
    ).rejects.toThrow(AccessDeniedError);
    const other = await ownerFixture();
    const theirs = await listWorkspaceInvitations(other.session, {
      workspaceId: other.ws.id,
    });
    expect(theirs.items).toHaveLength(0);
  });

  // --- E: revocation -------------------------------------------------------------

  it("revocation is owner-only, active-only, idempotent, and audited", async () => {
    const { ws, session: sess } = await ownerFixture();
    const coach = await user();
    await member(ws.id, coach.id, "COACH");
    const r = await invite(sess, ws.id, "rev@example.test", "CLIENT");
    await expect(
      revokeWorkspaceInvitation(session(coach.id), {
        workspaceId: ws.id,
        invitationId: r.invitationId,
      }),
    ).rejects.toThrow(AccessDeniedError);
    const first = await revokeWorkspaceInvitation(sess, {
      workspaceId: ws.id,
      invitationId: r.invitationId,
    });
    expect(first.changed).toBe(true);
    // Terminal records are indistinguishable no-ops — no new audit row.
    const audits = await prisma.auditEvent.count({
      where: { workspaceId: ws.id, action: "REVOKE" },
    });
    const again = await revokeWorkspaceInvitation(sess, {
      workspaceId: ws.id,
      invitationId: r.invitationId,
    });
    expect(again.changed).toBe(false);
    const after = await prisma.auditEvent.count({
      where: { workspaceId: ws.id, action: "REVOKE" },
    });
    expect(after).toBe(audits);
    // Foreign-workspace id is a structural no-change, not a leak.
    const other = await ownerFixture();
    await expect(
      revokeWorkspaceInvitation(other.session, {
        workspaceId: other.ws.id,
        invitationId: r.invitationId,
      }),
    ).resolves.toEqual({ changed: false });
  });

  // --- F: acceptance ----------------------------------------------------------------

  async function acceptAs(
    sess: { user: { id: string } } | null,
    wsId: string,
    rawToken: string,
    extra: { name?: string; password?: string } = {},
  ) {
    return acceptWorkspaceInvitation(
      sess,
      { workspaceId: wsId, rawToken, ...extra },
      prisma,
    );
  }

  it("new CLIENT acceptance creates user, ACTIVE member, linked ClientProfile", async () => {
    const { ws, session: sess } = await ownerFixture();
    const r = await invite(sess, ws.id, "newclient@example.test", "CLIENT");
    const res = await acceptAs(null, ws.id, r.delivery.rawToken, {
      name: "New Client",
      password: PASSWORD,
    });
    expect(res.outcome).toBe("accepted");
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: res.userId },
    });
    expect(u.email).toBe("newclient@example.test");
    expect(u.status).toBe("ACTIVE");
    expect(await verifyPassword(PASSWORD, u.passwordHash)).toBe(true);
    const m = await prisma.workspaceMember.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: u.id } },
    });
    expect(m.status).toBe("ACTIVE");
    expect(m.role).toBe("CLIENT");
    const p = await prisma.clientProfile.findFirstOrThrow({
      where: { workspaceId: ws.id, userId: u.id },
    });
    expect(p.name).toBe("New Client");
    const token = await prisma.accessToken.findUniqueOrThrow({
      where: { id: r.invitationId },
    });
    expect(token.userId).toBe(u.id);
    expect(token.consumedAt).not.toBeNull();
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: {
        workspaceId: ws.id,
        action: "INVITE",
        resourceType: "access_token",
        resourceId: r.invitationId,
        meta: { path: ["acceptedAs"], equals: "NEW_USER" },
      },
    });
    expect(audit.actorUserId).toBe(u.id);
    expect((audit.meta as { acceptedAs?: string })?.acceptedAs).toBe(
      "NEW_USER",
    );
  });

  it("new COACH/ASSISTANT_COACH acceptance creates member + CoachProfile only", async () => {
    const { ws, session: sess } = await ownerFixture();
    for (const role of ["COACH", "ASSISTANT_COACH"] as const) {
      const r = await invite(sess, ws.id, `new-${role}@example.test`, role);
      const res = await acceptAs(null, ws.id, r.delivery.rawToken, {
        name: `Coach ${role}`,
        password: PASSWORD,
      });
      const m = await prisma.workspaceMember.findUniqueOrThrow({
        where: {
          workspaceId_userId: { workspaceId: ws.id, userId: res.userId },
        },
      });
      expect(m.role).toBe(role);
      expect(m.status).toBe("ACTIVE");
      const coach = await prisma.coachProfile.findUniqueOrThrow({
        where: { workspaceMemberId: m.id },
      });
      expect(coach.displayName).toBe(`Coach ${role}`);
      // Never both profile types.
      expect(
        await prisma.clientProfile.findFirst({
          where: { workspaceId: ws.id, userId: res.userId },
        }),
      ).toBeNull();
    }
  });

  it("rejects invalid password with no side effects (token stays usable)", async () => {
    const { ws, session: sess } = await ownerFixture();
    const r = await invite(sess, ws.id, "weak@example.test", "CLIENT");
    await expect(
      acceptAs(null, ws.id, r.delivery.rawToken, {
        name: "Weak",
        password: "short",
      }),
    ).rejects.toThrow("password_too_short");
    const token = await prisma.accessToken.findUniqueOrThrow({
      where: { id: r.invitationId },
    });
    expect(token.consumedAt).toBeNull();
    expect(
      await prisma.user.findUnique({ where: { email: "weak@example.test" } }),
    ).toBeNull();
    // The token still works with a valid password.
    const ok = await acceptAs(null, ws.id, r.delivery.rawToken, {
      name: "Strong",
      password: PASSWORD,
    });
    expect(ok.outcome).toBe("accepted");
  });

  it("existing-user acceptance requires the exact signed-in identity", async () => {
    const { ws, session: sess } = await ownerFixture();
    const existing = await user({ email: "exists@example.test" });
    const r = await invite(sess, ws.id, "exists@example.test", "CLIENT");
    // Forwarded link without the identity fails.
    await expect(acceptAs(null, ws.id, r.delivery.rawToken)).rejects.toThrow(
      "identity_required",
    );
    const wrong = await user();
    await expect(
      acceptAs(session(wrong.id), ws.id, r.delivery.rawToken),
    ).rejects.toThrow("identity_mismatch");
    // Correct session works — and never touches the password.
    const res = await acceptAs(
      session(existing.id),
      ws.id,
      r.delivery.rawToken,
    );
    expect(res.outcome).toBe("accepted");
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: existing.id },
    });
    expect(u.passwordHash).toBe("scrypt$fixture");
    // ClientProfile created under this workspace only.
    expect(
      await prisma.clientProfile.count({
        where: { userId: existing.id },
      }),
    ).toBe(1);
  });

  it("same user may join a second workspace without any data crossing", async () => {
    const a = await ownerFixture();
    const shared = await user({ email: "multi@example.test" });
    const r1 = await invite(a.session, a.ws.id, "multi@example.test", "CLIENT");
    await acceptAs(session(shared.id), a.ws.id, r1.delivery.rawToken);
    const b = await ownerFixture();
    const r2 = await invite(b.session, b.ws.id, "multi@example.test", "CLIENT");
    await acceptAs(session(shared.id), b.ws.id, r2.delivery.rawToken);
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: shared.id },
    });
    expect(memberships).toHaveLength(2);
    const profiles = await prisma.clientProfile.findMany({
      where: { userId: shared.id },
    });
    expect(profiles).toHaveLength(2);
    expect(new Set(profiles.map((p) => p.workspaceId)).size).toBe(2);
  });

  it("membership state machine: INVITED→ACTIVE, same-role idempotent, diff-role closed", async () => {
    const { ws, session: sess } = await ownerFixture();
    // INVITED membership transitions only through a valid invite.
    const u1 = await user({ email: "invited@example.test" });
    const m1 = await member(ws.id, u1.id, "CLIENT", "INVITED");
    const r1 = await invite(sess, ws.id, "invited@example.test", "CLIENT");
    await acceptAs(session(u1.id), ws.id, r1.delivery.rawToken);
    const m1After = await prisma.workspaceMember.findUniqueOrThrow({
      where: { id: m1.id },
    });
    expect(m1After.status).toBe("ACTIVE");
    // ACTIVE same-role is idempotent — no duplicate membership/profile.
    const u2 = await user({ email: "same@example.test" });
    await member(ws.id, u2.id, "CLIENT", "ACTIVE");
    const r2 = await invite(sess, ws.id, "same@example.test", "CLIENT");
    const res2 = await acceptAs(session(u2.id), ws.id, r2.delivery.rawToken);
    expect(res2.outcome).toBe("already_member");
    expect(
      await prisma.workspaceMember.count({
        where: { workspaceId: ws.id, userId: u2.id },
      }),
    ).toBe(1);
    // ACTIVE different role fails closed — no silent role change.
    const u3 = await user({ email: "diff@example.test" });
    await member(ws.id, u3.id, "CLIENT", "ACTIVE");
    const r3 = await invite(sess, ws.id, "diff@example.test", "COACH");
    await expect(
      acceptAs(session(u3.id), ws.id, r3.delivery.rawToken),
    ).rejects.toThrow("membership_conflict");
    const m3 = await prisma.workspaceMember.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: u3.id } },
    });
    expect(m3.role).toBe("CLIENT");
  });

  it("stale pre-suspension invite cannot restore; fresh re-invite can", async () => {
    const { ws, session: sess } = await ownerFixture();
    const u = await user({ email: "suspend@example.test" });
    await member(ws.id, u.id, "CLIENT", "ACTIVE");
    // Invite issued BEFORE the suspension — it snapshots generation 0.
    const stale = await invite(sess, ws.id, "suspend@example.test", "CLIENT");
    // Suspend via raw SQL: no app clock is involved; the DB trigger bumps
    // state_version 0 → 1 in the same statement, making the invite stale.
    await prisma.$executeRawUnsafe(
      `UPDATE "workspace_member" SET status='SUSPENDED'
       WHERE workspace_id=$1 AND user_id=$2`,
      ws.id,
      u.id,
    );
    await expect(
      acceptAs(session(u.id), ws.id, stale.delivery.rawToken),
    ).rejects.toThrow("invalid_token");
    const stillSuspended = await prisma.workspaceMember.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: u.id } },
    });
    expect(stillSuspended.status).toBe("SUSPENDED");
    // A FRESH explicit re-invitation snapshots generation 1 and restores the
    // exact intended membership.
    const fresh = await invite(sess, ws.id, "suspend@example.test", "CLIENT");
    const res = await acceptAs(session(u.id), ws.id, fresh.delivery.rawToken);
    expect(res.outcome).toBe("accepted");
    const restored = await prisma.workspaceMember.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: u.id } },
    });
    expect(restored.status).toBe("ACTIVE");
    expect(restored.role).toBe("CLIENT");
  });

  it("issuer re-authorization: guard-denied issuers invalidate outstanding invites", async () => {
    const { ws, session: sess, owner } = await ownerFixture();
    const acceptClient = (token: string) =>
      acceptAs(null, ws.id, token, { name: "V", password: PASSWORD });

    // Issuer membership removed / suspended → invalid.
    const coach = await user();
    const cm = await member(ws.id, coach.id, "COACH");
    const r1 = await invite(
      session(coach.id),
      ws.id,
      "victim1@example.test",
      "CLIENT",
    );
    await prisma.workspaceMember.update({
      where: { id: cm.id },
      data: { status: "REMOVED" },
    });
    await expect(acceptClient(r1.delivery.rawToken)).rejects.toThrow(
      "invalid_token",
    );
    await prisma.workspaceMember.update({
      where: { id: cm.id },
      data: { status: "ACTIVE" },
    });
    const r2 = await invite(
      session(coach.id),
      ws.id,
      "victim2@example.test",
      "CLIENT",
    );
    await prisma.workspaceMember.update({
      where: { id: cm.id },
      data: { status: "SUSPENDED" },
    });
    await expect(acceptClient(r2.delivery.rawToken)).rejects.toThrow(
      "invalid_token",
    );

    // Issuer User DEACTIVATED or INVITED with an ACTIVE membership → invalid.
    for (const status of ["DEACTIVATED", "INVITED"] as const) {
      const cu = await user();
      const cmx = await member(ws.id, cu.id, "WORKSPACE_OWNER");
      const rx = await invite(
        session(cu.id),
        ws.id,
        `victim-${status}@example.test`,
        "CLIENT",
      );
      await prisma.user.update({
        where: { id: cu.id },
        data: { status },
      });
      await expect(acceptClient(rx.delivery.rawToken)).rejects.toThrow(
        "invalid_token",
      );
      void cmx;
    }

    // Issuer deletion is impossible while invites are outstanding — the FK is
    // ON DELETE RESTRICT, so the guard's missing-user denial is unreachable in
    // practice; prove the FK holds and the invite still works.
    const d = await user();
    await member(ws.id, d.id, "COACH");
    const rd = await invite(
      session(d.id),
      ws.id,
      "victim-del@example.test",
      "CLIENT",
    );
    await expect(prisma.user.delete({ where: { id: d.id } })).rejects.toThrow();
    const resDel = await acceptAs(null, ws.id, rd.delivery.rawToken, {
      name: "DL",
      password: PASSWORD,
    });
    expect(resDel.outcome).toBe("accepted");

    // Role demotion: owner → coach can no longer sustain a STAFF invite.
    const staffInvite = await invite(
      sess,
      ws.id,
      "demote@example.test",
      "COACH",
    );
    await prisma.workspaceMember.update({
      where: {
        workspaceId_userId: { workspaceId: ws.id, userId: owner.id },
      },
      data: { role: "COACH" },
    });
    await expect(
      acceptAs(null, ws.id, staffInvite.delivery.rawToken, {
        name: "D",
        password: PASSWORD,
      }),
    ).rejects.toThrow("invalid_token");
    // …but the demoted owner (now COACH) can still have issued CLIENT invites.
    const clientInvite = await invite(
      session(owner.id),
      ws.id,
      "demoted-ok@example.test",
      "CLIENT",
    );
    const res = await acceptAs(null, ws.id, clientInvite.delivery.rawToken, {
      name: "Ok",
      password: PASSWORD,
    });
    expect(res.outcome).toBe("accepted");

    // Suspended workspace invalidates acceptance.
    const ws2 = await ownerFixture();
    const r3 = await invite(
      ws2.session,
      ws2.ws.id,
      "sus@example.test",
      "CLIENT",
    );
    await prisma.workspace.update({
      where: { id: ws2.ws.id },
      data: { status: "SUSPENDED" },
    });
    await expect(
      acceptAs(null, ws2.ws.id, r3.delivery.rawToken, {
        name: "S",
        password: PASSWORD,
      }),
    ).rejects.toThrow("invalid_token");
  });

  it("wrong-workspace/purpose/expired/revoked/consumed tokens fail identically", async () => {
    const { ws, session: sess } = await ownerFixture();
    const r = await invite(sess, ws.id, "cases@example.test", "CLIENT");
    const raw = r.delivery.rawToken;
    const other = await ownerFixture();
    // Wrong workspace — token exists but is constrained to the issued workspace.
    await expect(
      acceptAs(null, other.ws.id, raw, { name: "X", password: PASSWORD }),
    ).rejects.toThrow("invalid_token");
    // Malformed tokens.
    for (const bad of ["", "not-a-token", "A".repeat(200), null, 5]) {
      await expect(
        acceptWorkspaceInvitation(
          null,
          { workspaceId: ws.id, rawToken: bad },
          prisma,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({ code: "invalid_token" }),
      );
    }
    // Revoked.
    const rev = await invite(sess, ws.id, "gone@example.test", "CLIENT");
    await revokeWorkspaceInvitation(sess, {
      workspaceId: ws.id,
      invitationId: rev.invitationId,
    });
    await expect(
      acceptAs(null, ws.id, rev.delivery.rawToken, {
        name: "X",
        password: PASSWORD,
      }),
    ).rejects.toThrow("invalid_token");
    // Expired — force expiry in the past.
    const exp = await invite(sess, ws.id, "old@example.test", "CLIENT");
    await prisma.accessToken.update({
      where: { id: exp.invitationId },
      data: {
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(Date.now() - 60_000),
      },
    });
    await expect(
      acceptAs(null, ws.id, exp.delivery.rawToken, {
        name: "X",
        password: PASSWORD,
      }),
    ).rejects.toThrow("invalid_token");
    // No side effects anywhere.
    expect(
      await prisma.user.count({
        where: {
          email: {
            in: ["cases@example.test", "gone@example.test", "old@example.test"],
          },
        },
      }),
    ).toBe(0);
  });

  it("concurrent acceptance has exactly one winner", async () => {
    const { ws, session: sess } = await ownerFixture();
    const r = await invite(sess, ws.id, "single@example.test", "CLIENT");
    const [a, b] = await Promise.allSettled([
      acceptAs(null, ws.id, r.delivery.rawToken, {
        name: "One",
        password: PASSWORD,
      }),
      acceptAs(null, ws.id, r.delivery.rawToken, {
        name: "Two",
        password: PASSWORD,
      }),
    ]);
    const wins = [a, b].filter((x) => x.status === "fulfilled");
    expect(wins).toHaveLength(1);
    const losers = [a, b].filter(
      (x): x is PromiseRejectedResult => x.status === "rejected",
    );
    expect(losers).toHaveLength(1);
    expect(losers[0].reason).toBeInstanceOf(InvitationError);
    expect(["invalid_token", "serialization_conflict"]).toContain(
      (losers[0].reason as InvitationError).code,
    );
    expect(
      await prisma.user.count({ where: { email: "single@example.test" } }),
    ).toBe(1);
    expect(
      await prisma.workspaceMember.count({
        where: {
          workspaceId: ws.id,
          user: { email: "single@example.test" },
        },
      }),
    ).toBe(1);
  });

  it("structural errors never contain emails/ids/tokens/sql", async () => {
    const { ws, session: sess } = await ownerFixture();
    const r = await invite(sess, ws.id, "leak@example.test", "CLIENT");
    const cases: Array<Promise<unknown>> = [
      acceptAs(null, ws.id, r.delivery.rawToken, {
        name: "X",
        password: "short",
      }).catch((e) => e),
      acceptAs(null, ws.id, "bogus-token", {
        name: "X",
        password: PASSWORD,
      }).catch((e) => e),
    ];
    for (const result of await Promise.all(cases)) {
      const err = result as Error;
      expect(err.message).not.toContain("@");
      expect(err.message).not.toContain(r.delivery.rawToken);
      expect(err.message).not.toMatch(/[0-9a-f]{32,}/i);
      expect(err.message).not.toContain("access_token");
    }
  });

  // --- repair: causal generation -----------------------------------------------

  it("state_version is DB-owned: direct SQL can never forge or reset it", async () => {
    const { ws } = await ownerFixture();
    const u = await user();
    const m = await member(ws.id, u.id, "CLIENT", "ACTIVE");
    expect(m.stateVersion).toBe(0);
    // Direct INSERT cannot forge a generation.
    const u2 = await user();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "workspace_member"
         (id, workspace_id, user_id, role, status, state_version, created_at, updated_at)
       VALUES ($1, $2, $3, 'CLIENT', 'ACTIVE', 99, now(), now())`,
      `forged-${uid()}`,
      ws.id,
      u2.id,
    );
    const m2 = await prisma.workspaceMember.findUniqueOrThrow({
      where: {
        workspaceId_userId: { workspaceId: ws.id, userId: u2.id },
      },
    });
    expect(m2.stateVersion).toBe(0);
    // Suspend → generation 1.
    await prisma.$executeRawUnsafe(
      `UPDATE "workspace_member" SET status='SUSPENDED' WHERE id=$1`,
      m.id,
    );
    expect(
      (await prisma.workspaceMember.findUniqueOrThrow({ where: { id: m.id } }))
        .stateVersion,
    ).toBe(1);
    // A direct write trying to reset it is overridden by the trigger.
    await prisma.$executeRawUnsafe(
      `UPDATE "workspace_member" SET state_version=0 WHERE id=$1`,
      m.id,
    );
    expect(
      (await prisma.workspaceMember.findUniqueOrThrow({ where: { id: m.id } }))
        .stateVersion,
    ).toBe(1);
    // Non-state writes (updatedAt) do NOT bump the generation.
    await prisma.$executeRawUnsafe(
      `UPDATE "workspace_member" SET updated_at=now() WHERE id=$1`,
      m.id,
    );
    expect(
      (await prisma.workspaceMember.findUniqueOrThrow({ where: { id: m.id } }))
        .stateVersion,
    ).toBe(1);
  });

  it("state_version increments exactly once per status OR role transition", async () => {
    const { ws } = await ownerFixture();
    const u = await user();
    const m = await member(ws.id, u.id, "CLIENT", "ACTIVE");
    const gen = () =>
      prisma.workspaceMember
        .findUniqueOrThrow({ where: { id: m.id } })
        .then((r) => r.stateVersion);
    expect(await gen()).toBe(0);
    // status-only → +1
    await prisma.$executeRawUnsafe(
      `UPDATE "workspace_member" SET status='SUSPENDED' WHERE id=$1`,
      m.id,
    );
    expect(await gen()).toBe(1);
    // role-only → +1
    await prisma.$executeRawUnsafe(
      `UPDATE "workspace_member" SET role='SUPPORT' WHERE id=$1`,
      m.id,
    );
    expect(await gen()).toBe(2);
    // simultaneous status+role → exactly +1, not +2
    await prisma.$executeRawUnsafe(
      `UPDATE "workspace_member" SET status='REMOVED', role='CLIENT' WHERE id=$1`,
      m.id,
    );
    expect(await gen()).toBe(3);
  });

  it("a role change after issuance makes the prior invitation stale", async () => {
    const { ws, session: sess } = await ownerFixture();
    const u = await user({ email: "rolestale@example.test" });
    await member(ws.id, u.id, "CLIENT", "ACTIVE");
    // Invite snapshots the CURRENT generation (ACTIVE).
    const stale = await invite(sess, ws.id, "rolestale@example.test", "CLIENT");
    // Role-only change bumps the generation → the invite is now stale.
    await prisma.$executeRawUnsafe(
      `UPDATE "workspace_member" SET role='SUPPORT' WHERE workspace_id=$1 AND user_id=$2`,
      ws.id,
      u.id,
    );
    await expect(
      acceptAs(session(u.id), ws.id, stale.delivery.rawToken),
    ).rejects.toThrow("invalid_token");
    // The claim rolled back — token still technically live would be wrong too,
    // but the row must remain unconsumed/unbound.
    const tok = await prisma.accessToken.findUniqueOrThrow({
      where: { id: stale.invitationId },
    });
    expect(tok.consumedAt).toBeNull();
    expect(tok.userId).toBeNull();
    // A fresh post-change invitation snapshots the NEW generation —
    // verifiable directly on the token row.
    const fresh = await invite(sess, ws.id, "rolestale@example.test", "CLIENT");
    const memberNow = await prisma.workspaceMember.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: u.id } },
    });
    const freshTok = await prisma.accessToken.findUniqueOrThrow({
      where: { id: fresh.invitationId },
    });
    expect(freshTok.targetMemberStateVersion).toBe(memberNow.stateVersion);
    // …but the member is ACTIVE with a different role — acceptance fails
    // closed on the role conflict (no silent role change).
    await expect(
      acceptAs(session(u.id), ws.id, fresh.delivery.rawToken),
    ).rejects.toThrow("membership_conflict");
    // Same shape with suspension: fresh invite DOES restore.
    await prisma.$executeRawUnsafe(
      `UPDATE "workspace_member" SET status='SUSPENDED', role='CLIENT' WHERE workspace_id=$1 AND user_id=$2`,
      ws.id,
      u.id,
    );
    const fresh2 = await invite(
      sess,
      ws.id,
      "rolestale@example.test",
      "CLIENT",
    );
    const ok = await acceptAs(session(u.id), ws.id, fresh2.delivery.rawToken);
    expect(ok.outcome).toBe("accepted");
    expect(
      (
        await prisma.workspaceMember.findUniqueOrThrow({
          where: { id: memberNow.id },
        })
      ).status,
    ).toBe("ACTIVE");
  });

  it("concurrent transition vs issuance never misclassifies freshness", async () => {
    const { ws, session: sess } = await ownerFixture();
    const u = await user({ email: "racegen@example.test" });
    const m = await member(ws.id, u.id, "CLIENT", "ACTIVE");
    // Race invite issuance against a suspension. Either serialization is
    // causally correct: pre-transition snapshot → accept fails; post-transition
    // snapshot → fresh invite → accept succeeds. Never misclassified.
    const [inv] = await Promise.all([
      invite(sess, ws.id, "racegen@example.test", "CLIENT"),
      prisma.$executeRawUnsafe(
        `UPDATE "workspace_member" SET status='SUSPENDED' WHERE id=$1`,
        m.id,
      ),
    ]);
    const memberAfter = await prisma.workspaceMember.findUniqueOrThrow({
      where: { id: m.id },
    });
    const token = await prisma.accessToken.findUniqueOrThrow({
      where: { id: inv.invitationId },
    });
    const accepted = await acceptAs(session(u.id), ws.id, inv.delivery.rawToken)
      .then(() => "accepted")
      .catch((e: Error) => e.message);
    if (token.targetMemberStateVersion === memberAfter.stateVersion) {
      expect(accepted).toBe("accepted");
    } else {
      expect(accepted).toBe("invalid_token");
    }
  });

  // --- repair: profile coherence ------------------------------------------------

  it("cross-role restoration with an opposite profile fails closed", async () => {
    const { ws, session: sess } = await ownerFixture();
    // suspended COACH w/ CoachProfile accepting a CLIENT invite → conflict
    const c1 = await user({ email: "x1@example.test" });
    const m1 = await member(ws.id, c1.id, "COACH", "SUSPENDED");
    await prisma.coachProfile.create({
      data: { workspaceMemberId: m1.id, displayName: "C1" },
    });
    const r1 = await invite(sess, ws.id, "x1@example.test", "CLIENT");
    await expect(
      acceptAs(session(c1.id), ws.id, r1.delivery.rawToken),
    ).rejects.toThrow("membership_conflict");
    // Nothing mutated: member still suspended, no ClientProfile, token live.
    expect(
      (await prisma.workspaceMember.findUniqueOrThrow({ where: { id: m1.id } }))
        .status,
    ).toBe("SUSPENDED");
    expect(
      await prisma.clientProfile.findFirst({
        where: { workspaceId: ws.id, userId: c1.id },
      }),
    ).toBeNull();
    expect(
      (
        await prisma.accessToken.findUniqueOrThrow({
          where: { id: r1.invitationId },
        })
      ).consumedAt,
    ).toBeNull();

    // removed COACH w/ CoachProfile + CLIENT invite → conflict
    const c2 = await user({ email: "x2@example.test" });
    const m2 = await member(ws.id, c2.id, "COACH", "REMOVED");
    await prisma.coachProfile.create({
      data: { workspaceMemberId: m2.id, displayName: "C2" },
    });
    const r2 = await invite(sess, ws.id, "x2@example.test", "CLIENT");
    await expect(
      acceptAs(session(c2.id), ws.id, r2.delivery.rawToken),
    ).rejects.toThrow("membership_conflict");

    // suspended CLIENT w/ ClientProfile + COACH invite → conflict
    const c3 = await user({ email: "x3@example.test" });
    await member(ws.id, c3.id, "CLIENT", "SUSPENDED");
    await prisma.clientProfile.create({
      data: { workspaceId: ws.id, userId: c3.id, name: "C3" },
    });
    const r3 = await invite(sess, ws.id, "x3@example.test", "COACH");
    await expect(
      acceptAs(session(c3.id), ws.id, r3.delivery.rawToken),
    ).rejects.toThrow("membership_conflict");

    // removed CLIENT w/ ClientProfile + ASSISTANT_COACH invite → conflict
    const c4 = await user({ email: "x4@example.test" });
    await member(ws.id, c4.id, "CLIENT", "REMOVED");
    await prisma.clientProfile.create({
      data: { workspaceId: ws.id, userId: c4.id, name: "C4" },
    });
    const r4 = await invite(sess, ws.id, "x4@example.test", "ASSISTANT_COACH");
    await expect(
      acceptAs(session(c4.id), ws.id, r4.delivery.rawToken),
    ).rejects.toThrow("membership_conflict");

    // Inconsistent dual-profile state fails closed on ANY acceptance.
    const c5 = await user({ email: "x5@example.test" });
    const m5 = await member(ws.id, c5.id, "CLIENT", "SUSPENDED");
    await prisma.clientProfile.create({
      data: { workspaceId: ws.id, userId: c5.id, name: "C5" },
    });
    await prisma.coachProfile.create({
      data: { workspaceMemberId: m5.id, displayName: "C5x" },
    });
    for (const role of ["CLIENT", "COACH"] as const) {
      const r5 = await invite(sess, ws.id, "x5@example.test", role);
      await expect(
        acceptAs(session(c5.id), ws.id, r5.delivery.rawToken),
      ).rejects.toThrow("membership_conflict");
    }

    // Same-role restoration still works and reuses the profile.
    const c6 = await user({ email: "x6@example.test" });
    await member(ws.id, c6.id, "CLIENT", "SUSPENDED");
    await prisma.clientProfile.create({
      data: { workspaceId: ws.id, userId: c6.id, name: "Kept Name" },
    });
    const r6 = await invite(sess, ws.id, "x6@example.test", "CLIENT");
    const ok = await acceptAs(session(c6.id), ws.id, r6.delivery.rawToken, {
      name: "Do Not Overwrite",
    });
    expect(ok.outcome).toBe("accepted");
    const prof = await prisma.clientProfile.findFirstOrThrow({
      where: { workspaceId: ws.id, userId: c6.id },
    });
    expect(prof.name).toBe("Kept Name");
    expect(
      await prisma.coachProfile.findMany({
        where: { workspaceMember: { workspaceId: ws.id, userId: c6.id } },
      }),
    ).toHaveLength(0);
  });

  // --- repair: truthful acceptance audit ----------------------------------------

  it("acceptance audit is INVITE/access_token with a structural outcome", async () => {
    const { ws, session: sess } = await ownerFixture();
    // JOINED — existing user, no membership.
    const ju = await user({ email: "join@example.test" });
    const j = await invite(sess, ws.id, "join@example.test", "CLIENT");
    await acceptAs(session(ju.id), ws.id, j.delivery.rawToken);
    // ALREADY_MEMBER — same-role ACTIVE.
    const am = await invite(sess, ws.id, "join@example.test", "CLIENT");
    await acceptAs(session(ju.id), ws.id, am.delivery.rawToken);
    // RESTORED — suspend then fresh re-invite.
    await prisma.$executeRawUnsafe(
      `UPDATE "workspace_member" SET status='SUSPENDED' WHERE workspace_id=$1 AND user_id=$2`,
      ws.id,
      ju.id,
    );
    const rs = await invite(sess, ws.id, "join@example.test", "CLIENT");
    await acceptAs(session(ju.id), ws.id, rs.delivery.rawToken);
    // ACTIVATED — INVITED membership.
    const iu = await user({ email: "inv@example.test" });
    await member(ws.id, iu.id, "CLIENT", "INVITED");
    const iv = await invite(sess, ws.id, "inv@example.test", "CLIENT");
    await acceptAs(session(iu.id), ws.id, iv.delivery.rawToken);

    const events = await prisma.auditEvent.findMany({
      where: {
        workspaceId: ws.id,
        action: "INVITE",
        resourceType: "access_token",
      },
      orderBy: { id: "asc" },
    });
    // Issuance and acceptance share action/resourceType/resourceId — select
    // the acceptance event via its acceptedAs marker.
    const byResource = (id: string) =>
      events.find(
        (e) =>
          e.resourceId === id &&
          typeof (e.meta as { acceptedAs?: string })?.acceptedAs === "string",
      );
    expect(
      (byResource(j.invitationId)!.meta as { acceptedAs: string }).acceptedAs,
    ).toBe("JOINED");
    expect(
      (byResource(am.invitationId)!.meta as { acceptedAs: string }).acceptedAs,
    ).toBe("ALREADY_MEMBER");
    expect(
      (byResource(rs.invitationId)!.meta as { acceptedAs: string }).acceptedAs,
    ).toBe("RESTORED");
    expect(
      (byResource(iv.invitationId)!.meta as { acceptedAs: string }).acceptedAs,
    ).toBe("ACTIVATED");
    // Actor = the accepted user; no emails/tokens anywhere.
    expect(byResource(rs.invitationId)!.actorUserId).toBe(ju.id);
    const blob = JSON.stringify(events);
    expect(blob).not.toContain("join@example.test");
    expect(blob).not.toContain(j.delivery.rawToken);
  });

  it("forced audit failure rolls back the ENTIRE acceptance", async () => {
    const { ws, session: sess } = await ownerFixture();
    const r = await invite(sess, ws.id, "auditroll@example.test", "CLIENT");
    await prisma.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION f2c_audit_fail() RETURNS trigger AS $$
         BEGIN RAISE EXCEPTION 'forced'; END; $$ LANGUAGE plpgsql`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER f2c_audit_accept_fail BEFORE INSERT ON "audit_event"
         FOR EACH ROW WHEN (NEW.resource_id = '${r.invitationId}')
         EXECUTE FUNCTION f2c_audit_fail()`,
    );
    try {
      await expect(
        acceptAs(null, ws.id, r.delivery.rawToken, {
          name: "AR",
          password: PASSWORD,
        }),
      ).rejects.toThrow();
      const token = await prisma.accessToken.findUniqueOrThrow({
        where: { id: r.invitationId },
      });
      expect(token.consumedAt).toBeNull(); // claim rolled back
      expect(token.userId).toBeNull(); // binding rolled back
      expect(
        await prisma.user.findUnique({
          where: { email: "auditroll@example.test" },
        }),
      ).toBeNull();
      expect(
        await prisma.workspaceMember.findMany({
          where: {
            workspaceId: ws.id,
            user: { email: "auditroll@example.test" },
          },
        }),
      ).toHaveLength(0);
      expect(
        await prisma.clientProfile.findFirst({
          where: { workspaceId: ws.id, name: "AR" },
        }),
      ).toBeNull();
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER f2c_audit_accept_fail ON "audit_event"',
      );
    }
  });

  // --- repair: lock ordering ------------------------------------------------------

  it("authorization precedes the tuple lock; revocation during wait is caught", async () => {
    const { ws, session: sess, owner } = await ownerFixture();
    const key = `${ws.id}|lockorder@example.test|CLIENT`;
    const lockSql = "SELECT pg_advisory_xact_lock(hashtextextended($1,0))";

    // (a) Unauthorized caller rejects while the lock is held — no wait.
    let release1!: () => void;
    const held1 = prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(lockSql, key);
      await new Promise<void>((res) => {
        release1 = res;
      });
    });
    await new Promise((r) => setTimeout(r, 150));
    const denied = await invite(
      { user: { id: "no-such-user" } },
      ws.id,
      "lockorder@example.test",
      "CLIENT",
    ).then(
      () => "ok",
      (e) => e,
    );
    expect(denied).toBeInstanceOf(AccessDeniedError);
    release1();
    await held1;

    // (b) Authorized caller waits on the lock; a suspension committed during
    // the wait is detected (the member row lock forces P2034 → retry → deny).
    const held2 = prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(lockSql, key);
      await tx.$executeRawUnsafe(
        `UPDATE "workspace_member" SET status='SUSPENDED'
         WHERE workspace_id=$1 AND user_id=$2`,
        ws.id,
        owner.id,
      );
      await new Promise((r) => setTimeout(r, 300));
    });
    await new Promise((r) => setTimeout(r, 100));
    await expect(
      invite(sess, ws.id, "lockorder@example.test", "CLIENT"),
    ).rejects.toThrow(AccessDeniedError);
    await held2;
    expect(await activeTokensFor(ws.id, "lockorder@example.test")).toHaveLength(
      0,
    );
  });

  it("post-lock barrier catches every authorization-row change mid-wait", async () => {
    const lockSql = "SELECT pg_advisory_xact_lock(hashtextextended($1,0))";
    /** Holder acquires the tuple lock, applies `mutateSql`, sleeps, then
     * commits — the change becomes visible exactly when the lock releases. */
    const holdWithChange = (key: string, sql: string, args: string[]) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(lockSql, key);
        await tx.$executeRawUnsafe(sql, ...args);
        await new Promise((r) => setTimeout(r, 250));
      });

    async function raceCase(
      label: string,
      mutateSql: (ctx: { wsId: string; uid: string }) => [string, string[]],
      role: "CLIENT" | "COACH",
      actorRole: "WORKSPACE_OWNER" | "COACH" = "WORKSPACE_OWNER",
    ) {
      const { ws, session: sess, owner } = await ownerFixture();
      const actor =
        actorRole === "WORKSPACE_OWNER"
          ? owner
          : await user().then(async (u) => {
              await member(ws.id, u.id, actorRole);
              return u;
            });
      const as = session(actor.id);
      const key = `${ws.id}|${label}@example.test|${role}`;
      const [sql, args] = mutateSql({ wsId: ws.id, uid: actor.id });
      const held = holdWithChange(key, sql, args);
      await new Promise((r) => setTimeout(r, 100));
      await expect(
        invite(as, ws.id, `${label}@example.test`, role),
      ).rejects.toThrow(AccessDeniedError);
      await held;
      // Nothing committed: no token row, no audit row.
      expect(
        await prisma.accessToken.count({
          where: { workspaceId: ws.id, targetEmail: `${label}@example.test` },
        }),
      ).toBe(0);
      expect(
        await prisma.auditEvent.count({
          where: { workspaceId: ws.id, action: "INVITE" },
        }),
      ).toBe(0);
      void sess;
    }

    // 1–2. Actor User status flips during the wait.
    await raceCase(
      "wu-deact",
      ({ uid }) => [
        `UPDATE "users" SET status='DEACTIVATED' WHERE id=$1`,
        [uid],
      ],
      "CLIENT",
    );
    await raceCase(
      "wu-invited",
      ({ uid }) => [`UPDATE "users" SET status='INVITED' WHERE id=$1`, [uid]],
      "CLIENT",
    );
    // 3. Workspace suspended during the wait.
    await raceCase(
      "ws-susp",
      ({ wsId }) => [
        `UPDATE "workspace" SET status='SUSPENDED' WHERE id=$1`,
        [wsId],
      ],
      "CLIENT",
    );
    // 4. Membership suspended during the wait.
    await raceCase(
      "wm-susp",
      ({ wsId, uid }) => [
        `UPDATE "workspace_member" SET status='SUSPENDED' WHERE workspace_id=$1 AND user_id=$2`,
        [wsId, uid],
      ],
      "CLIENT",
    );
    // 5. Owner→coach demotion during a STAFF invite wait.
    await raceCase(
      "wm-demote",
      ({ wsId, uid }) => [
        `UPDATE "workspace_member" SET role='COACH' WHERE workspace_id=$1 AND user_id=$2`,
        [wsId, uid],
      ],
      "COACH",
    );
    // 6. Coach→assistant demotion during a CLIENT invite wait.
    await raceCase(
      "wm-coach-assist",
      ({ wsId, uid }) => [
        `UPDATE "workspace_member" SET role='ASSISTANT_COACH' WHERE workspace_id=$1 AND user_id=$2`,
        [wsId, uid],
      ],
      "CLIENT",
      "COACH",
    );
  });

  // --- repair: list index ---------------------------------------------------------

  it("listing uses (workspace_id,purpose,id) — index exists, no Sort node", async () => {
    const idx = await prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes
       WHERE indexname = 'access_token_ws_invite_list_idx'`,
    );
    expect(idx).toHaveLength(1);
    expect(idx[0].indexdef).toContain("workspace_id");
    expect(idx[0].indexdef).toContain("purpose");
    expect(idx[0].indexdef.replace(/\s+/g, " ")).toContain(
      "(workspace_id, purpose, id)",
    );

    // Realistic interleaved fixture, analyzed.
    const wsA = await workspace();
    const wsB = await workspace();
    const wsC = await workspace();
    const issuer = await user();
    // Skewed fixture: wsA owns only ~2% of invite rows, so the composite
    // (workspace_id, purpose, id) index beats a pkey ordering scan + filter.
    const rows = [
      ...Array.from({ length: 300 }, (_, i) => ({
        purpose: "WORKSPACE_INVITE" as const,
        tokenHash: `1${i.toString(16).padStart(7, "0")}${"a".repeat(56)}`,
        workspaceId: wsA.id,
        targetEmail: `ixa${i}@example.test`,
        intendedRole: "CLIENT" as const,
        createdByUserId: issuer.id,
        expiresAt: new Date(Date.now() + 3600_000),
      })),
      ...Array.from({ length: 12000 }, (_, i) => ({
        purpose: "WORKSPACE_INVITE" as const,
        tokenHash: `2${i.toString(16).padStart(7, "0")}${"a".repeat(56)}`,
        workspaceId: i % 2 === 0 ? wsB.id : wsC.id,
        targetEmail: `ixb${i}@example.test`,
        intendedRole: "CLIENT" as const,
        createdByUserId: issuer.id,
        expiresAt: new Date(Date.now() + 3600_000),
      })),
    ];
    await prisma.accessToken.createMany({ data: rows });
    await prisma.$executeRawUnsafe("ANALYZE access_token");
    const plan = await prisma.$queryRawUnsafe<Array<{ line: string }>>(
      `EXPLAIN (ANALYZE, BUFFERS) SELECT "id","target_email","intended_role","expires_at","consumed_at","revoked_at"
       FROM "access_token" WHERE "workspace_id" = $1 AND "purpose"='WORKSPACE_INVITE'
       ORDER BY "id" ASC LIMIT 26`,
      wsA.id,
    );
    const text = plan.map((r) => r.line ?? Object.values(r)[0]).join("\n");
    expect(text).toContain("access_token_ws_invite_list_idx");
    expect(text).not.toMatch(/Sort/);
  });

  it("all earlier raw constraints and indexes remain live", async () => {
    const checks = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
      `SELECT conname FROM pg_constraint WHERE contype='c' AND conrelid='"access_token"'::regclass`,
    );
    expect(checks.map((c) => c.conname)).toEqual(
      expect.arrayContaining([
        "access_token_invite_shape",
        "access_token_reset_shape",
        "access_token_token_hash_sha256_hex",
        "access_token_invite_member_state_shape",
      ]),
    );
    const trg = await prisma.$queryRawUnsafe<Array<{ tgname: string }>>(
      `SELECT tgname FROM pg_trigger WHERE tgname='workspace_member_state_version_guard'`,
    );
    expect(trg).toHaveLength(1);
    const idx = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes WHERE tablename='access_token'`,
    );
    expect(idx.map((i) => i.indexname)).toEqual(
      expect.arrayContaining([
        "access_token_invite_target_idx",
        "access_token_terminal_cleanup_idx",
        "access_token_ws_invite_list_idx",
      ]),
    );
  });
});
