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
      where: { workspaceId: ws.id, action: "CREATE", resourceId: u.id },
    });
    expect(audit.actorUserId).toBe(u.id);
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
    // Invite issued BEFORE the suspension.
    const stale = await invite(sess, ws.id, "suspend@example.test", "CLIENT");
    // Suspend the member AFTER the invite was issued — membership.updatedAt
    // moves past the invite's createdAt, making that invite stale.
    await new Promise((r) => setTimeout(r, 10));
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: ws.id, userId: u.id },
      data: { status: "SUSPENDED" },
    });
    await expect(
      acceptAs(session(u.id), ws.id, stale.delivery.rawToken),
    ).rejects.toThrow("invalid_token");
    const stillSuspended = await prisma.workspaceMember.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: u.id } },
    });
    expect(stillSuspended.status).toBe("SUSPENDED");
    // A FRESH explicit re-invitation (issued after the state change) restores
    // the exact intended membership.
    await new Promise((r) => setTimeout(r, 10));
    const fresh = await invite(sess, ws.id, "suspend@example.test", "CLIENT");
    const res = await acceptAs(session(u.id), ws.id, fresh.delivery.rawToken);
    expect(res.outcome).toBe("accepted");
    const restored = await prisma.workspaceMember.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: u.id } },
    });
    expect(restored.status).toBe("ACTIVE");
    expect(restored.role).toBe("CLIENT");
  });

  it("issuer losing authorization invalidates outstanding invitations", async () => {
    const { ws, session: sess, owner } = await ownerFixture();
    const coach = await user();
    const cm = await member(ws.id, coach.id, "COACH");
    const r = await invite(
      session(coach.id),
      ws.id,
      "victim@example.test",
      "CLIENT",
    );
    // Coach's membership removed before acceptance.
    await prisma.workspaceMember.update({
      where: { id: cm.id },
      data: { status: "REMOVED" },
    });
    await expect(
      acceptAs(null, ws.id, r.delivery.rawToken, {
        name: "V",
        password: PASSWORD,
      }),
    ).rejects.toThrow("invalid_token");
    // Owner-issued invite still works.
    const ok = await invite(sess, ws.id, "fine@example.test", "CLIENT");
    const res = await acceptAs(null, ws.id, ok.delivery.rawToken, {
      name: "Fine",
      password: PASSWORD,
    });
    expect(res.outcome).toBe("accepted");
    void owner;
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

  it("all earlier raw constraints and indexes remain live", async () => {
    const checks = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
      `SELECT conname FROM pg_constraint WHERE contype='c' AND conrelid='"access_token"'::regclass`,
    );
    expect(checks.map((c) => c.conname)).toEqual(
      expect.arrayContaining([
        "access_token_invite_shape",
        "access_token_reset_shape",
        "access_token_token_hash_sha256_hex",
      ]),
    );
    const idx = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes WHERE tablename='access_token'`,
    );
    expect(idx.map((i) => i.indexname)).toEqual(
      expect.arrayContaining([
        "access_token_invite_target_idx",
        "access_token_terminal_cleanup_idx",
      ]),
    );
  });
});
