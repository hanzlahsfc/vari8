import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { signIn as loginAction } from "../../auth";
import { auth as authServer } from "../../lib/auth/server";
import {
  completePasswordReset,
  getResetLinkState,
  requestPasswordResetFromForm,
} from "../../lib/auth/password-reset-boundary";
import { hashPassword, verifyPassword } from "../../lib/password";
import { generateAccessToken } from "../../lib/tokens/crypto";
import { createWorkspaceInvitation } from "../../lib/workspace/invitations";
import { setTestHeaders } from "./stubs/next-headers";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";

const OLD_PASSWORD = "old correct horse battery staple";
const NEW_PASSWORD = "new correct horse battery staple1"; // ≥10 + digit

/**
 * Phase 3.2 — the public reset boundary on the REAL Better Auth pipeline:
 * non-enumerating request (`requestPasswordResetFromForm` →
 * `auth.api.requestPasswordReset`), digest-only `verifications` rows
 * (SHA-256 of `reset-password:<rawToken>`; the mailed raw token never rests
 * in the database), a non-consuming link peek, atomic single-use consume via
 * `completePasswordReset` → `auth.api.resetPassword`, revocation-by-deletion
 * of every `sessions` row for the user, and the setup password policy.
 *
 * The second describe hosts the credentials-gate invariants that moved out of
 * tests/unit/credentials.test.ts (audit TB0.029) now that they need a DB.
 */
describe.skipIf(!enabled)("Phase 3.2 password-reset boundary (real PG)", () => {
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
    // Unique mailbox per test — the dev-file adapter appends the reset email
    // (the only channel that ever sees the raw token) as JSONL.
    mailboxFile = path.join(
      mkdtempSync(path.join(tmpdir(), "mb-p32-")),
      "mailbox.jsonl",
    );
    process.env.DEV_MAILBOX_FILE = mailboxFile;
    setTestHeaders(new Headers());
  });

  const uid = () => `p32_${++n}_${Math.random().toString(36).slice(2, 8)}`;
  const GATE = { deliveryAvailable: true };

  async function mkUser(
    opts: { status?: "ACTIVE" | "DEACTIVATED" | "INVITED" } = {},
  ) {
    const email = `${uid()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(OLD_PASSWORD), // legacy mirror column
        name: `Fixture ${uid()}`,
        status: opts.status ?? "ACTIVE",
      },
    });
    // The credential identity Better Auth actually authenticates against.
    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: await hashPassword(OLD_PASSWORD),
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
              JSON.parse(l) as { to: string; subject: string; text: string },
          );
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return [] as { to: string; subject: string; text: string }[];
  }

  async function verificationsFor(userId: string) {
    return prisma.verification.findMany({ where: { value: userId } });
  }

  /** Issue a reset through the real boundary and capture the mailed token. */
  async function issueToken(email: string): Promise<string> {
    const before = (await mailboxMessages()).length;
    const r = await requestPasswordResetFromForm(email, GATE);
    expect(r.ok).toBe(true);
    const msgs = await mailboxMessages();
    const fresh = msgs.slice(before).filter((m) => m.to === email);
    expect(fresh).toHaveLength(1);
    const m = fresh[0].text.match(/\/reset\?token=([^\s]+)/);
    expect(m).toBeTruthy();
    return m![1];
  }

  async function signInHttp(email: string, password: string) {
    const res = await authServer.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    const bearer = res.headers.get("set-auth-token");
    expect(bearer).toBeTruthy();
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    return { bearer: bearer as string, token: body.token, cookie };
  }

  it("request returns an identical generic message for existing and missing accounts; stored form is digest-only", async () => {
    const u = await mkUser();
    const existing = await requestPasswordResetFromForm(u.email, GATE);
    const missing = await requestPasswordResetFromForm(
      `ghost-${uid()}@example.test`,
      GATE,
    );
    expect(existing).toEqual(missing); // non-enumerating surface
    expect(existing.ok).toBe(true);

    // Padded + uppercased input is normalized before the lookup — the mail
    // still lands on the stored (lowercase) address.
    const mixed = await requestPasswordResetFromForm(
      `  ${u.email.toUpperCase()}  `,
      GATE,
    );
    expect(mixed).toEqual(existing);

    const msgs = (await mailboxMessages()).filter((m) => m.to === u.email);
    expect(msgs).toHaveLength(2);
    const raw = msgs[1].text.match(/\/reset\?token=([^\s]+)/)![1];

    // Exactly one live verification row — the second request superseded the
    // first — holding only the SHA-256 digest of the composite identifier.
    const rows = await verificationsFor(u.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].identifier).toBe(storedResetIdentifier(raw));
    expect(JSON.stringify(rows[0])).not.toContain(raw);
    const delta = rows[0].expiresAt.getTime() - Date.now();
    expect(delta).toBeGreaterThan(55 * 60_000);
    expect(delta).toBeLessThanOrEqual(61 * 60_000); // 60-minute policy
  });

  it("request on non-ACTIVE accounts answers identically — and a reset still cannot produce a session", async () => {
    const control = await mkUser();
    const baseline = await requestPasswordResetFromForm(control.email, GATE);
    expect(baseline.ok).toBe(true);

    for (const status of ["DEACTIVATED", "INVITED"] as const) {
      const u = await mkUser({ status });
      const r = await requestPasswordResetFromForm(u.email, GATE);
      expect(r).toEqual(baseline); // identical — no account-status signal
      // Whatever token machinery ran, sign-in for the account stays denied
      // with the same generic failure as a wrong password.
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
    }
  });

  it("a completed reset on a deactivated account still cannot authenticate", async () => {
    const u = await mkUser({ status: "DEACTIVATED" });
    const raw = await issueToken(u.email);
    await expect(
      completePasswordReset({ rawToken: raw, password: NEW_PASSWORD }, GATE),
    ).resolves.toEqual({ ok: true });
    // The credential was rotated but the account status gate still applies —
    // identical generic denial, no session minted.
    const denial = await authServer.api
      .signInEmail({
        body: { email: u.email, password: NEW_PASSWORD },
        headers: new Headers(),
      })
      .then(
        () => null,
        (e) => e,
      );
    expect(denial?.status).toBe("UNAUTHORIZED");
    expect(denial?.body?.message).toBe("Invalid email or password");
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
  });

  it("getResetLinkState is non-consuming and purpose-scoped", async () => {
    const u = await mkUser();
    const rawToken = await issueToken(u.email);
    await expect(
      getResetLinkState(rawToken, prisma, { deliveryAvailable: true }),
    ).resolves.toEqual({
      state: "ready",
    });
    // Nothing consumed — the row survives the peek and stays ready.
    expect(await verificationsFor(u.id)).toHaveLength(1);
    await expect(
      getResetLinkState(rawToken, prisma, { deliveryAvailable: true }),
    ).resolves.toEqual({ state: "ready" });

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

  it("successful reset: password changed, every session row deleted, all reset rows deleted — atomic consume", async () => {
    const u = await mkUser();
    // Two live sessions — what "sessionVersion +1" used to invalidate.
    const s1 = await signInHttp(u.email, OLD_PASSWORD);
    const s2 = await signInHttp(u.email, OLD_PASSWORD);
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(2);
    expect(
      (
        await authServer.api.getSession({
          headers: new Headers({ authorization: `Bearer ${s1.bearer}` }),
        })
      )?.user?.id,
    ).toBe(u.id);

    const rawToken = await issueToken(u.email);
    const r = await completePasswordReset(
      { rawToken, password: NEW_PASSWORD },
      GATE,
    );
    expect(r).toEqual({ ok: true });

    const acct = await prisma.account.findFirstOrThrow({
      where: { userId: u.id, providerId: "credential" },
    });
    expect(await verifyPassword(NEW_PASSWORD, acct.password!)).toBe(true);
    expect(await verifyPassword(OLD_PASSWORD, acct.password!)).toBe(false);
    // Revocation-by-deletion: every session row for the user is gone.
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
    // Both prior credentials are dead through the real resolution path.
    for (const s of [s1, s2]) {
      await expect(
        authServer.api.getSession({
          headers: new Headers({ authorization: `Bearer ${s.bearer}` }),
        }),
      ).resolves.toBeNull();
    }
    // The consume deleted every reset row for the user (single use + sweep).
    expect(await verificationsFor(u.id)).toHaveLength(0);
    // Old password is dead, new password signs in.
    await expect(
      authServer.api.signInEmail({
        body: { email: u.email, password: OLD_PASSWORD },
        headers: new Headers(),
      }),
    ).rejects.toMatchObject({ status: "UNAUTHORIZED" });
    const s3 = await signInHttp(u.email, NEW_PASSWORD);
    expect(s3.bearer).toBeTruthy();
  });

  it("short and digitless passwords fail without consuming the token", async () => {
    const u = await mkUser();
    const rawToken = await issueToken(u.email);
    for (const [password, fragment] of [
      ["short1", "at least 10 characters"],
      ["abcdefghij", "at least one digit"],
    ] as const) {
      const r = await completePasswordReset({ rawToken, password }, GATE);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain(fragment);
    }
    // Token untouched — still claimable with a compliant password.
    expect(await verificationsFor(u.id)).toHaveLength(1);
    await expect(
      getResetLinkState(rawToken, prisma, { deliveryAvailable: true }),
    ).resolves.toEqual({ state: "ready" });
    const ok = await completePasswordReset(
      { rawToken, password: NEW_PASSWORD },
      GATE,
    );
    expect(ok).toEqual({ ok: true });
  });

  it("reused, superseded, expired, malformed, and wrong-purpose tokens fail identically with no mutation", async () => {
    const u = await mkUser();
    const INVALID = /invalid or has expired|request a new link/i;

    // Reused (consumed) token.
    const used = await issueToken(u.email);
    await completePasswordReset(
      { rawToken: used, password: NEW_PASSWORD },
      GATE,
    );
    const reuse = await completePasswordReset(
      { rawToken: used, password: NEW_PASSWORD },
      GATE,
    );
    expect(reuse.ok).toBe(false);
    if (!reuse.ok) expect(reuse.message).toMatch(INVALID);

    // Superseded: a second request kills the first token; the new one lives.
    const first = await issueToken(u.email);
    const second = await issueToken(u.email);
    await expect(
      getResetLinkState(first, prisma, { deliveryAvailable: true }),
    ).resolves.toEqual({ state: "invalid" });
    await expect(
      getResetLinkState(second, prisma, { deliveryAvailable: true }),
    ).resolves.toEqual({ state: "ready" });
    const superseded = await completePasswordReset(
      { rawToken: first, password: NEW_PASSWORD },
      GATE,
    );
    expect(superseded.ok).toBe(false);
    if (!superseded.ok) expect(superseded.message).toMatch(INVALID);

    // Expired: a planted row whose 60-minute window already closed.
    const expRaw = generateAccessToken().rawToken;
    await prisma.verification.create({
      data: {
        identifier: storedResetIdentifier(expRaw),
        value: u.id,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const expired = await completePasswordReset(
      { rawToken: expRaw, password: NEW_PASSWORD },
      GATE,
    );
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.message).toMatch(INVALID);

    // Malformed + unknown-but-well-formed.
    for (const bogus of ["nope", generateAccessToken().rawToken]) {
      const r = await completePasswordReset(
        { rawToken: bogus, password: NEW_PASSWORD },
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
      GATE,
    );
    expect(wrongPurpose.ok).toBe(false);
    if (!wrongPurpose.ok) expect(wrongPurpose.message).toMatch(INVALID);

    // Final state: only the legitimate consume mutated anything — the
    // credential still verifies as NEW_PASSWORD and the superseded request's
    // token is the one that stayed live until the expired-row plant.
    const acct = await prisma.account.findFirstOrThrow({
      where: { userId: u.id, providerId: "credential" },
    });
    expect(await verifyPassword(NEW_PASSWORD, acct.password!)).toBe(true);
  });
});

describe.skipIf(!enabled)(
  "credentials gate (moved from tests/unit/credentials.test.ts — TB0.029)",
  () => {
    let prisma: PrismaClient;
    let n = 0;

    beforeAll(async () => {
      prisma = new PrismaClient({
        datasources: { db: { url: url as string } },
      });
    });
    afterAll(async () => {
      await prisma?.$disconnect();
    });
    beforeEach(() => {
      setTestHeaders(new Headers());
    });

    const uid = () => `p32cg_${++n}_${Math.random().toString(36).slice(2, 8)}`;
    const PASSWORD = "credentials-gate-pw-1";

    async function mkUser(
      status: "ACTIVE" | "DEACTIVATED" | "INVITED" = "ACTIVE",
    ) {
      const email = `${uid()}@example.test`;
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword(PASSWORD),
          name: `Fixture ${uid()}`,
          status,
        },
      });
      await prisma.account.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: await hashPassword(PASSWORD),
        },
      });
      return user;
    }

    it("wrong password, unknown email, and non-ACTIVE accounts all fail with the same generic error and mint no session", async () => {
      const u = await mkUser();
      const deactivated = await mkUser("DEACTIVATED");
      const invited = await mkUser("INVITED");

      const outcomes = [];
      for (const creds of [
        { email: u.email, password: "wrong-password" },
        { email: `ghost-${uid()}@example.test`, password: PASSWORD },
        { email: deactivated.email, password: PASSWORD },
        { email: invited.email, password: PASSWORD },
      ]) {
        outcomes.push(
          await authServer.api
            .signInEmail({ body: creds, headers: new Headers() })
            .then(
              () => null,
              (e) => e,
            ),
        );
      }
      // Every failure is the same generic UNAUTHORIZED — status and copy
      // indistinguishable across the four cases. (Reported: the hook-thrown
      // denial for non-ACTIVE accounts omits `body.code` while Better Auth's
      // own failures carry INVALID_EMAIL_OR_PASSWORD — a residual status
      // signal; the user-visible contract asserted here is identical.)
      const signature = (e: {
        status?: unknown;
        body?: { message?: unknown };
      }) => JSON.stringify({ status: e?.status, message: e?.body?.message });
      for (const e of outcomes) {
        expect(signature(e)).toBe(signature(outcomes[0]));
      }
      expect(outcomes[0]).toMatchObject({ status: "UNAUTHORIZED" });
      expect(outcomes[0]?.body?.message).toBe("Invalid email or password");
      // A real sign-in produces exactly one session row; none of the failures did.
      await expect(
        authServer.api.signInEmail({
          body: { email: u.email, password: PASSWORD },
          headers: new Headers(),
        }),
      ).resolves.toBeTruthy();
      expect(
        await prisma.session.count({
          where: { userId: { in: [u.id, deactivated.id, invited.id] } },
        }),
      ).toBe(1);
    });

    it("the login action normalizes the email before sign-in", async () => {
      const u = await mkUser();
      // Padded + uppercased input must resolve to the stored account —
      // `signIn` in auth.ts runs normalizeEmail before auth.api.signInEmail.
      // Success is a redirect: next/navigation throws NEXT_REDIRECT.
      const err = await loginAction("credentials", {
        email: `  ${u.email.toUpperCase()}  `,
        password: PASSWORD,
        redirectTo: "/settings",
      }).then(
        () => null,
        (e) => e,
      );
      const digest = String((err as { digest?: unknown })?.digest ?? err);
      expect(digest).toContain("NEXT_REDIRECT");
      expect(digest).toContain("/settings");
      expect(await prisma.session.count({ where: { userId: u.id } })).toBe(1);
    });
  },
);
