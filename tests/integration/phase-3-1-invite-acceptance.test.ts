import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { verifyPassword } from "../../lib/password";
import { createWorkspaceInvitation } from "../../lib/workspace/invitations";
import {
  acceptInvitationFromLink,
  getInviteLinkState,
} from "../../lib/workspace/invite-acceptance";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

describe.skipIf(!enabled)(
  "Phase 3.1 invite acceptance boundary (real PG)",
  () => {
    let prisma: PrismaClient;
    let n = 0;

    beforeAll(async () => {
      execFileSync("npx", ["prisma", "migrate", "deploy"], {
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: url as string },
      });
      prisma = new PrismaClient({
        datasources: { db: { url: url as string } },
      });
      await prisma.$executeRawUnsafe(
        'TRUNCATE "audit_event","coach_profile","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
      );
    });
    afterAll(async () => {
      await prisma?.$disconnect();
    });

    const uid = () => `p31${++n}_${Date.now()}`;

    async function ownerFixture() {
      const ws = await prisma.workspace.create({
        data: { name: `w${n}`, slug: `ws-${uid()}`, status: "ACTIVE" },
      });
      const owner = await prisma.user.create({
        data: {
          email: `${uid()}@example.test`,
          passwordHash: "scrypt$fixture",
          name: `Owner ${n}`,
          status: "ACTIVE",
        },
      });
      await prisma.workspaceMember.create({
        data: {
          workspaceId: ws.id,
          userId: owner.id,
          role: "WORKSPACE_OWNER",
          status: "ACTIVE",
        },
      });
      return { ws, session: { user: { id: owner.id } } };
    }

    const invite = (
      sess: { user: { id: string } },
      workspaceId: string,
      targetEmail: string,
      intendedRole: "COACH" | "ASSISTANT_COACH" | "CLIENT" = "CLIENT",
    ) =>
      createWorkspaceInvitation(
        sess,
        { workspaceId, targetEmail, intendedRole },
        prisma,
      );

    it("peeks state without consuming; form state is ready only for active invites", async () => {
      const { ws, session } = await ownerFixture();
      const r = await invite(session, ws.id, `${uid()}@example.test`);
      await expect(
        getInviteLinkState(
          { workspaceId: ws.id, rawToken: r.delivery.rawToken },
          prisma,
        ),
      ).resolves.toEqual({ state: "ready" });
      // Peek consumed nothing — the token still claims cleanly.
      const row = await prisma.accessToken.findUniqueOrThrow({
        where: { id: r.invitationId },
      });
      expect(row.consumedAt).toBeNull();
    });

    it("returns invalid for consumed, revoked, expired, wrong-purpose, malformed", async () => {
      const { ws, session } = await ownerFixture();

      // Consumed: complete an acceptance, then peek again.
      const consumed = await invite(session, ws.id, `${uid()}@example.test`);
      await acceptInvitationFromLink(null, {
        workspaceId: ws.id,
        rawToken: consumed.delivery.rawToken,
        name: "Done",
        password: "valid-passw0rd",
      });
      await expect(
        getInviteLinkState(
          { workspaceId: ws.id, rawToken: consumed.delivery.rawToken },
          prisma,
        ),
      ).resolves.toEqual({ state: "invalid" });

      // Revoked.
      const revoked = await invite(session, ws.id, `${uid()}@example.test`);
      await prisma.accessToken.update({
        where: { id: revoked.invitationId },
        data: { revokedAt: new Date() },
      });
      await expect(
        getInviteLinkState(
          { workspaceId: ws.id, rawToken: revoked.delivery.rawToken },
          prisma,
        ),
      ).resolves.toEqual({ state: "invalid" });

      // Expired (the access_token_expiry_after_creation CHECK requires
      // expires_at > created_at — move both into the past).
      const expired = await invite(session, ws.id, `${uid()}@example.test`);
      await prisma.accessToken.update({
        where: { id: expired.invitationId },
        data: {
          createdAt: new Date(Date.now() - 13 * 3600_000),
          expiresAt: new Date(Date.now() - 3600_000),
        },
      });
      await expect(
        getInviteLinkState(
          { workspaceId: ws.id, rawToken: expired.delivery.rawToken },
          prisma,
        ),
      ).resolves.toEqual({ state: "invalid" });

      // Wrong purpose: a PASSWORD_RESET token is not an invite link.
      const resetUser = await prisma.user.create({
        data: {
          email: `${uid()}@example.test`,
          passwordHash: "scrypt$fixture",
          status: "ACTIVE",
        },
      });
      const { rawToken: resetRaw } = await prisma.$transaction(async (tx) => {
        const { issuePasswordResetToken } =
          await import("../../lib/tokens/store");
        return issuePasswordResetToken(tx, { userId: resetUser.id });
      });
      await expect(
        getInviteLinkState({ workspaceId: ws.id, rawToken: resetRaw }, prisma),
      ).resolves.toEqual({ state: "invalid" });

      // Malformed / missing.
      await expect(
        getInviteLinkState({ workspaceId: ws.id, rawToken: "bogus" }, prisma),
      ).resolves.toEqual({ state: "invalid" });
      await expect(
        getInviteLinkState(
          { workspaceId: "", rawToken: `${"a".repeat(42)}A` },
          prisma,
        ),
      ).resolves.toEqual({ state: "invalid" });
    });

    it("accepts a new user through the boundary and returns {ok:true}", async () => {
      const { ws, session } = await ownerFixture();
      const email = `${uid()}@example.test`;
      const r = await invite(session, ws.id, email);
      const res = await acceptInvitationFromLink(
        null,
        {
          workspaceId: ws.id,
          rawToken: r.delivery.rawToken,
          name: "Invited User",
          password: "member-passw0rd",
        },
        prisma,
      );
      expect(res).toEqual({ ok: true });
      const u = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(await verifyPassword("member-passw0rd", u.passwordHash)).toBe(
        true,
      );
      const m = await prisma.workspaceMember.findUniqueOrThrow({
        where: { workspaceId_userId: { workspaceId: ws.id, userId: u.id } },
      });
      expect(m.role).toBe("CLIENT");
      // Acceptance audit event exists (the INVITE issue event also uses this
      // resourceId — distinguish via the acceptedAs meta).
      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: {
          workspaceId: ws.id,
          action: "INVITE",
          resourceId: r.invitationId,
          meta: { path: ["acceptedAs"], equals: "NEW_USER" },
        },
      });
      expect(audit.actorUserId).toBe(u.id);
    });

    it("maps policy failures to safe copy and leaves no partial state", async () => {
      const { ws, session } = await ownerFixture();
      const email = `${uid()}@example.test`;
      const r = await invite(session, ws.id, email);

      for (const [password, fragment] of [
        ["short", "at least 10 characters"],
        ["abcdefghij", "at least one digit (0–9)"],
      ] as const) {
        const res = await acceptInvitationFromLink(
          null,
          {
            workspaceId: ws.id,
            rawToken: r.delivery.rawToken,
            name: "Invited",
            password,
          },
          prisma,
        );
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.message).toContain(fragment);
      }
      // No partial state: no user, no member, token still claimable.
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
      const token = await prisma.accessToken.findUniqueOrThrow({
        where: { id: r.invitationId },
      });
      expect(token.consumedAt).toBeNull();
      await expect(
        getInviteLinkState(
          { workspaceId: ws.id, rawToken: r.delivery.rawToken },
          prisma,
        ),
      ).resolves.toEqual({ state: "ready" });
    });

    it("maps token failures to one safe message and mutates nothing", async () => {
      const { ws, session } = await ownerFixture();
      const bad = await invite(session, ws.id, `${uid()}@example.test`);
      const res = await acceptInvitationFromLink(
        null,
        {
          workspaceId: ws.id,
          rawToken: "bogus-token",
          name: "X",
          password: "valid-passw0rd",
        },
        prisma,
      );
      expect(res.ok).toBe(false);
      if (!res.ok)
        expect(res.message).toMatch(/invalid or has already been used/);
      // Second failure mode: workspace mismatch.
      const res2 = await acceptInvitationFromLink(
        null,
        {
          workspaceId: "nonexistent-ws",
          rawToken: bad.delivery.rawToken,
          name: "X",
          password: "valid-passw0rd",
        },
        prisma,
      );
      expect(res2.ok).toBe(false);
      if (!res2.ok)
        expect(res2.message).toMatch(/invalid or has already been used/);
      // The genuine token remains usable.
      const token = await prisma.accessToken.findUniqueOrThrow({
        where: { id: bad.invitationId },
      });
      expect(token.consumedAt).toBeNull();
    });

    it("existing-account anonymous accept → identity_required guidance; wrong session → mismatch", async () => {
      const { ws, session } = await ownerFixture();
      const existing = await prisma.user.create({
        data: {
          email: `${uid()}@example.test`,
          passwordHash: "scrypt$fixture",
          name: "Existing",
          status: "ACTIVE",
        },
      });
      const r = await invite(session, ws.id, existing.email, "CLIENT");

      const anonymous = await acceptInvitationFromLink(
        null,
        { workspaceId: ws.id, rawToken: r.delivery.rawToken },
        prisma,
      );
      expect(anonymous.ok).toBe(false);
      if (!anonymous.ok) expect(anonymous.message).toMatch(/[Ss]ign in/);

      const other = await prisma.user.create({
        data: {
          email: `${uid()}@example.test`,
          passwordHash: "scrypt$fixture",
          status: "ACTIVE",
        },
      });
      const wrong = await acceptInvitationFromLink(
        { user: { id: other.id } },
        { workspaceId: ws.id, rawToken: r.delivery.rawToken },
        prisma,
      );
      expect(wrong.ok).toBe(false);
      if (!wrong.ok) expect(wrong.message).toMatch(/different account/);

      // Correct session accepts — with explicit null name/password (the
      // FormData.get shape for absent fields), which the boundary must
      // normalize to `undefined` before the service sees them.
      const ok = await acceptInvitationFromLink(
        { user: { id: existing.id } },
        {
          workspaceId: ws.id,
          rawToken: r.delivery.rawToken,
          name: null,
          password: null,
        },
        prisma,
      );
      expect(ok).toEqual({ ok: true });
    });
  },
);
