import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { GET } from "../../app/api/v1/workspaces/[workspaceId]/session/route";
import { assertAuthSecretConfigured, auth } from "../../lib/auth/server";
import { RateLimitExceededError } from "../../lib/auth/rate-limit";
import { signUpCoachAccount } from "../../lib/auth/signup";
import { prisma as sharedPrisma } from "../../lib/db";
import { normalizeEmail } from "../../lib/email";
import { hashPassword } from "../../lib/password";
import { issueWorkspaceInviteToken } from "../../lib/tokens/store";
import { getInviteLinkState } from "../../lib/workspace/invite-acceptance";
import { listWorkspaceClientRoster } from "../../lib/workspace/roster";

/**
 * PR-05 fix pass 1 — live regression probes for the security findings.
 * Every case here fails on the fix baseline (e68a2ef) and passes on head:
 * each exercises the real Better Auth pipeline (auth.api / auth.handler),
 * the real prisma client, and the shared rate_limit store.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";
const PASSWORD = "fixture-pass-1";

const sha256b64 = (s: string) =>
  createHash("sha256").update(s).digest("base64url");

describe.skipIf(!enabled)("PR-05 security fixes (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;
  const mailboxDir = mkdtempSync(path.join(tmpdir(), "pr05-mail-"));
  const mailbox = path.join(mailboxDir, "mailbox.jsonl");

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const tag = () => `fx1_${++n}_${Date.now()}`;

  async function createUser(
    status: "ACTIVE" | "DEACTIVATED" = "ACTIVE",
  ): Promise<{ id: string; email: string }> {
    const t = tag();
    const email = `${t}@example.test`;
    const user = await prisma.user.create({
      data: { email, name: t, passwordHash: "fixture", status },
    });
    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: await hashPassword(PASSWORD),
      },
    });
    return { id: user.id, email };
  }

  async function signIn(email: string, password = PASSWORD) {
    return auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
    );
  }

  async function signInToken(email: string): Promise<string> {
    const res = await signIn(email);
    expect(res.status).toBe(200);
    const token = res.headers.get("set-auth-token");
    expect(token).toBeTruthy();
    return token as string;
  }

  function authedHeaders(token: string): Headers {
    return new Headers({
      cookie: `better-auth.session_token=${token}`,
      authorization: `Bearer ${token}`,
    });
  }

  function mailboxTokens(): string[] {
    let lines: string[];
    try {
      lines = readFileSync(mailbox, "utf8").trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
    return lines
      .map((line) => JSON.parse(line).text as string)
      .map((text) => /\/reset\?token=([^\s]+)/.exec(text)?.[1])
      .filter((t): t is string => typeof t === "string");
  }

  async function requestReset(email: string, request?: Request) {
    process.env.DEV_MAILBOX_FILE = mailbox;
    return auth.api.requestPasswordReset({
      body: { email },
      headers: request?.headers ?? new Headers(),
      request,
    });
  }

  describe("F3/F5 — verification identifiers stored hashed only", () => {
    it("stores only the digest of the mailed token; the token works once", async () => {
      const { id, email } = await createUser();
      await requestReset(email);
      const [rawToken] = mailboxTokens().slice(-1);
      expect(rawToken).toBeTruthy();

      const rows = await prisma.verification.findMany({
        where: { value: id },
      });
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.identifier).not.toContain(rawToken);
        expect(row.identifier).toBe(sha256b64(`reset-password:${rawToken}`));
      }

      // The mailed token completes the reset exactly once.
      const res = await auth.api.resetPassword({
        body: { token: rawToken, newPassword: "new-pass-1234" },
        headers: new Headers(),
      });
      expect(res).toMatchObject({ status: true });
      await expect(
        auth.api.resetPassword({
          body: { token: rawToken, newPassword: "new-pass-9999" },
          headers: new Headers(),
        }),
      ).rejects.toMatchObject({ status: "BAD_REQUEST" });
    });
  });

  describe("F6/F7 — superseded reset tokens + post-reset cleanup", () => {
    it("a second request invalidates the first token", async () => {
      const { email } = await createUser();
      await requestReset(email);
      const [first] = mailboxTokens().slice(-1);
      await requestReset(email);
      const [second] = mailboxTokens().slice(-1);
      expect(first).not.toBe(second);

      await expect(
        auth.api.resetPassword({
          body: { token: first, newPassword: "new-pass-1234" },
          headers: new Headers(),
        }),
      ).rejects.toMatchObject({
        status: "BAD_REQUEST",
        body: expect.objectContaining({ code: "INVALID_TOKEN" }),
      });
      await expect(
        auth.api.resetPassword({
          body: { token: second, newPassword: "new-pass-1234" },
          headers: new Headers(),
        }),
      ).resolves.toMatchObject({ status: true });
    });

    it("a completed reset deletes every outstanding reset row for the user", async () => {
      const { id, email } = await createUser();
      await requestReset(email);
      const [token] = mailboxTokens().slice(-1);
      await auth.api.resetPassword({
        body: { token, newPassword: "new-pass-1234" },
        headers: new Headers(),
      });
      expect(await prisma.verification.count({ where: { value: id } })).toBe(0);
      // All sessions revoked, old password dead, new password live.
      await expect(signIn(email, PASSWORD)).resolves.toMatchObject({
        status: 401,
      });
      await expect(signIn(email, "new-pass-1234")).resolves.toMatchObject({
        status: 200,
      });
    });
  });

  describe("F1/F2 — form-path limiter and per-account throttle", () => {
    it("the 11th wrong-password form attempt (auth.api, no HTTP) is refused", async () => {
      const { email } = await createUser();
      for (let i = 0; i < 10; i++) {
        await expect(
          auth.api.signInEmail({
            body: { email, password: "wrong-pass-1" },
            headers: new Headers(),
          }),
        ).rejects.toMatchObject({ status: "UNAUTHORIZED" });
      }
      await expect(
        auth.api.signInEmail({
          body: { email, password: "wrong-pass-1" },
          headers: new Headers(),
        }),
      ).rejects.toMatchObject({ status: "TOO_MANY_REQUESTS" });
    });

    it("rotating x-forwarded-for buys no extra guesses; a second account is unaffected", async () => {
      const { email } = await createUser();
      for (let i = 0; i < 11; i++) {
        const res = await auth.handler(
          new Request(`${BASE}/api/auth/sign-in/email`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-forwarded-for": `203.0.113.${i}`,
            },
            body: JSON.stringify({ email, password: "wrong-pass-1" }),
          }),
        );
        expect(res.status).toBe(i < 10 ? 401 : 429);
      }
      // No shared lockout bucket: a different account still signs in.
      const other = await createUser();
      await expect(signIn(other.email)).resolves.toMatchObject({
        status: 200,
      });
    });

    it("the 11th rapid sign-up submission is refused", async () => {
      const email = `${tag()}@example.test`;
      let sawLimited = false;
      for (let i = 0; i < 11; i++) {
        try {
          await signUpCoachAccount({
            name: "Coach",
            email,
            password: PASSWORD,
            workspaceName: `WS ${i}`,
          });
        } catch (error) {
          if (error instanceof RateLimitExceededError) {
            sawLimited = true;
            break;
          }
        }
      }
      expect(sawLimited).toBe(true);
    });
  });

  describe("F3 — change-password always revokes other sessions", () => {
    it("a second session dies even when the caller omits the flag", async () => {
      const { id, email } = await createUser();
      const tokenA = await signInToken(email);
      const tokenB = await signInToken(email);
      await auth.api.changePassword({
        body: {
          newPassword: "new-pass-1234",
          currentPassword: PASSWORD,
          revokeOtherSessions: false,
        },
        headers: authedHeaders(tokenA),
      });
      const remaining = await prisma.session.findMany({
        where: { userId: id },
      });
      expect(remaining).toHaveLength(1);
      await expect(
        auth.api.getSession({ headers: authedHeaders(tokenB) }),
      ).resolves.toBeNull();
    });
  });

  describe("F4 — deactivated users lose every session-bearing path", () => {
    it("deactivation kills sessions; get-session/list/update/change-password all refuse", async () => {
      const { id, email } = await createUser();
      const token = await signInToken(email);
      const headers = authedHeaders(token);
      await prisma.user.update({
        where: { id },
        data: { status: "DEACTIVATED" },
      });

      // Bearer first, while the session row still exists: the bearer plugin
      // resolves its session after the before-hook, so the hook must resolve
      // + reject the dead token itself (a dead bearer credential previously
      // still reached BA's own endpoints).
      const bearerRes = await auth.handler(
        new Request(`${BASE}/api/auth/get-session`, {
          headers: { authorization: `Bearer ${token}` },
        }),
      );
      expect(bearerRes.status).toBe(401);
      expect(await prisma.session.count({ where: { userId: id } })).toBe(0);

      const res = await auth.handler(
        new Request(`${BASE}/api/auth/get-session`, {
          headers: { cookie: `better-auth.session_token=${token}` },
        }),
      );
      expect(await res.text()).toBe("null");

      await expect(auth.api.listSessions({ headers })).rejects.toMatchObject({
        status: "UNAUTHORIZED",
      });
      await expect(
        auth.api.updateUser({ body: { name: "x" }, headers }),
      ).rejects.toMatchObject({ status: "UNAUTHORIZED" });
      await expect(
        auth.api.changePassword({
          body: { newPassword: "new-pass-1234", currentPassword: PASSWORD },
          headers,
        }),
      ).rejects.toMatchObject({ status: "UNAUTHORIZED" });
      // And the generic sign-in refusal is preserved (no status disclosure).
      await expect(signIn(email)).resolves.toMatchObject({ status: 401 });
    });
  });

  describe("F8 — reset links derive only from BETTER_AUTH_URL/AUTH_URL", () => {
    it("a hostile request origin never reaches the mailed link", async () => {
      const { email } = await createUser();
      await requestReset(
        email,
        new Request(
          "https://evil.example.net/api/auth/request-password-reset",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              host: "evil.example.net",
              "x-forwarded-host": "evil.example.net",
              "x-forwarded-proto": "https",
            },
          },
        ),
      );
      const line = readFileSync(mailbox, "utf8").trim().split("\n").at(-1);
      const text = JSON.parse(line as string).text as string;
      expect(text).toContain(
        `${
          process.env.BETTER_AUTH_URL ?? process.env.AUTH_URL ?? ""
        }/reset?token=`,
      );
      expect(text).not.toContain("evil.example.net");
    });
  });

  describe("F9 — reset endpoints fail closed without a mail adapter", () => {
    it("request-password-reset writes no verification row when mail is unconfigured", async () => {
      const { id, email } = await createUser();
      vi.stubEnv("MAIL_DELIVERY_ADAPTER", "");
      const before = await prisma.verification.count({ where: { value: id } });
      await expect(
        auth.api.requestPasswordReset({
          body: { email },
          headers: new Headers(),
        }),
      ).rejects.toMatchObject({ status: "BAD_REQUEST" });
      await expect(
        auth.api.resetPassword({
          body: { token: "any", newPassword: "new-pass-1234" },
          headers: new Headers(),
        }),
      ).rejects.toMatchObject({ status: "BAD_REQUEST" });
      expect(await prisma.verification.count({ where: { value: id } })).toBe(
        before,
      );
    });
  });

  describe("F11-sec — production refuses a missing/short auth secret", () => {
    it("throws in production without a >=32-char secret", () => {
      const saved = {
        NODE_ENV: process.env.NODE_ENV,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
        AUTH_SECRET: process.env.AUTH_SECRET,
        BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
        AUTH_URL: process.env.AUTH_URL,
      };
      try {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("BETTER_AUTH_SECRET", "");
        vi.stubEnv("AUTH_SECRET", "");
        vi.stubEnv("BETTER_AUTH_URL", "");
        vi.stubEnv("AUTH_URL", "");
        expect(() => assertAuthSecretConfigured()).toThrow(/32/);
        vi.stubEnv("BETTER_AUTH_SECRET", "short");
        expect(() => assertAuthSecretConfigured()).toThrow(/32/);
        vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(32));
        expect(() => assertAuthSecretConfigured()).not.toThrow();
      } finally {
        vi.unstubAllEnvs();
        for (const [k, v] of Object.entries(saved)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      }
    });

    it("refuses a conflicting BETTER_AUTH_*/AUTH_* alias pair", () => {
      const saved = {
        NODE_ENV: process.env.NODE_ENV,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
        AUTH_SECRET: process.env.AUTH_SECRET,
        BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
        AUTH_URL: process.env.AUTH_URL,
      };
      try {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(40));
        vi.stubEnv("AUTH_SECRET", "");
        // https: fixtures — an http: auth origin is itself a production
        // boot refusal since BOOT-CHECKS (#167), so equal-but-http values
        // would throw for a different reason than the alias conflict.
        vi.stubEnv("BETTER_AUTH_URL", "https://a.example");
        vi.stubEnv("AUTH_URL", "https://b.example");
        expect(() => assertAuthSecretConfigured()).toThrow(
          /BETTER_AUTH_URL and AUTH_URL/,
        );
        vi.stubEnv("AUTH_URL", "https://a.example");
        expect(() => assertAuthSecretConfigured()).not.toThrow();
        vi.stubEnv("AUTH_SECRET", `different-${"y".repeat(40)}`);
        expect(() => assertAuthSecretConfigured()).toThrow(
          /BETTER_AUTH_SECRET and AUTH_SECRET/,
        );
      } finally {
        vi.unstubAllEnvs();
        for (const [k, v] of Object.entries(saved)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      }
    });
  });

  describe("F11-verify — session lookup fails closed (401, never 500)", () => {
    it("a throwing session store yields 401 on a protected route", async () => {
      const { email } = await createUser();
      const token = await signInToken(email);
      vi.spyOn(sharedPrisma.session, "findFirst").mockRejectedValue(
        new Error("session store down"),
      );
      vi.spyOn(sharedPrisma.session, "findUnique").mockRejectedValue(
        new Error("session store down"),
      );
      const res = await GET(
        new Request(`${BASE}/api/v1/workspaces/any/session`, {
          headers: { authorization: `Bearer ${token}` },
        }),
        { params: Promise.resolve({ workspaceId: "any" }) },
      );
      expect(res.status).toBe(401);
    });
  });

  describe("F14 — invite peek binds the requested workspace", () => {
    it("a foreign workspaceId renders invite-invalid", async () => {
      const { id: ownerId } = await createUser();
      const t = tag();
      const [wsA, wsB] = await prisma.$transaction([
        prisma.workspace.create({
          data: { name: t, slug: `${t}a`, status: "ACTIVE" },
        }),
        prisma.workspace.create({
          data: { name: t, slug: `${t}b`, status: "ACTIVE" },
        }),
      ]);
      const { rawToken } = await prisma.$transaction(async (tx) =>
        issueWorkspaceInviteToken(tx, {
          workspaceId: wsA.id,
          targetEmail: normalizeEmail(`${t}@example.test`),
          intendedRole: "CLIENT",
          createdByUserId: ownerId,
        }),
      );
      await expect(
        getInviteLinkState({ workspaceId: wsB.id, rawToken }),
      ).resolves.toEqual({ state: "invalid" });
      await expect(
        getInviteLinkState({ workspaceId: wsA.id, rawToken }),
      ).resolves.toEqual({ state: "ready" });
    });
  });

  describe("roster cursor — (createdAt, id) keyset", () => {
    async function rosterFixture() {
      const t = tag();
      const ws = await prisma.workspace.create({
        data: { name: t, slug: t, status: "ACTIVE" },
      });
      const viewer = { userId: "u", email: "e", name: null };
      const workspace = {
        workspaceId: ws.id,
        memberId: "m",
        role: "owner" as const,
        scope: "workspace" as const,
      };
      return { ws, viewer, workspace };
    }

    it("pages through rows sharing one createdAt without skips or repeats", async () => {
      const { ws, viewer, workspace } = await rosterFixture();
      const same = new Date("2026-01-01T00:00:00.000Z");
      const ids = ["cur_a", "cur_b", "cur_c", "cur_d"];
      for (const id of ids) {
        await prisma.clientProfile.create({
          data: {
            id: `${id}_${tag()}`,
            workspaceId: ws.id,
            name: id,
            createdAt: same,
          },
        });
      }
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 4; page++) {
        const res = await listWorkspaceClientRoster(viewer, workspace, {
          limit: 1,
          cursor,
        });
        seen.push(...res.items.map((i) => i.clientProfileId));
        cursor = res.nextCursor ?? undefined;
        if (!res.nextCursor) break;
      }
      expect(new Set(seen).size).toBe(4);
    });

    it("an id-order inversion across createdAt is not skipped", async () => {
      const { ws, viewer, workspace } = await rosterFixture();
      // High id + early createdAt first, low ids later — the id-only cursor
      // predicate (id > cursor) would skip the later rows entirely.
      await prisma.clientProfile.create({
        data: {
          id: `zzz_${tag()}`,
          workspaceId: ws.id,
          name: "early-high-id",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
      for (const id of ["aaa", "bbb"]) {
        await prisma.clientProfile.create({
          data: {
            id: `${id}_${tag()}`,
            workspaceId: ws.id,
            name: id,
            createdAt: new Date("2026-02-01T00:00:00.000Z"),
          },
        });
      }
      const first = await listWorkspaceClientRoster(viewer, workspace, {
        limit: 1,
      });
      expect(first.items).toHaveLength(1);
      expect(first.nextCursor).toBeTruthy();
      const second = await listWorkspaceClientRoster(viewer, workspace, {
        limit: 10,
        cursor: first.nextCursor ?? undefined,
      });
      expect(second.items).toHaveLength(2);
      expect(second.items.map((i) => i.name).sort()).toEqual(["aaa", "bbb"]);
    });
  });
});
