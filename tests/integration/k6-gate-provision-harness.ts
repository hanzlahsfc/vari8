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

async function createDatabaseFromTemplate(
  admin: PrismaClient,
  dbName: string,
  templateName: string,
) {
  await admin.$executeRawUnsafe(
    `CREATE DATABASE "${dbName}" TEMPLATE "${templateName}"`,
  );
}

const hooks: ProvisionHooks = {
  dbName: process.env.K6_GATE_TEST_DB_NAME || undefined,
};

if (mode === "create-dispatch-hold" || mode === "create-dispatch-fail") {
  hooks.createDatabase = async (admin, dbName) => {
    const createPromise = createDatabase(admin, dbName);
    fs.writeFileSync(
      path.join(syncDir, "create-sql-dispatched"),
      "dispatched\n",
    );
    try {
      await createPromise;
    } catch (e) {
      console.error("fault: CREATE DATABASE failed during termination");
      await barrier("create-settle");
      throw e;
    }
    await barrier("create-settle");
  };
}

if (mode === "create-sql-inflight") {
  const templateName = process.env.K6_GATE_TEST_TEMPLATE ?? "";
  if (!templateName) throw new Error("K6_GATE_TEST_TEMPLATE is required");
  hooks.createDatabase = async (admin, dbName) => {
    const createPromise = createDatabaseFromTemplate(
      admin,
      dbName,
      templateName,
    );
    fs.writeFileSync(
      path.join(syncDir, "create-sql-dispatched"),
      "dispatched\n",
    );
    await createPromise;
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
