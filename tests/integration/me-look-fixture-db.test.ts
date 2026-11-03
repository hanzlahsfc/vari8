import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { auth as authServer } from "../../lib/auth/server";
import { requestPasswordResetFromForm } from "../../lib/auth/password-reset-boundary";
import { accountLimitKey } from "../../lib/auth/rate-limit";
import { hashPassword } from "../../lib/password";
import { createWorkspaceInvitation } from "../../lib/workspace/invitations";
import {
  cleanupMeLookFixtures,
  meLookRateLimitKeys,
  newMeLookOwned,
  setupMeLookFixtures,
  type MeLookDeps,
  type MeLookFixture,
  type MeLookOwned,
} from "../e2e/me-look-fixture";
import { setTestHeaders } from "./stubs/next-headers";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";
const GATE = { deliveryAvailable: true };

/**
 * P718 disposable-DB proof for the me-look fixture lifecycle, against the
 * real migrated schema and the real Better Auth pipeline — the coverage
 * the in-memory fake cannot give:
 *
 * - the spec's browser auth calls are replayed for real (sign-in →
 *   session + `acct:sign-in` bucket; reset-request → `verification` row +
 *   `acct:reset-request` bucket), so the residue the #252 review found is
 *   reproduced and then deleted;
 * - every cleanup `where` clause is exercised against real rows — a wrong
 *   or broad filter shows up as residue or as deleted foreign rows;
 * - a genuine `Restrict` child (a client_assignment pinning the run
 *   profile and the owner membership) proves the failure path the old
 *   mocks faked: the workspace delete CANNOT succeed while its member
 *   delete fails, and every step is still attempted and reported;
 * - the whole cycle runs twice on the same database — no residue
 *   accumulates and no foreign row is ever touched.
 */
describe.skipIf(!enabled)("me-look fixture cleanup on real PostgreSQL", () => {
  let prisma: PrismaClient;
  let originalMailbox: string | undefined;
  // Every sentinel bucket planted by foreign tenants across the whole
  // file — the trace check asserts no row exists outside owned ∪ this.
  const sentinelRateKeys = new Set<string>();

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    originalMailbox = process.env.DEV_MAILBOX_FILE;
  });

  afterAll(async () => {
    if (originalMailbox === undefined) delete process.env.DEV_MAILBOX_FILE;
    else process.env.DEV_MAILBOX_FILE = originalMailbox;
    await prisma?.$disconnect();
  });

  beforeEach(() => {
    process.env.DEV_MAILBOX_FILE = path.join(
      mkdtempSync(path.join(tmpdir(), "mb-melook-")),
      "mailbox.jsonl",
    );
    setTestHeaders(new Headers());
  });

  const realDeps = (): MeLookDeps => ({
    hashPassword,
    createInvitation: (owner, input) =>
      createWorkspaceInvitation(owner, input, prisma),
  });

  /** The spec's auth surface for real: client sign-in (session +
   * `acct:sign-in` bucket) and a reset request (verification row +
   * `acct:reset-request` bucket + dev-file mail). Returns the epoch-ms
   * the driving started at — `rate_limit.last_request` lets the trace
   * check scope itself to rows this call created, so leftover rows from
   * an earlier crashed process cannot produce a false positive. */
  async function driveSpecAuthCalls(fixture: MeLookFixture) {
    const startedAt = Date.now();
    const signIn = await authServer.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: fixture.clientEmail,
          password: "s1h-e2e-password",
        }),
      }),
    );
    expect(signIn.status).toBe(200);
    const reset = await requestPasswordResetFromForm(fixture.clientEmail, GATE);
    expect(reset.ok).toBe(true);
    return startedAt;
  }

  /** A foreign tenant whose rows overlap every owned filter shape —
   * any over-broad delete would erase one of these. */
  async function plantForeignTenant() {
    // A namespace disjoint from every run tag — the run-residue
    // namespace scan must never match a foreign row.
    const tag = randomUUID().slice(0, 8);
    const email = `p718-foreign-${tag}@example.test`;
    const user = await prisma.user.create({
      data: { email, name: "foreign", status: "ACTIVE" },
    });
    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: "x",
      },
    });
    await prisma.session.create({
      data: { userId: user.id, token: `ft-${tag}`, expiresAt: future() },
    });
    const ws = await prisma.workspace.create({
      data: { slug: `p718-foreign-${tag}`, name: "Foreign" },
    });
    const owner = await prisma.user.create({
      data: { email: `p718-foreign-owner-${tag}@example.test`, name: "fo" },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: ws.id,
        userId: owner.id,
        role: "WORKSPACE_OWNER",
        status: "ACTIVE",
      },
    });
    await prisma.clientProfile.create({
      data: { workspaceId: ws.id, userId: user.id, name: "Foreign Client" },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: ws.id,
        userId: user.id,
        role: "CLIENT",
        status: "ACTIVE",
      },
    });
    await prisma.accessToken.create({
      data: {
        purpose: "PASSWORD_RESET",
        tokenHash: createHash("sha256").update(`ft-${tag}`).digest("hex"),
        userId: user.id,
        expiresAt: future(),
      },
    });
    // Account-scope audit row: subjectUserId Restrict-references the
    // foreign user — survives only if the owned delete stays scoped.
    await prisma.auditEvent.create({
      data: {
        scope: "ACCOUNT",
        subjectUserId: user.id,
        action: "LOGIN",
        resourceType: "user",
        result: "ALLOW",
      },
    });
    await prisma.verification.create({
      data: {
        identifier: `reset-password:foreign-${tag}`,
        value: user.id,
        expiresAt: future(),
      },
    });
    // Buckets the run must not touch: the foreign account's sign-in
    // bucket and the shared E2E coach identity's bucket shape.
    const foreignKeys = [
      accountLimitKey("sign-in", email),
      accountLimitKey("sign-in", "coach@s1h-e2e.test"),
    ];
    for (const key of foreignKeys) {
      sentinelRateKeys.add(key);
      // Upsert: the shared-identity bucket already exists when an
      // earlier test in this file planted it — it stays foreign either
      // way.
      await prisma.rateLimit.upsert({
        where: { key },
        update: {},
        create: { key, count: 1, lastRequest: BigInt(Date.now()) },
      });
    }
    return tag;
  }

  const future = () => new Date(Date.now() + 60 * 60 * 1000);

  async function foreignTenantAlive(tag: string) {
    const email = `p718-foreign-${tag}@example.test`;
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user, "foreign user deleted").not.toBeNull();
    const ws = await prisma.workspace.findUnique({
      where: { slug: `p718-foreign-${tag}` },
    });
    expect(ws, "foreign workspace deleted").not.toBeNull();
    expect(
      await prisma.workspaceMember.count({
        where: { workspaceId: ws!.id },
      }),
    ).toBe(2);
    expect(
      await prisma.clientProfile.count({ where: { workspaceId: ws!.id } }),
    ).toBe(1);
    expect(
      await prisma.accessToken.count({ where: { userId: user!.id } }),
    ).toBe(1);
    expect(
      await prisma.auditEvent.count({ where: { subjectUserId: user!.id } }),
    ).toBe(1);
    expect(
      await prisma.verification.count({ where: { value: user!.id } }),
    ).toBe(1);
    expect(await prisma.session.count({ where: { userId: user!.id } })).toBe(1);
    expect(
      await prisma.rateLimit.count({
        where: {
          key: {
            in: [
              accountLimitKey("sign-in", email),
              accountLimitKey("sign-in", "coach@s1h-e2e.test"),
            ],
          },
        },
      }),
    ).toBe(2);
  }

  /** Zero residue for a run, checked two ways: by the tracked owned ids
   * and by the run's identity namespace (read-only, so a wide scan is
   * safe here — it is the check, not the delete). */
  async function expectNoRunResidue(owned: MeLookOwned) {
    const runTag = owned.runId;
    const checks: [string, Promise<number>][] = [
      [
        "users by namespace",
        prisma.user.count({ where: { email: { contains: runTag } } }),
      ],
      [
        "users by id",
        prisma.user.count({ where: { id: { in: owned.userIds } } }),
      ],
      [
        "accounts",
        prisma.account.count({ where: { userId: { in: owned.userIds } } }),
      ],
      [
        "sessions",
        prisma.session.count({ where: { userId: { in: owned.userIds } } }),
      ],
      [
        "workspaces by namespace",
        prisma.workspace.count({ where: { slug: { contains: runTag } } }),
      ],
      [
        "workspace members",
        prisma.workspaceMember.count({
          where: {
            OR: [
              { workspaceId: owned.workspaceId ?? "__none__" },
              { userId: { in: owned.userIds } },
            ],
          },
        }),
      ],
      [
        "client profiles",
        prisma.clientProfile.count({
          where: {
            OR: [
              { workspaceId: owned.workspaceId ?? "__none__" },
              { userId: { in: owned.userIds } },
            ],
          },
        }),
      ],
      [
        "invitation tokens",
        prisma.accessToken.count({
          where: {
            OR: [
              { workspaceId: owned.workspaceId ?? "__none__" },
              { userId: { in: owned.userIds } },
              { createdByUserId: { in: owned.userIds } },
              { targetEmail: { contains: runTag } },
            ],
          },
        }),
      ],
      [
        "audit events",
        prisma.auditEvent.count({
          where: {
            OR: [
              { workspaceId: owned.workspaceId ?? "__none__" },
              { subjectUserId: { in: owned.userIds } },
              { actorUserId: { in: owned.userIds } },
            ],
          },
        }),
      ],
      [
        "reset verifications",
        prisma.verification.count({
          where: { value: { in: owned.userIds } },
        }),
      ],
      [
        "rate limits",
        prisma.rateLimit.count({
          where: { key: { in: meLookRateLimitKeys(owned) } },
        }),
      ],
    ];
    for (const [label, count] of checks)
      expect(await count, `${label} residue`).toBe(0);
  }

  /** The review's residue reproduced: prove the rows a spec run leaves
   * actually exist before cleanup removes them. `since` scopes the
   * rate-limit trace to this run's own auth calls. */
  async function expectRunArtifactsPresent(owned: MeLookOwned, since: number) {
    const [clientId] = owned.userIds;
    expect(
      await prisma.session.count({ where: { userId: clientId } }),
    ).toBeGreaterThan(0);
    const verifications = await prisma.verification.findMany({
      where: { value: { in: owned.userIds } },
    });
    expect(verifications.length).toBeGreaterThan(0);
    const ownedKeys = meLookRateLimitKeys(owned);
    const rateRows = await prisma.rateLimit.findMany({
      where: { key: { in: ownedKeys } },
    });
    const presentKeys = rateRows.map((r) => r.key);
    // The exact keys the spec's auth calls mint: sign-in (index 0) and
    // reset-request (index 1) buckets of the run client email.
    expect(presentKeys).toContain(ownedKeys[0]);
    expect(presentKeys).toContain(ownedKeys[1]);
    // Nothing outside the computed owned set carries run state: every
    // rate_limit row written since this run's auth calls is either a
    // planted sentinel or inside this run's owned key set.
    const freshKeys = (
      await prisma.rateLimit.findMany({
        where: { lastRequest: { gte: BigInt(since) } },
        select: { key: true },
      })
    ).map((r) => r.key);
    for (const key of freshKeys)
      if (!sentinelRateKeys.has(key)) expect(ownedKeys).toContain(key);
    expect(
      await prisma.accessToken.count({
        where: { workspaceId: owned.workspaceId },
      }),
    ).toBe(2);
    expect(
      await prisma.auditEvent.count({
        where: { workspaceId: owned.workspaceId },
      }),
    ).toBeGreaterThan(0);
  }

  it("a full spec-shaped run leaves zero residue and spares the foreign tenant", async () => {
    const owned = newMeLookOwned();
    const foreign = await plantForeignTenant();
    const fixture = await setupMeLookFixtures(prisma, realDeps(), owned);
    const since = await driveSpecAuthCalls(fixture);
    await expectRunArtifactsPresent(owned, since);

    const errors = await cleanupMeLookFixtures(prisma, owned);
    expect(errors).toEqual([]);
    await expectNoRunResidue(owned);
    await foreignTenantAlive(foreign);

    // Idempotent: a second cleanup of the same record is a no-op.
    expect(await cleanupMeLookFixtures(prisma, owned)).toEqual([]);
  });

  it("a second independent run on the same database repeats clean", async () => {
    const owned = newMeLookOwned();
    const foreign = await plantForeignTenant();
    const fixture = await setupMeLookFixtures(prisma, realDeps(), owned);
    const since = await driveSpecAuthCalls(fixture);
    await expectRunArtifactsPresent(owned, since);

    expect(await cleanupMeLookFixtures(prisma, owned)).toEqual([]);
    await expectNoRunResidue(owned);
    await foreignTenantAlive(foreign);
  });

  it("a mid-setup failure still leaves a complete owned set that cleans to zero", async () => {
    const owned = newMeLookOwned();
    const foreign = await plantForeignTenant();
    let inviteCalls = 0;
    await expect(
      setupMeLookFixtures(
        prisma,
        {
          hashPassword,
          createInvitation: (owner, input) => {
            inviteCalls += 1;
            if (inviteCalls === 2) throw new Error("provider down");
            return createWorkspaceInvitation(owner, input, prisma);
          },
        },
        owned,
      ),
    ).rejects.toThrow("provider down");

    // Everything before the failed second invite was committed: two
    // users+accounts, the workspace tree, and the first token+audit.
    expect(owned.userIds).toHaveLength(2);
    expect(owned.inviteTokenIds).toHaveLength(1);
    expect(
      await prisma.accessToken.count({
        where: { workspaceId: owned.workspaceId },
      }),
    ).toBe(1);

    expect(await cleanupMeLookFixtures(prisma, owned)).toEqual([]);
    await expectNoRunResidue(owned);
    await foreignTenantAlive(foreign);
  });

  it("a live Restrict violation reports each failure and cannot skip ahead", async () => {
    const owned = newMeLookOwned();
    const foreign = await plantForeignTenant();
    const fixture = await setupMeLookFixtures(prisma, realDeps(), owned);
    await driveSpecAuthCalls(fixture);

    // A Restrict child the fixture legitimately does not sweep — the
    // spec never creates assignments. It pins the run client profile
    // and the owner's membership, so the real FK chain fails for the
    // profile, members, workspace and users — in that order.
    const ownerMember = await prisma.workspaceMember.findFirstOrThrow({
      where: {
        workspaceId: owned.workspaceId,
        userId: owned.userIds[1],
      },
    });
    const blocker = await prisma.clientAssignment.create({
      data: {
        workspaceId: owned.workspaceId!,
        clientProfileId: owned.clientProfileId!,
        coachMemberId: ownerMember.id,
        role: "PRIMARY",
      },
    });

    const errors = await cleanupMeLookFixtures(prisma, owned);
    const labels = errors.map((e) => e.message);
    for (const label of [
      "client profile",
      "workspace members",
      "workspace",
      "users",
    ]) {
      expect(
        labels.some((m) => m.startsWith(`${label}:`)),
        `expected a labeled ${label} failure in ${labels.join(" | ")}`,
      ).toBe(true);
    }

    // The protected parents are still there — the real FK did what the
    // old mock could not express.
    expect(
      await prisma.workspace.findUnique({
        where: { id: owned.workspaceId },
      }),
    ).not.toBeNull();
    expect(
      await prisma.workspaceMember.count({
        where: { workspaceId: owned.workspaceId },
      }),
    ).toBe(2);
    expect(
      await prisma.clientProfile.findUnique({
        where: { id: owned.clientProfileId },
      }),
    ).not.toBeNull();
    expect(
      await prisma.user.count({ where: { id: { in: owned.userIds } } }),
    ).toBe(2);

    // Everything without a live blocker was still deleted.
    expect(
      await prisma.accessToken.count({
        where: { workspaceId: owned.workspaceId },
      }),
    ).toBe(0);
    expect(
      await prisma.auditEvent.count({
        where: { workspaceId: owned.workspaceId },
      }),
    ).toBe(0);
    expect(
      await prisma.verification.count({
        where: { value: { in: owned.userIds } },
      }),
    ).toBe(0);
    expect(
      await prisma.rateLimit.count({
        where: { key: { in: meLookRateLimitKeys(owned) } },
      }),
    ).toBe(0);
    expect(
      await prisma.session.count({
        where: { userId: { in: owned.userIds } },
      }),
    ).toBe(0);
    expect(
      await prisma.account.count({
        where: { userId: { in: owned.userIds } },
      }),
    ).toBe(0);
    await foreignTenantAlive(foreign);

    // Remove the blocker and re-run: the same owned set cleans to zero.
    await prisma.clientAssignment.delete({ where: { id: blocker.id } });
    expect(await cleanupMeLookFixtures(prisma, owned)).toEqual([]);
    await expectNoRunResidue(owned);
    await foreignTenantAlive(foreign);
  });
});
