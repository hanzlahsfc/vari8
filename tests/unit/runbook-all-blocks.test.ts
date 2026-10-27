import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
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
  // derived heads — what `gh pr view` reports AFTER the forward-update push
  d206: "d206".repeat(10),
  d207: "d207".repeat(10),
};

// receipt in the schema the runbook's jq -n writes: base is the base-tip sha
function receipt(base: string) {
  return {
    schema: "transition-prep-v1",
    pr: 203,
    head: SHAS.h203,
    base,
    mergeCommit: SHAS.h203,
    mergeTree: SHAS.tree,
    toolBundle: SHAS.bundle,
    gates: { canonical: "70", strict: "68" },
  };
}

function fixtures() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "rbk-"));
  const bin = path.join(dir, "bin");
  const st = path.join(dir, "state");
  mkdirSync(bin, { recursive: true });
  mkdirSync(st);
  writeFileSync(path.join(st, "called"), "");
  const sh = (n: string, b: string) => {
    writeFileSync(path.join(bin, n), `#!/usr/bin/env bash\n${b}`);
    chmodSync(path.join(bin, n), 0o755);
  };
  // gh stub — honors the --jq selectors the runbook actually uses so receipt
  // checks see a real MERGED/OPEN world, not just "a command ran"
  sh(
    "gh",
    `echo "gh $*" >> "$FIX/state/called"
if [[ "$2" == view ]]; then
  if [[ "$*" == *'state=="MERGED"'* ]]; then
    [[ "$GH_STATE" == MERGED ]] && printf '%s' "$GH_MERGE"; exit 0
  fi
  if [[ "$*" == *'.mergeCommit.oid'* ]]; then printf '%s' "$GH_MERGE"; exit 0; fi
  if [[ "$*" == *'.headRefOid'* ]]; then printf '%s' "$GH_HEAD"; exit 0; fi
  printf '{"headRefOid":"%s","baseRefName":"%s","state":"%s","isDraft":%s,"mergeCommit":{"oid":"%s"}}' "$GH_HEAD" "$GH_BASE" "$GH_STATE" "$GH_DRAFT" "$GH_MERGE"; exit 0; fi
if [[ "$1" == pr && "$2" == merge ]]; then echo "gh pr merge" >> "$FIX/state/called"; exit 0; fi
if [[ "$1" == pr && "$2" == ready ]]; then exit 0; fi
if [[ "$1" == pr && "$2" == edit ]]; then echo "gh pr edit $*" >> "$FIX/state/called"; exit 0; fi
exit 0`,
  );
  sh(
    "git",
    `echo "git $*" >> "$FIX/state/called"
case "$*" in
  *rev-parse*'HEAD^{tree}'*) echo "$GIT_TREE";;
  *rev-parse*'HEAD^1'*) echo "$GIT_BASETIP";;
  *rev-parse*'HEAD^2'*) echo "$GH_HEAD";;
  *rev-parse*'^1'*) echo "$GIT_P1";;
  *rev-parse*'^2'*) echo "$GIT_P2";;
  *rev-parse*'^{tree}'*) echo "$GIT_TREE";;
  *rev-parse*"origin"*) echo "$GIT_BASETIP";;
  *rev-parse*HEAD) echo "$GH_HEAD";;
  *worktree*add*) mkdir -p "$3/$BUNDLE_PATH/reference" "$3/$BUNDLE_PATH/baseline"
    : > "$3/$BUNDLE_PATH/run.mjs"; exit 0;;
  *worktree*) exit 0;;
  *) exit 0;; esac`,
  );
  sh("flock", `echo "flock $*" >> "$FIX/state/called"; exit 0`);
  for (const b of [
    "psql",
    "createdb",
    "dropdb",
    "npm",
    "npx",
    "openssl",
    "shasum",
    "cmp",
    "cp",
    "mv",
    "rm",
    "tar",
  ])
    sh(b, `echo "${b} $*" >> "$FIX/state/called"; exit 0`);
  return {
    dir,
    bin,
    st,
    called: () => readFileSync(path.join(st, "called"), "utf8"),
  };
}

// fixture safety preamble — prepended to EVERY executed block. Refuses unless
// the caller supplies task-owned scratch paths: WT must be a non-existent path
// under the fixture root, STATE under the fixture root, DB/FIX set. Omitted or
// unsafe inputs stop here — before any block command can touch operator paths.
const GUARD = `set -euo pipefail
for v in WT STATE DB FIX; do [[ -n "\${!v:-}" ]] || { echo "fixture-guard: $v unset — refusing"; exit 5; }; done
[[ "$WT" == "$FIX"/* && ! -e "$WT" ]] || { echo "fixture-guard: unsafe WT=$WT — refusing"; exit 5; }
[[ "$STATE" == "$FIX"/* ]] || { echo "fixture-guard: unsafe STATE=$STATE — refusing"; exit 5; }
`;

function guardedEnv(
  f: ReturnType<typeof fixtures>,
  extra: Record<string, string> = {},
) {
  return {
    PATH: `${f.bin}:${process.env.PATH}`,
    FIX: f.dir,
    WT: path.join(f.dir, "wt"),
    STATE: f.st,
    DB: "app_x",
    ...extra,
  };
}

function runBlock(
  marker: string,
  extra: Record<string, string> = {},
  inside = false,
) {
  const f = fixtures();
  const vars = {
    REPO: "fx/fx",
    HEADSHA: SHAS.h203,
    HEAD: SHAS.h203,
    BASE: "Vari8-Beta",
    WT: path.join(f.dir, "wt"),
    STATE: f.st,
    DB: "app_x",
    PR: "203",
    BUNDLE_PATH: "tools/parity",
    BUNDLE_TREE: SHAS.bundle,
    BUNDLE_COMMIT: SHAS.h207,
    CANON_N: "70",
    STRICT_N: "68",
    MERGETREE: SHAS.tree,
    BASETIP: SHAS.base,
    MERGE_SHA: SHAS.merge,
    POSTGRES_PASSWORD: "x",
    BETTER_AUTH_SECRET: "y",
    NODE: "node",
    PATH: `${f.bin}:${process.env.PATH}`,
    FIX: f.dir,
    GH_HEAD: SHAS.h203,
    GH_BASE: "Vari8-Beta",
    GH_STATE: "OPEN",
    GH_DRAFT: "true",
    GH_MERGE: SHAS.merge,
    GIT_BASETIP: SHAS.base,
    GIT_TREE: SHAS.tree,
    GIT_P1: SHAS.base,
    GIT_P2: SHAS.h203,
    ...extra,
  };
  const src = `${GUARD}${block(marker, inside)}`;
  const r = spawnSync("bash", ["-c", src], {
    env: { ...process.env, ...vars },
    encoding: "utf8",
  });
  return { r, st: f.st, wt: vars.WT, called: f.called() };
}

// stacked stages — each retargets onto Vari8-Beta after its prerequisite merges
const STAGES = [
  {
    n: 206,
    prev: 203,
    marker: "gh pr edit 206",
    branch: "beta/visual-reference-establishment",
    derived: SHAS.d206,
  },
  {
    n: 207,
    prev: 206,
    marker: "gh pr edit 207",
    branch: "beta/p203-p206-combined-verification",
    derived: SHAS.d207,
  },
] as const;

// stub-process spawns make the literal blocks take a few seconds
const T = 30_000;

describe(`runbook blocks ${RBHASH}`, { timeout: T }, () => {
  it("#203 prep block runs to completion under lock — test merge, ancestors, receipt persisted", () => {
    const { r, st, wt, called } = runBlock("# #203 changes present", {}, true);
    expect(r.status).toBe(0);
    const iF = called.indexOf("flock -x");
    const iW = called.indexOf("worktree add");
    const iM = called.indexOf("merge -q --no-ff");
    expect(iF).toBeGreaterThan(-1);
    expect(iF).toBeLessThan(iW);
    expect(iW).toBeLessThan(iM);
    expect(called).toContain(`worktree add ${wt} --detach ${SHAS.h203}`);
    expect(called).toContain(
      "merge -q --no-ff --no-edit -m test merge transition p203",
    );
    expect(called.match(/merge-base --is-ancestor/g)).toHaveLength(2);
    expect(called).toContain("createdb"); // disposable-DB probe passed
    expect(called).not.toContain("gh pr merge");
    // the dirty-state probe wrote into the fixture worktree, not a real one
    expect(
      readFileSync(path.join(wt, "tools/parity/run.mjs"), "utf8"),
    ).toContain("dirty");
    // strict-validated receipt persisted under the fixture state dir
    const prep = JSON.parse(
      readFileSync(path.join(st, "p203-prep.json"), "utf8"),
    );
    expect(prep.head).toBe(SHAS.h203);
    expect(prep.base).toBe(SHAS.base);
    expect(prep.mergeTree).toBe(SHAS.tree);
  });

  it("merge block refuses when receipts are missing", () => {
    const f = fixtures();
    const src = GUARD + block("REACQUIRE", true);
    const r = spawnSync("bash", ["-c", src], {
      env: { ...process.env, ...guardedEnv(f, { REPO: "x" }) },
      encoding: "utf8",
    });
    expect(r.status).not.toBe(0);
    expect(f.called()).not.toContain("gh pr merge");
  });

  it("merge block refuses a stale receipt base", () => {
    const f = fixtures();
    writeFileSync(
      path.join(f.st, "p203-prep.json"),
      JSON.stringify(receipt("0".repeat(40))),
    );
    const src = GUARD + block("REACQUIRE", true);
    const r = spawnSync("bash", ["-c", src], {
      env: {
        ...process.env,
        ...guardedEnv(f, {
          REPO: "x",
          GH_HEAD: SHAS.h203,
          GH_BASE: "Vari8-Beta",
          GH_STATE: "OPEN",
          GH_DRAFT: "true",
          GH_MERGE: SHAS.merge,
          GIT_BASETIP: SHAS.base,
          GIT_TREE: SHAS.tree,
          HEADSHA: SHAS.h203,
        }),
      },
      encoding: "utf8",
    });
    expect(r.status).not.toBe(0);
    expect(f.called()).not.toContain("gh pr merge");
  });

  it("merge checkpoint holds the lock before merging and verifies parents/tree", () => {
    const f = fixtures();
    writeFileSync(
      path.join(f.st, "p203-prep.json"),
      JSON.stringify(receipt(SHAS.base)),
    );
    const src = GUARD + block("REACQUIRE", true);
    const r = spawnSync("bash", ["-c", src], {
      env: {
        ...process.env,
        ...guardedEnv(f, {
          REPO: "x",
          HEADSHA: SHAS.h203,
          HEAD: SHAS.h203,
          BASE: "Vari8-Beta",
          BASETIP: SHAS.base,
          MERGETREE: SHAS.tree,
          GH_HEAD: SHAS.h203,
          GH_BASE: "Vari8-Beta",
          GH_STATE: "OPEN",
          GH_DRAFT: "true",
          GH_MERGE: SHAS.merge,
          GIT_BASETIP: SHAS.base,
          GIT_TREE: SHAS.tree,
          GIT_P1: SHAS.base,
          GIT_P2: SHAS.h203,
          BUNDLE_PATH: "tools/parity",
        }),
      },
      encoding: "utf8",
    });
    const called = f.called();
    expect(r.status).toBe(0);
    expect(called).toContain("gh pr ready 203");
    expect(called).toContain("gh pr merge 203");
    // lock ownership: the exclusive flock precedes every merge action
    expect(called.indexOf("flock -x")).toBeGreaterThan(-1);
    expect(called.indexOf("flock -x")).toBeLessThan(
      called.indexOf("gh pr merge 203"),
    );
  });

  for (const s of STAGES) {
    it(`#${s.n} block reaches the changed-head checkpoint — retarget + forward update, no merge`, () => {
      const { r, called } = runBlock(
        s.marker,
        { GH_STATE: "MERGED", GH_HEAD: s.derived },
        true,
      );
      expect(r.status).toBe(0);
      // prerequisite check ran live under the fresh lock, then the retarget
      expect(called).toContain(`gh pr view ${s.prev}`);
      expect(called.indexOf("flock -x")).toBeGreaterThan(-1);
      expect(called.indexOf("flock -x")).toBeLessThan(
        called.indexOf(`gh pr edit ${s.n}`),
      );
      expect(called).toContain(`gh pr edit ${s.n} -R fx/fx -B Vari8-Beta`);
      // forward update of the PR branch — merge base in, no force-push
      expect(called).toContain("git pull --ff-only");
      expect(called).toContain("git merge --no-edit origin/Vari8-Beta");
      expect(called).toContain(`git push origin ${s.branch}`);
      expect(called).not.toMatch(/git push[^\n]*(-f |--force)/);
      // derived head re-read live and stopped for review — not pre-authorized
      expect(called).toContain(`gh pr view ${s.n}`);
      expect(r.stdout).toContain(`changed head ${s.derived}`);
      expect(r.stdout).toContain("review/revalidation REQUIRED");
      expect(called).not.toContain("gh pr merge");
    });

    it(`#${s.n} block stops when #${s.prev} is not merged — no retarget, no push, no merge`, () => {
      const { r, called } = runBlock(s.marker, { GH_STATE: "OPEN" }, true);
      expect(r.status).toBe(4);
      expect(r.stdout).toContain(`#${s.prev} not merged`);
      expect(called).toContain("flock -x");
      expect(called).not.toContain("gh pr edit");
      expect(called).not.toContain("git push");
      expect(called).not.toContain("gh pr merge");
    });
  }

  // regression for the incident where a fixture-less run wrote into the real
  // /tmp/p452-wt — omitted or unsafe scratch inputs must die at the guard,
  // before any block command runs (RECEIPTS-p203-prep.md P467/P468 records it)
  it("sentinel: omitted scratch paths refuse before touching operator defaults", () => {
    const f = fixtures();
    // WT/STATE/DB deliberately absent — the block's ${VAR:-/tmp/p452-*} defaults
    // would point at operator paths; the guard must fire first.
    const src = GUARD + block("# #203 changes present", true);
    const r = spawnSync("bash", ["-c", src], {
      env: { ...process.env, PATH: `${f.bin}:${process.env.PATH}`, FIX: f.dir },
      encoding: "utf8",
    });
    expect(r.status).toBe(5);
    expect(r.stderr + r.stdout).toContain("fixture-guard");
    expect(f.called()).toBe(""); // zero invocations — nothing ran, nothing touched
  });

  it("sentinel: foreign or pre-existing WT destinations refuse before mutation", () => {
    const f = fixtures();
    const probe = 'echo ran >> "$FIX/state/called"';
    // real operator path, an existing dir inside the fixture, and a foreign path —
    // all must refuse identically, on any host
    for (const WT of ["/tmp/p452-wt", f.st, "/tmp"]) {
      const r = spawnSync("bash", ["-c", GUARD + probe], {
        env: {
          ...process.env,
          PATH: `${f.bin}:${process.env.PATH}`,
          FIX: f.dir,
          WT,
          STATE: f.st,
          DB: "x",
        },
        encoding: "utf8",
      });
      expect(r.status).toBe(5);
      expect(r.stderr + r.stdout).toContain("fixture-guard");
    }
    expect(f.called()).toBe("");
  });
});
