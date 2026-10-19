import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertRawDirIsIgnored,
  isInsideRepo,
  isPathGitIgnored,
  SourceConfigError,
  validateSheetsSourceDir,
} from "../../lib/extraction/source";

const REPO = process.cwd();

describe("isInsideRepo", () => {
  it("detects paths inside, equal to, and outside the repo root", () => {
    expect(isInsideRepo(join(REPO, "sources", "x"), REPO)).toBe(true);
    expect(isInsideRepo(REPO, REPO)).toBe(true);
    expect(isInsideRepo("/Users/apple/Downloads/elsewhere", REPO)).toBe(false);
  });
});

describe("isPathGitIgnored", () => {
  it("recognizes ignored raw paths and rejects committed spec output", () => {
    expect(isPathGitIgnored(".local-raw/spec.json", REPO)).toBe(true);
    expect(isPathGitIgnored("spec/sheets/example.json", REPO)).toBe(false);
  });
});

describe("assertRawDirIsIgnored", () => {
  it("accepts an ignored raw destination", () => {
    expect(() => assertRawDirIsIgnored(".local-raw", REPO)).not.toThrow();
  });

  it("fails closed for a non-ignored destination", () => {
    expect(() => assertRawDirIsIgnored("spec/sheets", REPO)).toThrow(
      SourceConfigError,
    );
  });
});

describe("validateSheetsSourceDir", () => {
  it("rejects a missing directory", () => {
    expect(() =>
      validateSheetsSourceDir("/no/such/dir/anywhere", REPO),
    ).toThrow(SourceConfigError);
  });

  it("rejects a source directory inside the repository", () => {
    expect(() => validateSheetsSourceDir(REPO, REPO)).toThrow(
      SourceConfigError,
    );
  });

  it("reports all expected sheets missing in an empty directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "app-empty-src-"));
    try {
      const result = validateSheetsSourceDir(dir, REPO);
      expect(result.sheets).toHaveLength(0);
      expect(result.missing).toHaveLength(11);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports a differently-named file that slugs to a known sheet as unexpected", () => {
    const dir = mkdtempSync(join(tmpdir(), "app-extra-src-"));
    try {
      writeFileSync(join(dir, "DAILY-TRACKER.html"), "<html></html>");
      const result = validateSheetsSourceDir(dir, REPO);
      expect(result.unexpected).toContain("daily-tracker");
      expect(result.missing).toContain("DAILY TRACKER.html");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
