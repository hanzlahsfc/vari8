import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

import { accountLimitKey, userLimitKey } from "../../lib/auth/rate-limit";

/**
 * P716 spec-owned fixtures for the me-auth-look appearance cases.
 *
 * Ownership rules the shared-workspace repair was judged on:
 * - identities carry a per-invocation suffix, so two lanes on one DB can
 *   never share a row — nothing here can delete another run's fixtures;
 * - every created resource is recorded the moment its create/upsert
 *   returns, before the next operation, so a mid-setup throw still
 *   leaves a complete ownership record for cleanup;
 * - cleanup attempts every safe delete even when one fails, removes
 *   restrictive children (invitation tokens, profile, members, audit,
 *   reset verifications, sessions, accounts) before their parents, and
 *   reports every failure instead of swallowing or masking the original
 *   setup/test error;
 * - the browser-driven auth calls leave rows the setup never sees:
 *   `verification` reset rows (`value` = the run user id) and `rate_limit`
 *   buckets (`acct:<purpose>:<sha256(email|user:id)>`). Both are derived
 *   from this run's own identities, so cleanup recomputes the exact key
 *   set instead of sweeping by prefix. Buckets keyed on SHARED fixture
 *   identities (e.g. `acct:sign-in:<sha256(coach@s1h-e2e.test)>`) are not
 *   owned by this run and are left for global teardown.
 */

/** The subset of PrismaClient the fixture lifecycle needs — lets the
 * failure-path tests drive it with a mock. */
export type FixtureDb = Pick<
  PrismaClient,
  | "user"
  | "account"
  | "session"
  | "workspace"
  | "workspaceMember"
  | "clientProfile"
  | "accessToken"
  | "auditEvent"
  | "verification"
  | "rateLimit"
>;

export type InviteResult = {
  invitationId: string;
  delivery: { rawToken: string };
};

/** Injectable collaborators — real services in the spec, doubles in the
 * failure-path tests. */
export type MeLookDeps = {
  hashPassword: (password: string) => Promise<string>;
  createInvitation: (
    owner: { user: { id: string } },
    input: {
      workspaceId: string;
      targetEmail: string;
      intendedRole: "CLIENT" | "COACH";
    },
  ) => Promise<InviteResult>;
};

/** Everything setup managed to create — filled incrementally and still
 * valid when setup throws part-way. */
export type MeLookOwned = {
  runId: string;
  workspaceId?: string;
  clientProfileId?: string;
  userIds: string[];
  inviteTokenIds: string[];
};

export type MeLookFixture = MeLookOwned & {
  clientEmail: string;
  ownerEmail: string;
  workspaceSlug: string;
  clientInviteHref: string;
  staffInviteHref: string;
};

/** Every email identity a run can create state under — all derived from
 * the per-invocation runId, so keys built from them belong to this run. */
function meLookEmails(runId: string): string[] {
  return [
    `me-look-${runId}@s1h-e2e.test`,
    `me-look-owner-${runId}@s1h-e2e.test`,
    `me-look-client-invite-${runId}@s1h-e2e.test`,
    `me-look-staff-invite-${runId}@s1h-e2e.test`,
  ];
}

// Every purpose the codebase passes to `accountLimitKey`
// (lib/auth/server.ts sign-in + reset-request, lib/auth/signup.ts
// sign-up) and to `userLimitKey` (change-password, invitation-api
// invite-create, the v1 refresh route). Enumerating all of them keeps
// the owned key set exact: another run cannot mint any of these keys
// because the inputs are this run's own ids and emails.
const EMAIL_LIMIT_PURPOSES = ["sign-in", "reset-request", "sign-up"];
const USER_LIMIT_PURPOSES = ["change-password", "invite-create", "refresh"];

/**
 * The exact `rate_limit` keys this invocation can own: account buckets
 * hashed from the run's emails plus user buckets hashed from the run's
 * user ids. Keys for shared identities (E2E coach sign-in) are absent by
 * construction — deleting one would erase another lane's bucket.
 */
export function meLookRateLimitKeys(owned: MeLookOwned): string[] {
  const keys: string[] = [];
  for (const email of meLookEmails(owned.runId))
    for (const purpose of EMAIL_LIMIT_PURPOSES)
      keys.push(accountLimitKey(purpose, email));
  for (const userId of owned.userIds)
    for (const purpose of USER_LIMIT_PURPOSES)
      keys.push(userLimitKey(purpose, userId));
  return keys;
}

export function newMeLookOwned(): MeLookOwned {
  // Short unique suffix: `s1h-e2e-me-look-<run>` and
  // `me-look-<run>@s1h-e2e.test` stay inside the reserved e2e namespace
  // while being unique per invocation.
  return { runId: randomUUID().slice(0, 8), userIds: [], inviteTokenIds: [] };
}

export async function setupMeLookFixtures(
  prisma: FixtureDb,
  deps: MeLookDeps,
  owned: MeLookOwned,
): Promise<MeLookFixture> {
  const [clientEmail, ownerEmail, clientInviteEmail, staffInviteEmail] =
    meLookEmails(owned.runId);
  const workspaceSlug = `s1h-e2e-me-look-${owned.runId}`;
  const workspaceName = `S1H E2E Me Look ${owned.runId}`;
  const password = "s1h-e2e-password";

  const passwordHash = await deps.hashPassword(password);
  const upsertUser = async (email: string) => {
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash, status: "ACTIVE", name: email },
      create: { email, passwordHash, status: "ACTIVE", name: email },
    });
    // Recorded before the credential account is attempted — a failed
    // account.upsert must not orphan the just-created user.
    owned.userIds.push(user.id);
    await prisma.account.upsert({
      where: {
        providerId_accountId: {
          providerId: "credential",
          accountId: user.id,
        },
      },
      update: { password: passwordHash },
      create: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: passwordHash,
      },
    });
    return user;
  };

  const client = await upsertUser(clientEmail);
  const owner = await upsertUser(ownerEmail);

  const ws = await prisma.workspace.upsert({
    where: { slug: workspaceSlug },
    update: { name: workspaceName, status: "ACTIVE" },
    create: { slug: workspaceSlug, name: workspaceName, status: "ACTIVE" },
  });
  owned.workspaceId = ws.id;

  const upsertMember = (userId: string, role: "WORKSPACE_OWNER" | "CLIENT") =>
    prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: ws.id, userId } },
      update: { role, status: "ACTIVE" },
      create: { workspaceId: ws.id, userId, role, status: "ACTIVE" },
    });
  await upsertMember(owner.id, "WORKSPACE_OWNER");
  await upsertMember(client.id, "CLIENT");

  const existing = await prisma.clientProfile.findFirst({
    where: { userId: client.id, workspaceId: ws.id },
  });
  if (existing) {
    owned.clientProfileId = existing.id;
    if (existing.archivedAt) {
      await prisma.clientProfile.update({
        where: { id: existing.id },
        data: { archivedAt: null },
      });
    }
  } else {
    const created = await prisma.clientProfile.create({
      data: { userId: client.id, workspaceId: ws.id, name: "O17 Client" },
    });
    owned.clientProfileId = created.id;
  }

  // Each invitation is tracked the moment it is committed — if the second
  // create throws, the first token is already owned and gets cleaned.
  const clientInvite = await deps.createInvitation(
    { user: owner },
    {
      workspaceId: ws.id,
      targetEmail: clientInviteEmail,
      intendedRole: "CLIENT",
    },
  );
  owned.inviteTokenIds.push(clientInvite.invitationId);
  const staffInvite = await deps.createInvitation(
    { user: owner },
    {
      workspaceId: ws.id,
      targetEmail: staffInviteEmail,
      intendedRole: "COACH",
    },
  );
  owned.inviteTokenIds.push(staffInvite.invitationId);

  return {
    ...owned,
    clientEmail,
    ownerEmail,
    workspaceSlug,
    clientInviteHref: `/invite?workspace=${ws.id}&token=${clientInvite.delivery.rawToken}`,
    staffInviteHref: `/invite?workspace=${ws.id}&token=${staffInvite.delivery.rawToken}`,
  };
}

/**
 * Deletes only rows recorded in `owned` or derived from this run's own
 * identities. Every step runs even when an earlier one fails; failures
 * are collected and returned so the caller can surface them without
 * masking the original setup/test error. Restrict-FK children (tokens →
 * profile/members/audit → workspace; verifications/sessions/accounts →
 * users) go before their parents.
 *
 * Ownership boundary per delete (verified by the disposable-DB test):
 * - accessToken / clientProfile / auditEvent: this run's workspace id OR
 *   this run's user ids (the same boundary tests/e2e/fixture-sweep.ts
 *   uses for the reserved shell);
 * - workspaceMember / workspace: this run's workspace id only — a member
 *   row for our user in another workspace is never ours;
 * - verification: `value` carries the user id on reset rows
 *   (lib/auth/server.ts convention), so `value IN owned.userIds`;
 * - rateLimit: the exact recomputed key set from meLookRateLimitKeys —
 *   buckets for shared identities are not deleted;
 * - session / account / user: this run's user ids only.
 */
export async function cleanupMeLookFixtures(
  prisma: FixtureDb,
  owned: MeLookOwned,
): Promise<Error[]> {
  const errors: Error[] = [];
  const attempt = async (label: string, run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      errors.push(
        error instanceof Error
          ? new Error(`${label}: ${error.message}`)
          : new Error(`${label}: ${String(error)}`),
      );
    }
  };

  const hasUsers = owned.userIds.length > 0;
  const userScope = { in: owned.userIds };
  const ownedWorkspaceScope: Prisma.AccessTokenWhereInput[] = [
    ...(owned.workspaceId ? [{ workspaceId: owned.workspaceId }] : []),
    ...(hasUsers
      ? [{ userId: userScope }, { createdByUserId: userScope }]
      : []),
  ];
  const ownedAuditScope: Prisma.AuditEventWhereInput[] = [
    ...(owned.workspaceId ? [{ workspaceId: owned.workspaceId }] : []),
    ...(hasUsers
      ? [{ subjectUserId: userScope }, { actorUserId: userScope }]
      : []),
  ];

  if (ownedWorkspaceScope.length > 0) {
    await attempt("invitation tokens", () =>
      prisma.accessToken.deleteMany({
        where: { OR: ownedWorkspaceScope },
      }),
    );
    await attempt("client profile", () =>
      prisma.clientProfile.deleteMany({
        where: {
          OR: [
            ...(owned.workspaceId ? [{ workspaceId: owned.workspaceId }] : []),
            ...(hasUsers ? [{ userId: userScope }] : []),
            ...(owned.clientProfileId ? [{ id: owned.clientProfileId }] : []),
          ],
        },
      }),
    );
    await attempt("audit events", () =>
      prisma.auditEvent.deleteMany({ where: { OR: ownedAuditScope } }),
    );
  }
  if (owned.workspaceId) {
    // Membership rows belong to the workspace itself — scoped to this
    // run's workspace id only, never widened to the user ids.
    await attempt("workspace members", () =>
      prisma.workspaceMember.deleteMany({
        where: { workspaceId: owned.workspaceId },
      }),
    );
    await attempt("workspace", () =>
      prisma.workspace.deleteMany({ where: { id: owned.workspaceId } }),
    );
  }
  const rateLimitKeys = meLookRateLimitKeys(owned);
  if (rateLimitKeys.length > 0) {
    // Exact owned key set — never a prefix sweep. Shared-identity buckets
    // (the E2E coach sign-in) are not in the set and stay behind.
    await attempt("auth rate limits", () =>
      prisma.rateLimit.deleteMany({ where: { key: { in: rateLimitKeys } } }),
    );
  }
  if (hasUsers) {
    await attempt("reset verifications", () =>
      prisma.verification.deleteMany({ where: { value: userScope } }),
    );
    await attempt("sessions", () =>
      prisma.session.deleteMany({ where: { userId: userScope } }),
    );
    await attempt("credential accounts", () =>
      prisma.account.deleteMany({ where: { userId: userScope } }),
    );
    await attempt("users", () =>
      prisma.user.deleteMany({ where: { id: userScope } }),
    );
  }
  return errors;
}

/**
 * Spec teardown: cleanup, then disconnect — always, even when cleanup
 * reports failures or throws. Every failure (each labeled cleanup step,
 * a thrown cleanup, a failed disconnect) is collected and thrown as one
 * error at the end, so a secondary teardown failure is reported next to
 * — never instead of — the original setup/test error.
 */
export async function teardownMeLookFixtures(
  prisma: FixtureDb & Pick<PrismaClient, "$disconnect">,
  owned: MeLookOwned,
): Promise<void> {
  const failures: string[] = [];
  const describe = (error: unknown) =>
    error instanceof Error ? error.message : String(error);
  try {
    for (const error of await cleanupMeLookFixtures(prisma, owned)) {
      failures.push(`cleanup: ${error.message}`);
    }
  } catch (error) {
    failures.push(`cleanup: ${describe(error)}`);
  } finally {
    try {
      await prisma.$disconnect();
    } catch (error) {
      failures.push(`disconnect: ${describe(error)}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`me-look fixture teardown failed: ${failures.join("; ")}`);
  }
}
