import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { prisma } from "../../lib/db";
import { classifyRuntime } from "../../lib/runtime";

/**
 * PR-04 (D17, D34) — deterministic development seed.
 *
 * Loads every `scripts/seed/*.seed.ts` in name order — one file per domain —
 * and runs each module's default export. Refuses to run unless the runtime
 * classifies as development/test AND the target database is a lane database
 * (`app_<lane>`, never `app_dev`): the seed writes synthetic demo rows and
 * must never touch a shared or production database.
 *
 *   DATABASE_URL=postgresql://app:...@127.0.0.1:5433/app_<lane>?schema=public \
 *     npm run seed:dev
 */

export type SeedContext = { prisma: typeof prisma };
export type SeedModule = { default: (ctx: SeedContext) => Promise<void> };

export function laneDbName(databaseUrl: string): string {
  const name = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (!/^app_[a-z0-9_]+$/.test(name) || name === "app_dev")
    throw new Error(
      `refusing to seed database "${name}": lane databases only (app_<lane>)`,
    );
  return name;
}

async function main(): Promise<void> {
  const runtime = classifyRuntime();
  if (runtime === "production")
    throw new Error(
      `refusing to seed: runtime classified as production ` +
        `(APP_ENV=${process.env.APP_ENV ?? "<unset>"}, ` +
        `NODE_ENV=${process.env.NODE_ENV ?? "<unset>"}); ` +
        `the seed is development/test only`,
    );
  const dbName = laneDbName(process.env.DATABASE_URL ?? "");

  const dir = dirname(fileURLToPath(import.meta.url));
  const demoOn = process.env.VARI8_SEED_DEMO === "1";
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".seed.ts"))
    // Opt-in demo profile (Stage 11): `*-demo-*.seed.ts` modules run only
    // under VARI8_SEED_DEMO=1, keeping the default output byte-identical.
    .filter((file) => demoOn || !file.includes("-demo-"))
    .sort();
  if (files.length === 0) throw new Error("no scripts/seed/*.seed.ts found");

  for (const file of files) {
    const mod = (await import(
      pathToFileURL(join(dir, file)).href
    )) as SeedModule;
    if (typeof mod.default !== "function")
      throw new Error(`seed module ${file} has no default export`);
    console.log(`[seed] ${file}`);
    await mod.default({ prisma });
  }
  console.log(`[seed] done: ${files.length} module(s) on ${dbName}`);
}

// Run only when invoked directly — `scripts/db-fresh.ts` imports the lane
// guard above without re-running the seed.
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
