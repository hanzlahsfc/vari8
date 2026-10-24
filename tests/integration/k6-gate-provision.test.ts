// K6-GATE (issue #178) — fixture provision/cleanup safety against REAL
// PostgreSQL. The suite creates its own task-owned lane via
// `provision.ts lane-create` (the only ownership-establishment path)
// and exercises every destructive path through the real CLI.
//   INTEGRATION_DATABASE_URL — admin-URL base; the suite derives lane
//   DB URLs from it via URL parsing (preserving ?schema=public and any
//   other supported components).
// Destructive paths never run against shared databases; the lane DB is
// dropped after the suite.

import { execFileSync } from "node:child_process";
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

    it("lane-create failure drops only the DB it created", async () => {
      // --lane pointing into a path whose parent is an existing FILE →
      // writeLaneFile throws AFTER CREATE DATABASE → cleanup must drop
      // exactly that DB and no other.
      const admin = new PrismaClient({
        datasources: { db: { url: adminUrl() } },
      });
      const before = (
        await admin.$queryRawUnsafe<{ datname: string }[]>(
          "SELECT datname FROM pg_database WHERE datname LIKE 'app_k6_%'",
        )
      ).map((r) => r.datname);
      await admin.$disconnect();
      const badLane = path.join(manifestPath, "lane.json"); // parent is a file
      const r2 = runProvision(
        ["lane-create", "--lane", badLane], // first --lane wins
        { CONFIRM_DISPOSABLE_DB: "" },
        url as string,
      );
      expect(r2.code).not.toBe(0);
      const admin2 = new PrismaClient({
        datasources: { db: { url: adminUrl() } },
      });
      const after = (
        await admin2.$queryRawUnsafe<{ datname: string }[]>(
          "SELECT datname FROM pg_database WHERE datname LIKE 'app_k6_%'",
        )
      ).map((x) => x.datname);
      await admin2.$disconnect();
      // Exactly zero leftover databases — the failed invocation dropped
      // its own, and no others were touched.
      expect(after).toEqual(before);
    }, 60_000);

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
