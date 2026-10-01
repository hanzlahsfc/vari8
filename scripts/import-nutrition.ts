import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { prisma } from "../lib/db";
import { importNutritionCatalog } from "../lib/nutrition/import";
import { extractNutritionSource } from "../lib/nutrition/source";

/**
 * Trusted, local-only Nutrition Database import command.
 *
 *   npm run import:nutrition -- --source "/path/to/Nutrition Database.html"
 *
 * This is a maintenance CLI, NOT a route/API/upload: it requires an explicit
 * local file path and is only ever run by a trusted operator. The source is
 * read from disk, fingerprinted, mapped, and imported transactionally. No raw
 * source file or row payload is written to the repository.
 */

function readSourceArg(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source" || arg === "-s") return argv[i + 1];
    if (arg.startsWith("--source=")) return arg.slice("--source=".length);
  }
  return undefined;
}

function countByReason(
  rows: { reasonCode: string | null }[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = row.reasonCode ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function main(): Promise<void> {
  const sourcePath = readSourceArg(process.argv.slice(2));
  if (!sourcePath) {
    console.error(
      'usage: npm run import:nutrition -- --source "/path/to/Nutrition Database.html"',
    );
    process.exitCode = 2;
    return;
  }

  const bytes = readFileSync(sourcePath);
  const sourceFingerprint = createHash("sha256").update(bytes).digest("hex");
  const source = extractNutritionSource(bytes.toString("utf8"), {
    sourceName: basename(sourcePath),
    sourceFingerprint,
  });

  const summary = await importNutritionCatalog(prisma, source);

  console.log(
    JSON.stringify(
      {
        source: {
          name: source.sourceName,
          fingerprint: sourceFingerprint,
          headerRow: source.headerRow,
        },
        summary,
        rejectedByReason: countByReason(source.rejected),
        duplicatedByReason: countByReason(source.duplicates),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error),
    );
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
