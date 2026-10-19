import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../../lib/password";
import { passwordResetDeliveryConfigured } from "../../lib/auth/password-reset-boundary";
import { generateAccessToken } from "../../lib/tokens/crypto";
import { createWorkspaceInvitation } from "../../lib/workspace/invitations";
import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * Phase 3.2 — user-facing password reset E2E (PR-05 rewiring).
 *
 * Reset links are Better Auth `verification` rows
 * (`identifier = "reset-password:<token>"`, `value = userId`, 60-minute TTL,
 * consumed atomically on use). The spec mints the row directly — exactly the
 * shape `request-password-reset` writes — then the browser exercises
 * `/reset-request` and `/reset?token=…`. Created rows are namespaced
 * (`p32-*@s1h-e2e.test`) and removed in afterAll.
 *
 * The routes are capability-gated: every flow test skips while mail delivery
 * is unconfigured (the documented activation path). The gated-off assertions
 * at the bottom always run.
 */

const DELIVERY_UP = passwordResetDeliveryConfigured();
const GATED = !DELIVERY_UP;
const GATE_REASON = "mail delivery adapter not configured";

const prisma = new PrismaClient({
  datasources: { db: { url: e2eDatabaseUrl() } },
});

let ownerId: string;
let workspaceId: string;
const myEmails: string[] = [];
const myRawTokens: string[] = [];

function resetEmail(tag: string) {
  const email = `p32-${tag}-${Date.now()}@s1h-e2e.test`;
  myEmails.push(email);
  return email;
}

async function mkResettableUser(tag: string) {
  const email = resetEmail(tag);
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(E2E.password),
      name: `P32 ${tag}`,
      status: "ACTIVE",
    },
  });
}

const resetIdentifier = (rawToken: string) => `reset-password:${rawToken}`;

/** Mint a real reset token: the same verification row the auth flow writes. */
async function resetToken(email: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const { rawToken } = generateAccessToken();
  await prisma.verification.create({
    data: {
      identifier: resetIdentifier(rawToken),
      value: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return rawToken;
}

function trackToken(rawToken: string) {
  myRawTokens.push(rawToken);
}

test.beforeAll(async () => {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: E2E.owner },
  });
  ownerId = owner.id;
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { slug: E2E.workspaceSlug },
  });
  workspaceId = ws.id;
});

test.afterAll(async () => {
  await prisma.verification.deleteMany({
    where: {
      identifier: { in: myRawTokens.map(resetIdentifier) },
    },
  });
  const users = await prisma.user.findMany({
    where: { email: { in: myEmails } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  await prisma.verification.deleteMany({ where: { value: { in: userIds } } });
  await prisma.auditEvent.deleteMany({
    where: { subjectUserId: { in: userIds } },
  });
  await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.accessToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

async function signInExpect(
  page: Page,
  email: string,
  password: string,
): Promise<boolean> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Success navigates away from /login; failure renders .auth-error inline.
  const outcome = await Promise.race([
    page
      .waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 5000 })
      .then(() => "out" as const),
    page
      .locator(".auth-error")
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => "err" as const),
  ]).catch(() => "timeout" as const);
  return outcome === "out";
}

test.describe("reset request (/reset-request)", () => {
  test.skip(GATED, GATE_REASON);
  test("generic success for existing AND missing accounts — non-enumerating", async ({
    page,
  }) => {
    const u = await mkResettableUser("enum");
    await page.goto("/reset-request");
    await page.getByLabel("Email").fill(u.email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    const success = page.getByRole("status");
    await expect(success).toBeVisible();
    const existingMessage = await success.textContent();

    await page.goto("/reset-request");
    await page.getByLabel("Email").fill(`ghost-${Date.now()}@s1h-e2e.test`);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toHaveText(existingMessage!);
  });
});

test.describe("reset completion (/reset)", () => {
  test.skip(GATED, GATE_REASON);
  test("valid link sets a compliant password; old fails, new signs in", async ({
    page,
  }) => {
    const u = await mkResettableUser("valid");
    const rawToken = await resetToken(u.email);
    trackToken(rawToken);

    const resp = await page.goto(`/reset?token=${rawToken}`);
    expect(resp?.headers()["referrer-policy"]).toBe("no-referrer");
    expect(resp?.headers()["cache-control"]).toBe("no-store");

    // Policy rejections render accessible errors; the link stays usable.
    await page.getByLabel("New password").fill("tooshort1");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.locator(".auth-error")).toContainText(
      "at least 10 characters",
    );
    await page.getByLabel("New password").fill("abcdefghij");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.locator(".auth-error")).toContainText(
      "at least one digit (0–9)",
    );
    const stillLive = await prisma.verification.findUnique({
      where: { identifier: resetIdentifier(rawToken) },
    });
    expect(stillLive).not.toBeNull();

    const newPassword = `reset-${Date.now()}-pw1`;
    await page.getByLabel("New password").fill(newPassword);
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page).toHaveURL(/\/login\?reset=1/);
    await expect(page.getByRole("status")).toContainText(
      "password was updated",
    );

    // Old password rejected; new password works.
    expect(await signInExpect(page, u.email, E2E.password)).toBe(false);
    await expect(page.locator(".auth-error")).toContainText(
      "Invalid email or password",
    );
    expect(await signInExpect(page, u.email, newPassword)).toBe(true);
  });

  test("a consumed link fails safely on revisit", async ({ page }) => {
    const u = await mkResettableUser("consumed");
    const rawToken = await resetToken(u.email);
    trackToken(rawToken);
    await page.goto(`/reset?token=${rawToken}`);
    await page.getByLabel("New password").fill("consumed-passw0rd");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page).toHaveURL(/\/login\?reset=1/);
    // Revisit — the safe state, not the form.
    await page.goto(`/reset?token=${rawToken}`);
    await expect(page.getByLabel("New password")).toHaveCount(0);
    await expect(page.locator("main")).toContainText(
      "invalid, expired, or has already been used",
    );
    await expect(
      page.getByRole("link", { name: "Request a new link" }),
    ).toHaveAttribute("href", "/reset-request");
  });

  test("expired links fail safely", async ({ page }) => {
    const u2 = await mkResettableUser("expired");
    const exp = await resetToken(u2.email);
    trackToken(exp);
    await prisma.verification.update({
      where: { identifier: resetIdentifier(exp) },
      data: { expiresAt: new Date(Date.now() - 36 * 3600_000) },
    });
    await page.goto(`/reset?token=${exp}`);
    await expect(page.getByLabel("New password")).toHaveCount(0);
    await expect(page.locator("main")).toContainText("invalid");
  });

  test("malformed, unknown, and wrong-purpose links get the same safe state", async ({
    page,
  }) => {
    for (const bad of ["", "?token=bogus", `?token=${"z".repeat(42)}Z`]) {
      const resp = await page.goto(`/reset${bad}`);
      expect(resp?.headers()["referrer-policy"]).toBe("no-referrer");
      expect(resp?.headers()["cache-control"]).toBe("no-store");
      await expect(page.getByLabel("New password")).toHaveCount(0);
      await expect(page.locator("main")).toContainText("invalid");
    }
    // Wrong purpose: a live invite token is not a reset link.
    const inv = await createWorkspaceInvitation(
      { user: { id: ownerId } },
      {
        workspaceId,
        targetEmail: resetEmail("wrongpurpose"),
        intendedRole: "CLIENT",
      },
      prisma,
    );
    myRawTokens.push(inv.delivery.rawToken);
    await page.goto(`/reset?token=${inv.delivery.rawToken}`);
    await expect(page.getByLabel("New password")).toHaveCount(0);
    await expect(page.locator("main")).toContainText("invalid");
  });
});

test.describe("session invalidation", () => {
  test.skip(GATED, GATE_REASON);
  test("an existing session is signed out by the reset", async ({ page }) => {
    const u = await mkResettableUser("session");
    // Sign in first — prove the session worked before the reset.
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Password").fill(E2E.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));

    const rawToken = await resetToken(u.email);
    trackToken(rawToken);
    await page.goto(`/reset?token=${rawToken}`);
    await page.getByLabel("New password").fill("post-session-pw9");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page).toHaveURL(/\/login\?reset=1/);

    // The reset deleted this user's session rows — the old cookie is dead.
    await page.goto("/workspace");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("responsive + a11y", () => {
  test.skip(GATED, GATE_REASON);
});

test.describe("delivery gated off (current default)", () => {
  test("/reset-request returns 404", async ({ page }) => {
    const resp = await page.goto("/reset-request");
    expect(resp?.status()).toBe(404);
  });

  test("/reset returns 404 — including token-bearing URLs", async ({
    page,
  }) => {
    const resp = await page.goto("/reset");
    expect(resp?.status()).toBe(404);
    const resp2 = await page.goto(`/reset?token=${"a".repeat(42)}A`);
    expect(resp2?.status()).toBe(404);
    // The gated route never inspects the token: a REAL valid token also 404s.
    const u = await mkResettableUser("gated404");
    const rawToken = await resetToken(u.email);
    myRawTokens.push(rawToken);
    const resp3 = await page.goto(`/reset?token=${rawToken}`);
    expect(resp3?.status()).toBe(404);
  });
});
