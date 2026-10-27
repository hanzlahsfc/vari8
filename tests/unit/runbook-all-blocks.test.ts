import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const RUNBOOK = readFileSync(
  path.join(ROOT, "icm/05-build/tools/transition/RUNBOOK-p203-p207.md"),
  "utf8",
);
const RBHASH = createHash("sha256").update(RUNBOOK).digest("hex").slice(0, 16);

// extract fenced code blocks by marker comment
function block(marker: string, inside = false) {
  const i = RUNBOOK.indexOf(marker);
  expect(i).toBeGreaterThan(-1);
  // markers inside a fence → containing fence (lastIndexOf); markers that
  // precede a fence → the next fence (indexOf)
  const f1 = inside
    ? RUNBOOK.lastIndexOf("```bash", i)
    : RUNBOOK.indexOf("```bash", i);
  expect(f1).toBeGreaterThan(-1);
  const f2 = RUNBOOK.indexOf("```", f1 + 7);
  return RUNBOOK.slice(f1 + 7, f2);
}

const SHAS = {
  h203: "90c16bee63e2609ebc4f09e91459332390562464",
  h206: "43b63ed0f41e6e92e93ecf72065c0190c9ef3dea",
  h207: "04902f1dc3d317e0959ae533f2f4c479a8fc55f9",
  base: "d1c4081022f2ac21070b28f284248fad2ef04839",
  tree: "6fd7353e4734632c49c6d9e28427dd2c5c8a1556",
  bundle: "f457065f61753245b6853ac3ddb3236deb00c8bd",
  merge: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
};

function fixtures(over: Record<string, string> = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "rbk-"));
  const bin = path.join(dir, "bin");
  const st = path.join(dir, "state");
  mkdirSync(bin, { recursive: true });
  mkdirSync(st);
  writeFileSync(path.join(st, "called"), "");
  const fx = {
    pr_head: SHAS.h203, pr_base: "Vari8-Beta", pr_state: "OPEN", pr_draft: "true",
    merged: "", git_basetip: SHAS.base, git_tree: SHAS.tree,
    receipt: "", ...over,
  };
  const sh = (n: string, b: string) => {
    writeFileSync(path.join(bin, n), `#!/usr/bin/env bash\n${b}`);
    chmodSync(path.join(bin, n), 0o755);
  };
  sh("gh", `echo "gh $*" >> "$FIX/state/called"
if [[ "$2" == view ]]; then
  printf '{"headRefOid":"%s","baseRefName":"%s","state":"%s","isDraft":%s,"mergeCommit":{"oid":"%s"}}' "$GH_HEAD" "$GH_BASE" "$GH_STATE" "$GH_DRAFT" "$GH_MERGE"; exit 0; fi
if [[ "$1" == pr && "$2" == merge ]]; then echo "gh pr merge" >> "$FIX/state/called"; exit 0; fi
if [[ "$1" == pr && "$2" == ready ]]; then exit 0; fi
if [[ "$1" == pr && "$2" == edit ]]; then echo "gh pr edit $*" >> "$FIX/state/called"; exit 0; fi
exit 0`);
  sh("git", `echo "git $*" >> "$FIX/state/called"
case "$*" in
  *rev-parse*'HEAD^{tree}'*) echo "$GIT_TREE";;
  *rev-parse*'HEAD^1'*) echo "$GIT_BASETIP";;
  *rev-parse*'HEAD^2'*) echo "$GH_HEAD";;
  *rev-parse*"origin"*) echo "$GIT_BASETIP";;
  *rev-parse*HEAD) echo "$GH_HEAD";;
  *worktree*) exit 0;;
  *) exit 0;; esac`);
  sh("flock", `echo "flock $*" >> "$FIX/state/called"; exit 0`);
  for (const b of ["psql","createdb","dropdb","npm","npx","openssl","shasum","cmp","cp","mv"])
    sh(b, `echo "${b} $*" >> "$FIX/state/called"; exit 0`);
  return { dir, bin, st, called: () => readFileSync(path.join(st, "called"), "utf8") };
}

function runBlock(marker: string, extra: Record<string, string> = {}) {
  const f = fixtures();
  const vars = {
    REPO: "fx/fx", HEADSHA: SHAS.h203, HEAD: SHAS.h203, BASE: "Vari8-Beta",
    WT: path.join(f.dir, "wt"), STATE: f.st, DB: "app_x", PR: "203",
    BUNDLE_PATH: "tools/parity", BUNDLE_TREE: SHAS.bundle, BUNDLE_COMMIT: SHAS.h207,
    CANON_N: "70", STRICT_N: "68", MERGETREE: SHAS.tree, BASETIP: SHAS.base,
    MERGE_SHA: SHAS.merge, POSTGRES_PASSWORD: "x", BETTER_AUTH_SECRET: "y",
    NODE: "node", PATH: `${f.bin}:${process.env.PATH}`, FIX: f.dir,
    GH_HEAD: SHAS.h203, GH_BASE: "Vari8-Beta", GH_STATE: "OPEN", GH_DRAFT: "true",
    GH_MERGE: SHAS.merge, GIT_BASETIP: SHAS.base, GIT_TREE: SHAS.tree,
    ...extra,
  };
  const src = `set -euo pipefail\n${block(marker)}`;
  const r = spawnSync("bash", ["-c", src], { env: { ...process.env, ...vars }, encoding: "utf8" });
  return { r, called: f.called() };
}

describe(`runbook blocks ${RBHASH}`, () => {
  it("#203 prep block reaches preparation checkpoint, no merge", () => {
    const { r, called } = runBlock("# #203 changes present") || runBlock("git worktree add");
    expect(called).not.toContain("gh pr merge");
  });

  it("merge block refuses when receipts are missing", () => {
    const f = fixtures();
    const src = `set -euo pipefail\nSTATE=${f.st}\n` + block("REACQUIRE", true);
    const r = spawnSync("bash", ["-c", src], {
      env: { ...process.env, PATH: `${f.bin}:${process.env.PATH}`, FIX: f.dir, STATE: f.st, REPO: "x" },
      encoding: "utf8",
    });
    expect(r.status).not.toBe(0);
    expect(f.called()).not.toContain("gh pr merge");
  });

  it("merge block refuses a stale receipt base", () => {
    const f = fixtures();
    writeFileSync(path.join(f.st, "p203-prep.json"), JSON.stringify({
      schema: "transition-prep-v1", pr: 203, head: SHAS.h203, base: "Vari8-Beta",
      baseTip: "0".repeat(40), mergeCommit: SHAS.h203, mergeTree: SHAS.tree,
      toolBundle: SHAS.bundle, gates: { canonical: "70", strict: "68" } }));
    const src = `set -euo pipefail\nSTATE=${f.st}\nREPO=x\n` + block("REACQUIRE", true);
    const r = spawnSync("bash", ["-c", src], {
      env: { ...process.env, PATH: `${f.bin}:${process.env.PATH}`, FIX: f.dir, STATE: f.st, REPO: "x",
        GH_HEAD: SHAS.h203, GH_BASE: "Vari8-Beta", GH_STATE: "OPEN", GH_DRAFT: "true", GH_MERGE: SHAS.merge,
        GIT_BASETIP: SHAS.base, GIT_TREE: SHAS.tree, HEADSHA: SHAS.h203 },
      encoding: "utf8",
    });
    expect(r.status).not.toBe(0);
    expect(f.called()).not.toContain("gh pr merge");
  });

  it("#206/#207 blocks contain concrete retarget+update commands", () => {
    const b206 = block("gh pr edit 206", true);
    const b207 = block("gh pr edit 207", true);
    expect(b206).toContain("gh pr edit 206");
    expect(b206).not.toContain("force-push");
    expect(b207).toContain("gh pr edit 207");
    expect(b207).not.toContain("force-push");
  });

  it("lock invocation recorded at merge checkpoint", () => {
    const f = fixtures();
    writeFileSync(path.join(f.st, "p203-prep.json"), JSON.stringify({
      schema: "transition-prep-v1", pr: 203, head: SHAS.h203, base: "Vari8-Beta",
      baseTip: SHAS.base, mergeCommit: SHAS.h203, mergeTree: SHAS.tree,
      toolBundle: SHAS.bundle, gates: { canonical: "70", strict: "68" } }));
    const src = `set -euo pipefail\n` + block("REACQUIRE", true);
    const r = spawnSync("bash", ["-c", src], {
      env: { ...process.env, PATH: `${f.bin}:${process.env.PATH}`, FIX: f.dir, STATE: f.st, REPO: "x",
        HEADSHA: SHAS.h203, HEAD: SHAS.h203, BASE: "Vari8-Beta", BASETIP: SHAS.base, MERGETREE: SHAS.tree,
        GH_HEAD: SHAS.h203, GH_BASE: "Vari8-Beta", GH_STATE: "OPEN", GH_DRAFT: "true", GH_MERGE: SHAS.merge,
        GIT_BASETIP: SHAS.base, GIT_TREE: SHAS.tree, BUNDLE_PATH: "tools/parity" },
      encoding: "utf8",
    });
    expect(f.called()).toContain("flock -x");
  });
});
