// K6-GATE fixture lifecycle (issue #178). Two commands:
//
//   CONFIRM_DISPOSABLE_DB=<dbname> tsx tools/load/provision.ts \
//     create --clients 30 --coaches 4 --out fixtures.json
//   CONFIRM_DISPOSABLE_DB=<dbname> tsx tools/load/provision.ts \
//     cleanup --file fixtures.json
//
// `create` builds a self-contained `loadgate-<ts>` workspace: sign-in
// users (owner-less coaches + clients, Better Auth credential rows via
// the same hashPassword the real seed uses), ACTIVE memberships, client
// profiles and PRIMARY assignments.
//
// Safety contract:
//   - the target database must be an explicitly confirmed disposable
//     lane: the DATABASE_URL database name must look like a lane db
//     (app_*/test/lane/review) AND equal CONFIRM_DISPOSABLE_DB
//   - fixture emails end in `@loadgate.invalid`, workspace slug starts
//     `loadgate-`, every owned id is recorded in the manifest
//   - `cleanup` re-validates ownership FROM THE DATABASE — a tampered
//     or stale manifest whose ids point at foreign rows refuses to
//     delete anything — then deletes recorded ids in one transaction
//   - the manifest (which contains the random fixture passwords) is
//     written 0600 and removed by cleanup
//
// Synthetic data only; never run against a shared or production DB.

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../../lib/password";

const FIXTURE_DOMAIN = "loadgate.invalid";
const FIXTURE_SLUG_PREFIX = "loadgate-";
const CLIENT_PROFILE_NAME_PREFIX = "Load Gate Synthetic Client";
// A disposable lane must look like one AND not be a shared database —
// app_dev / e2e / the shared integration DBs are never fixture targets.
const LANE_DB_NAME = /^(app_|test_|lane_|.*_it$|.*_review$|loadgate)/;
const SHARED_DB_DENYLIST = new Set([
  "app_dev",
  "app_e2e",
  "app",
  "postgres",
  "app_integration_test",
  "integration_test",
]);

type FixtureFile = {
  createdAt: string;
  targetId: string;
  workspaceId: string;
  userIds: string[];
  clientProfileIds: string[];
  coaches: { email: string; password: string; userId: string }[];
  clients: { email: string; password: string; userId: string }[];
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** The DB must be a confirmed disposable lane — fail closed. */
function assertDisposableDb() {
  const url = process.env.DATABASE_URL ?? "";
  const dbName = url.split("/").pop()?.split("?")[0] ?? "";
  const confirm = process.env.CONFIRM_DISPOSABLE_DB ?? "";
  if (!dbName || !LANE_DB_NAME.test(dbName) || SHARED_DB_DENYLIST.has(dbName))
    throw new Error(
      `refusing: DATABASE_URL db ${JSON.stringify(dbName)} is not a task-owned disposable lane`,
    );
  if (confirm !== dbName)
    throw new Error(
      `refusing: CONFIRM_DISPOSABLE_DB must equal the DATABASE_URL db name ${JSON.stringify(dbName)}`,
    );
  return dbName;
}

async function main() {
  const cmd = process.argv[2];
  assertDisposableDb();
  const db = new PrismaClient();
  try {
    if (cmd === "create") {
      const clients = Number(arg("clients") ?? "30");
      const coaches = Number(arg("coaches") ?? "4");
      const out = arg("out") ?? "tools/load/out/fixtures.json";
      if (!Number.isInteger(clients) || clients < 1 || clients > 750)
        throw new Error("--clients must be an integer 1..750");
      if (!Number.isInteger(coaches) || coaches < 1 || coaches > 250)
        throw new Error("--coaches must be an integer 1..250");

      const tag = `${FIXTURE_SLUG_PREFIX}${Date.now()}-${randomBytes(3).toString("hex")}`;
      const fixture: FixtureFile = {
        createdAt: new Date().toISOString(),
        targetId: tag,
        workspaceId: "",
        userIds: [],
        clientProfileIds: [],
        coaches: [],
        clients: [],
      };

      // One transaction: a partial provision commits nothing.
      await db.$transaction(async (tx) => {
        const ws = await tx.workspace.create({
          data: { name: tag, slug: tag },
        });
        fixture.workspaceId = ws.id;

        const makeUser = async (email: string, role: "COACH" | "CLIENT") => {
          const password = `Lg!${randomBytes(8).toString("hex")}`;
          const user = await tx.user.create({
            data: { email, name: `Load Gate ${role}`, emailVerified: true },
          });
          await tx.account.create({
            data: {
              userId: user.id,
              providerId: "credential",
              accountId: user.id,
              password: await hashPassword(password),
            },
          });
          await tx.workspaceMember.create({
            data: {
              workspaceId: ws.id,
              userId: user.id,
              role,
              status: "ACTIVE",
            },
          });
          fixture.userIds.push(user.id);
          return { email, password, userId: user.id };
        };

        for (let i = 0; i < coaches; i++)
          fixture.coaches.push(
            await makeUser(`${tag}-coach-${i}@${FIXTURE_DOMAIN}`, "COACH"),
          );
        const coachMemberIds = (
          await tx.workspaceMember.findMany({
            where: { workspaceId: ws.id, role: "COACH" },
            select: { id: true },
          })
        ).map((m) => m.id);

        for (let i = 0; i < clients; i++) {
          const account = await makeUser(
            `${tag}-client-${i}@${FIXTURE_DOMAIN}`,
            "CLIENT",
          );
          const profile = await tx.clientProfile.create({
            data: {
              workspaceId: ws.id,
              userId: account.userId,
              name: `${CLIENT_PROFILE_NAME_PREFIX} ${i}`,
            },
          });
          fixture.clientProfileIds.push(profile.id);
          await tx.clientAssignment.create({
            data: {
              workspaceId: ws.id,
              clientProfileId: profile.id,
              coachMemberId: coachMemberIds[i % coachMemberIds.length],
              role: "PRIMARY",
            },
          });
          fixture.clients.push(account);
        }
      });

      // Manifest write is post-commit; on failure roll the fixture rows
      // back rather than leave orphaned synthetic users.
      try {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify(fixture, null, 2), {
          mode: 0o600,
        });
      } catch (e) {
        await db.$transaction(async (tx) => {
          await tx.clientAssignment.deleteMany({
            where: { clientProfileId: { in: fixture.clientProfileIds } },
          });
          await tx.clientProfile.deleteMany({
            where: { id: { in: fixture.clientProfileIds } },
          });
          await tx.workspaceMember.deleteMany({
            where: {
              userId: { in: fixture.userIds },
              workspaceId: fixture.workspaceId,
            },
          });
          await tx.session.deleteMany({
            where: { userId: { in: fixture.userIds } },
          });
          await tx.account.deleteMany({
            where: { userId: { in: fixture.userIds } },
          });
          await tx.user.deleteMany({ where: { id: { in: fixture.userIds } } });
          await tx.workspace.delete({ where: { id: fixture.workspaceId } });
        });
        throw e;
      }
      console.log(
        `provisioned workspace ${fixture.workspaceId} (${tag}): ${coaches} coaches, ${clients} clients -> ${out}`,
      );
    } else if (cmd === "cleanup") {
      const file = arg("file");
      if (!file) throw new Error("--file <fixtures.json> is required");
      const f = JSON.parse(fs.readFileSync(file, "utf8")) as FixtureFile;

      // Ownership proof FROM THE DATABASE — never trust manifest ids.
      // Every recorded user must be a loadgate email; every recorded
      // profile must belong to the recorded loadgate workspace.
      const ws = await db.workspace.findUnique({
        where: { id: f.workspaceId },
        select: { slug: true },
      });
      if (!ws || !ws.slug.startsWith(FIXTURE_SLUG_PREFIX))
        throw new Error(
          `refusing cleanup: workspace ${f.workspaceId} is not a ${FIXTURE_SLUG_PREFIX}* fixture`,
        );
      const users = await db.user.findMany({
        where: { id: { in: f.userIds } },
        select: { id: true, email: true },
      });
      if (
        users.length !== f.userIds.length ||
        users.some((u) => !u.email.endsWith(`@${FIXTURE_DOMAIN}`))
      )
        throw new Error(
          "refusing cleanup: manifest userIds do not all resolve to @loadgate.invalid users",
        );
      const profiles = await db.clientProfile.findMany({
        where: { id: { in: f.clientProfileIds } },
        select: { id: true, workspaceId: true },
      });
      if (
        profiles.length !== f.clientProfileIds.length ||
        profiles.some((p) => p.workspaceId !== f.workspaceId)
      )
        throw new Error(
          "refusing cleanup: manifest clientProfileIds do not all belong to the fixture workspace",
        );

      await db.$transaction(async (tx) => {
        await tx.clientAssignment.deleteMany({
          where: { clientProfileId: { in: f.clientProfileIds } },
        });
        await tx.clientProfile.deleteMany({
          where: { id: { in: f.clientProfileIds } },
        });
        await tx.workspaceMember.deleteMany({
          where: { userId: { in: f.userIds }, workspaceId: f.workspaceId },
        });
        await tx.session.deleteMany({ where: { userId: { in: f.userIds } } });
        await tx.account.deleteMany({ where: { userId: { in: f.userIds } } });
        await tx.user.deleteMany({ where: { id: { in: f.userIds } } });
        await tx.workspace.delete({ where: { id: f.workspaceId } });
      });
      fs.rmSync(file, { force: true });
      console.log(
        `cleanup removed workspace ${f.workspaceId} + ${f.userIds.length} users`,
      );
    } else {
      console.error(
        "usage: provision.ts create --clients N --coaches N --out file.json | cleanup --file file.json",
      );
      process.exit(2);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
