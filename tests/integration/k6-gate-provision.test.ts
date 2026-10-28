// K6-GATE (issue #178) — fixture provision/cleanup safety against REAL
// PostgreSQL. The suite creates its own task-owned lane via
// `provision.ts lane-create` (the only ownership-establishment path)
// and exercises every destructive path through the real CLI.
//   INTEGRATION_DATABASE_URL — admin-URL base; the suite derives lane
//   DB URLs from it via URL parsing (preserving ?schema=public and any
//   other supported components).
// Destructive paths never run against shared databases; the lane DB is
// dropped after the suite.

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = !!url;
if (!enabled) console.warn("skipping: INTEGRATION_DATABASE_URL unset");

let lanePath = "";
let laneDbUrl = "";

/** Derive a URL for `dbName` from the admin base — preserves query. */
function dbUrlFor(dbName: string): string {
  const u = new URL(url as string);
  u.pathname = `/${dbName}`;
  return u.toString();
}

function adminUrl(): string {
  return dbUrlFor("postgres");
}

function runProvision(
  args: string[],
  env: Record<string, string> = {},
  dbUrl = laneDbUrl,
): { code: number; output: string } {
  try {
    const out = execFileSync(
      "npx",
      ["tsx", "tools/load/provision.ts", ...args, "--lane", lanePath],
      {
        stdio: "pipe",
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATABASE_URL: dbUrl,
          CONFIRM_DISPOSABLE_DB:
            new URL(dbUrl).pathname.replace(/^\//, "") || "",
          ...env,
        },
      },
    );
    return { code: 0, output: String(out) };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer; stderr?: Buffer };
    return {
      code: err.status ?? 1,
      output: `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
}

function runHarness(
  args: string[],
  env: Record<string, string> = {},
  dbUrl = laneDbUrl,
) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "tests/integration/k6-gate-provision-harness.ts",
      ...args,
      "--lane",
      lanePath,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: dbUrl,
        CONFIRM_DISPOSABLE_DB: new URL(dbUrl).pathname.replace(/^\//, "") || "",
        ...env,
      },
    },
  );
  let output = "";
  child.stdout?.on("data", (d) => {
    output += String(d);
  });
  child.stderr?.on("data", (d) => {
    output += String(d);
  });
  const done = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    output: string;
  }>((resolve) => {
    child.once("error", (e) =>
      resolve({ code: 1, signal: null, output: output + String(e) }),
    );
    child.once("close", (code, signal) => resolve({ code, signal, output }));
  });
  return { child, done };
}

async function waitForFile(file: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(file)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${file}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function dbExists(dbName: string) {
  const admin = new PrismaClient({
    datasources: { db: { url: adminUrl() } },
  });
  try {
    const rows = await admin.$queryRawUnsafe<{ exists: boolean }[]>(
      "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      dbName,
    );
    return rows[0]?.exists === true;
  } finally {
    await admin.$disconnect();
  }
}

async function dropDb(dbName: string) {
  const admin = new PrismaClient({
    datasources: { db: { url: adminUrl() } },
  });
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
  } finally {
    await admin.$disconnect();
  }
}

async function waitForCreateActive(dbName: string, timeoutMs = 15_000) {
  const admin = new PrismaClient({
    datasources: { db: { url: adminUrl() } },
  });
  try {
    const deadline = Date.now() + timeoutMs;
    const pattern = `CREATE DATABASE "${dbName}"%`;
    while (Date.now() <= deadline) {
      const rows = await admin.$queryRawUnsafe<{ state: string }[]>(
        `SELECT state FROM pg_stat_activity
         WHERE state = 'active' AND query LIKE $1 LIMIT 1`,
        pattern,
      );
      if (rows.length > 0) return rows[0].state;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`CREATE DATABASE for ${dbName} was not observed active`);
  } finally {
    await admin.$disconnect();
  }
}

async function createInflightTemplate(templateName: string) {
  const admin = new PrismaClient({
    datasources: { db: { url: adminUrl() } },
  });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${templateName}"`);
  } finally {
    await admin.$disconnect();
  }

  const template = new PrismaClient({
    datasources: { db: { url: dbUrlFor(templateName) } },
  });
  try {
    await template.$executeRawUnsafe(`
      DO $$
      BEGIN
        FOR i IN 1..2000 LOOP
          EXECUTE format('CREATE TABLE load_copy_%s (id int)', i);
        END LOOP;
      END $$;
    `);
  } finally {
    await template.$disconnect();
  }
}

describe.skipIf(!enabled)(
  "K6-GATE provision/cleanup safety (real PG, task-owned lane)",
  () => {
    let prisma: PrismaClient;
    let dir: string;
    let manifestPath: string;
    let laneDbName = "";
    let victimUserId: string;
    let victimProfileId: string;
    let victimWorkspaceId: string;

    beforeAll(async () => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "k6-gate-"));
      manifestPath = path.join(dir, "fixtures.json");
      lanePath = path.join(dir, "lane.json");
      // The ONLY ownership path: lane-create makes a fresh task-owned
      // database (create → migrate → marker row + 0600 lane file).
      const init = runProvision(
        ["lane-create"],
        { CONFIRM_DISPOSABLE_DB: "" },
        url as string,
      );
      if (init.code !== 0)
        throw new Error(`lane-create failed: ${init.output}`);
      laneDbName = JSON.parse(fs.readFileSync(lanePath, "utf8")).dbName;
      laneDbUrl = dbUrlFor(laneDbName);
      prisma = new PrismaClient({ datasources: { db: { url: laneDbUrl } } });

      // An unrelated victim workspace + user + profile — must survive.
      const victimWs = await prisma.workspace.create({
        data: { name: `victim-${Date.now()}`, slug: `victim-${Date.now()}` },
      });
      victimWorkspaceId = victimWs.id;
      const victim = await prisma.user.create({
        data: {
          email: `victim-${Date.now()}@seed.test`,
          name: "Victim User",
          emailVerified: true,
        },
      });
      await prisma.workspaceMember.create({
        data: {
          workspaceId: victimWs.id,
          userId: victim.id,
          role: "CLIENT",
          status: "ACTIVE",
        },
      });
      const profile = await prisma.clientProfile.create({
        data: {
          workspaceId: victimWs.id,
          userId: victim.id,
          name: "Victim Profile",
        },
      });
      victimUserId = victim.id;
      victimProfileId = profile.id;
    }, 180_000);

    afterAll(async () => {
      if (victimProfileId)
        await prisma.clientProfile
          .delete({ where: { id: victimProfileId } })
          .catch(() => {});
      if (victimUserId) {
        await prisma.workspaceMember
          .deleteMany({ where: { userId: victimUserId } })
          .catch(() => {});
        await prisma.user
          .delete({ where: { id: victimUserId } })
          .catch(() => {});
      }
      if (victimWorkspaceId)
        await prisma.workspace
          .delete({ where: { id: victimWorkspaceId } })
          .catch(() => {});
      await prisma.$disconnect();
      if (laneDbName) await dropDb(laneDbName);
      fs.rmSync(dir, { recursive: true, force: true });
    }, 30_000);

    it("refuses destructive commands with no lane ownership file", () => {
      const backup = fs.readFileSync(lanePath, "utf8");
      fs.rmSync(lanePath);
      const r = runProvision(["cleanup", "--file", manifestPath]);
      fs.writeFileSync(lanePath, backup, { mode: 0o600 });
      expect(r.code).not.toBe(0);
      expect(r.output).toMatch(/lane ownership/);
    });

    it("there is no adoption path — lane-init does not exist", () => {
      const r = runProvision(["lane-init"], {}, laneDbUrl);
      expect(r.code).not.toBe(0);
    });

    it("creates the fixture workspace with 0600 manifest perms", () => {
      const r = runProvision([
        "create",
        "--clients",
        "3",
        "--coaches",
        "1",
        "--out",
        manifestPath,
      ]);
      expect(r.code).toBe(0);
      expect(fs.existsSync(manifestPath)).toBe(true);
      expect(fs.statSync(manifestPath).mode & 0o777).toBe(0o600);
      const f = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      expect(f.coaches).toHaveLength(1);
      expect(f.clients).toHaveLength(3);
    });

    it("SIGTERM during fixture create leaves no partial fixture or victim change", async () => {
      const beforeWorkspaces = await prisma.workspace.count({
        where: { slug: { startsWith: "loadgate-" } },
      });
      const beforeUsers = await prisma.user.count({
        where: { email: { endsWith: "@loadgate.invalid" } },
      });
      const victimBefore = await prisma.user.findUnique({
        where: { id: victimUserId },
      });
      const out = path.join(dir, "interrupted-create.json");
      const sync = fs.mkdtempSync(path.join(dir, "sync-fixture-create-"));
      const { child, done } = runHarness(
        ["create", "--clients", "2", "--coaches", "1", "--out", out],
        {
          K6_GATE_TEST_BARRIER: "fixture-create-hold",
          K6_GATE_TEST_SYNC_DIR: sync,
        },
      );
      await waitForFile(path.join(sync, "fixture-create-started"));
      expect(child.kill("SIGTERM")).toBe(true);
      fs.writeFileSync(path.join(sync, "fixture-create-release"), "release\n");
      const r = await done;
      expect(r.code).not.toBe(0);
      expect(
        await prisma.workspace.count({
          where: { slug: { startsWith: "loadgate-" } },
        }),
      ).toBe(beforeWorkspaces);
      expect(
        await prisma.user.count({
          where: { email: { endsWith: "@loadgate.invalid" } },
        }),
      ).toBe(beforeUsers);
      expect(fs.existsSync(out)).toBe(false);
      expect(
        await prisma.user.findUnique({ where: { id: victimUserId } }),
      ).toEqual(victimBefore);
    }, 60_000);

    it("SIGTERM during fixture cleanup completes scoped deletion only", async () => {
      const out = path.join(dir, "interrupted-cleanup.json");
      const created = runProvision([
        "create",
        "--clients",
        "2",
        "--coaches",
        "1",
        "--out",
        out,
      ]);
      expect(created.code).toBe(0);
      const f = JSON.parse(fs.readFileSync(out, "utf8"));
      const victimUserBefore = await prisma.user.findUnique({
        where: { id: victimUserId },
      });
      const victimProfileBefore = await prisma.clientProfile.findUnique({
        where: { id: victimProfileId },
      });
      const sync = fs.mkdtempSync(path.join(dir, "sync-fixture-clean-"));
      const { child, done } = runHarness(["cleanup", "--file", out], {
        K6_GATE_TEST_BARRIER: "fixture-cleanup-hold",
        K6_GATE_TEST_SYNC_DIR: sync,
      });
      await waitForFile(path.join(sync, "fixture-cleanup-started"));
      expect(child.kill("SIGTERM")).toBe(true);
      fs.writeFileSync(path.join(sync, "fixture-cleanup-release"), "release\n");
      const r = await done;
      expect(r.code).not.toBe(0);
      expect(
        await prisma.workspace.findUnique({ where: { id: f.workspaceId } }),
      ).toBeNull();
      expect(
        await prisma.user.count({ where: { id: { in: f.userIds } } }),
      ).toBe(0);
      expect(
        await prisma.clientProfile.count({
          where: { id: { in: f.clientProfileIds } },
        }),
      ).toBe(0);
      expect(
        await prisma.workspaceMember.count({
          where: { userId: { in: f.userIds } },
        }),
      ).toBe(0);
      expect(
        await prisma.account.count({
          where: { userId: { in: f.userIds } },
        }),
      ).toBe(0);
      expect(fs.existsSync(out)).toBe(false);
      expect(
        await prisma.user.findUnique({ where: { id: victimUserId } }),
      ).toEqual(victimUserBefore);
      expect(
        await prisma.clientProfile.findUnique({
          where: { id: victimProfileId },
        }),
      ).toEqual(victimProfileBefore);
    }, 60_000);

    it("a manifest with a mismatched targetId refuses", async () => {
      const f = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const forged = { ...f, targetId: "loadgate-other-fixture" };
      const p = path.join(dir, "wrong-target.json");
      fs.writeFileSync(p, JSON.stringify(forged));
      const r = runProvision(["cleanup", "--file", p]);
      expect(r.code).not.toBe(0);
      expect(r.output).toMatch(/targetId/i);
      expect(
        await prisma.user.findUnique({ where: { id: victimUserId } }),
      ).not.toBeNull();
      // The real fixture itself must also survive the wrong-target attempt.
      expect(
        await prisma.workspace.findUnique({ where: { id: f.workspaceId } }),
      ).not.toBeNull();
    });

    async function laneDbs(): Promise<string[]> {
      const admin = new PrismaClient({
        datasources: { db: { url: adminUrl() } },
      });
      try {
        return (
          await admin.$queryRawUnsafe<{ datname: string }[]>(
            "SELECT datname FROM pg_database WHERE datname LIKE 'app_k6_%'",
          )
        ).map((r) => r.datname);
      } finally {
        await admin.$disconnect();
      }
    }

    it("lane-create failure drops only the DB it created", async () => {
      // --lane pointing into a path whose parent is an existing FILE →
      // writeLaneFile throws AFTER CREATE DATABASE → cleanup must drop
      // exactly that DB and no other.
      const before = await laneDbs();
      const badLane = path.join(manifestPath, "lane.json"); // parent is a file
      const r2 = runProvision(
        ["lane-create", "--lane", badLane], // first --lane wins
        { CONFIRM_DISPOSABLE_DB: "" },
        url as string,
      );
      expect(r2.code).not.toBe(0);
      // Exactly zero leftover databases — the failed invocation dropped
      // its own, and no others were touched.
      expect(await laneDbs()).toEqual(before);
    }, 60_000);

    it.each(["SIGTERM", "SIGINT"] as const)(
      "%s during a pending CREATE promise waits for settlement and coalesces repeated signals",
      async (signal) => {
        // Controlled dependency window: SQL has been dispatched, the
        // hook delays promise settlement, and repeated signals arrive
        // before release. This proves scope/promise synchronization;
        // the SQL may already have completed, so it is not a SQL-in-
        // flight proof — that is covered separately below.
        const dbName = `app_k6_race_${Date.now().toString(36)}_${signal.toLowerCase()}`;
        const sync = fs.mkdtempSync(path.join(dir, `sync-${signal}-`));
        const dispatched = path.join(sync, "create-sql-dispatched");
        const release = path.join(sync, "create-settle-release");
        const { child, done } = runHarness(
          ["lane-create", "--lane", path.join(dir, `race-${signal}.json`)],
          {
            K6_GATE_TEST_BARRIER: "create-dispatch-hold",
            K6_GATE_TEST_DB_NAME: dbName,
            K6_GATE_TEST_SYNC_DIR: sync,
          },
          url as string,
        );
        await waitForFile(dispatched);
        expect(child.kill(signal)).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(child.kill(signal === "SIGTERM" ? "SIGINT" : "SIGTERM")).toBe(
          true,
        );
        fs.writeFileSync(release, "release\n");
        const r = await done;
        expect(r.code).not.toBe(0);
        expect(await dbExists(dbName)).toBe(false);
        expect(fs.existsSync(path.join(dir, `race-${signal}.json`))).toBe(
          false,
        );
      },
      60_000,
    );

    it("SIGTERM while PostgreSQL reports CREATE DATABASE active removes only its lane", async () => {
      // Actual SQL-in-flight window: a multi-file template makes
      // CREATE DATABASE long enough for pg_stat_activity to report the
      // exact statement active before SIGTERM is sent.
      const dbName = `app_k6_sqlrace_${Date.now().toString(36)}`;
      const templateName = `app_k6_template_${Date.now().toString(36)}`;
      await createInflightTemplate(templateName);
      try {
        const sync = fs.mkdtempSync(path.join(dir, "sync-sql-inflight-"));
        const { child, done } = runHarness(
          ["lane-create", "--lane", path.join(dir, "sql-race.json")],
          {
            K6_GATE_TEST_BARRIER: "create-sql-inflight",
            K6_GATE_TEST_DB_NAME: dbName,
            K6_GATE_TEST_TEMPLATE: templateName,
            K6_GATE_TEST_SYNC_DIR: sync,
          },
          url as string,
        );
        await waitForFile(path.join(sync, "create-sql-dispatched"));
        await expect(waitForCreateActive(dbName)).resolves.toBe("active");
        expect(child.kill("SIGTERM")).toBe(true);
        const r = await done;
        expect(r.code).not.toBe(0);
        expect(await dbExists(dbName)).toBe(false);
        expect(fs.existsSync(path.join(dir, "sql-race.json"))).toBe(false);
      } finally {
        await dropDb(templateName);
      }
    }, 120_000);

    it("CREATE failure during termination never drops another database", async () => {
      const dbName = `app_k6_fail_${Date.now().toString(36)}`;
      const admin = new PrismaClient({
        datasources: { db: { url: adminUrl() } },
      });
      try {
        await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
      } finally {
        await admin.$disconnect();
      }
      try {
        const sync = fs.mkdtempSync(path.join(dir, "sync-create-fail-"));
        const { child, done } = runHarness(
          ["lane-create", "--lane", path.join(dir, "create-fail.json")],
          {
            K6_GATE_TEST_BARRIER: "create-dispatch-fail",
            K6_GATE_TEST_DB_NAME: dbName,
            K6_GATE_TEST_SYNC_DIR: sync,
          },
          url as string,
        );
        await waitForFile(path.join(sync, "create-sql-dispatched"));
        expect(child.kill("SIGTERM")).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(child.kill("SIGINT")).toBe(true);
        fs.writeFileSync(path.join(sync, "create-settle-release"), "release\n");
        const r = await done;
        expect(r.code).not.toBe(0);
        expect(r.output).toMatch(/CREATE DATABASE failed|already exists/);
        expect(await dbExists(dbName)).toBe(true);
      } finally {
        await dropDb(dbName);
      }
    }, 60_000);

    it("an already-existing database is refused and preserved", async () => {
      const dbName = `app_k6_existing_${Date.now().toString(36)}`;
      const admin = new PrismaClient({
        datasources: { db: { url: adminUrl() } },
      });
      try {
        await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
      } finally {
        await admin.$disconnect();
      }
      try {
        const { done } = runHarness(
          ["lane-create", "--lane", path.join(dir, "existing.json")],
          { K6_GATE_TEST_DB_NAME: dbName },
          url as string,
        );
        const r = await done;
        expect(r.code).not.toBe(0);
        expect(await dbExists(dbName)).toBe(true);
      } finally {
        await dropDb(dbName);
      }
    }, 60_000);

    it("marker-install failure drops only the DB created by that call", async () => {
      // The test harness throws after CREATE DATABASE + migrate, before
      // marker install — the catch must drop its own DB.
      const before = await laneDbs();
      const { done } = runHarness(
        ["lane-create", "--lane", path.join(dir, "fault-lane.json")],
        { K6_GATE_TEST_FAULT: "marker" },
        url as string,
      );
      const r = await done;
      expect(r.code).not.toBe(0);
      expect(await laneDbs()).toEqual(before);
      // And the fault-lane file must not authorize anything later —
      // its DB was dropped, so any use is a live-marker refusal.
      const f = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const probe = path.join(dir, "probe.json");
      fs.writeFileSync(probe, JSON.stringify(f));
      const rc = runProvision([
        "cleanup",
        "--file",
        probe,
        "--lane",
        path.join(dir, "fault-lane.json"),
      ]);
      expect(rc.code).not.toBe(0);
    }, 60_000);

    it("SIGTERM after create/migrate drops only its own DB and exits nonzero", async () => {
      // Catchable termination after CREATE DATABASE: the installed
      // handler must stop provisioning, drop exactly the created DB,
      // and exit nonzero — zero residue, no other DB touched.
      // (SIGKILL/machine failure still leaves a residual — documented.)
      const before = await laneDbs();
      const { done } = runHarness(
        ["lane-create", "--lane", path.join(dir, "term-lane.json")],
        { K6_GATE_TEST_FAULT: "term" },
        url as string,
      );
      const r = await done;
      expect(r.code).not.toBe(0);
      expect(await laneDbs()).toEqual(before); // zero residue
      expect(fs.existsSync(path.join(dir, "term-lane.json"))).toBe(false);
    }, 60_000);

    it("the shipping CLI ignores K6_GATE_FAULT entirely", async () => {
      // Normal execution must not interpret the old environment fault
      // switch — even in test-like variables it creates a normal lane.
      const env = { K6_GATE_FAULT: "term", NODE_ENV: "test" };
      const r = runProvision(
        ["lane-create", "--lane", path.join(dir, "inert-lane.json")],
        env,
        url as string,
      );
      if (r.code === 0) {
        // Clean the legitimately created lane (fault was inert).
        const laneName = JSON.parse(
          fs.readFileSync(path.join(dir, "inert-lane.json"), "utf8"),
        ).dbName;
        await dropDb(laneName);
      }
      expect(r.code).toBe(0); // created normally — fault never fired
    }, 120_000);

    it("a tampered manifest deletes nothing — victims survive", async () => {
      const f = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const forged = {
        ...f,
        workspaceId: victimWorkspaceId,
        userIds: [...f.userIds, victimUserId],
        clientProfileIds: [...f.clientProfileIds, victimProfileId],
      };
      fs.writeFileSync(manifestPath, JSON.stringify(forged));
      const r = runProvision(["cleanup", "--file", manifestPath]);
      expect(r.code).not.toBe(0);
      expect(r.output).toMatch(/ownership|loadgate/i);
      // Restore the real manifest for the legitimate-cleanup test.
      fs.writeFileSync(manifestPath, JSON.stringify(f));
      expect(
        await prisma.user.findUnique({ where: { id: victimUserId } }),
      ).not.toBeNull();
      expect(
        await prisma.clientProfile.findUnique({
          where: { id: victimProfileId },
        }),
      ).not.toBeNull();
      expect(
        await prisma.workspace.findUnique({
          where: { id: victimWorkspaceId },
        }),
      ).not.toBeNull();
    });

    it("a stale manifest (fixture ids pointing at nothing) refuses", async () => {
      const f = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const stale = {
        ...f,
        workspaceId: "nonexistent-ws-id",
        userIds: ["ghost-1", "ghost-2"],
      };
      const p = path.join(dir, "stale.json");
      fs.writeFileSync(p, JSON.stringify(stale));
      const r = runProvision(["cleanup", "--file", p]);
      expect(r.code).not.toBe(0);
      expect(
        await prisma.user.findUnique({ where: { id: victimUserId } }),
      ).not.toBeNull();
    });

    it("forged lane file token refuses destructive cleanup", async () => {
      const lane = JSON.parse(fs.readFileSync(lanePath, "utf8"));
      fs.writeFileSync(
        lanePath,
        JSON.stringify({ ...lane, token: "forged-token" }),
        { mode: 0o600 },
      );
      const r = runProvision(["cleanup", "--file", manifestPath]);
      expect(r.code).not.toBe(0);
      expect(r.output).toMatch(/lane marker|ownership/i);
      fs.writeFileSync(lanePath, JSON.stringify(lane), { mode: 0o600 });
      const victims = await prisma.user.findUnique({
        where: { id: victimUserId },
      });
      expect(victims).not.toBeNull();
    });

    it("stale lane file for another database refuses", () => {
      const lane = JSON.parse(fs.readFileSync(lanePath, "utf8"));
      fs.writeFileSync(
        lanePath,
        JSON.stringify({ ...lane, dbName: "app_other_lane" }),
        { mode: 0o600 },
      );
      const r = runProvision(["cleanup", "--file", manifestPath]);
      expect(r.code).not.toBe(0);
      fs.writeFileSync(lanePath, JSON.stringify(lane), { mode: 0o600 });
    });

    it("an unmarked pre-existing lane-named DB refuses", async () => {
      // A real, lane-shaped database that lane-create never made — a
      // forged lane file naming it cannot authorize cleanup: there is
      // no marker row inside.
      const noMarkerDb = `app_nomarker_${Date.now().toString(36)}`;
      const admin = new PrismaClient({
        datasources: { db: { url: adminUrl() } },
      });
      try {
        await admin.$executeRawUnsafe(`CREATE DATABASE "${noMarkerDb}"`);
      } finally {
        await admin.$disconnect();
      }
      execFileSync("npx", ["prisma", "migrate", "deploy"], {
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: dbUrlFor(noMarkerDb) },
      });
      const lane = JSON.parse(fs.readFileSync(lanePath, "utf8"));
      fs.writeFileSync(
        lanePath,
        JSON.stringify({ ...lane, dbName: noMarkerDb }),
        { mode: 0o600 },
      );
      const r = runProvision(
        ["cleanup", "--file", manifestPath],
        {},
        dbUrlFor(noMarkerDb),
      );
      fs.writeFileSync(lanePath, JSON.stringify(lane), { mode: 0o600 });
      expect(r.code).not.toBe(0);
      expect(r.output).toMatch(/lane marker|ownership|marker/i);
      await dropDb(noMarkerDb);
    }, 90_000);

    it("shared database names are refused even when confirmed", () => {
      for (const shared of ["app_dev", "app_e2e", "app_integration_test"])
        expect(
          runProvision(
            [
              "create",
              "--clients",
              "1",
              "--coaches",
              "1",
              "--out",
              manifestPath,
            ],
            {},
            dbUrlFor(shared),
          ).code,
        ).not.toBe(0);
    });

    it("a failed manifest write rolls the fixture rows back", async () => {
      const before = await prisma.workspace.count({
        where: { slug: { startsWith: "loadgate-" } },
      });
      // A path whose parent is an existing FILE — mkdirSync fails
      // (ENOTDIR) after the transaction commits → rollback must fire.
      const missing = path.join(manifestPath, "x.json");
      const r = runProvision([
        "create",
        "--clients",
        "2",
        "--coaches",
        "1",
        "--out",
        missing,
      ]);
      expect(r.code).not.toBe(0);
      expect(
        await prisma.workspace.count({
          where: { slug: { startsWith: "loadgate-" } },
        }),
      ).toBe(before);
    });

    it("legitimate cleanup removes exactly the fixture set", async () => {
      const r = runProvision(["cleanup", "--file", manifestPath]);
      expect(r.code).toBe(0);
      expect(
        await prisma.workspace.count({
          where: { slug: { startsWith: "loadgate-" } },
        }),
      ).toBe(0);
      expect(
        await prisma.user.count({
          where: { email: { endsWith: "@loadgate.invalid" } },
        }),
      ).toBe(0);
      expect(
        await prisma.user.findUnique({ where: { id: victimUserId } }),
      ).not.toBeNull();
    });
  },
);
