import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * P2-2 regression: `lib/onboarding/assignments.ts` is the guarded service —
 * `app/**` must reach it only through `assignments-boundary.ts` (the declared
 * app-facing boundary). This walks every app source file and fails on any
 * direct import of the service module (exact specifier — `-boundary` and
 * `-gate` suffixes are legal).
 */
const APP_DIR = join(import.meta.dirname, "../../app");
const SERVICE_SPECIFIER =
  /["'`](?:@\/|\.{1,2}\/)*lib\/onboarding\/assignments["'`]/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield p;
  }
}

describe("P-013 declared app boundary", () => {
  it("no app/** file imports the guarded assignment service directly", () => {
    const offenders: string[] = [];
    for (const file of walk(APP_DIR)) {
      const src = readFileSync(file, "utf8");
      if (SERVICE_SPECIFIER.test(src)) offenders.push(relative(APP_DIR, file));
    }
    expect(offenders).toEqual([]);
  });
});
