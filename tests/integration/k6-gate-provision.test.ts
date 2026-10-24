// K6-GATE (issue #178) — fixture lifecycle safety on a real database.
//
// The reviewer's proof that manifest ids alone are dangerous: a
// tampered manifest pointed cleanup at an unrelated user and it deleted
// the victim. This suite proves the repaired contract: ownership is
// re-validated FROM THE DATABASE before any delete, a tampered manifest
// refuses the whole cleanup transactionally (victims survive
// unchanged), and a wrong database name / missing CONFIRM_DISPOSABLE_DB
// refuses both commands up front.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
let victimWorkspaceId: string | null = null;

let lanePath = "";

function runProvision(
  args: string[],
  env: Record<string, string> = {},
  dbUrl = url as string,
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
          CONFIRM_DISPOSABLE_DB: dbUrl.split("/").pop()?.split("?")[0] ?? "",
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

describe.skipIf(!enabled)(
  "K6-GATE provision/cleanup safety (real PG, real CLI entrypoint)",
  () => {
    let prisma: PrismaClient;
    let dir: string;
    let manifestPath: string;
    let victimUserId: string;
    let victimProfileId: string;

    beforeAll(async () => {
      execFileSync("npx", ["prisma", "migrate", "deploy"], {
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: url as string },
      });
      prisma = new PrismaClient({
        datasources: { db: { url: url as string } },
      });
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "k6-gate-"));
      manifestPath = path.join(dir, "fixtures.json");
      lanePath = path.join(dir, "lane.json");
      // Task-owned lane: the tool installs its marker + lane file;
      // create/cleanup require this positive ownership evidence.
      const init = runProvision(["lane-init"]);
      if (init.code !== 0) throw new Error(`lane-init failed: ${init.output}`);

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
    }, 120_000);

    afterAll(async () => {
      // Remove the suite's own victim rows — the disposable lane stays
      // clean for the next run. FK order: dependents first.
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
      fs.rmSync(dir, { recursive: true, force: true });
    }, 30_000);

    it("refuses when CONFIRM_DISPOSABLE_DB is missing or wrong", () => {
      const r = runProvision(
        ["create", "--clients", "1", "--coaches", "1", "--out", manifestPath],
        { CONFIRM_DISPOSABLE_DB: "some_other_db" },
      );
      expect(r.code).not.toBe(0);
      expect(r.output).toMatch(/CONFIRM_DISPOSABLE_DB/);
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
      expect(f.userIds).toHaveLength(4);
      expect(f.clientProfileIds).toHaveLength(3);
      expect(f.clients.every((c: { userId?: string }) => c.userId)).toBe(true);
    });

    it("a tampered manifest deletes nothing — victims survive", async () => {
      const f = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      f.userIds.push(victimUserId); // poison: a foreign user id in the manifest
      f.clientProfileIds.push(victimProfileId);
      const tampered = path.join(dir, "tampered.json");
      fs.writeFileSync(tampered, JSON.stringify(f));

      const r = runProvision(["cleanup", "--file", tampered]);
      expect(r.code).not.toBe(0);
      expect(r.output).toMatch(/refusing cleanup/);

      // Nothing deleted — victim AND the genuine fixtures are intact.
      expect(await prisma.user.count({ where: { id: victimUserId } })).toBe(1);
      expect(
        await prisma.clientProfile.count({ where: { id: victimProfileId } }),
      ).toBe(1);
      expect(
        await prisma.user.count({
          where: { email: { endsWith: "@loadgate.invalid" } },
        }),
      ).toBe(4);
    });

    it("a stale manifest (fixture ids pointing at nothing) refuses", async () => {
      const stale = {
        createdAt: new Date().toISOString(),
        targetId: "",
        workspaceId: "does-not-exist",
        userIds: ["u-x"],
        clientProfileIds: ["p-x"],
        coaches: [],
        clients: [],
      };
      const stalePath = path.join(dir, "stale.json");
      fs.writeFileSync(stalePath, JSON.stringify(stale));
      const r = runProvision(["cleanup", "--file", stalePath]);
      expect(r.code).not.toBe(0);
      expect(r.output).toMatch(/refusing cleanup/);
    });

    it("positive ownership: pre-existing DB without the marker refuses", async () => {
      // A real, lane-named, CONFIRMED database — but lane-init never
      // ran on it, so no marker row exists. Point lane.json at it
      // anyway: cleanup must refuse before touching anything.
      const noMarkerDb = `app_nomarker_${Date.now().toString(36)}`;
      const admin = new PrismaClient({
        datasources: {
          db: { url: (url as string).replace(/\/[^/?]+$/, "/postgres") },
        },
      });
      try {
        await admin.$executeRawUnsafe(`CREATE DATABASE "${noMarkerDb}"`);
      } finally {
        await admin.$disconnect();
      }
      execFileSync("npx", ["prisma", "migrate", "deploy"], {
        stdio: "pipe",
        env: {
          ...process.env,
          DATABASE_URL: (url as string).replace(/\/[^/?]+$/, `/${noMarkerDb}`),
        },
      });
      const r = runProvision(
        ["cleanup", "--file", manifestPath],
        {},
        (url as string).replace(/\/[^/?]+$/, `/${noMarkerDb}`),
      );
      expect(r.code).not.toBe(0);
      expect(r.output).toMatch(/lane|ownership|marker/i);
      // Drop the probe DB — the disposable host stays clean.
      const admin2 = new PrismaClient({
        datasources: {
          db: { url: (url as string).replace(/\/[^/?]+$/, "/postgres") },
        },
      });
      try {
        await admin2.$executeRawUnsafe(`DROP DATABASE "${noMarkerDb}"`);
      } finally {
        await admin2.$disconnect();
      }
    }, 90_000);

    it("forged lane file token refuses destructive cleanup", async () => {
      // Overwrite lane.json's token — the live DB marker no longer
      // matches → cleanup refuses before touching rows.
      const lane = JSON.parse(fs.readFileSync(lanePath, "utf8"));
      fs.writeFileSync(
        lanePath,
        JSON.stringify({ ...lane, token: "forged-token" }),
        { mode: 0o600 },
      );
      const r = runProvision(["cleanup", "--file", manifestPath]);
      expect(r.code).not.toBe(0);
      expect(r.output).toMatch(/lane marker|ownership/i);
      // Restore — the legitimate cleanup test still needs real ownership.
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

    it("shared database names are refused even when confirmed", () => {
      for (const shared of ["app_dev", "app_e2e", "app_integration_test"]) {
        const r = runProvision(
          ["create", "--clients", "1", "--coaches", "1", "--out", manifestPath],
          {},
          `postgresql://app:app_dev_password@127.0.0.1:5433/${shared}`,
        );
        expect(r.code).not.toBe(0);
        expect(r.output).toMatch(/disposable lane/);
      }
    });

    it("a failed manifest write rolls the fixture rows back", async () => {
      // --out inside a directory tsx cannot create → post-commit write
      // fails → rollback must remove everything it provisioned. Compare
      // loadgate counts before/after — the earlier test's fixture set
      // legitimately still exists.
      const before = {
        users: await prisma.user.count({
          where: { email: { endsWith: "@loadgate.invalid" } },
        }),
        workspaces: await prisma.workspace.count({
          where: { slug: { startsWith: "loadgate-" } },
        }),
      };
      const r = runProvision([
        "create",
        "--clients",
        "1",
        "--coaches",
        "1",
        "--out",
        "/proc/definitely-cannot-create/fixtures.json",
      ]);
      expect(r.code).not.toBe(0);
      expect(
        await prisma.user.count({
          where: { email: { endsWith: "@loadgate.invalid" } },
        }),
      ).toBe(before.users);
      expect(
        await prisma.workspace.count({
          where: { slug: { startsWith: "loadgate-" } },
        }),
      ).toBe(before.workspaces);
    });

    it("legitimate cleanup removes exactly the fixture set", async () => {
      const r = runProvision(["cleanup", "--file", manifestPath]);
      expect(r.code).toBe(0);
      expect(
        await prisma.user.count({
          where: { email: { endsWith: "@loadgate.invalid" } },
        }),
      ).toBe(0);
      // Victim untouched by a clean fixture cleanup too.
      expect(await prisma.user.count({ where: { id: victimUserId } })).toBe(1);
      expect(fs.existsSync(manifestPath)).toBe(false);
    });
  },
);
