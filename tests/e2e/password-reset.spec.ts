import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../../lib/password";
import { requestPasswordReset } from "../../lib/auth/password-reset";
import { passwordResetDeliveryAvailable } from "../../lib/auth/password-reset-delivery";
import { createWorkspaceInvitation } from "../../lib/workspace/invitations";
import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * Phase 3.2 — user-facing password reset E2E.
 *
 * Reset tokens are issued through the reviewed service (delivery seam
 * captured), then the browser exercises `/reset-request` and
 * `/reset?token=…`. Created rows are namespaced (`p32-*@s1h-e2e.test`) and
 * removed in afterAll so teardown's reserved-row cleanup stays intact.
 *
 * The routes are capability-gated: every flow test skips while no real
 * delivery adapter is registered (the documented activation path). The
 * gated-off assertions at the bottom always run.
 */

// True only when a REAL adapter is registered AND selected — an env value
// alone can never enable this (the registry is empty until a provider lands).
const DELIVERY_UP = passwordResetDeliveryAvailable(
  process.env.PASSWORD_RESET_DELIVERY_ADAPTER,
);
const GATED = !DELIVERY_UP;
const GATE_REASON = "password-reset delivery adapter not configured";

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

/** Issue a real reset token via the service, capturing the delivery seam. */
async function resetToken(email: string): Promise<string> {
  const payloads: { rawToken: string }[] = [];
  await requestPasswordReset(
    { email },
    { deliver: (p) => void payloads.push(p) },
    prisma,
  );
  return payloads[0].rawToken;
}

function trackToken(rawToken: string) {
  myRawTokens.push(rawToken); // resolved to row ids in afterAll
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
  const hashes = await Promise.all(
    myRawTokens.map(async (raw) => {
      const { hashAccessToken } = await import("../../lib/tokens/crypto");
      return hashAccessToken(raw);
    }),
  );
  const tokenIds = (
    await prisma.accessToken.findMany({
      where: { tokenHash: { in: hashes } },
      select: { id: true },
    })
  ).map((t) => t.id);
  await prisma.auditEvent.deleteMany({
    where: { resourceId: { in: tokenIds } },
  });
  await prisma.accessToken.deleteMany({ where: { id: { in: tokenIds } } });
  const users = await prisma.user.findMany({
    where: { email: { in: myEmails } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  await prisma.auditEvent.deleteMany({
    where: { subjectUserId: { in: userIds } },
  });
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
    const stillLive = await prisma.accessToken.findUnique({
      where: {
        tokenHash:
          // token still unclaimed after the rejections
          (await import("../../lib/tokens/crypto")).hashAccessToken(rawToken),
      },
    });
    expect(stillLive?.consumedAt).toBeNull();

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

  test("revoked (superseded) and expired links fail safely", async ({
    page,
  }) => {
    const u = await mkResettableUser("revoked");
    const first = await resetToken(u.email);
    trackToken(first);
    const second = await resetToken(u.email); // sibling rule revokes `first`
    trackToken(second);
    await page.goto(`/reset?token=${first}`);
    await expect(page.getByLabel("New password")).toHaveCount(0);
    await expect(page.locator("main")).toContainText("invalid");

    const u2 = await mkResettableUser("expired");
    const exp = await resetToken(u2.email);
    trackToken(exp);
    const { hashAccessToken } = await import("../../lib/tokens/crypto");
    await prisma.accessToken.update({
      where: { tokenHash: hashAccessToken(exp) },
      data: {
        createdAt: new Date(Date.now() - 48 * 3600_000),
        expiresAt: new Date(Date.now() - 36 * 3600_000),
      },
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

    // sessionVersion++ must invalidate the previously-issued JWT cookie.
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
