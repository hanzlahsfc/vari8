import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

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
 *   restrictive children (invitation tokens, profile, members, audit)
 *   before their parents, and reports every failure instead of
 *   swallowing or masking the original setup/test error.
 */

/** The subset of PrismaClient the fixture lifecycle needs — lets the
 * failure-path tests drive it with a mock. */
export type FixtureDb = Pick<
  PrismaClient,
  | "user"
  | "account"
  | "workspace"
  | "workspaceMember"
  | "clientProfile"
  | "accessToken"
  | "auditEvent"
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
  const clientEmail = `me-look-${owned.runId}@s1h-e2e.test`;
  const ownerEmail = `me-look-owner-${owned.runId}@s1h-e2e.test`;
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
      targetEmail: `me-look-client-invite-${owned.runId}@s1h-e2e.test`,
      intendedRole: "CLIENT",
    },
  );
  owned.inviteTokenIds.push(clientInvite.invitationId);
  const staffInvite = await deps.createInvitation(
    { user: owner },
    {
      workspaceId: ws.id,
      targetEmail: `me-look-staff-invite-${owned.runId}@s1h-e2e.test`,
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
 * Deletes only rows recorded in `owned`. Every step runs even when an
 * earlier one fails; failures are collected and returned so the caller
 * can surface them without masking the original setup/test error.
 * Restrict-FK children (tokens → profile/members/audit → workspace →
 * accounts → users) go before their parents.
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

  if (owned.workspaceId) {
    // Workspace-scoped: covers invitation tokens whether or not the
    // tracking list caught them. The workspace id is this run's own —
    // per-run identity means it cannot belong to another fixture.
    await attempt("invitation tokens", () =>
      prisma.accessToken.deleteMany({
        where: { workspaceId: owned.workspaceId },
      }),
    );
    await attempt("client profile", () =>
      prisma.clientProfile.deleteMany({
        where: { id: owned.clientProfileId ?? "__none__" },
      }),
    );
    await attempt("workspace members", () =>
      prisma.workspaceMember.deleteMany({
        where: { workspaceId: owned.workspaceId },
      }),
    );
    await attempt("audit events", () =>
      prisma.auditEvent.deleteMany({
        where: { workspaceId: owned.workspaceId },
      }),
    );
    await attempt("workspace", () =>
      prisma.workspace.deleteMany({ where: { id: owned.workspaceId } }),
    );
  }
  if (owned.userIds.length > 0) {
    await attempt("credential accounts", () =>
      prisma.account.deleteMany({ where: { userId: { in: owned.userIds } } }),
    );
    await attempt("users", () =>
      prisma.user.deleteMany({ where: { id: { in: owned.userIds } } }),
    );
  }
  return errors;
}
