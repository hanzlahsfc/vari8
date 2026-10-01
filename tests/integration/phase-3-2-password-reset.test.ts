import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../../lib/password";
import { hashAccessToken } from "../../lib/tokens/crypto";
import { createWorkspaceInvitation } from "../../lib/workspace/invitations";
import { requestPasswordReset } from "../../lib/auth/password-reset";
import {
  completePasswordReset,
  getResetLinkState,
  requestPasswordResetFromForm,
} from "../../lib/auth/password-reset-boundary";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const OLD_PASSWORD = "old correct horse battery staple";
const NEW_PASSWORD = "new correct horse battery staple1"; // ≥10 + digit

/**
 * Phase 3.2 — the public boundary over the reviewed S1-F2D orchestration,
 * on real PostgreSQL: non-enumerating request, safe link peek, atomic
 * consume (password + sessionVersion + audit), and the stricter setup
 * password policy applied to reset completions only.
 */
describe.skipIf(!enabled)("Phase 3.2 password-reset boundary (real PG)", () => {
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

  const uid = () => `p32${++n}_${Date.now()}`;
  // These tests exercise the ENABLED path — the capability gate is injected
  // explicitly (an env flag can never open it; see the delivery seam).
  const GATE = { deliveryAvailable: true };
  async function mkUser(
    opts: { status?: "ACTIVE" | "DEACTIVATED" | "INVITED" } = {},
  ) {
    return prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: await hashPassword(OLD_PASSWORD),
        name: `Fixture ${uid()}`,
        status: opts.status ?? "ACTIVE",
      },
    });
  }

  async function resetTokens(userId: string) {
    return prisma.accessToken.findMany({
      where: { userId, purpose: "PASSWORD_RESET" },
      orderBy: { createdAt: "asc" },
    });
  }
  async function accountAudit(userId: string) {
    return prisma.auditEvent.findMany({
      where: { scope: "ACCOUNT", subjectUserId: userId },
      orderBy: { id: "asc" },
    });
  }

  // Capture the token through the service's own delivery seam — this is
  // the only way a test (or a future mailer) ever receives a raw token.
  async function issueToken(email: string): Promise<string> {
    const payloads: { rawToken: string }[] = [];
    await requestPasswordReset(
      { email },
      { deliver: (p) => void payloads.push(p) },
      prisma,
    );
    expect(payloads).toHaveLength(1);
    return payloads[0].rawToken;
  }

  it("request returns an identical generic message for existing and missing accounts", async () => {
    const u = await mkUser();
    const existing = await requestPasswordResetFromForm(u.email, prisma, GATE);
    const missing = await requestPasswordResetFromForm(
      `ghost-${uid()}@example.test`,
      prisma,
      GATE,
    );
    expect(existing).toEqual(missing); // non-enumerating surface
    expect(existing.ok).toBe(true);
    // Existing account: one live token (hash-only), REQUESTED audit.
    const tokens = await resetTokens(u.id);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
    const audit = await accountAudit(u.id);
    expect(
      audit.map((a) => (a.meta as { resetStage?: string })?.resetStage),
    ).toEqual(["REQUESTED"]);
    // The delivery seam was invoked by the service but performs no send —
    // nothing was written that carries the token or the email body.
    const auditJson = JSON.stringify(audit);
    expect(auditJson).not.toContain(u.email.split("@")[0]);
  });

  it("request on INVITED/DEACTIVATED accounts issues nothing but answers identically", async () => {
    const u = await mkUser({ status: "DEACTIVATED" });
    const r = await requestPasswordResetFromForm(u.email, prisma, GATE);
    expect(r.ok).toBe(true);
    expect(await resetTokens(u.id)).toHaveLength(0);
    expect(await accountAudit(u.id)).toHaveLength(0);
  });

  it("getResetLinkState is non-consuming and purpose-scoped", async () => {
    const u = await mkUser();
    const rawToken = await issueToken(u.email);
    await expect(
      getResetLinkState(rawToken, prisma, { deliveryAvailable: true }),
    ).resolves.toEqual({
      state: "ready",
    });
    // Nothing consumed.
    const row = await prisma.accessToken.findUniqueOrThrow({
      where: { tokenHash: hashAccessToken(rawToken) },
    });
    expect(row.consumedAt).toBeNull();
    // Wrong purpose: a workspace-invite token is not a reset link.
    const ws = await prisma.workspace.create({
      data: { name: "w", slug: `ws-${uid()}`, status: "ACTIVE" },
    });
    const owner = await mkUser();
    await prisma.workspaceMember.create({
      data: {
        workspaceId: ws.id,
        userId: owner.id,
        role: "WORKSPACE_OWNER",
        status: "ACTIVE",
      },
    });
    const inv = await createWorkspaceInvitation(
      { user: { id: owner.id } },
      {
        workspaceId: ws.id,
        targetEmail: `${uid()}@example.test`,
        intendedRole: "CLIENT",
      },
      prisma,
    );
    await expect(
      getResetLinkState(inv.delivery.rawToken, prisma, {
        deliveryAvailable: true,
      }),
    ).resolves.toEqual({ state: "invalid" });
    await expect(
      getResetLinkState("malformed", prisma, { deliveryAvailable: true }),
    ).resolves.toEqual({
      state: "invalid",
    });
    await expect(
      getResetLinkState(undefined, prisma, { deliveryAvailable: true }),
    ).resolves.toEqual({
      state: "invalid",
    });
  });

  it("successful reset: password changed, token consumed, sv +1, audit written — all atomic", async () => {
    const u = await mkUser();
    const rawToken = await issueToken(u.email);
    const r = await completePasswordReset(
      { rawToken, password: NEW_PASSWORD },
      prisma,
      GATE,
    );
    expect(r).toEqual({ ok: true });
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: u.id },
    });
    expect(await verifyPassword(NEW_PASSWORD, after.passwordHash)).toBe(true);
    expect(await verifyPassword(OLD_PASSWORD, after.passwordHash)).toBe(false);
    expect(after.sessionVersion).toBe(u.sessionVersion + 1); // sessions revoked
    const row = await prisma.accessToken.findUniqueOrThrow({
      where: { tokenHash: hashAccessToken(rawToken) },
    });
    expect(row.consumedAt).not.toBeNull();
    const audit = await accountAudit(u.id);
    expect(
      audit.map((a) => (a.meta as { resetStage?: string })?.resetStage),
    ).toEqual(["REQUESTED", "COMPLETED"]);
    expect(
      audit.every(
        (a) =>
          a.action === "PASSWORD_RESET" &&
          a.actorUserId === null &&
          a.scope === "ACCOUNT",
      ),
    ).toBe(true);
  });

  it("short and digitless passwords fail without consuming the token", async () => {
    const u = await mkUser();
    const rawToken = await issueToken(u.email);
    for (const [password, fragment] of [
      ["short1", "at least 10 characters"],
      ["abcdefghij", "at least one digit (0–9)"],
    ] as const) {
      const r = await completePasswordReset(
        { rawToken, password },
        prisma,
        GATE,
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain(fragment);
    }
    // Token untouched — still claimable with a compliant password.
    const row = await prisma.accessToken.findUniqueOrThrow({
      where: { tokenHash: hashAccessToken(rawToken) },
    });
    expect(row.consumedAt).toBeNull();
    const ok = await completePasswordReset(
      { rawToken, password: NEW_PASSWORD },
      prisma,
      GATE,
    );
    expect(ok).toEqual({ ok: true });
  });

  it("reused, expired, revoked, malformed, and wrong-purpose tokens fail identically with no mutation", async () => {
    const u = await mkUser();
    const sv0 = u.sessionVersion;
    const INVALID = /invalid or has expired|request a new link/i;

    // Reused (consumed) token.
    const used = await issueToken(u.email);
    await completePasswordReset(
      { rawToken: used, password: NEW_PASSWORD },
      prisma,
      GATE,
    );
    const reuse = await completePasswordReset(
      { rawToken: used, password: NEW_PASSWORD },
      prisma,
      GATE,
    );
    expect(reuse.ok).toBe(false);
    if (!reuse.ok) expect(reuse.message).toMatch(INVALID);

    // Revoked: a second request revokes the first (sibling rule).
    const first = await issueToken(u.email);
    await issueToken(u.email); // revokes `first`
    const revoked = await completePasswordReset(
      { rawToken: first, password: NEW_PASSWORD },
      prisma,
      GATE,
    );
    expect(revoked.ok).toBe(false);
    if (!revoked.ok) expect(revoked.message).toMatch(INVALID);

    // Expired: backdate createdAt+expiresAt past the CHECK constraint rule.
    const expiring = await issueToken(u.email);
    const back = new Date(Date.now() - 48 * 3600_000);
    const past = new Date(Date.now() - 36 * 3600_000);
    await prisma.accessToken.update({
      where: { tokenHash: hashAccessToken(expiring) },
      data: { createdAt: back, expiresAt: past },
    });
    const expired = await completePasswordReset(
      { rawToken: expiring, password: NEW_PASSWORD },
      prisma,
      GATE,
    );
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.message).toMatch(INVALID);

    // Malformed + unknown-but-well-formed.
    for (const bogus of ["nope", `${"z".repeat(42)}Z`]) {
      const r = await completePasswordReset(
        { rawToken: bogus, password: NEW_PASSWORD },
        prisma,
        GATE,
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(INVALID);
    }

    // Wrong purpose: a live invite token cannot consume here.
    const ws = await prisma.workspace.create({
      data: { name: "w", slug: `ws-${uid()}`, status: "ACTIVE" },
    });
    const owner = await mkUser();
    await prisma.workspaceMember.create({
      data: {
        workspaceId: ws.id,
        userId: owner.id,
        role: "WORKSPACE_OWNER",
        status: "ACTIVE",
      },
    });
    const inv = await createWorkspaceInvitation(
      { user: { id: owner.id } },
      {
        workspaceId: ws.id,
        targetEmail: `${uid()}@example.test`,
        intendedRole: "CLIENT",
      },
      prisma,
    );
    const wrongPurpose = await completePasswordReset(
      { rawToken: inv.delivery.rawToken, password: NEW_PASSWORD },
      prisma,
      GATE,
    );
    expect(wrongPurpose.ok).toBe(false);
    if (!wrongPurpose.ok) expect(wrongPurpose.message).toMatch(INVALID);

    // Final state: only the legitimate consume mutated anything — sv bumped
    // exactly once (the valid reset above) and the password is NEW_PASSWORD.
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: u.id },
    });
    expect(after.sessionVersion).toBe(sv0 + 1);
    expect(await verifyPassword(NEW_PASSWORD, after.passwordHash)).toBe(true);
  });
});
