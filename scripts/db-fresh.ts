import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { classifyRuntime } from "../lib/runtime";
import { laneDbName } from "./seed/index";

/**
 * PR-04 — one-command lane database bootstrap.
 *
 *   NODE_ENV=development \
 *   DATABASE_URL=postgresql://app:<pw>@127.0.0.1:5433/app_<lane>?schema=public \
 *   SEED_OWNER_EMAIL=owner@vari8.test SEED_OWNER_PASSWORD=<15+ chars> \
 *   SEED_COACH_EMAIL=coach@vari8.test SEED_COACH_PASSWORD=<15+ chars> \
 *   npm run db:fresh
 *
 * Drops and recreates `app_<lane>` in the local dockerized PostgreSQL
 * (container `vari8-db-1`, the same tooling `verify-local.sh` uses), deploys
 * the committed migrations, runs the catalog imports and the development
 * seed. Refuses outside a trusted development/test runtime.
 *
 * Catalog sources are raw workbook exports that never enter version control.
 * Point `SHEETS_SOURCE_DIR` at the extracted folder (it must contain
 * "Nutrition Database.html" and "Exercise Database.html"), or set the file
 * paths directly via NUTRITION_SOURCE / EXERCISE_SOURCE. When no catalog
 * source exists on this machine, set DB_FRESH_SKIP_CATALOGS=1 to skip the
 * imports explicitly — the seed still runs.
 */

const CONTAINER = "vari8-db-1";
const NUTRITION_FILE = "Nutrition Database.html";
const EXERCISE_FILE = "Exercise Database.html";

function run(cmd: string, args: string[]): void {
  execFileSync(cmd, args, { stdio: "inherit" });
}

function catalogSources(): { nutrition: string; exercise: string } | null {
  const dir = process.env.SHEETS_SOURCE_DIR;
  if (dir) {
    const nutrition = join(dir, NUTRITION_FILE);
    const exercise = join(dir, EXERCISE_FILE);
    if (existsSync(nutrition) && existsSync(exercise))
      return { nutrition, exercise };
    throw new Error(
      `SHEETS_SOURCE_DIR=${dir} must contain ${NUTRITION_FILE} and ${EXERCISE_FILE}`,
    );
  }
  const nutrition = process.env.NUTRITION_SOURCE;
  const exercise = process.env.EXERCISE_SOURCE;
  if (nutrition && exercise) {
    if (!existsSync(nutrition) || !existsSync(exercise))
      throw new Error("NUTRITION_SOURCE/EXERCISE_SOURCE paths must exist");
    return { nutrition, exercise };
  }
  return null;
}

function main(): void {
  const runtime = classifyRuntime();
  if (runtime === "production")
    throw new Error("db:fresh is development/test only");
  const db = laneDbName(process.env.DATABASE_URL ?? "");

  console.log(`[db:fresh] recreate ${db} in ${CONTAINER}`);
  run("docker", ["exec", CONTAINER, "dropdb", "-U", "app", "--if-exists", db]);
  run("docker", ["exec", CONTAINER, "createdb", "-U", "app", db]);

  console.log("[db:fresh] prisma migrate deploy");
  run("npx", ["prisma", "migrate", "deploy"]);

  const sources = catalogSources();
  if (process.env.DB_FRESH_SKIP_CATALOGS === "1") {
    console.warn(
      "[db:fresh] DB_FRESH_SKIP_CATALOGS=1 — catalog imports skipped " +
        "(nutrition/exercise catalogs stay empty)",
    );
  } else if (!sources) {
    throw new Error(
      "catalog sources not found: set SHEETS_SOURCE_DIR (folder with " +
        `${NUTRITION_FILE} + ${EXERCISE_FILE}) or NUTRITION_SOURCE and ` +
        "EXERCISE_SOURCE file paths, or DB_FRESH_SKIP_CATALOGS=1 to skip",
    );
  } else {
    console.log("[db:fresh] import:nutrition");
    run("npx", [
      "tsx",
      "scripts/import-nutrition.ts",
      "--source",
      sources.nutrition,
    ]);
    console.log("[db:fresh] import:exercise");
    run("npx", [
      "tsx",
      "scripts/import-exercise.ts",
      "--source",
      sources.exercise,
    ]);
  }

  console.log("[db:fresh] seed");
  run("npx", ["tsx", "scripts/seed/index.ts"]);
  console.log("[db:fresh] done");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
