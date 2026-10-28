// K6-GATE fixture lifecycle (issue #178). Commands:
//
//   DATABASE_URL=<admin-url> tsx tools/load/provision.ts lane-create \
//     --lane tools/load/out/lane.json
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

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Prisma, PrismaClient } from "@prisma/client";

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

export type ProvisionHooks = {
  dbName?: string;
  createDatabase?: (admin: PrismaClient, dbName: string) => Promise<unknown>;
  beforeMarkerInstall?: () => Promise<void> | void;
  beforeFixtureCommit?: () => Promise<void> | void;
  beforeCleanupCommit?: () => Promise<void> | void;
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

// ── positive lane ownership ──────────────────────────────────────────
// A name pattern alone cannot prove ownership — ANY user-set env var can
// confirm `app_dev`. The tool instead writes a random marker row into a
// sidecar table inside the database itself (`_k6_lane_ownership`) plus a
// matching 0600 `lane.json` next to the manifests. `create`/`cleanup`
// then require BOTH: the env-confirmed lane name AND the live marker
// row equal to the lane file's token. A forged manifest or a lane file
// pointing at a database the tool did not initialize fails this check;
// a pre-existing arbitrary `app_*` DB without the marker is refused.
const LANE_FILE = arg("lane") ?? "tools/load/out/lane.json";

type LaneFile = { dbName: string; token: string; createdAt: string };

async function writeLaneFile(dbName: string): Promise<LaneFile> {
  const lane: LaneFile = {
    dbName,
    token: randomBytes(24).toString("hex"),
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(LANE_FILE), { recursive: true });
  fs.writeFileSync(LANE_FILE, JSON.stringify(lane, null, 2), {
    mode: 0o600,
  });
  return lane;
}

async function installMarker(db: PrismaClient, lane: LaneFile) {
  await db.$executeRawUnsafe(
    "CREATE TABLE IF NOT EXISTS _k6_lane_ownership (token text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())",
  );
  // Never overwrite an existing marker — an already-owned database is
  // not ours to adopt.
  const existing = await db.$queryRawUnsafe<{ token: string }[]>(
    "SELECT token FROM _k6_lane_ownership",
  );
  if (existing.length > 0)
    throw new Error(
      "refusing: database already carries a lane ownership marker — cannot re-own",
    );
  await db.$executeRawUnsafe(
    "INSERT INTO _k6_lane_ownership (token) VALUES ($1)",
    lane.token,
  );
}

/**
 * Ownership gate: lane.json must exist, name the same database as
 * DATABASE_URL, and match the live marker row written by lane-create.
 * Anything else — missing file, wrong name, forged token, pre-existing
 * unmarked database — refuses.
 */
async function assertLaneOwnership(
  db: PrismaClient,
  dbName: string,
): Promise<void> {
  let lane: LaneFile | null = null;
  try {
    lane = JSON.parse(fs.readFileSync(LANE_FILE, "utf8"));
  } catch {
    throw new Error(
      `refusing: no lane ownership record at ${LANE_FILE} — run lane-create first`,
    );
  }
  if (lane?.dbName !== dbName || typeof lane?.token !== "string")
    throw new Error(
      `refusing: lane file names ${JSON.stringify(lane?.dbName)}, not DATABASE_URL db ${JSON.stringify(dbName)}`,
    );
  let rows: { token: string }[] = [];
  try {
    rows = await db.$queryRawUnsafe<{ token: string }[]>(
      "SELECT token FROM _k6_lane_ownership",
    );
  } catch {
    rows = [];
  }
  if (rows.length !== 1 || rows[0].token !== lane.token)
    throw new Error(
      `refusing: database ${JSON.stringify(dbName)} carries no valid k6 lane marker — it is not a task-owned disposable lane`,
    );
}

type TerminationScope = {
  run<T>(operation: Promise<T>): Promise<T>;
  checkpoint(): Promise<void>;
  close(): void;
};

/**
 * Catchable-signal scope. A signal never skips an already-started DB
 * operation: the handler marks termination, waits for the tracked
 * operation to settle, runs the scoped cleanup for the resulting state,
 * then exits nonzero. `checkpoint` stops later provisioning after sync
 * sections too. SIGKILL/machine failure cannot run this contract.
 */
function terminationScope(
  onInterrupted: () => Promise<void>,
): TerminationScope {
  let active: Promise<unknown> | null = null;
  let termination: Promise<never> | null = null;
  const terminate = async (): Promise<never> => {
    if (active) await active.catch(() => {});
    try {
      await onInterrupted();
    } finally {
      process.exit(1);
    }
  };
  const onSignal = () => {
    termination ??= terminate();
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
  return {
    async run(operation) {
      active = operation;
      try {
        return await operation;
      } finally {
        active = null;
        if (termination) await termination;
      }
    },
    async checkpoint() {
      await new Promise((resolve) => setImmediate(resolve));
      if (termination) await termination;
    },
    close() {
      process.off("SIGTERM", onSignal);
      process.off("SIGINT", onSignal);
    },
  };
}

async function createDatabase(admin: PrismaClient, dbName: string) {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
}

function migrateDeploy(databaseUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["prisma", "migrate", "deploy"], {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `prisma migrate deploy failed (code ${code ?? "null"}${
              signal ? `, signal ${signal}` : ""
            })`,
          ),
        );
    });
  });
}

async function deleteFixtureRows(
  tx: Prisma.TransactionClient,
  fixture: FixtureFile,
) {
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
  await tx.session.deleteMany({ where: { userId: { in: fixture.userIds } } });
  await tx.account.deleteMany({ where: { userId: { in: fixture.userIds } } });
  await tx.user.deleteMany({ where: { id: { in: fixture.userIds } } });
  await tx.workspace.delete({ where: { id: fixture.workspaceId } });
}

async function deleteFixtureRowsWithClient(
  db: PrismaClient,
  fixture: FixtureFile,
) {
  await db.$transaction((tx) => deleteFixtureRows(tx, fixture));
}

export async function main(hooks: ProvisionHooks = {}) {
  const cmd = process.argv[2];

  // lane-create: build a fresh task-owned database end-to-end —
  // `app_k6_<rand>` via the same credentials on the `postgres` admin
  // db, `prisma migrate deploy`, ownership marker + lane file. This is
  // the ONLY ownership-establishment path: it creates a database that
  // provably did not exist before, so it can never adopt or overwrite
  // someone else's ownership. On any failure it drops only the
  // database this invocation created.
  if (cmd === "lane-create") {
    const url = process.env.DATABASE_URL ?? "";
    const dbName =
      hooks.dbName ??
      `app_k6_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
    const adminUrl = new URL(url);
    adminUrl.pathname = "/postgres"; // URL parsing preserves ?schema=…
    const laneUrl = new URL(url);
    laneUrl.pathname = `/${dbName}`;
    const admin = new PrismaClient({
      datasources: { db: { url: adminUrl.toString() } },
    });
    let createState: "pending" | "created" | "failed" | "dropped" = "pending";
    let laneFileWritten = false;
    const removeOwnLaneFile = () => {
      if (laneFileWritten) fs.rmSync(LANE_FILE, { force: true });
    };
    let dropPromise: Promise<void> | null = null;
    const dropOwnDb = () => {
      if (createState !== "created") return Promise.resolve();
      dropPromise ??= (async () => {
        const admin2 = new PrismaClient({
          datasources: { db: { url: adminUrl.toString() } },
        });
        try {
          await admin2.$executeRawUnsafe(`DROP DATABASE "${dbName}"`);
          createState = "dropped";
        } finally {
          await admin2.$disconnect();
        }
      })().catch((e) => {
        dropPromise = null;
        throw e;
      });
      return dropPromise;
    };
    // Catchable termination: wait for CREATE DATABASE to settle, then
    // drop only if THIS invocation successfully created the lane. A
    // failed/existing-database CREATE is never dropped by this tool.
    const scope = terminationScope(async () => {
      try {
        await dropOwnDb();
      } catch (e) {
        console.error(`lane-create cleanup failed for ${dbName}: ${e}`);
      } finally {
        removeOwnLaneFile();
      }
    });
    try {
      const createPromise = Promise.resolve()
        .then(() => (hooks.createDatabase ?? createDatabase)(admin, dbName))
        .then(
          () => {
            createState = "created";
          },
          (e) => {
            createState = "failed";
            throw e;
          },
        );
      try {
        await scope.run(createPromise);
      } finally {
        await admin.$disconnect();
      }
      await scope.checkpoint();
      try {
        const lane = await scope.run(
          Promise.resolve().then(async () => {
            const written = await writeLaneFile(dbName);
            laneFileWritten = true;
            return written;
          }),
        );
        await scope.run(migrateDeploy(laneUrl.toString()));
        await scope.run(
          Promise.resolve().then(() => hooks.beforeMarkerInstall?.()),
        );
        const markerInstall = (async () => {
          const db = new PrismaClient({
            datasources: { db: { url: laneUrl.toString() } },
          });
          try {
            await installMarker(db, lane);
          } finally {
            await db.$disconnect();
          }
        })();
        await scope.run(markerInstall);
        console.log(
          `lane created: ${dbName} (migrated, marker installed, ${LANE_FILE})`,
        );
      } catch (e) {
        // Failure cleanup drops ONLY the database this invocation made.
        try {
          await dropOwnDb();
        } finally {
          removeOwnLaneFile();
        }
        throw e;
      }
    } finally {
      scope.close();
    }
    return;
  }

  const dbName = assertDisposableDb();
  const db = new PrismaClient();
  try {
    await assertLaneOwnership(db, dbName);
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
      let fixtureState:
        "transaction" | "committed" | "failed" | "manifestWritten" | "cleaned" =
        "transaction";
      let rollbackPromise: Promise<void> | null = null;
      let manifestCreated = false;
      const rollbackFixture = () => {
        if (fixtureState !== "committed" && fixtureState !== "manifestWritten")
          return Promise.resolve();
        rollbackPromise ??= deleteFixtureRowsWithClient(db, fixture)
          .then(() => {
            fixtureState = "cleaned";
          })
          .catch((e) => {
            rollbackPromise = null;
            throw e;
          });
        return rollbackPromise;
      };
      const scope = terminationScope(async () => {
        try {
          await rollbackFixture();
        } finally {
          if (manifestCreated) fs.rmSync(out, { force: true });
        }
      });
      try {
        // One transaction: a partial provision commits nothing.
        const createPromise = db
          .$transaction(async (tx) => {
            const ws = await tx.workspace.create({
              data: { name: tag, slug: tag },
            });
            fixture.workspaceId = ws.id;

            const makeUser = async (
              email: string,
              role: "COACH" | "CLIENT",
            ) => {
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
            await hooks.beforeFixtureCommit?.();
          })
          .then(
            () => {
              fixtureState = "committed";
            },
            (e) => {
              fixtureState = "failed";
              throw e;
            },
          );
        await scope.run(createPromise);
        await scope.checkpoint();

        // Manifest write is post-commit; on failure roll the fixture rows
        // back rather than leave orphaned synthetic users. On catchable
        // termination, rollbackFixture performs the same scoped cleanup.
        try {
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(out, JSON.stringify(fixture, null, 2), {
            mode: 0o600,
          });
          manifestCreated = true;
          fixtureState = "manifestWritten";
        } catch (e) {
          try {
            await scope.run(rollbackFixture());
          } catch (cleanupError) {
            console.error(`fixture rollback failed: ${cleanupError}`);
          }
          throw e;
        }
        await scope.checkpoint();
        console.log(
          `provisioned workspace ${fixture.workspaceId} (${tag}): ${coaches} coaches, ${clients} clients -> ${out}`,
        );
      } finally {
        scope.close();
      }
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
      // Target identity: the manifest's recorded targetId must equal
      // the live workspace slug — a stale/forged manifest can point at
      // another loadgate fixture set only if this check binds it.
      if (f.targetId !== ws.slug)
        throw new Error(
          `refusing cleanup: manifest targetId ${f.targetId} != live workspace slug ${ws.slug}`,
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

      let cleanupState: "transaction" | "committed" | "failed" = "transaction";
      let fileRemoved = false;
      const scope = terminationScope(async () => {
        // A committed deletion is completed by removing its manifest;
        // a failed/rolled-back transaction leaves the fixture intact.
        if (cleanupState === "committed" && !fileRemoved) {
          fs.rmSync(file, { force: true });
          fileRemoved = true;
        }
      });
      try {
        const cleanupPromise = db
          .$transaction(async (tx) => {
            await deleteFixtureRows(tx, f);
            await hooks.beforeCleanupCommit?.();
          })
          .then(
            () => {
              cleanupState = "committed";
            },
            (e) => {
              cleanupState = "failed";
              throw e;
            },
          );
        await scope.run(cleanupPromise);
        await scope.checkpoint();
        fs.rmSync(file, { force: true });
        fileRemoved = true;
        await scope.checkpoint();
        console.log(
          `cleanup removed workspace ${f.workspaceId} + ${f.userIds.length} users`,
        );
      } finally {
        scope.close();
      }
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

const invokedAsCli =
  process.argv[1] != null &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsCli) {
  main().catch((e) => {
    console.error(String(e));
    process.exit(1);
  });
}
