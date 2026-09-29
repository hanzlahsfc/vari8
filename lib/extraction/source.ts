import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import {
  EXPECTED_SHEETS,
  type ExpectedSheet,
  slugifySheetFileName,
} from "./contracts";

/**
 * Source handling for the sheet extractor (Phase 7).
 *
 * The exports contain real client PII/health data and must stay OUTSIDE the
 * repository. This module resolves and validates the read-only source folder,
 * and provides the fail-closed guard for opt-in raw output.
 */

export const DEFAULT_SHEETS_SOURCE_DIR =
  "/Users/apple/Downloads/PRGRSS 2.0 extracted/Copy of PRGRSS 2.0";

export class SourceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceConfigError";
  }
}

/** Env override wins; otherwise default to the supplied exports folder. */
export function resolveSheetsSourceDir(env: string | undefined): string {
  const value = typeof env === "string" ? env.trim() : "";
  return value.length > 0 ? value : DEFAULT_SHEETS_SOURCE_DIR;
}

/** True when `target` is the repo root or nested inside it. */
export function isInsideRepo(target: string, repoRoot: string): boolean {
  const rel = relative(resolve(repoRoot), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export type ValidatedSource = {
  dir: string;
  sheets: ExpectedSheet[];
  missing: string[];
  unexpected: string[];
};

/**
 * Validate the source directory and confirm the expected sheets.
 *
 * Throws `SourceConfigError` for directory-level problems (missing, not a
 * directory, inside the repo). Missing/unexpected *files* are reported in the
 * result so the caller can surface them instead of silently skipping a sheet.
 */
export function validateSheetsSourceDir(
  dir: string,
  repoRoot: string,
): ValidatedSource {
  const resolved = resolve(dir);

  if (isInsideRepo(resolved, repoRoot)) {
    throw new SourceConfigError(
      `SHEETS_SOURCE_DIR resolves inside the repository (${resolved}). ` +
        "Raw exports must stay outside the repo.",
    );
  }
  if (!existsSync(resolved)) {
    throw new SourceConfigError(
      `SHEETS_SOURCE_DIR does not exist: ${resolved}`,
    );
  }
  if (!statSync(resolved).isDirectory()) {
    throw new SourceConfigError(
      `SHEETS_SOURCE_DIR is not a directory: ${resolved}`,
    );
  }

  const present = new Set(
    readdirSync(resolved)
      .filter((name) => /\.html?$/i.test(name))
      .map((name) => name.trim()),
  );

  const sheets: ExpectedSheet[] = [];
  const missing: string[] = [];
  for (const expected of EXPECTED_SHEETS) {
    if (present.has(expected.file)) {
      sheets.push(expected);
      present.delete(expected.file);
    } else {
      missing.push(expected.file);
    }
  }

  // Anything left over does not match an expected export file name: report it
  // (never silently skip). Detection is by original filename, so a
  // differently-named file that slugs to a known value is still surfaced.
  const unexpected = [
    ...new Set([...present].map((name) => slugifySheetFileName(name))),
  ].sort();

  return { dir: resolved, sheets, missing, unexpected };
}

/** True when `git check-ignore` confirms `target` is ignored in `cwd`. */
export function isPathGitIgnored(target: string, cwd: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", target], {
      cwd,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fail-closed guard for unredacted raw output: the destination must be
 * git-ignored. Throws otherwise.
 */
export function assertRawDirIsIgnored(rawDir: string, repoRoot: string): void {
  const candidate = (
    isAbsolute(rawDir) ? relative(resolve(repoRoot), resolve(rawDir)) : rawDir
  ).replace(/\/+$/, "");
  // Check the directory itself and a sentinel child: a directory-only ignore
  // rule (e.g. "/.local-raw/") does not match a bare, non-existent dir name.
  const ignored =
    isPathGitIgnored(candidate, repoRoot) ||
    isPathGitIgnored(`${candidate}/__probe__`, repoRoot);
  if (!ignored) {
    throw new SourceConfigError(
      `RAW_EXTRACTION_DIR is not git-ignored: ${rawDir}. ` +
        "Refusing to write unredacted output outside an ignored path.",
    );
  }
}
