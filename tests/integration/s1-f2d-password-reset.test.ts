import { execFileSync } from "node:child_process";

import { encode } from "@auth/core/jwt";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth, handlers } from "../../auth";
import { authorizeCredentials } from "../../lib/credentials";
import {
  PasswordResetError,
  requestPasswordReset,
  resetPasswordWithToken,
  type ResetDeliveryPayload,
} from "../../lib/auth/password-reset";
import { hashPassword, verifyPassword } from "../../lib/password";
import { generateAccessToken, hashAccessToken } from "../../lib/tokens/crypto";
import { setTestHeaders } from "./stubs/next-headers";

/**
 * S1-F2D password-reset orchestration against real PostgreSQL — the service,
 * real Serializable transactions, real row locks, and the REAL Auth.js
 * pipeline (`auth()` + `handlers` from `../../auth`). Synthetic fixtures only.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const AUTH_SECRET = "integration-test-auth-secret-not-for-production";
const COOKIE_NAME = "authjs.session-token";
const NEW_PASSWORD = "brand new correct horse battery staple";
const OLD_PASSWORD = "old correct horse battery staple";

describe.skipIf(!enabled)(
  "S1-F2D password-reset orchestration (real PG)",
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

    const uid = () => `f2d${++n}_${Date.now()}`;
    async function mkUser(
      opts: {
        status?: "ACTIVE" | "DEACTIVATED" | "INVITED";
        password?: string;
        email?: string;
      } = {},
    ) {
      return prisma.user.create({
        data: {
          email: opts.email ?? `${uid()}@example.test`,
          passwordHash: await hashPassword(opts.password ?? OLD_PASSWORD),
          name: `Fixture ${uid()}`,
          status: opts.status ?? "ACTIVE",
        },
      });
    }

    async function activeResetTokens(userId: string) {
      return prisma.accessToken.findMany({
        where: {
          userId,
          purpose: "PASSWORD_RESET",
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
    }
    async function accountAudit(userId: string) {
      return prisma.auditEvent.findMany({
        where: { scope: "ACCOUNT", subjectUserId: userId },
        orderBy: { id: "asc" },
      });
    }
    const request = (
      email: unknown,
      opts?: {
        deliver?: (p: ResetDeliveryPayload) => void | Promise<void>;
      },
    ) =>
      requestPasswordReset(
        { email },
        { deliver: opts?.deliver ?? (() => {}) },
        prisma as never,
      );
    async function requestForToken(
      email: string,
    ): Promise<ResetDeliveryPayload> {
      const payloads: ResetDeliveryPayload[] = [];
      const r = await request(email, {
        deliver: (pl) => void payloads.push(pl),
      });
      expect(r).toEqual({ outcome: "ACCOUNT_EXISTS" });
      expect(payloads).toHaveLength(1);
      return payloads[0];
    }
    const consume = (rawToken: unknown, password: unknown = NEW_PASSWORD) =>
      resetPasswordWithToken({ rawToken, password }, prisma as never);

    // --- request ----------------------------------------------------------------

    it("malformed email → invalid_input; missing account → ACCOUNT_NOT_FOUND", async () => {
      for (const bad of [undefined, null, 42, "", "   ", {}, "@x"]) {
        await expect(request(bad)).rejects.toMatchObject({
          name: "PasswordResetError",
          code: "invalid_input",
        });
      }
      expect(await request(`ghost-${uid()}@example.test`)).toEqual({
        outcome: "ACCOUNT_NOT_FOUND",
      });
    });

    it("ACTIVE user → ACCOUNT_EXISTS + exactly one delivery payload + 12h expiry", async () => {
      const u = await mkUser();
      const payloads: ResetDeliveryPayload[] = [];
      const r = await request(`  ${u.email.toUpperCase()}  `, {
        deliver: (pl) => void payloads.push(pl),
      });
      // Public result carries existence ONLY — never a delivery property.
      expect(r).toEqual({ outcome: "ACCOUNT_EXISTS" });
      expect(Object.keys(r)).toEqual(["outcome"]);
      expect(payloads).toHaveLength(1);
      const delivery = payloads[0];
      expect(delivery.kind).toBe("password_reset");
      expect(delivery.to).toBe(u.email);
      expect(delivery.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      // Exactly 12h (shared ACCESS_TOKEN_TTL_MS), within a small skew.
      const delta = delivery.expiresAt.getTime() - Date.now();
      expect(delta).toBeGreaterThan(12 * 3600_000 - 60_000);
      expect(delta).toBeLessThanOrEqual(12 * 3600_000);
      const tokens = await activeResetTokens(u.id);
      expect(tokens).toHaveLength(1);
      // Hash-only persistence: the raw token never appears in any column.
      const row = tokens[0];
      expect(row.tokenHash).toBe(hashAccessToken(delivery.rawToken));
      expect(JSON.stringify(row)).not.toContain(delivery.rawToken);

      const audit = await accountAudit(u.id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        action: "PASSWORD_RESET",
        resourceType: "access_token",
        resourceId: row.id,
        actorUserId: null,
        workspaceId: null,
        subjectUserId: u.id,
      });
      expect(audit[0].meta).toEqual({ resetStage: "REQUESTED" });
    });

    it("INVITED and DEACTIVATED accounts → ACCOUNT_EXISTS, no token/audit", async () => {
      for (const status of ["INVITED", "DEACTIVATED"] as const) {
        const u = await mkUser({ status });
        let called = 0;
        const r = await request(u.email, { deliver: () => void called++ });
        expect(r).toEqual({ outcome: "ACCOUNT_EXISTS" });
        expect(called).toBe(0);
        expect(await activeResetTokens(u.id)).toHaveLength(0);
        expect(await accountAudit(u.id)).toHaveLength(0);
      }
    });

    it("replacement revokes only that user's outstanding tokens", async () => {
      const a = await mkUser();
      const b = await mkUser();
      const r1 = await requestForToken(a.email);
      const rb = await requestForToken(b.email);
      const r2 = await requestForToken(a.email);
      const aTokens = await prisma.accessToken.findMany({
        where: { userId: a.id, purpose: "PASSWORD_RESET" },
        orderBy: { createdAt: "asc" },
      });
      expect(aTokens).toHaveLength(2);
      expect(aTokens[0].revokedAt).not.toBeNull();
      expect(aTokens[1].revokedAt).toBeNull();
      // b's token untouched; the stale a token can no longer consume.
      expect(await activeResetTokens(b.id)).toHaveLength(1);
      await expect(consume(r1.rawToken)).rejects.toMatchObject({
        code: "invalid_token",
      });
      expect((await consume(r2.rawToken)).changed).toBe(true);
      void rb;
    });

    it("concurrent requests leave exactly one active token", async () => {
      const u = await mkUser();
      let delivered = 0;
      const sink = { deliver: () => void delivered++ };
      const results = await Promise.all([
        request(u.email, sink),
        request(u.email, sink),
        request(u.email, sink),
      ]);
      for (const r of results) expect(r).toEqual({ outcome: "ACCOUNT_EXISTS" });
      expect(delivered).toBeGreaterThanOrEqual(1);
      expect(await activeResetTokens(u.id)).toHaveLength(1);
    });

    it("repeated 3-way and 8-way bursts: one active token, zero rejections", async () => {
      // Regression for the availability finding: 8-way bursts previously
      // produced serialization_conflict on 48/80 operations.
      for (let burst = 0; burst < 10; burst++) {
        const u = await mkUser();
        const fanout = burst % 2 === 0 ? 8 : 3;
        const results = await Promise.allSettled(
          Array.from({ length: fanout }, () => request(u.email)),
        );
        for (const r of results) {
          expect(r.status, JSON.stringify(r)).toBe("fulfilled");
          if (r.status === "fulfilled")
            expect(r.value).toEqual({ outcome: "ACCOUNT_EXISTS" });
        }
        expect(await activeResetTokens(u.id)).toHaveLength(1);
      }
    });

    it("user deactivated mid-request fails closed — no token issued", async () => {
      const u = await mkUser();
      // Holder locks the user row, deactivates, sleeps, then commits — the
      // change publishes exactly when the row lock releases.
      const holder = prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE "users" SET status='DEACTIVATED' WHERE id=$1`,
          u.id,
        );
        await new Promise((r) => setTimeout(r, 300));
      });
      await new Promise((r) => setTimeout(r, 120));
      const r = await request(u.email);
      await holder;
      // The request's FOR UPDATE collided with the committed change → retry →
      // the fresh snapshot sees DEACTIVATED → ACCOUNT_EXISTS, no delivery.
      expect(r).toEqual({ outcome: "ACCOUNT_EXISTS" });
      expect(await prisma.accessToken.count({ where: { userId: u.id } })).toBe(
        0,
      );
    });

    it("audit failure rolls back revocation — prior token survives", async () => {
      const u = await mkUser();
      const r1 = await requestForToken(u.email);
      const first = (
        await prisma.accessToken.findMany({
          where: { userId: u.id },
        })
      )[0];
      // Force audit failure inside a transaction proxy: auditEvent.create throws.
      const bad = new Proxy(prisma, {
        get(target, prop) {
          if (prop === "$transaction")
            return (fn: (t: unknown) => Promise<unknown>, opts?: unknown) =>
              target.$transaction(
                (tx) =>
                  fn(
                    new Proxy(tx, {
                      get(t, p) {
                        if (p === "auditEvent")
                          return {
                            create: async () => {
                              throw Object.assign(new Error("forced"), {
                                code: "P2025",
                              });
                            },
                          };
                        return t[p as keyof typeof t];
                      },
                    }),
                  ),
                opts as never,
              );
          return target[prop as keyof typeof target];
        },
      });
      await expect(
        requestPasswordReset(
          { email: u.email },
          { deliver: () => {} },
          bad as never,
        ),
      ).rejects.toMatchObject({ name: "AuditError" });
      const row = await prisma.accessToken.findUniqueOrThrow({
        where: { id: first.id },
      });
      expect(row.revokedAt).toBeNull();
      expect(row.consumedAt).toBeNull();
      void r1;
    });

    // --- consume ----------------------------------------------------------------

    it("valid token: password changes, sv +1, siblings revoked, audit written", async () => {
      const u = await mkUser();
      const r1 = await requestForToken(u.email);
      const r2 = await requestForToken(u.email); // r1 revoked (sibling)
      const res = await consume(r2.rawToken);
      expect(res.changed).toBe(true);
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: u.id },
      });
      expect(after.sessionVersion).toBe(u.sessionVersion + 1);
      expect(await verifyPassword(NEW_PASSWORD, after.passwordHash)).toBe(true);
      expect(await verifyPassword(OLD_PASSWORD, after.passwordHash)).toBe(
        false,
      );
      expect(await activeResetTokens(u.id)).toHaveLength(0);
      const audit = await accountAudit(u.id);
      const completed = audit.filter(
        (a) => (a.meta as { resetStage?: string })?.resetStage === "COMPLETED",
      );
      expect(completed).toHaveLength(1);
      expect(completed[0]).toMatchObject({
        action: "PASSWORD_RESET",
        resourceType: "access_token",
        actorUserId: null,
        actorRole: null,
        workspaceId: null,
        subjectUserId: u.id,
      });
      // Consumed token cannot be reused.
      await expect(consume(r2.rawToken)).rejects.toMatchObject({
        code: "invalid_token",
      });
      void r1;
    });

    it("expired / wrong-purpose / malformed tokens share invalid_token", async () => {
      const u = await mkUser();
      // wrong purpose: a hand-made WORKSPACE_INVITE token
      const inv = generateAccessToken();
      await prisma.accessToken.create({
        data: {
          purpose: "WORKSPACE_INVITE",
          tokenHash: inv.tokenHash,
          workspaceId: (
            await prisma.workspace.create({
              data: { name: "w", slug: `ws-${uid()}` },
            })
          ).id,
          targetEmail: u.email,
          intendedRole: "CLIENT",
          createdByUserId: u.id,
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
      // expired reset token
      const exp = generateAccessToken();
      await prisma.accessToken.create({
        data: {
          purpose: "PASSWORD_RESET",
          tokenHash: exp.tokenHash,
          userId: u.id,
          createdAt: new Date(Date.now() - 48 * 3600_000),
          expiresAt: new Date(Date.now() - 36 * 3600_000),
        },
      });
      for (const tok of [
        undefined,
        null,
        42,
        "",
        "not-a-token",
        inv.rawToken,
        exp.rawToken,
        generateAccessToken().rawToken, // well-formed but unknown
      ]) {
        const e = await consume(tok).then(
          () => "ok",
          (x) => x,
        );
        expect(e).toMatchObject({
          name: "PasswordResetError",
          code: "invalid_token",
        });
      }
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: u.id },
      });
      expect(after.sessionVersion).toBe(u.sessionVersion);
      expect(await verifyPassword(OLD_PASSWORD, after.passwordHash)).toBe(true);
    });

    it("non-ACTIVE / missing user fails closed with zero mutation", async () => {
      const u = await mkUser({ status: "DEACTIVATED" });
      // Plant an active reset token directly (as if issued before deactivation).
      const tok = generateAccessToken();
      await prisma.accessToken.create({
        data: {
          purpose: "PASSWORD_RESET",
          tokenHash: tok.tokenHash,
          userId: u.id,
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
      await expect(consume(tok.rawToken)).rejects.toMatchObject({
        code: "invalid_token",
      });
      const row = await prisma.accessToken.findFirstOrThrow({
        where: { tokenHash: tok.tokenHash },
      });
      expect(row.consumedAt).toBeNull(); // claim rolled back
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: u.id },
      });
      expect(after.sessionVersion).toBe(u.sessionVersion);
    });

    it("password-policy failure never consumes the token", async () => {
      const u = await mkUser();
      const d = await requestForToken(u.email);
      await expect(consume(d.rawToken, "short")).rejects.toMatchObject({
        name: "PasswordPolicyError",
        code: "password_too_short",
      });
      // Token still valid — a corrected password succeeds.
      expect((await consume(d.rawToken)).changed).toBe(true);
    });

    it("concurrent same-token consumes: exactly one winner", async () => {
      const u = await mkUser();
      const d = await requestForToken(u.email);
      const results = await Promise.allSettled([
        consume(d.rawToken),
        consume(d.rawToken),
      ]);
      const wins = results.filter(
        (x) => x.status === "fulfilled" && x.value.changed,
      ).length;
      expect(wins).toBe(1);
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: u.id },
      });
      expect(after.sessionVersion).toBe(u.sessionVersion + 1);
    });

    it("concurrent sibling-token consumes: at most one reset", async () => {
      const u = await mkUser();
      const t1 = generateAccessToken();
      const t2 = generateAccessToken();
      for (const t of [t1, t2]) {
        await prisma.accessToken.create({
          data: {
            purpose: "PASSWORD_RESET",
            tokenHash: t.tokenHash,
            userId: u.id,
            expiresAt: new Date(Date.now() + 3600_000),
          },
        });
      }
      const results = await Promise.allSettled([
        consume(t1.rawToken, "password one for t1"),
        consume(t2.rawToken, "password two for t2"),
      ]);
      const wins = results.filter(
        (x) => x.status === "fulfilled" && x.value.changed,
      ).length;
      expect(wins).toBe(1);
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: u.id },
      });
      expect(after.sessionVersion).toBe(u.sessionVersion + 1);
    });

    it("no token/password/email/hash canaries in audit, errors, or output", async () => {
      const u = await mkUser({ password: "canary-old-passphrase-1" });
      const d = await requestForToken(u.email);
      const raw = d.rawToken;
      const hash = hashAccessToken(raw);
      const canaries = [raw, hash, u.email, NEW_PASSWORD, "canary-old"];
      const res = await consume(raw);
      // returned result shape
      const resJson = JSON.stringify(res);
      for (const c of canaries) expect(resJson).not.toContain(c);
      // audit rows
      for (const a of await accountAudit(u.id)) {
        const j = JSON.stringify(a);
        for (const c of canaries) expect(j).not.toContain(c);
      }
      // error surfaces
      const e = await consume(raw).then(
        () => "",
        (x) => JSON.stringify(x) + String(x) + (x?.stack ?? ""),
      );
      for (const c of canaries) expect(e).not.toContain(c);
    });

    // --- Auth.js runtime ----------------------------------------------------------

    async function sessionJwtCookie(claims: Record<string, unknown>) {
      const jwt = await encode({
        token: { iat: Math.floor(Date.now() / 1000), ...claims } as never,
        secret: AUTH_SECRET,
        salt: COOKIE_NAME,
        maxAge: 30 * 24 * 60 * 60,
      });
      return `${COOKIE_NAME}=${jwt}`;
    }
    async function authForCookie(cookie: string) {
      setTestHeaders(
        new Headers({
          cookie,
          host: "localhost",
          "x-forwarded-proto": "http",
        }),
      );
      return auth();
    }
    const lookup = (email: string) =>
      prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
          status: true,
          sessionVersion: true,
        },
      });

    it("consume invalidates the real Auth.js session; new password signs in", async () => {
      const u = await mkUser({ password: OLD_PASSWORD });
      // Real sign-in path before reset.
      const pre = await authorizeCredentials(
        { email: u.email, password: OLD_PASSWORD },
        lookup,
      );
      expect(pre?.id).toBe(u.id);
      const staleCookie = await sessionJwtCookie({ sub: u.id, sv: 0 });
      expect((await authForCookie(staleCookie))?.user?.id).toBe(u.id);

      const d = await requestForToken(u.email);
      await consume(d.rawToken);

      // Old session dead through the real jwt-callback gate.
      await expect(authForCookie(staleCookie)).resolves.toBeNull();
      const res = await handlers.GET(
        new NextRequest("http://localhost/api/auth/session", {
          headers: { cookie: staleCookie },
        }),
      );
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toBeNull();
      expect(
        res.headers
          .getSetCookie()
          .some(
            (c) =>
              c.startsWith(`${COOKIE_NAME}=`) &&
              /(Max-Age=0|Expires=Thu, 01 Jan 1970|expires=Thu, 01 Jan 1970)/i.test(
                c,
              ),
          ),
      ).toBe(true);

      // Old password fails generically; new password succeeds and carries sv=1.
      await expect(
        authorizeCredentials(
          { email: u.email, password: OLD_PASSWORD },
          lookup,
        ),
      ).resolves.toBeNull();
      const fresh = await authorizeCredentials(
        { email: u.email, password: NEW_PASSWORD },
        lookup,
      );
      expect(fresh?.id).toBe(u.id);
      expect(fresh?.sessionVersion).toBe(1);
      const freshCookie = await sessionJwtCookie({
        sub: u.id,
        sv: fresh!.sessionVersion,
      });
      expect((await authForCookie(freshCookie))?.user?.id).toBe(u.id);

      // Real CSRF-gated session update cannot resurrect the stale session.
      const csrfRes = await handlers.GET(
        new NextRequest("http://localhost/api/auth/csrf"),
      );
      expect(csrfRes.status).toBe(200);
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
      const csrfCookie = csrfRes.headers
        .getSetCookie()
        .find((c) => c.includes("csrf-token"));
      expect(csrfCookie).toBeTruthy();
      const up = await handlers.POST(
        new NextRequest("http://localhost/api/auth/session", {
          method: "POST",
          headers: {
            cookie: `${staleCookie}; ${csrfCookie!.split(";")[0]}`,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: `csrfToken=${encodeURIComponent(csrfToken)}&data=${encodeURIComponent(JSON.stringify({ sv: 1 }))}`,
        }),
      );
      expect(up.status).toBe(200);
      await expect(up.json()).resolves.toBeNull();
      expect(
        up.headers
          .getSetCookie()
          .some(
            (c) =>
              c.startsWith(`${COOKIE_NAME}=`) &&
              /(Max-Age=0|Expires=Thu, 01 Jan 1970|expires=Thu, 01 Jan 1970)/i.test(
                c,
              ),
          ),
      ).toBe(true);
      await expect(authForCookie(staleCookie)).resolves.toBeNull();
    });

    // --- exposure -----------------------------------------------------------------

    it("exposure assertion fails closed; no app import exists", async () => {
      const { assertPasswordResetOrchestrationExternallyExposable } =
        await import("../../lib/auth/password-reset");
      expect(() =>
        assertPasswordResetOrchestrationExternallyExposable(),
      ).toThrow(PasswordResetError);
      expect(() =>
        assertPasswordResetOrchestrationExternallyExposable(),
      ).toThrow("resets_not_exposable");
    });
  },
);
