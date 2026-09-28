/**
 * Sheet extraction entry point.
 *
 * Phase 7 implements input resolution, validation, and a NON-WRITING dry-run.
 * Full parsing and artifact emission land in Phase 8+.
 *
 * Usage:
 *   npm run extract:sheets -- --dry-run
 */

import { EXPECTED_SHEETS } from "../lib/extraction/contracts";
import {
  assertRawDirIsIgnored,
  resolveSheetsSourceDir,
  SourceConfigError,
  validateSheetsSourceDir,
} from "../lib/extraction/source";

type Options = { dryRun: boolean };

const KNOWN_FLAGS = new Set(["--dry-run"]);

function parseArgs(argv: string[]): Options {
  const unknown = argv.filter((arg) => arg.startsWith("--") && !KNOWN_FLAGS.has(arg));
  if (unknown.length > 0) {
    throw new Error(`Unknown argument(s): ${unknown.join(", ")}`);
  }
  return { dryRun: argv.includes("--dry-run") };
}

function main(): number {
  let options: Options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[extract:sheets] ${(error as Error).message}`);
    return 2;
  }

  const repoRoot = process.cwd();
  const sourceDir = resolveSheetsSourceDir(process.env.SHEETS_SOURCE_DIR);

  console.log("[extract:sheets] mode: dry-run (non-writing)");
  console.log(`[extract:sheets] repo root: ${repoRoot}`);
  console.log(`[extract:sheets] SHEETS_SOURCE_DIR: ${sourceDir}`);

  let result;
  try {
    result = validateSheetsSourceDir(sourceDir, repoRoot);
  } catch (error) {
    if (error instanceof SourceConfigError) {
      console.error(`[extract:sheets] ${error.message}`);
      return 1;
    }
    throw error;
  }

  console.log(
    `[extract:sheets] found ${result.sheets.length}/${EXPECTED_SHEETS.length} expected sheets`,
  );
  for (const sheet of result.sheets) {
    console.log(`  ok        ${sheet.slug} <- ${sheet.file}`);
  }
  for (const file of result.missing) {
    console.error(`  MISSING   ${file}`);
  }
  for (const slug of result.unexpected) {
    console.warn(`  unexpected sheet: ${slug}`);
  }

  const rawDir = (process.env.RAW_EXTRACTION_DIR ?? "").trim();
  if (rawDir.length > 0) {
    try {
      assertRawDirIsIgnored(rawDir, repoRoot);
      console.log(`[extract:sheets] RAW_EXTRACTION_DIR is git-ignored: ${rawDir}`);
    } catch (error) {
      console.error(`[extract:sheets] ${(error as Error).message}`);
      return 1;
    }
  } else {
    console.log("[extract:sheets] RAW_EXTRACTION_DIR: not set (unredacted output disabled)");
  }

  if (result.missing.length > 0) {
    console.error(
      `[extract:sheets] missing ${result.missing.length} expected sheet(s); aborting without writing`,
    );
    return 1;
  }

  if (!options.dryRun) {
    console.log(
      "[extract:sheets] artifact emission is not implemented until Phase 8; nothing was written.",
    );
  }
  console.log("[extract:sheets] dry-run complete; no files written.");
  return 0;
}

process.exit(main());
