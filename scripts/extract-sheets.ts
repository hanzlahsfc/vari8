/**
 * Sheet extraction entry point.
 *
 * Phase 8 parses all 11 exports into the canonical in-memory artifact shape.
 * By default it is NON-WRITING: it validates the source and prints a coverage
 * report. Unredacted output is written only with `--raw` into a git-ignored
 * `RAW_EXTRACTION_DIR` (fail-closed). Committed, redacted `spec/sheets/**`
 * artifacts are produced in a later phase once the redaction ruleset lands.
 *
 * Usage:
 *   npm run extract:sheets -- --dry-run          # validate + parse, no writes
 *   RAW_EXTRACTION_DIR=.local-raw npm run extract:sheets -- --raw
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildCrossSheetData, renderCrossSheetMarkdown } from "../lib/extraction/crosssheet";
import type {
  ExerciseArtifact,
  ExpectedSheet,
  FoodArtifact,
  RedactionEntry,
  RedactionManifest,
} from "../lib/extraction/contracts";
import { parseCssDeclarations, type ClassDeclarations } from "../lib/extraction/css";
import { extractExercises, extractFoods } from "../lib/extraction/databases";
import { parseSheetHtml, type ParsedSheet } from "../lib/extraction/parse";
import { redactSheet, sortRedactions } from "../lib/extraction/redact";
import {
  assertRawDirIsIgnored,
  resolveSheetsSourceDir,
  SourceConfigError,
  validateSheetsSourceDir,
} from "../lib/extraction/source";
import { buildSheetSummary, SUMMARY_CONFIG } from "../lib/extraction/summaries";
import { buildThemeArtifact } from "../lib/extraction/theme";

type Options = {
  dryRun: boolean;
  raw: boolean;
  dataOnly: boolean;
  specOnly: boolean;
  redacted: boolean;
};

const KNOWN_FLAGS = new Set(["--dry-run", "--raw", "--data-only", "--spec-only", "--redacted"]);
const EXPECTED_FOODS = 599;
const EXPECTED_EXERCISES = 546;
const FOODS_FILE = "Nutrition Database.html";
const EXERCISES_FILE = "Exercise Database.html";
const SPEC_DIR = "spec";

function parseArgs(argv: string[]): Options {
  const unknown = argv.filter((arg) => arg.startsWith("--") && !KNOWN_FLAGS.has(arg));
  if (unknown.length > 0) throw new Error(`Unknown argument(s): ${unknown.join(", ")}`);
  const options = {
    dryRun: argv.includes("--dry-run"),
    raw: argv.includes("--raw"),
    dataOnly: argv.includes("--data-only"),
    specOnly: argv.includes("--spec-only"),
    redacted: argv.includes("--redacted"),
  };
  const selected = [options.raw, options.dataOnly, options.specOnly, options.redacted].filter(
    Boolean,
  ).length;
  if (selected > 1) {
    throw new Error("--raw, --data-only, --spec-only and --redacted are mutually exclusive");
  }
  return options;
}

function loadBaseClasses(dir: string): Record<string, ClassDeclarations> {
  const sheetCss = join(dir, "resources", "sheet.css");
  if (!existsSync(sheetCss)) return {};
  return parseCssDeclarations(readFileSync(sheetCss, "utf8"));
}

type Coverage = {
  slug: string;
  file: string;
  cells: number;
  spanned: number;
  checked: number;
  unchecked: number;
  ambiguousCheckbox: number;
  normalized: number;
  classes: number;
  todos: number;
};

function summarize(slug: string, file: string, parsed: ParsedSheet): Coverage {
  let spanned = 0;
  let checked = 0;
  let unchecked = 0;
  let ambiguousCheckbox = 0;
  let normalized = 0;
  for (const cell of parsed.cells) {
    if (cell.rowSpan > 1 || cell.colSpan > 1) spanned += 1;
    if (cell.checkbox === "checked") checked += 1;
    if (cell.checkbox === "unchecked") unchecked += 1;
    if (cell.todo) ambiguousCheckbox += 1;
    if (cell.normalized !== undefined) normalized += 1;
  }
  return {
    slug,
    file,
    cells: parsed.cells.length,
    spanned,
    checked,
    unchecked,
    ambiguousCheckbox,
    normalized,
    classes: Object.keys(parsed.classes).length,
    todos: parsed.todos.length,
  };
}

function stableArtifact(slug: string, file: string, parsed: ParsedSheet) {
  const classes: Record<string, ClassDeclarations> = {};
  for (const name of Object.keys(parsed.classes).sort()) classes[name] = parsed.classes[name];
  return { slug, sourceFile: file, cells: parsed.cells, classes, todos: parsed.todos };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runDataOnly(sourceDir: string): number {
  if (!existsSync(join(sourceDir, FOODS_FILE)) || !existsSync(join(sourceDir, EXERCISES_FILE))) {
    console.error(
      `[extract:sheets] --data-only requires ${FOODS_FILE} and ${EXERCISES_FILE} in the source dir`,
    );
    return 1;
  }

  const foods = extractFoods(readFileSync(join(sourceDir, FOODS_FILE), "utf8"));
  const exercises = extractExercises(readFileSync(join(sourceDir, EXERCISES_FILE), "utf8"));

  const foodArtifact: FoodArtifact = {
    version: 1,
    sourceFile: FOODS_FILE,
    count: foods.records.length,
    skippedNumberedRows: foods.skippedNumberedRows,
    records: foods.records,
  };
  const exerciseArtifact: ExerciseArtifact = {
    version: 1,
    sourceFile: EXERCISES_FILE,
    count: exercises.records.length,
    records: exercises.records,
  };

  const outDir = join(process.cwd(), "spec", "data");
  mkdirSync(outDir, { recursive: true });
  writeJson(join(outDir, "foods.json"), foodArtifact);
  writeJson(join(outDir, "exercises.json"), exerciseArtifact);

  console.log(
    `[extract:sheets] foods: ${foods.records.length} records (skipped ${foods.skippedNumberedRows} numbered-empty rows)`,
  );
  console.log(`[extract:sheets] exercises: ${exercises.records.length} records`);
  if (foods.records.length !== EXPECTED_FOODS) {
    console.warn(
      `[extract:sheets] WARN foods count ${foods.records.length} != expected ~${EXPECTED_FOODS}`,
    );
  }
  if (exercises.records.length !== EXPECTED_EXERCISES) {
    console.warn(
      `[extract:sheets] WARN exercises count ${exercises.records.length} != expected ~${EXPECTED_EXERCISES}`,
    );
  }
  if (foods.missingHeaders.length > 0) {
    console.warn(`[extract:sheets] WARN missing food headers: ${foods.missingHeaders.join(", ")}`);
  }
  if (exercises.missingHeaders.length > 0) {
    console.warn(
      `[extract:sheets] WARN missing exercise headers: ${exercises.missingHeaders.join(", ")}`,
    );
  }
  console.log("[extract:sheets] wrote spec/data/foods.json and spec/data/exercises.json");
  return 0;
}

function runSpecOnly(sourceDir: string, sheets: ExpectedSheet[]): number {
  const baseClasses = loadBaseClasses(sourceDir);
  const parsedSheets = sheets.map((sheet) => ({
    sheet,
    parsed: parseSheetHtml(readFileSync(join(sourceDir, sheet.file), "utf8"), { baseClasses }),
  }));

  const sheetsDir = join(process.cwd(), SPEC_DIR, "sheets");
  mkdirSync(sheetsDir, { recursive: true });
  for (const { sheet, parsed } of parsedSheets) {
    writeJson(
      join(sheetsDir, `${sheet.slug}.summary.json`),
      buildSheetSummary(sheet.slug, sheet.file, parsed.cells),
    );
  }

  const theme = buildThemeArtifact(
    parsedSheets.map(({ sheet, parsed }) => ({
      slug: sheet.slug,
      cells: parsed.cells,
      classes: parsed.classes,
    })),
  );
  writeJson(join(process.cwd(), SPEC_DIR, "theme.json"), theme);

  const foods = extractFoods(readFileSync(join(sourceDir, FOODS_FILE), "utf8"));
  const exercises = extractExercises(readFileSync(join(sourceDir, EXERCISES_FILE), "utf8"));
  const safeLabels = new Set(Object.values(SUMMARY_CONFIG).flatMap((config) => config.labels));
  const crossSheet = buildCrossSheetData({
    sheets: parsedSheets.map(({ sheet, parsed }) => ({ slug: sheet.slug, cells: parsed.cells })),
    foodNames: new Set(foods.records.map((record) => record.food)),
    exerciseNames: new Set(exercises.records.map((record) => record.name)),
    safeLabels,
  });
  writeFileSync(
    join(process.cwd(), SPEC_DIR, "cross-sheet.md"),
    renderCrossSheetMarkdown(crossSheet),
    "utf8",
  );

  console.log(
    `[extract:sheets] wrote ${parsedSheets.length} sheet summaries, spec/theme.json, spec/cross-sheet.md`,
  );
  console.log(`[extract:sheets] theme combinations: ${theme.combinations.length}`);
  console.log(
    `[extract:sheets] cross-sheet: foods=${crossSheet.totals.foods} exercises=${crossSheet.totals.exercises} labels=${crossSheet.totals.labels}`,
  );
  return 0;
}

function runRedacted(sourceDir: string, sheets: ExpectedSheet[]): number {
  const baseClasses = loadBaseClasses(sourceDir);
  const sheetsDir = join(process.cwd(), SPEC_DIR, "sheets");
  mkdirSync(sheetsDir, { recursive: true });

  const generated: RedactionEntry[] = [];
  let totalRedacted = 0;
  let totalKept = 0;
  let totalEmpty = 0;

  for (const sheet of sheets) {
    const parsed = parseSheetHtml(readFileSync(join(sourceDir, sheet.file), "utf8"), {
      baseClasses,
    });
    const result = redactSheet(sheet.slug, sheet.file, parsed.cells, parsed.classes, parsed.todos);
    writeJson(join(sheetsDir, `${sheet.slug}.json`), result.artifact);
    generated.push(...result.redactions);
    totalRedacted += result.redactedCells;
    totalKept += result.keptCells;
    totalEmpty += result.emptyCells;
  }

  const manifestPath = join(process.cwd(), SPEC_DIR, "redaction-manifest.json");
  const existing: RedactionManifest | null = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, "utf8")) as RedactionManifest)
    : null;
  const documentRedactions = (existing?.redactions ?? []).filter(
    (entry) => !entry.artifact.startsWith("spec/sheets/"),
  );
  const manifest: RedactionManifest = {
    version: existing?.version ?? 1,
    policy: existing?.policy ?? "docs/redaction-policy.md",
    placeholderConvention: existing?.placeholderConvention ?? "[REDACTED:<category>]",
    redactions: sortRedactions([...documentRedactions, ...generated]),
  };
  writeJson(manifestPath, manifest);

  console.log(`[extract:sheets] wrote ${sheets.length} redacted sheet artifacts to spec/sheets/`);
  console.log(
    `[extract:sheets] cells: kept=${totalKept} redacted=${totalRedacted} empty=${totalEmpty}`,
  );
  console.log(
    `[extract:sheets] manifest: ${manifest.redactions.length} entries (${generated.length} cell-level)`,
  );
  return 0;
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
  const rawDir = (process.env.RAW_EXTRACTION_DIR ?? "").trim();

  const mode = options.dataOnly
    ? "data-only"
    : options.specOnly
      ? "spec-only (safe artifacts)"
      : options.redacted
        ? "redacted (committed cell artifacts)"
        : options.raw
          ? "raw-write"
          : "dry-run (non-writing)";
  console.log(`[extract:sheets] mode: ${mode}`);
  console.log(`[extract:sheets] SHEETS_SOURCE_DIR: ${sourceDir}`);

  let source;
  try {
    source = validateSheetsSourceDir(sourceDir, repoRoot);
  } catch (error) {
    if (error instanceof SourceConfigError) {
      console.error(`[extract:sheets] ${error.message}`);
      return 1;
    }
    throw error;
  }

  if (options.dataOnly) {
    for (const slug of source.unexpected) console.warn(`  unexpected sheet: ${slug}`);
    return runDataOnly(source.dir);
  }

  if (source.missing.length > 0) {
    for (const file of source.missing) console.error(`  MISSING   ${file}`);
    console.error(`[extract:sheets] missing ${source.missing.length} expected sheet(s); aborting`);
    return 1;
  }
  for (const slug of source.unexpected) console.warn(`  unexpected sheet: ${slug}`);

  if (options.specOnly) {
    return runSpecOnly(source.dir, source.sheets);
  }

  if (options.redacted) {
    return runRedacted(source.dir, source.sheets);
  }

  if (options.raw) {
    if (rawDir.length === 0) {
      console.error("[extract:sheets] --raw requires RAW_EXTRACTION_DIR to be set");
      return 1;
    }
    try {
      assertRawDirIsIgnored(rawDir, repoRoot);
    } catch (error) {
      console.error(`[extract:sheets] ${(error as Error).message}`);
      return 1;
    }
  }

  const baseClasses = loadBaseClasses(source.dir);
  const coverages: Coverage[] = [];

  for (const sheet of source.sheets) {
    const filePath = join(source.dir, sheet.file);
    let parsed: ParsedSheet;
    try {
      parsed = parseSheetHtml(readFileSync(filePath, "utf8"), { baseClasses });
    } catch (error) {
      console.error(`[extract:sheets] failed to parse ${sheet.file}: ${(error as Error).message}`);
      return 1;
    }
    coverages.push(summarize(sheet.slug, sheet.file, parsed));

    if (options.raw) {
      const outDir = join(repoRoot, rawDir, "sheets");
      mkdirSync(outDir, { recursive: true });
      writeJson(join(outDir, `${sheet.slug}.json`), stableArtifact(sheet.slug, sheet.file, parsed));
    }
  }

  console.log("");
  console.log("sheet                 cells  spans  checked  unchecked  norm  classes  todos");
  for (const c of coverages) {
    console.log(
      `${c.slug.padEnd(20)} ${String(c.cells).padStart(5)} ${String(c.spanned).padStart(6)} ` +
        `${String(c.checked).padStart(8)} ${String(c.unchecked).padStart(10)} ` +
        `${String(c.normalized).padStart(5)} ${String(c.classes).padStart(8)} ${String(c.todos).padStart(6)}`,
    );
  }
  const totalCells = coverages.reduce((sum, c) => sum + c.cells, 0);
  console.log(`[extract:sheets] parsed ${coverages.length} sheets, ${totalCells} cells total`);

  if (options.raw) {
    console.log(`[extract:sheets] wrote raw artifacts to ${rawDir}/sheets/ (git-ignored)`);
  } else {
    console.log("[extract:sheets] dry-run complete; no files written");
  }
  return 0;
}

process.exit(main());
