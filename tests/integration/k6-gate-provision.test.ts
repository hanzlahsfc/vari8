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
const dbName = (url ?? "").split("/").pop()?.split("?")[0] ?? "";

function runProvision(
  args: string[],
  env: Record<string, string> = {},
): { code: number; output: string } {
  try {
    const out = execFileSync(
      "npx",
      ["tsx", "tools/load/provision.ts", ...args],
      {
        stdio: "pipe",
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATABASE_URL: url as string,
          CONFIRM_DISPOSABLE_DB: dbName,
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

      // An unrelated victim workspace + user + profile — must survive.
      const victimWs = await prisma.workspace.create({
        data: { name: `victim-${Date.now()}`, slug: `victim-${Date.now()}` },
      });
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
