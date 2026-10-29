import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { verifyPassword } from "../../lib/password";

/**
 * SEED-FIX: the development seed must write a Better Auth credential
 * `accounts` row for every seeded sign-in user — since PR-05 credential
 * sign-in reads `accounts`, a seed that only writes `users.passwordHash`
 * produces a database nobody can sign in to. The seed runs through the real
 * `npm run seed:dev` entrypoint (`tsx scripts/seed/index.ts`) against the
 * disposable integration database; each stored hash is checked with the same
 * `verifyPassword` the auth server uses.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const SEED_ENV = {
  SEED_OWNER_EMAIL: "seed-owner@seed-fix.test",
  SEED_OWNER_PASSWORD: "seed-owner-pass-1",
  SEED_COACH_EMAIL: "seed-coach@seed-fix.test",
  SEED_COACH_PASSWORD: "seed-coach-pass-1",
  SEED_CLIENT_EMAIL: "seed-client@seed-fix.test",
  SEED_CLIENT_PASSWORD: "seed-client-pass-1",
  SEED_STAFF2_EMAIL: "seed-staff2@seed-fix.test",
  SEED_STAFF2_PASSWORD: "seed-staff2-pass-1",
};

function runSeed() {
  // Exactly what `npm run seed:dev` invokes, with the lane/test env pointed
  // at the disposable integration database.
  execFileSync("npx", ["tsx", "scripts/seed/index.ts"], {
    stdio: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: url as string,
      ...SEED_ENV,
    },
  });
}

describe.skipIf(!enabled)(
  "SEED-FIX: seed writes sign-in credentials (real PG + real seed entrypoint)",
  () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
      execFileSync("npx", ["prisma", "migrate", "deploy"], {
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: url as string },
      });
      runSeed();
      prisma = new PrismaClient({
        datasources: { db: { url: url as string } },
      });
    }, 120_000);

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    /** Asserts the user exists and holds a working credential account. */
    async function expectCredential(email: string, password: string) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email },
        select: { id: true, passwordHash: true },
      });
      // `users.passwordHash` is read-dead after PR-05 (PR-R2 removal marker):
      // the seed must not write it.
      expect(user.passwordHash).toBe("");
      const account = await prisma.account.findUnique({
        where: {
          providerId_accountId: {
            providerId: "credential",
            accountId: user.id,
          },
        },
      });
      expect(account).not.toBeNull();
      expect(account?.userId).toBe(user.id);
      expect(await verifyPassword(password, account?.password ?? "")).toBe(
        true,
      );
      return user;
    }

    it("owner, coach, client and second-workspace staff get sign-in credentials", async () => {
      const owner = await expectCredential(
        SEED_ENV.SEED_OWNER_EMAIL,
        SEED_ENV.SEED_OWNER_PASSWORD,
      );
      const coach = await expectCredential(
        SEED_ENV.SEED_COACH_EMAIL,
        SEED_ENV.SEED_COACH_PASSWORD,
      );
      const client = await expectCredential(
        SEED_ENV.SEED_CLIENT_EMAIL,
        SEED_ENV.SEED_CLIENT_PASSWORD,
      );
      const staff2 = await expectCredential(
        SEED_ENV.SEED_STAFF2_EMAIL,
        SEED_ENV.SEED_STAFF2_PASSWORD,
      );

      const canvas = await prisma.workspace.findUniqueOrThrow({
        where: { slug: "canvas-demo" },
      });
      const second = await prisma.workspace.findUniqueOrThrow({
        where: { slug: "seed-second-workspace" },
      });
      const member = (workspaceId: string, userId: string) =>
        prisma.workspaceMember.findUniqueOrThrow({
          where: { workspaceId_userId: { workspaceId, userId } },
        });

      expect((await member(canvas.id, owner.id)).role).toBe("WORKSPACE_OWNER");
      expect((await member(canvas.id, coach.id)).role).toBe("COACH");
      const clientMembership = await member(canvas.id, client.id);
      expect(clientMembership.role).toBe("CLIENT");
      expect(clientMembership.status).toBe("ACTIVE");
      expect((await member(second.id, staff2.id)).role).toBe("COACH");

      // The first canvas demo profile stays linked to the seeded demo
      // client user (`33-checkins.seed.ts`, PR-M8). The credential client
      // owns the James Reed profile, which the submission fixtures do not
      // claim; the binding lets `getClientViewer` resolve its /me route.
      const emma = await prisma.user.findUniqueOrThrow({
        where: { email: "emma.anders@canvas-demo.test" },
      });
      const emmaProfile = await prisma.clientProfile.findFirstOrThrow({
        where: { workspaceId: canvas.id, userId: emma.id },
      });
      expect(emmaProfile.name).toBe("Emma Anders");
      const clientProfiles = await prisma.clientProfile.findMany({
        where: { workspaceId: canvas.id, userId: client.id },
      });
      expect(clientProfiles).toHaveLength(1);
      expect(clientProfiles[0]?.name).toBe("James Reed");
    });

    it("the first canvas demo client signs in and owns scheduled check-ins (CHECKIN-ENABLE)", async () => {
      // The trial client walkthrough signs in as the first canvas demo
      // client — `33-checkins.seed.ts` gives her a credential reusing
      // SEED_CLIENT_PASSWORD - alongside the SEED-FIX credential client,
      // which owns the James Reed profile.
      const emma = await expectCredential(
        "emma.anders@canvas-demo.test",
        SEED_ENV.SEED_CLIENT_PASSWORD,
      );
      const canvas = await prisma.workspace.findUniqueOrThrow({
        where: { slug: "canvas-demo" },
      });
      const profile = await prisma.clientProfile.findFirstOrThrow({
        where: { workspaceId: canvas.id, userId: emma.id },
      });
      expect(profile.name).toBe("Emma Anders");
      // Without instances the sign-in client has nothing to submit — the
      // loop is not exercisable regardless of credentials.
      expect(
        await prisma.checkInInstance.count({
          where: { workspaceId: canvas.id, clientProfileId: profile.id },
        }),
      ).toBeGreaterThan(0);

      // Staff review requires a coherent ACTIVE assignment (coach scope
      // never reads the workspace boundary) — the seeded coach is linked
      // to every canvas client as PRIMARY.
      const coach = await prisma.user.findUniqueOrThrow({
        where: { email: SEED_ENV.SEED_COACH_EMAIL },
      });
      const coachMember = await prisma.workspaceMember.findUniqueOrThrow({
        where: {
          workspaceId_userId: { workspaceId: canvas.id, userId: coach.id },
        },
      });
      const assignments = await prisma.clientAssignment.count({
        where: {
          workspaceId: canvas.id,
          coachMemberId: coachMember.id,
          status: "ACTIVE",
        },
      });
      expect(assignments).toBe(15);
    });

    it("re-running the seed does not duplicate accounts or members", async () => {
      runSeed();
      const emails = Object.values(SEED_ENV).filter((v) => v.includes("@"));
      const users = await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true },
      });
      const accounts = await prisma.account.findMany({
        where: { userId: { in: users.map((u) => u.id) } },
      });
      expect(accounts).toHaveLength(4);
      const members = await prisma.workspaceMember.count({
        where: { userId: { in: users.map((u) => u.id) } },
      });
      expect(members).toBe(4);
    });
  },
);
