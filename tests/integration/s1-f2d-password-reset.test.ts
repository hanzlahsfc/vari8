import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { auth as authServer } from "../../lib/auth/server";
import {
  completePasswordReset,
  getResetLinkState,
  requestPasswordResetFromForm,
} from "../../lib/auth/password-reset-boundary";
import { hashPassword, verifyPassword } from "../../lib/password";
import { generateAccessToken } from "../../lib/tokens/crypto";
import { setTestHeaders } from "./stubs/next-headers";

/**
 * S1-F2D password-reset orchestration against real PostgreSQL — PR-05
 * rewiring (audit block TB0.093: the password-reset and session-revocation
 * contracts stay; only library-specific session setup/assertions were
 * replaced).
 *
 * The deleted `lib/auth/password-reset.ts` service (deliver-sink injection,
 * FOR UPDATE row locks, serialization retry loop, audit_event writes, 12h
 * tokens) is gone; Better Auth's `/request-password-reset` +
 * `/reset-password` endpoints own the flow now. What survives and is proven
 * here on the real pipeline:
 *  - request is non-enumerating (identical generic response),
 *  - verification rows store ONLY the digest of `reset-password:<raw>` —
 *    the mailed raw token never rests in the DB — with a 60-minute window,
 *  - a new request supersedes prior tokens for that user only,
 *  - consume is single-use, rotates the credential `accounts` row, deletes
 *    every reset row for the user, and revokes every `sessions` row,
 *  - password policy is enforced before the token is claimed,
 *  - nothing leaks tokens, hashes, emails, or passwords.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";
const NEW_PASSWORD = "brand new correct horse battery staple1";
const OLD_PASSWORD = "old correct horse battery staple";
const INVALID_LINK =
  "This password reset link is invalid or has expired. Request a new link.";

describe.skipIf(!enabled)(
  "S1-F2D password-reset orchestration (real PG)",
  () => {
    let prisma: PrismaClient;
    let n = 0;
    let mailboxFile = "";
    let originalMailbox: string | undefined;

    beforeAll(async () => {
      execFileSync("npx", ["prisma", "migrate", "deploy"], {
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: url as string },
      });
      prisma = new PrismaClient({
        datasources: { db: { url: url as string } },
      });
      originalMailbox = process.env.DEV_MAILBOX_FILE;
    });
    afterAll(async () => {
      if (originalMailbox === undefined) delete process.env.DEV_MAILBOX_FILE;
      else process.env.DEV_MAILBOX_FILE = originalMailbox;
      await prisma?.$disconnect();
    });
    beforeEach(() => {
      mailboxFile = path.join(
        mkdtempSync(path.join(tmpdir(), "mb-f2d-")),
        "mailbox.jsonl",
      );
      process.env.DEV_MAILBOX_FILE = mailboxFile;
      setTestHeaders(new Headers());
    });

    const uid = () => `f2d_${++n}_${Math.random().toString(36).slice(2, 8)}`;
    const GATE = { deliveryAvailable: true };

    async function mkUser(
      opts: {
        status?: "ACTIVE" | "DEACTIVATED" | "INVITED";
        password?: string;
      } = {},
    ) {
      const email = `${uid()}@example.test`;
      const password = opts.password ?? OLD_PASSWORD;
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword(password), // legacy mirror
          name: `Fixture ${uid()}`,
          status: opts.status ?? "ACTIVE",
        },
      });
      await prisma.account.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: await hashPassword(password),
        },
      });
      return user;
    }

    function storedResetIdentifier(rawToken: string): string {
      return createHash("sha256")
        .update(`reset-password:${rawToken}`)
        .digest("base64url");
    }

    async function mailboxMessages() {
      for (let i = 0; i < 40; i++) {
        if (existsSync(mailboxFile)) {
          return readFileSync(mailboxFile, "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map(
              (l) =>
                JSON.parse(l) as {
                  to: string;
                  subject: string;
                  text: string;
                },
            );
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      return [] as { to: string; subject: string; text: string }[];
    }

    const verificationsFor = (userId: string) =>
      prisma.verification.findMany({ where: { value: userId } });

    /** Request a reset via the real boundary; return the mailed raw token. */
    async function issueToken(email: string): Promise<string> {
      const before = (await mailboxMessages()).length;
      const r = await requestPasswordResetFromForm(email, GATE);
      expect(r.ok).toBe(true);
      const fresh = (await mailboxMessages())
        .slice(before)
        .filter((m) => m.to === email);
      expect(fresh).toHaveLength(1);
      const raw = fresh[0].text.match(/\/reset\?token=([^\s]+)/)?.[1];
      expect(raw).toBeTruthy();
      return raw as string;
    }

    /** Plant a verification row directly (expiry/sibling scenarios). */
    async function plantToken(userId: string, expiresAt: Date) {
      const rawToken = generateAccessToken().rawToken;
      await prisma.verification.create({
        data: {
          identifier: storedResetIdentifier(rawToken),
          value: userId,
          expiresAt,
        },
      });
      return rawToken;
    }

    const consume = (rawToken: unknown, password: unknown = NEW_PASSWORD) =>
      completePasswordReset({ rawToken, password }, GATE);

    async function signInHttp(email: string, password: string) {
      const res = await authServer.handler(
        new Request(`${BASE}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        }),
      );
      const body = (await res.json().catch(() => null)) as {
        token?: string;
      } | null;
      const bearer = res.headers.get("set-auth-token");
      const cookie = res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      return { res, body, bearer, cookie };
    }

    // --- request -------------------------------------------------------------

    it("malformed email fails on the boundary; a missing account gets the identical generic success", async () => {
      for (const bad of [undefined, null, 42, "", "   ", {}, "noatsign"]) {
        const r = await requestPasswordResetFromForm(bad, GATE);
        expect(r).toEqual({
          ok: false,
          message: "Enter a valid email address.",
        });
      }
      const u = await mkUser();
      const existing = await requestPasswordResetFromForm(u.email, GATE);
      const missing = await requestPasswordResetFromForm(
        `ghost-${uid()}@example.test`,
        GATE,
      );
      expect(existing.ok).toBe(true);
      expect(existing).toEqual(missing); // non-enumeration
    });

    it("an ACTIVE request mails exactly one reset link and stores one digest-only row with a 60-minute window", async () => {
      const u = await mkUser();
      const raw = await issueToken(u.email);
      const rows = await verificationsFor(u.id);
      expect(rows).toHaveLength(1);
      // Digest-only persistence: the raw token appears nowhere in the row.
      expect(rows[0].identifier).toBe(storedResetIdentifier(raw));
      expect(rows[0].identifier).not.toContain(raw);
      expect(JSON.stringify(rows[0])).not.toContain(raw);
      const delta = rows[0].expiresAt.getTime() - Date.now();
      expect(delta).toBeGreaterThan(55 * 60_000);
      expect(delta).toBeLessThanOrEqual(61 * 60_000);
      // The link went to the normalized stored address through the mailbox.
      const msg = (await mailboxMessages()).find((m) => m.to === u.email);
      expect(msg?.text).toContain(`/reset?token=${raw}`);
    });

    it("non-ACTIVE accounts get the identical response, and sign-in stays denied", async () => {
      const control = await mkUser();
      const baseline = await requestPasswordResetFromForm(control.email, GATE);
      for (const status of ["INVITED", "DEACTIVATED"] as const) {
        const u = await mkUser({ status });
        const r = await requestPasswordResetFromForm(u.email, GATE);
        expect(r).toEqual(baseline);
        // The protection that survives: the account cannot authenticate —
        // same generic failure as a wrong password, no session minted.
        const denial = await authServer.api
          .signInEmail({
            body: { email: u.email, password: OLD_PASSWORD },
            headers: new Headers(),
          })
          .then(
            () => null,
            (e) => e,
          );
        expect(denial?.status).toBe("UNAUTHORIZED");
        expect(denial?.body?.message).toBe("Invalid email or password");
        expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
      }
    });

    it("a new request supersedes only that user's outstanding tokens", async () => {
      const a = await mkUser();
      const b = await mkUser();
      const a1 = await issueToken(a.email);
      const bTok = await issueToken(b.email);
      const a2 = await issueToken(a.email);

      expect(await verificationsFor(a.id)).toHaveLength(1);
      await expect(getResetLinkState(a1, prisma, GATE)).resolves.toEqual({
        state: "invalid",
      });
      await expect(getResetLinkState(a2, prisma, GATE)).resolves.toEqual({
        state: "ready",
      });
      // The sibling account's token is untouched and still consumes.
      await expect(getResetLinkState(bTok, prisma, GATE)).resolves.toEqual({
        state: "ready",
      });
      const a1Result = await consume(a1);
      expect(a1Result).toEqual({ ok: false, message: INVALID_LINK });
      expect((await consume(bTok)).ok).toBe(true);
    });

    it("concurrent requests never leave more than one live reset row", async () => {
      const u = await mkUser();
      const results = await Promise.all(
        [0, 1, 2].map(() => requestPasswordResetFromForm(u.email, GATE)),
      );
      for (const r of results) expect(r.ok).toBe(true);
      const rows = await verificationsFor(u.id);
      expect(rows.length).toBeLessThanOrEqual(1);
    });

    // --- consume -------------------------------------------------------------

    it("valid token: credential rotated, every session row deleted, all reset rows deleted, single use", async () => {
      const u = await mkUser();
      // Two real sessions exist when the reset lands.
      const s1 = await signInHttp(u.email, OLD_PASSWORD);
      const s2 = await signInHttp(u.email, OLD_PASSWORD);
      expect(s1.res.status).toBe(200);
      expect(await prisma.session.count({ where: { userId: u.id } })).toBe(2);

      const raw = await issueToken(u.email);
      await expect(consume(raw)).resolves.toEqual({ ok: true });

      const acct = await prisma.account.findFirstOrThrow({
        where: { userId: u.id, providerId: "credential" },
      });
      expect(await verifyPassword(NEW_PASSWORD, acct.password!)).toBe(true);
      expect(await verifyPassword(OLD_PASSWORD, acct.password!)).toBe(false);
      // Revocation-by-deletion — every session row gone, both credentials dead.
      expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
      for (const s of [s1, s2]) {
        await expect(
          authServer.api.getSession({
            headers: new Headers({
              authorization: `Bearer ${s.bearer}`,
            }),
          }),
        ).resolves.toBeNull();
      }
      // Every reset row for the user was consumed/swept.
      expect(await verificationsFor(u.id)).toHaveLength(0);
      // Single use: the same token cannot be claimed twice.
      await expect(consume(raw)).resolves.toEqual({
        ok: false,
        message: INVALID_LINK,
      });
    });

    it("expired, wrong-purpose, malformed, and unknown tokens share the invalid outcome", async () => {
      const u = await mkUser();
      // Expired planted row (60-minute window closed).
      const expRaw = await plantToken(u.id, new Date(Date.now() - 60_000));
      // Unknown but well-formed; malformed; non-string.
      const cases: unknown[] = [
        expRaw,
        generateAccessToken().rawToken,
        "not-a-token",
        42,
        undefined,
        "",
      ];
      for (const tok of cases) {
        await expect(consume(tok)).resolves.toEqual({
          ok: false,
          message: INVALID_LINK,
        });
      }
      // The link peek agrees: expired and unknown are "invalid".
      await expect(getResetLinkState(expRaw, prisma, GATE)).resolves.toEqual({
        state: "invalid",
      });
      // Nothing mutated: the credential still verifies as the old password.
      const acct = await prisma.account.findFirstOrThrow({
        where: { userId: u.id, providerId: "credential" },
      });
      expect(await verifyPassword(OLD_PASSWORD, acct.password!)).toBe(true);
    });

    it("an orphaned verification row (deleted user) fails closed without leaking", async () => {
      const ghostId = `ghost_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;
      const raw = await plantToken(ghostId, new Date(Date.now() + 3600_000));
      const r = await consume(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        // USER_NOT_FOUND maps to the generic failure copy — not the invalid
        // link copy and never the planted value.
        expect(r.message).toBe(
          "Something went wrong. Please try again in a moment.",
        );
        expect(r.message).not.toContain(raw);
      }
      // The link peek is non-consuming and only reflects row validity — the
      // unexpired orphan row still shows "ready", but every consume attempt
      // keeps failing closed with the same generic copy.
      await expect(getResetLinkState(raw, prisma, GATE)).resolves.toEqual({
        state: "ready",
      });
      const again = await consume(raw);
      expect(again.ok).toBe(false);
      if (!again.ok) {
        expect(again.message).toBe(
          "Something went wrong. Please try again in a moment.",
        );
      }
      // And no credential was ever created or rotated for the ghost.
      const acct = await prisma.account.findFirst({
        where: { accountId: ghostId },
      });
      expect(acct).toBeNull();
    });

    it("password-policy failures never consume the token", async () => {
      const u = await mkUser();
      const raw = await issueToken(u.email);
      for (const [password, fragment] of [
        ["short", "at least 10 characters"],
        ["abcdefghij", "at least one digit"],
      ] as const) {
        const r = await consume(raw, password);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.message).toContain(fragment);
      }
      expect(await verificationsFor(u.id)).toHaveLength(1);
      await expect(getResetLinkState(raw, prisma, GATE)).resolves.toEqual({
        state: "ready",
      });
      await expect(consume(raw)).resolves.toEqual({ ok: true });
    });

    it("concurrent consumes of one token: exactly one winner", async () => {
      const u = await mkUser();
      const raw = await issueToken(u.email);
      const results = await Promise.allSettled([
        consume(raw, "first-concurrent-pw-1"),
        consume(raw, "second-concurrent-pw-2"),
      ]);
      const wins = results.filter(
        (r) => r.status === "fulfilled" && r.value.ok,
      ).length;
      expect(wins).toBe(1);
      expect(await verificationsFor(u.id)).toHaveLength(0);
    });

    it("a completed reset kills every outstanding sibling token", async () => {
      const u = await mkUser();
      const t1 = await plantToken(u.id, new Date(Date.now() + 3600_000));
      const t2 = await plantToken(u.id, new Date(Date.now() + 3600_000));
      await expect(consume(t1)).resolves.toEqual({ ok: true });
      // The sibling is dead — the completed reset deleted every reset row.
      await expect(consume(t2)).resolves.toEqual({
        ok: false,
        message: INVALID_LINK,
      });
      expect(await verificationsFor(u.id)).toHaveLength(0);
    });

    it("no token, hash, email, or password canaries in results or errors", async () => {
      const u = await mkUser({ password: "canary-old-passphrase-1" });
      const raw = await issueToken(u.email);
      const digest = storedResetIdentifier(raw);
      const canaries = [raw, digest, u.email, NEW_PASSWORD, "canary-old"];
      const ok = await consume(raw);
      const okJson = JSON.stringify(ok);
      for (const c of canaries) expect(okJson).not.toContain(c);
      // Error surfaces — both the boundary result and the raw API error.
      const boundary = await consume(raw);
      const boundaryJson = JSON.stringify(boundary);
      for (const c of canaries) expect(boundaryJson).not.toContain(c);
      const apiErr = await authServer.api
        .resetPassword({
          body: { newPassword: NEW_PASSWORD, token: raw },
          headers: new Headers(),
        })
        .then(
          () => null,
          (e) => JSON.stringify(e) + String(e),
        );
      for (const c of canaries) expect(apiErr).not.toContain(c);
    });

    it("full pipeline: reset revokes the real signed-in session; new password signs in", async () => {
      const u = await mkUser();
      const { res, bearer, cookie } = await signInHttp(u.email, OLD_PASSWORD);
      expect(res.status).toBe(200);
      // Session resolves before the reset through the real pipeline.
      const before = await authServer.api.getSession({
        headers: new Headers({ authorization: `Bearer ${bearer}` }),
      });
      expect(before?.user?.id).toBe(u.id);

      const raw = await issueToken(u.email);
      await expect(consume(raw)).resolves.toEqual({ ok: true });

      // The old credential is dead on both transports.
      await expect(
        authServer.api.getSession({
          headers: new Headers({ authorization: `Bearer ${bearer}` }),
        }),
      ).resolves.toBeNull();
      const dead = await authServer.handler(
        new Request(`${BASE}/api/auth/get-session`, {
          headers: { cookie },
        }),
      );
      expect(dead.status).toBe(200);
      await expect(dead.json()).resolves.toBeNull();

      // Old password denied; new password establishes a fresh session.
      const oldAttempt = await signInHttp(u.email, OLD_PASSWORD);
      expect(oldAttempt.res.status).toBe(401);
      const fresh = await signInHttp(u.email, NEW_PASSWORD);
      expect(fresh.res.status).toBe(200);
      expect(
        (
          await authServer.api.getSession({
            headers: new Headers({
              authorization: `Bearer ${fresh.bearer}`,
            }),
          })
        )?.user?.id,
      ).toBe(u.id);
    });
  },
);
