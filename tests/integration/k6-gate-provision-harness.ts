// Test-only lifecycle harness for k6-gate-provision.test.ts. The shipping
// CLI accepts no fault switches; this file injects synchronization and
// failures through ProvisionHooks so tests can hold exact signal windows.
import fs from "node:fs";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";

import { main, type ProvisionHooks } from "../../tools/load/provision";

const mode = process.env.K6_GATE_TEST_BARRIER ?? "";
const fault = process.env.K6_GATE_TEST_FAULT ?? "";
const syncDir = process.env.K6_GATE_TEST_SYNC_DIR ?? "";

async function barrier(name: string) {
  if (!syncDir) throw new Error(`K6_GATE_TEST_SYNC_DIR required for ${name}`);
  fs.writeFileSync(path.join(syncDir, `${name}-started`), "started\n");
  const release = path.join(syncDir, `${name}-release`);
  const deadline = Date.now() + 15_000;
  while (!fs.existsSync(release)) {
    if (Date.now() > deadline)
      throw new Error(`timed out waiting for ${name} release`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function createDatabase(admin: PrismaClient, dbName: string) {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
}

const hooks: ProvisionHooks = {
  dbName: process.env.K6_GATE_TEST_DB_NAME || undefined,
};

if (mode === "create-hold" || mode === "create-hold-fail") {
  hooks.createDatabase = async (admin, dbName) => {
    await barrier("create");
    if (mode === "create-hold-fail") {
      console.error("fault: CREATE DATABASE failed during termination");
      throw new Error("fault: CREATE DATABASE failed during termination");
    }
    await createDatabase(admin, dbName);
  };
}

if (fault === "marker" || fault === "term") {
  hooks.beforeMarkerInstall = async () => {
    if (fault === "marker") throw new Error("fault: marker install aborted");
    process.kill(process.pid, "SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  };
}

if (mode === "fixture-create-hold")
  hooks.beforeFixtureCommit = () => barrier("fixture-create");
if (mode === "fixture-cleanup-hold")
  hooks.beforeCleanupCommit = () => barrier("fixture-cleanup");

main(hooks).catch((e) => {
  console.error(String(e));
  process.exit(1);
});
