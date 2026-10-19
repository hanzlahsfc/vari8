import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../../lib/password";
import { createWorkspaceInvitation } from "../../lib/workspace/invitations";
import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * Phase 3.1 — user-facing invite acceptance E2E.
 *
 * Real invitations are issued through the reviewed service against the shared
 * E2E workspace; the browser then exercises `/invite?workspace=…&token=…`.
 * Created rows are namespaced (`p31-*@s1h-e2e.test`) and removed in afterAll
 * so teardown's reserved-row cleanup stays intact.
 */

const prisma = new PrismaClient({
  datasources: { db: { url: e2eDatabaseUrl() } },
});

let ownerId: string;
let workspaceId: string;
let workspaceBId: string;
const myEmails: string[] = [];
const myTokenIds: string[] = [];
const myUserIds: string[] = [];

async function invite(
  targetEmail: string,
  role: "COACH" | "ASSISTANT_COACH" | "CLIENT" = "CLIENT",
  wsId: string = workspaceId,
) {
  myEmails.push(targetEmail);
  const r = await createWorkspaceInvitation(
    { user: { id: ownerId } },
    { workspaceId: wsId, targetEmail, intendedRole: role },
    prisma,
  );
  myTokenIds.push(r.invitationId);
  return `/invite?workspace=${wsId}&token=${r.delivery.rawToken}`;
}

test.beforeAll(async () => {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: E2E.owner },
  });
  ownerId = owner.id;
  const [wsA, wsB] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { slug: E2E.workspaceSlug },
    }),
    prisma.workspace.findUniqueOrThrow({
      where: { slug: E2E.workspaceBSlug },
    }),
  ]);
  workspaceId = wsA.id;
  workspaceBId = wsB.id;
});

test.afterAll(async () => {
  await prisma.auditEvent.deleteMany({
    where: {
      OR: [
        { resourceId: { in: myTokenIds } },
        { actorUserId: { in: myUserIds } },
      ],
    },
  });
  await prisma.accessToken.deleteMany({
    where: { id: { in: myTokenIds } },
  });
  await prisma.clientProfile.deleteMany({
    where: { userId: { in: myUserIds } },
  });
  await prisma.workspaceMember.deleteMany({
    where: { userId: { in: myUserIds } },
  });
  await prisma.user.deleteMany({ where: { email: { in: myEmails } } });
  await prisma.$disconnect();
});

function inviteeEmail(tag: string) {
  return `p31-${tag}-${Date.now()}@s1h-e2e.test`;
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test.describe("anonymous acceptance (new account)", () => {
  test("valid invite creates the account and hands off to sign-in", async ({
    page,
  }) => {
    const email = inviteeEmail("new");
    await page.goto(await invite(email));

    await expect(
      page.getByRole("heading", { name: "Accept your invitation" }),
    ).toBeVisible();
    await page.getByLabel("Your name").fill("E2E Invitee");
    await page.getByLabel("Password").fill("member-passw0rd-1");
    await page.getByRole("button", { name: "Create account and join" }).click();

    await expect(page).toHaveURL(/\/login\?inviteAccepted=1/);
    await expect(page.getByRole("status")).toContainText(
      "invitation was accepted",
    );

    // The new credentials work through the ordinary sign-in.
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("member-passw0rd-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));

    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    myUserIds.push(u.id);
    expect(u.status).toBe("ACTIVE");
    const m = await prisma.workspaceMember.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId, userId: u.id } },
    });
    expect(m.role).toBe("CLIENT");
    expect(m.status).toBe("ACTIVE");
  });

  test("policy rejections render accessible errors and leave the token usable", async ({
    page,
  }) => {
    const email = inviteeEmail("policy");
    const link = await invite(email);
    await page.goto(link);

    await page.getByLabel("Your name").fill("Policy Check");
    await page.getByLabel("Password").fill("tooshort1");
    await page.getByRole("button", { name: "Create account and join" }).click();
    await expect(page.locator(".auth-error")).toContainText(
      "at least 10 characters",
    );

    // React resets uncontrolled fields after an action; the name is restored
    // via action state, the password (deliberately) is not.
    await expect(page.getByLabel("Your name")).toHaveValue("Policy Check");
    await page.getByLabel("Password").fill("abcdefghij");
    await page.getByRole("button", { name: "Create account and join" }).click();
    await expect(page.locator(".auth-error")).toContainText(
      "at least one digit (0–9)",
    );

    // Both rejections left zero account state — the link still works.
    await page.getByLabel("Password").fill("valid-passw0rd");
    await page.getByRole("button", { name: "Create account and join" }).click();
    await expect(page).toHaveURL(/\/login\?inviteAccepted=1/);
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    myUserIds.push(u.id);
  });

  test("a consumed link fails safely on revisit", async ({ page }) => {
    const email = inviteeEmail("reuse");
    const link = await invite(email);
    await page.goto(link);
    await page.getByLabel("Your name").fill("Reuse");
    await page.getByLabel("Password").fill("valid-passw0rd");
    await page.getByRole("button", { name: "Create account and join" }).click();
    await expect(page).toHaveURL(/\/login/);

    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    myUserIds.push(u.id);

    // Reopening the same link shows the safe invalid state — no form.
    await page.goto(link);
    await expect(
      page.getByRole("heading", { name: "Invitation" }),
    ).toBeVisible();
    await expect(
      page.getByText(/invalid, expired, or has already been used/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create account and join" }),
    ).toHaveCount(0);
  });
});

test.describe("invalid link states", () => {
  test("/invite responses send Referrer-Policy: no-referrer", async ({
    page,
  }) => {
    // The token lives in the URL — the document must never leak it via the
    // Referer header to subresources or link targets.
    const valid = await page.goto(await invite(inviteeEmail("refpolicy")));
    expect(valid?.headers()["referrer-policy"]).toBe("no-referrer");
    // …and the invalid-link state gets the same protection.
    const invalid = await page.goto("/invite?workspace=x&token=bogus");
    expect(invalid?.headers()["referrer-policy"]).toBe("no-referrer");
  });

  test("malformed and unknown tokens show the same safe state", async ({
    page,
  }) => {
    for (const token of ["bogus", `${"a".repeat(42)}A`]) {
      await page.goto(`/invite?workspace=${workspaceId}&token=${token}`);
      await expect(
        page.getByText(/invalid, expired, or has already been used/),
      ).toBeVisible();
      await expect(page.locator("form")).toHaveCount(0);
    }
    await page.goto("/invite");
    await expect(
      page.getByText(/invalid, expired, or has already been used/),
    ).toBeVisible();
  });

  test("revoked and expired invites fail safely", async ({ page }) => {
    const revokedEmail = inviteeEmail("revoked");
    const revokedLink = await invite(revokedEmail);
    await prisma.accessToken.updateMany({
      where: { targetEmail: revokedEmail },
      data: { revokedAt: new Date() },
    });
    await page.goto(revokedLink);
    await expect(
      page.getByText(/invalid, expired, or has already been used/),
    ).toBeVisible();

    const expiredEmail = inviteeEmail("expired");
    const expiredLink = await invite(expiredEmail);
    await prisma.accessToken.updateMany({
      where: { targetEmail: expiredEmail },
      data: {
        createdAt: new Date(Date.now() - 13 * 3600_000),
        expiresAt: new Date(Date.now() - 3600_000),
      },
    });
    await page.goto(expiredLink);
    await expect(
      page.getByText(/invalid, expired, or has already been used/),
    ).toBeVisible();
    // No account was created for either.
    expect(
      await prisma.user.count({
        where: { email: { in: [revokedEmail, expiredEmail] } },
      }),
    ).toBe(0);
  });
});

test.describe("signed-in acceptance", () => {
  test("an existing user accepts without a password prompt", async ({
    page,
  }) => {
    const email = inviteeEmail("existing");
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(E2E.password),
        name: "E2E Existing",
        status: "ACTIVE",
      },
    });
    myUserIds.push(u.id);
    const link = await invite(email, "COACH", workspaceBId);

    await signIn(page, email);
    await page.goto(link);
    // Signed-in path: no account-creation fields, one confirm action.
    await expect(page.getByLabel("Password")).toHaveCount(0);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(page).toHaveURL("/");

    const m = await prisma.workspaceMember.findUniqueOrThrow({
      where: {
        workspaceId_userId: { workspaceId: workspaceBId, userId: u.id },
      },
    });
    expect(m.role).toBe("COACH");
    expect(m.status).toBe("ACTIVE");
  });

  test("a different signed-in account gets the safe mismatch state", async ({
    page,
  }) => {
    const email = inviteeEmail("mismatch");
    await signIn(page, E2E.nonmember);
    await page.goto(await invite(email));
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(page.locator(".auth-error")).toContainText(
      "belongs to a different account",
    );
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });
});
