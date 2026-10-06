import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * P-014 regression: `lib/coaching/parameters.ts` and
 * `lib/coaching/templates.ts` are the guarded services — `app/**` must reach
 * them only through the declared `-boundary` modules. Walks every app source
 * file and fails on a direct service import (exact specifier — `-boundary`
 * and `gate` suffixes are legal).
 */
const APP_DIR = join(import.meta.dirname, "../../app");
const SERVICE_SPECIFIERS = [
  /["'`](?:@\/|\.{1,2}\/)*lib\/coaching\/parameters["'`]/,
  /["'`](?:@\/|\.{1,2}\/)*lib\/coaching\/templates["'`]/,
];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield p;
  }
}

describe("P-014 declared app boundary", () => {
  it("no app/** file imports the guarded coaching services directly", () => {
    const offenders: string[] = [];
    for (const file of walk(APP_DIR)) {
      const src = readFileSync(file, "utf8");
      if (SERVICE_SPECIFIERS.some((re) => re.test(src)))
        offenders.push(relative(APP_DIR, file));
    }
    expect(offenders).toEqual([]);
  });
});
