#!/usr/bin/env node
/**
 * PR-05 live proof — runs the full acceptance matrix against the dev server
 * on :3620 backed by the fresh `app_pr05` database.
 *
 *   BASE=http://127.0.0.1:3620 DATABASE_URL=... MAILBOX=/tmp/mailbox.jsonl \
 *     node scripts/live-proof-pr05.mjs
 *
 * Browser steps drive the real forms (signup, login, reset); the API matrix
 * uses plain fetch exactly like an external client.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { randomBytes, scrypt } from "node:crypto";

const BASE = process.env.BASE ?? "http://127.0.0.1:3620";
const MAILBOX = process.env.MAILBOX ?? "/tmp/pr05-mailbox.jsonl";
const prisma = new PrismaClient();

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
const eq = (a, b) => a === b;

async function api(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      origin: BASE, // Better Auth CSRF check requires Origin on mutations
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, headers: res.headers, text };
}

const tag = Date.now();
// DB-backed rate buckets persist between runs — keep every simulated client
// IP unique per proof run so old buckets can never pollute the matrix.
const ip = (() => {
  let n = 0;
  const octet = Math.floor(tag / 1000) % 250;
  return () => `172.${20 + (n % 30)}.${octet}.${++n % 250}`;
})();
const coach = {
  name: "Proof Coach",
  email: `proof-coach-${tag}@example.test`,
  password: "proof-pass-1",
  workspace: `Proof WS ${tag}`,
};
const other = {
  email: `proof-other-${tag}@example.test`,
  password: "proof-pass-2",
};

/* ── UI flows (real browser) ─────────────────────────────────────────── */

async function browserSteps() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // 1. Coach self-signup through the real /signup form.
  await page.goto(`${BASE}/signup`);
  await page.getByLabel("Your name").fill(coach.name);
  await page.getByLabel("Workspace name").fill(coach.workspace);
  await page.getByLabel("Email").fill(coach.email);
  await page.getByLabel("Password").fill(coach.password);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signup"), {
    timeout: 15000,
  });
  record("signup: coach form creates account+workspace, redirects in", true);

  // Sign out so the login form is exercised fresh.
  await page.goto(`${BASE}/login`);

  // 2. Sign-in through the real /login form.
  await page.getByLabel("Email").fill(coach.email);
  await page.getByLabel("Password").fill(coach.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 15000,
  });
  record("sign-in: form login lands on the app", true);

  // 3. Wrong password via the form -> generic inline error, stays on /login.
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(coach.email);
  await page.getByLabel("Password").fill("wrong-pass-9");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".auth-error").waitFor({ state: "visible" });
  const errText = await page.locator(".auth-error").textContent();
  record(
    "wrong password: refused with generic inline error",
    /invalid email or password/i.test(errText ?? ""),
    (errText ?? "").trim(),
  );

  await ctx.close();
  await browser.close();
}

/* ── API matrix (plain fetch) ────────────────────────────────────────── */

async function signIn(email, password) {
  const res = await api("/api/auth/sign-in/email", {
    method: "POST",
    body: { email, password },
    headers: { "x-forwarded-for": ip() },
  });
  const token = res.headers.get("set-auth-token");
  return { res, token };
}
const bearer = (t) => ({ authorization: `Bearer ${t}` });

async function apiSteps() {
  // 4. HTTP sign-in -> 200 + bearer token.
  const { res: in1, token: t1 } = await signIn(coach.email, coach.password);
  record("sign-in: /api/auth/sign-in/email 200 + bearer token", eq(in1.status, 200) && !!t1, `${in1.status} token=${!!t1}`);

  // 5. Wrong password -> 401 generic.
  const wrong = await api("/api/auth/sign-in/email", {
    method: "POST",
    body: { email: coach.email, password: "nope-12345" },
    headers: { "x-forwarded-for": ip() },
  });
  record("wrong password: 401 INVALID_EMAIL_OR_PASSWORD", eq(wrong.status, 401), `${wrong.status} ${wrong.text.slice(0, 80)}`);

  // 6. 11 rapid wrong-password attempts -> the 11th is refused (429). The
  // account limiter counts every sign-in attempt for an address, including
  // the earlier checks in this script — so the burst uses a decoy address:
  // throttling applies to unknown accounts exactly as to real ones, and
  // coach.email's bucket stays available for the password-change checks.
  const burstIp = ip();
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    const r = await api("/api/auth/sign-in/email", {
      method: "POST",
      body: { email: `burst-${burstIp}@proof.test`, password: "nope-12345" },
      headers: { "x-forwarded-for": burstIp },
    });
    statuses.push(r.status);
  }
  record(
    "rate limit: 10x401 then 11th 429",
    statuses.slice(0, 10).every((s) => s === 401) && statuses[10] === 429,
    statuses.join(","),
  );

  // 7. Password reset: request -> mailbox link -> consume; second use 400.
  const req = await api("/api/auth/request-password-reset", {
    method: "POST",
    body: { email: coach.email },
    headers: { "x-forwarded-for": ip() },
  });
  await new Promise((r) => setTimeout(r, 300)); // mail write is fire-and-forget
  const lines = readFileSync(MAILBOX, "utf8").trim().split("\n");
  const msg = lines
    .map((l) => JSON.parse(l))
    .filter((m) => m.to === coach.email)
    .at(-1);
  const resetToken = /token=([^\s]+)/.exec(msg?.text ?? "")?.[1];
  record("reset request: 200 + reset link delivered to dev mailbox", eq(req.status, 200) && !!resetToken, `200 token=${!!resetToken}`);

  const reset = await api("/api/auth/reset-password", {
    method: "POST",
    body: { newPassword: "proof-reset-9", token: resetToken },
    headers: { "x-forwarded-for": ip() },
  });
  record("reset consume: 200", eq(reset.status, 200), `${reset.status}`);

  const replay = await api("/api/auth/reset-password", {
    method: "POST",
    body: { newPassword: "proof-reset-10", token: resetToken },
    headers: { "x-forwarded-for": ip() },
  });
  record(
    "reset single-use: second consume 400 INVALID_TOKEN",
    eq(replay.status, 400) && replay.json?.code === "INVALID_TOKEN",
    `${replay.status} ${replay.text.slice(0, 80)}`,
  );

  // 8. Expired reset token -> 400.
  await prisma.verification.create({
    data: {
      identifier: "reset-password:expired-proof-token",
      value: "n/a",
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  const expired = await api("/api/auth/reset-password", {
    method: "POST",
    body: { newPassword: "proof-reset-9", token: "expired-proof-token" },
    headers: { "x-forwarded-for": ip() },
  });
  record("reset expiry: 400 INVALID_TOKEN", eq(expired.status, 400), `${expired.status}`);

  // 9. Session revocation on password change: t1 + t2 die, fresh token lives.
  const { token: s1 } = await signIn(coach.email, "proof-reset-9");
  const { token: s2 } = await signIn(coach.email, "proof-reset-9");
  const change = await api("/api/auth/change-password", {
    method: "POST",
    body: {
      currentPassword: "proof-reset-9",
      newPassword: "proof-final-8",
      revokeOtherSessions: true,
    },
    headers: { ...bearer(s1), "x-forwarded-for": ip() },
  });
  const s1After = await api("/api/auth/get-session", { headers: bearer(s1) });
  const s2After = await api("/api/auth/get-session", { headers: bearer(s2) });
  const freshTok = change.json?.token ?? change.headers.get("set-auth-token");
  const fresh = await api("/api/auth/get-session", { headers: bearer(freshTok) });
  record(
    "password change: prior sessions revoked, fresh session works",
    eq(change.status, 200) && eq(s1After.text, "null") && eq(s2After.text, "null") && fresh.json?.user?.email === coach.email,
    `old=${s1After.text === "null"},${s2After.text === "null"} new=${fresh.json?.user?.email ?? "none"}`,
  );

  // 10. Bearer roster: coach 200, foreign-workspace member 403, none 401.
  const membership = await prisma.workspaceMember.findFirstOrThrow({
    where: { user: { email: coach.email } },
    include: { workspace: true },
  });
  const roster = await api(
    `/api/v1/workspaces/${membership.workspaceId}/clients`,
    { headers: bearer(freshTok) },
  );
  record(
    "roster bearer 200 (literal JSON)",
    eq(roster.status, 200) && roster.json?.items !== undefined,
    `${roster.status} ${roster.text.slice(0, 120)}`,
  );

  // A member of a DIFFERENT workspace — same scrypt credential format the app
  // writes (lib/password.ts: scrypt$N$r$p$salt$hash).
  const salt = randomBytes(16);
  const derived = await new Promise((res, rej) =>
    scrypt(other.password.normalize("NFC"), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))),
  );
  const otherUser = await prisma.user.create({
    data: { email: other.email, name: "Other", status: "ACTIVE" },
  });
  await prisma.account.create({
    data: {
      userId: otherUser.id,
      accountId: otherUser.id,
      providerId: "credential",
      password: ["scrypt", 16384, 8, 1, salt.toString("base64"), derived.toString("base64")].join("$"),
    },
  });
  const otherWs = await prisma.workspace.create({
    data: { name: `Other WS ${tag}`, slug: `other-${tag}`, status: "ACTIVE" },
  });
  await prisma.workspaceMember.create({
    data: {
      workspaceId: otherWs.id,
      userId: otherUser.id,
      role: "COACH",
      status: "ACTIVE",
    },
  });
  const { token: otherTok } = await signIn(other.email, other.password);
  const foreign = await api(
    `/api/v1/workspaces/${membership.workspaceId}/clients`,
    { headers: bearer(otherTok) },
  );
  record("roster foreign-workspace member 403", eq(foreign.status, 403), `${foreign.status} ${foreign.text.slice(0, 80)}`);

  const anon = await api(`/api/v1/workspaces/${membership.workspaceId}/clients`);
  record("roster no credentials 401", eq(anon.status, 401), `${anon.status} ${anon.text.slice(0, 80)}`);
}

try {
  await browserSteps();
  await apiSteps();
} catch (error) {
  record("script error", false, String(error));
} finally {
  await prisma.$disconnect();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
