import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { verifyPassword } from "../../lib/password";

/**
 * SEED-FIX / W2-SEEDLINK: the development seed must write a Better Auth
 * credential `accounts` row for every seeded sign-in user, and every
 * client_profile link it produces in `canvas-demo` must resolve to a user
 * that can authenticate, since PR-05 credential sign-in reads `accounts`.
 * The seed runs through the real `npm run seed:dev` entrypoint
 * (`tsx scripts/seed/index.ts`) against the disposable integration database
 * with VARI8_SEED_DEMO=1 so `50-demo-coverage.seed.ts` runs; each stored
 * hash is checked with the same `verifyPassword` the auth server uses.
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
  VARI8_SEED_DEMO: "1",
  MEDIA_STORAGE_SIGNING_SECRET: "seed-fix-test-signing-secret",
};

// SEED_DEMO_CLIENT_PASSWORD is intentionally unset: every seeded client
// credential falls back to SEED_CLIENT_PASSWORD.
const NO_PROFILE_EMAIL = "no-profile@canvas-demo.test";
const DEMO_CLIENT_EMAILS = [
  "emma.anders@canvas-demo.test",
  "lily.chen@canvas-demo.test",
  "oliver.stone@canvas-demo.test",
];

let mediaDir: string;

function runSeed(
  dbUrl = url as string,
  extra: Record<string, string> = SEED_ENV,
) {
  // Exactly what `npm run seed:dev` invokes, with the lane/test env pointed
  // at the disposable integration database.
  execFileSync("npx", ["tsx", "scripts/seed/index.ts"], {
    stdio: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: dbUrl,
      MEDIA_STORAGE_DIR: mediaDir,
      ...extra,
    },
  });
}

describe.skipIf(!enabled)(
  "default seed (VARI8_SEED_DEMO unset) binds the sign-in client",
  () => {
    // Runs before the demo-seeded suite below so the database holds only
    // what the default seed wrote.
    const defaultUrl = url as string;
    let prisma: PrismaClient;

    beforeAll(async () => {
      mediaDir = mkdtempSync(join(tmpdir(), "seed-default-media-"));
      execFileSync("npx", ["prisma", "migrate", "deploy"], {
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: defaultUrl },
      });
      const { VARI8_SEED_DEMO: _unset, ...defaultEnv } = SEED_ENV;
      void _unset;
      runSeed(defaultUrl, defaultEnv);
      prisma = new PrismaClient({ datasources: { db: { url: defaultUrl } } });
    }, 120_000);

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it("SEED_CLIENT owns Amara Lewis and can sign in; the no-profile client owns nothing", async () => {
      expect(process.env.VARI8_SEED_DEMO).toBeUndefined();
      const signIn = async (email: string, password: string) => {
        const user = await prisma.user.findUniqueOrThrow({ where: { email } });
        const account = await prisma.account.findUniqueOrThrow({
          where: {
            providerId_accountId: {
              providerId: "credential",
              accountId: user.id,
            },
          },
        });
        expect(await verifyPassword(password, account.password ?? "")).toBe(
          true,
        );
        return user;
      };
      const client = await signIn(
        SEED_ENV.SEED_CLIENT_EMAIL,
        SEED_ENV.SEED_CLIENT_PASSWORD,
      );
      const noProfile = await signIn(
        NO_PROFILE_EMAIL,
        SEED_ENV.SEED_CLIENT_PASSWORD,
      );
      const owned = await prisma.clientProfile.findMany({
        where: { userId: client.id },
        select: { name: true },
      });
      expect(owned).toEqual([{ name: "Amara Lewis" }]);
      expect(
        await prisma.clientProfile.count({ where: { userId: noProfile.id } }),
      ).toBe(0);
    });
  },
);

describe.skipIf(!enabled)(
  "SEED-FIX: seed writes sign-in credentials (real PG + real seed entrypoint)",
  () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
      mediaDir = mkdtempSync(join(tmpdir(), "seed-fix-media-"));
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

      // W2-SEEDLINK: the seeded sign-in client owns the Amara Lewis profile
      // (the demo-export client-007 row resolves to SEED_CLIENT), and the
      // user record carries the profile name so the account label matches.
      const amara = await prisma.clientProfile.findFirstOrThrow({
        where: { workspaceId: canvas.id, name: "Amara Lewis" },
      });
      expect(amara.userId).toBe(client.id);
      const clientUser = await prisma.user.findUniqueOrThrow({
        where: { id: client.id },
        select: { name: true },
      });
      expect(clientUser.name).toBe("Amara Lewis");
      expect(
        await prisma.clientProfile.count({
          where: { workspaceId: canvas.id, userId: client.id },
        }),
      ).toBe(1);
    });

    it("every linked canvas-demo client profile resolves to a user that can sign in", async () => {
      const canvas = await prisma.workspace.findUniqueOrThrow({
        where: { slug: "canvas-demo" },
      });
      const profiles = await prisma.clientProfile.findMany({
        where: { workspaceId: canvas.id, userId: { not: null } },
        select: { name: true, userId: true },
      });
      // All fifteen canvas demo clients end up linked and sign-in-able.
      expect(profiles).toHaveLength(15);
      for (const profile of profiles) {
        const account = await prisma.account.findUnique({
          where: {
            providerId_accountId: {
              providerId: "credential",
              accountId: profile.userId!,
            },
          },
        });
        expect(
          account,
          `credential account for profile "${profile.name}"`,
        ).not.toBeNull();
        // The SEED_CLIENT account keeps SEED_CLIENT_PASSWORD; every other
        // linked user falls back to it because SEED_DEMO_CLIENT_PASSWORD is
        // unset in this env.
        expect(
          await verifyPassword(
            SEED_ENV.SEED_CLIENT_PASSWORD,
            account?.password ?? "",
          ),
          `password for profile "${profile.name}"`,
        ).toBe(true);
      }
    });

    it("the first canvas demo client signs in and owns scheduled check-ins (CHECKIN-ENABLE)", async () => {
      // The trial client walkthrough signs in as the first canvas demo
      // client; `33-checkins.seed.ts` gives every linked demo user a
      // credential sourced from SEED_DEMO_CLIENT_PASSWORD with fallback to
      // SEED_CLIENT_PASSWORD.
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

    it("the dedicated no-profile client signs in and owns zero profiles", async () => {
      // SEED_CLIENT now owns Amara Lewis, so the own-scope denial coverage
      // it used to carry moves to a dedicated synthetic client.
      const noProfile = await expectCredential(
        NO_PROFILE_EMAIL,
        SEED_ENV.SEED_CLIENT_PASSWORD,
      );
      const canvas = await prisma.workspace.findUniqueOrThrow({
        where: { slug: "canvas-demo" },
      });
      const member = await prisma.workspaceMember.findUniqueOrThrow({
        where: {
          workspaceId_userId: {
            workspaceId: canvas.id,
            userId: noProfile.id,
          },
        },
      });
      expect(member.role).toBe("CLIENT");
      expect(member.status).toBe("ACTIVE");
      expect(
        await prisma.clientProfile.count({
          where: { workspaceId: canvas.id, userId: noProfile.id },
        }),
      ).toBe(0);
    });

    it("re-running the seed does not duplicate accounts or members", async () => {
      runSeed();
      const emails = [
        ...Object.values(SEED_ENV).filter(
          (v) => typeof v === "string" && v.includes("@"),
        ),
        ...DEMO_CLIENT_EMAILS,
        NO_PROFILE_EMAIL,
      ];
      const users = await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true },
      });
      expect(users).toHaveLength(8);
      const accounts = await prisma.account.findMany({
        where: { userId: { in: users.map((u) => u.id) } },
      });
      expect(accounts).toHaveLength(8);
      const members = await prisma.workspaceMember.count({
        where: { userId: { in: users.map((u) => u.id) } },
      });
      expect(members).toBe(8);
      // Link state is identical after a reseed: SEED_CLIENT still owns the
      // Amara Lewis profile and the no-profile client still owns none.
      const canvas = await prisma.workspace.findUniqueOrThrow({
        where: { slug: "canvas-demo" },
      });
      const amara = await prisma.clientProfile.findFirstOrThrow({
        where: { workspaceId: canvas.id, name: "Amara Lewis" },
      });
      const seedClientUser = await prisma.user.findUniqueOrThrow({
        where: { email: SEED_ENV.SEED_CLIENT_EMAIL },
        select: { id: true },
      });
      expect(amara.userId).toBe(seedClientUser.id);
      const noProfile = await prisma.user.findUniqueOrThrow({
        where: { email: NO_PROFILE_EMAIL },
        select: { id: true },
      });
      expect(
        await prisma.clientProfile.count({
          where: { workspaceId: canvas.id, userId: noProfile.id },
        }),
      ).toBe(0);
    });
  },
);
