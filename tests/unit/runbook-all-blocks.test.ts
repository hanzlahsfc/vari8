import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
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

// extract a text span inside the runbook (e.g. the scratch prelude or the
// task_owned definition) — used to execute the runbook's own safeguards
function slice(from: string, to: string) {
  const i = RUNBOOK.indexOf(from);
  expect(i).toBeGreaterThan(-1);
  const j = RUNBOOK.indexOf(to, i + from.length);
  expect(j).toBeGreaterThan(-1);
  return RUNBOOK.slice(i, j);
}

const SHAS = {
  h203: "90c16bee63e2609ebc4f09e91459332390562464",
  h206: "43b63ed0f41e6e92e93ecf72065c0190c9ef3dea",
  h207: "04902f1dc3d317e0959ae533f2f4c479a8fc55f9",
  base: "d1c4081022f2ac21070b28f284248fad2ef04839",
  tree: "6fd7353e4734632c49c6d9e28427dd2c5c8a1556",
  bundle: "f457065f61753245b6853ac3ddb3236deb00c8bd",
  merge: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  tmc: "aa90aa90aa90aa90aa90aa90aa90aa90aa90aa90", // the persisted test-merge commit
  // derived heads — what `gh pr view` reports AFTER the forward-update push
  d206: "d206".repeat(10),
  d207: "d207".repeat(10),
};

function fixtures() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "rbk-"));
  const bin = path.join(dir, "bin");
  const st = path.join(dir, "state");
  const scratch = path.join(dir, "scratch");
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
  // git stub — real object semantics: rev-parse resolves trees from the
  // GIT_TREES map (unknown commits fail), cat-file -e checks GIT_OBJECTS,
  // merge-base --is-ancestor honors the GIT_ANCESTORS pair set; worktree add
  // lays down a fixture bundle layout inside the task-owned scratch
  sh(
    "git",
    `echo "git $*" >> "$FIX/state/called"
[[ -n "\${FAIL_GIT:-}" && "$*" == *"$FAIL_GIT"* ]] && exit 1
last=""; for a in "$@"; do last="$a"; done
case "$*" in
  *rev-parse*^{tree}*)
    sha="\${last%%^*}"
    for kv in \$GIT_TREES; do [[ "\${kv%%:*}" == "\$sha" ]] && { echo "\${kv##*:}"; exit 0; }; done
    exit 1;;
  *rev-parse*^1*) echo "\$GIT_P1";;
  *rev-parse*^2*) echo "\$GIT_P2";;
  *rev-parse*origin*) echo "\$GIT_BASETIP";;
  *rev-parse*':'*) echo "\$GIT_BUNDLE_TREE";;
  *rev-parse*HEAD*) echo "\$GIT_TMC";;
  *cat-file*-e*)
    for s in \$GIT_OBJECTS; do [[ "\$s" == "\$last" ]] && exit 0; done; exit 1;;
  *merge-base*--is-ancestor*)
    anc=""; prev=""; for a in "$@"; do anc="$prev"; prev="$a"; done
    for kv in \$GIT_ANCESTORS; do [[ "\$kv" == "\$anc:\$prev" ]] && exit 0; done
    exit 1;;
  *worktree*add*) mkdir -p "\$3/tools/parity/reference" "\$3/tools/parity/baseline"
    : > "\$3/tools/parity/run.mjs"; exit 0;;
  *worktree*) exit 0;;
  *) exit 0;; esac`,
  );
  // npx stub — the parity runner writes the gate receipts the runbook parses
  // (real files inside the fixture worktree, counts controllable via GATE_*)
  sh(
    "npx",
    `echo "npx $*" >> "$FIX/state/called"
[[ -n "\${FAIL_NPX:-}" && "$*" == *"$FAIL_NPX"* && -n "\${PARITY_OUT_DIR:-}" ]] && exit 1
if [[ "$*" == *run.mjs* && -n "\${PARITY_OUT_DIR:-}" ]]; then
  mkdir -p "$PARITY_OUT_DIR"
  printf '{"strict":false,"total":70,"passed":%s,"failed":0}\\n' "\${GATE_CANON:-70}" > "$PARITY_OUT_DIR/proposed-canonical.json"
  printf '{"strict":true,"total":70,"passed":%s,"failed":0}\\n' "\${GATE_STRICT:-68}" > "$PARITY_OUT_DIR/proposed-strict.json"
fi
exit 0`,
  );
  // tar stub — git archive | tar -x lays down the reviewed-tooling layout
  sh(
    "tar",
    `echo "tar $*" >> "$FIX/state/called"
[[ -n "\${FAIL_TAR:-}" && "$*" == *"$FAIL_TAR"* ]] && exit 1
c=""; prev=""; for a in "$@"; do [[ "$prev" == -C ]] && c="$a"; prev="$a"; done
[[ -n "$c" ]] && mkdir -p "$c/tools/parity/reference" "$c/tools/parity/baseline" && : > "$c/tools/parity/run.mjs"
exit 0`,
  );
  sh("flock", `echo "flock $*" >> "$FIX/state/called"; exit 0`);
  for (const b of ["psql", "createdb", "dropdb", "openssl"])
    sh(b, `echo "${b} $*" >> "$FIX/state/called"; exit 0`);
  sh(
    "npm",
    `echo "npm $*" >> "$FIX/state/called"
[[ -n "\${FAIL_NPM:-}" && "$*" == *"$FAIL_NPM"* ]] && exit 1
exit 0`,
  );
  return {
    dir,
    bin,
    st,
    scratch,
    called: () => readFileSync(path.join(st, "called"), "utf8"),
  };
}

// environment for block execution — SCRATCH is the only location the caller
// supplies; every other location/identity comes from the block or the receipt
function blockEnv(
  f: ReturnType<typeof fixtures>,
  extra: Record<string, string> = {},
) {
  return {
    PATH: `${f.bin}:${process.env.PATH}`,
    FIX: f.dir,
    SCRATCH: f.scratch,
    POSTGRES_PASSWORD: "x",
    BETTER_AUTH_SECRET: "y",
    GH_HEAD: SHAS.h203,
    GH_BASE: "Vari8-Beta",
    GH_STATE: "OPEN",
    GH_DRAFT: "true",
    GH_MERGE: SHAS.merge,
    GIT_BASETIP: SHAS.base,
    GIT_TMC: SHAS.tmc,
    GIT_BUNDLE_TREE: SHAS.bundle,
    GIT_TREES: `HEAD:${SHAS.tree} ${SHAS.tmc}:${SHAS.tree} ${SHAS.merge}:${SHAS.tree}`,
    GIT_OBJECTS: SHAS.tmc,
    GIT_ANCESTORS: `${SHAS.h203}:HEAD ${SHAS.base}:HEAD ${SHAS.h203}:${SHAS.tmc} ${SHAS.base}:${SHAS.tmc}`,
    GIT_P1: SHAS.base,
    GIT_P2: SHAS.h203,
    BUNDLE_PATH: "tools/parity",
    GATE_CANON: "70",
    GATE_STRICT: "68",
    ...extra,
  };
}

// extracted blocks execute VERBATIM — every fence carries its own
// `set -euo pipefail`; the fixture must not inject shell behavior the
// published text does not have
function runSrc(src: string, env: Record<string, string>) {
  return spawnSync("bash", ["-c", src], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function runBlock(
  f: ReturnType<typeof fixtures>,
  marker: string,
  extra: Record<string, string> = {},
) {
  const r = runSrc(block(marker, true), blockEnv(f, extra));
  return { r, called: f.called() };
}

// the runbook's own scratch prelude (SCRATCH requirement → task_owned def) —
// executed verbatim to produce an owned scratch for the merge/stage blocks
const PRELUDE = slice('SCRATCH="${SCRATCH:?', "# lock (real shared flock");
function prepScratch(
  f: ReturnType<typeof fixtures>,
  extra: Record<string, string> = {},
) {
  const r = runSrc(PRELUDE, blockEnv(f, extra));
  expect(r.status).toBe(0);
}
const canonScratch = (f: ReturnType<typeof fixtures>) =>
  path.join(realpathSync(f.dir), "scratch");

// run the literal prep block, producing a real receipt under the scratch
function runPrep(
  f: ReturnType<typeof fixtures>,
  extra: Record<string, string> = {},
) {
  return runBlock(f, "# #203 changes present", extra);
}
const receiptPath = (f: ReturnType<typeof fixtures>) =>
  path.join(canonScratch(f), "state", "p203-prep.json");
const readReceipt = (f: ReturnType<typeof fixtures>) =>
  JSON.parse(readFileSync(receiptPath(f), "utf8"));
// forge a mutated-but-internally-consistent receipt (valid digest sidecar) —
// the merge block's content checks must be what refuses it, not the digest
function forge(
  f: ReturnType<typeof fixtures>,
  mutate: (p: Record<string, unknown>) => void,
) {
  const p = receiptPath(f);
  const j = JSON.parse(readFileSync(p, "utf8"));
  mutate(j);
  writeFileSync(p, JSON.stringify(j));
  const d = createHash("sha256").update(readFileSync(p)).digest("hex");
  writeFileSync(`${p}.sha256`, `${d}  ${p}`);
}

// reset the invocation log between phases so assertions see one block's calls
function clearCalled(f: ReturnType<typeof fixtures>) {
  writeFileSync(path.join(f.st, "called"), "");
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
  it("#203 prep block runs end-to-end under lock and persists a complete receipt", () => {
    const f = fixtures();
    const { r, called } = runPrep(f);
    expect(r.status).toBe(0);
    const iF = called.indexOf("flock -x");
    const iW = called.indexOf("worktree add");
    const iM = called.indexOf("merge -q --no-ff");
    expect(iF).toBeGreaterThan(-1);
    expect(iF).toBeLessThan(iW);
    expect(iW).toBeLessThan(iM);
    expect(called.match(/merge-base --is-ancestor/g)).toHaveLength(2);
    expect(called).toContain("createdb"); // disposable-DB probe passed
    expect(called).not.toContain("gh pr merge");
    // the dirty-state probe restored run.mjs byte-identically (real cp/cmp/shasum)
    const wt = path.join(canonScratch(f), "wt");
    expect(
      readFileSync(path.join(wt, "tools/parity/run.mjs"), "utf8"),
    ).not.toContain("dirty");
    // the receipt carries every field the merge block needs — produced by the
    // block itself, none of it injected through the environment
    const prep = readReceipt(f);
    expect(prep).toEqual({
      schema: "transition-prep-v2",
      pr: 203,
      head: SHAS.h203,
      base: "Vari8-Beta",
      baseTip: SHAS.base,
      testMergeCommit: SHAS.tmc,
      mergeTree: SHAS.tree,
      toolBundle: {
        commit: SHAS.h207,
        path: "tools/parity",
        tree: SHAS.bundle,
      },
      gates: {
        runId: "p203-prep",
        canonical: { expected: 70, observed: 70 },
        strict: { expectedMin: 68, observed: 68 },
      },
    });
    expect(existsSync(`${receiptPath(f)}.sha256`)).toBe(true);
  });

  it("prep writes no receipt and refuses when the combined gate is red", () => {
    const f = fixtures();
    const { r } = runPrep(f, { GATE_CANON: "69" });
    expect(r.status).toBe(5);
    expect(r.stderr + r.stdout).toContain("gate counts below expected");
    expect(existsSync(receiptPath(f))).toBe(false);
  });

  it("omitted SCRATCH input refuses before touching anything", () => {
    const f = fixtures();
    const env = blockEnv(f);
    delete (env as Record<string, string>).SCRATCH;
    const r = runSrc(block("# #203 changes present", true), env);
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toContain("SCRATCH");
    expect(f.called()).toBe(""); // zero invocations — nothing ran, nothing touched
  });

  it("existing unowned destination refuses untouched", () => {
    const f = fixtures();
    const foreign = path.join(f.dir, "foreign");
    mkdirSync(foreign);
    writeFileSync(path.join(foreign, "keep.txt"), "do not touch");
    const { r } = runBlock(f, "# #203 changes present", { SCRATCH: foreign });
    expect(r.status).toBe(4);
    expect(r.stderr + r.stdout).toContain("foreign/unowned");
    expect(readFileSync(path.join(foreign, "keep.txt"), "utf8")).toBe(
      "do not touch",
    );
    expect(existsSync(path.join(foreign, ".task-owned"))).toBe(false);
  });

  it("foreign sentinel — a .task-owned naming another path refuses", () => {
    const f = fixtures();
    const alien = path.join(f.dir, "alien");
    mkdirSync(alien);
    writeFileSync(path.join(alien, ".task-owned"), "/tmp/somebody-else\n");
    const { r } = runBlock(f, "# #203 changes present", { SCRATCH: alien });
    expect(r.status).toBe(4);
    expect(r.stderr + r.stdout).toContain("foreign/unowned");
  });

  it("symlinked scratch destination refuses outright", () => {
    const f = fixtures();
    const real = path.join(f.dir, "real-target");
    mkdirSync(real);
    const link = path.join(f.dir, "scratch-alias");
    symlinkSync(real, link);
    const { r } = runBlock(f, "# #203 changes present", { SCRATCH: link });
    expect(r.status).toBe(4);
    expect(r.stderr + r.stdout).toContain("symlinked scratch");
  });

  it("task_owned refuses symlink aliases and foreign paths, allows owned", () => {
    const f = fixtures();
    prepScratch(f); // runbook's own prelude created the owned scratch
    const s = canonScratch(f);
    mkdirSync(path.join(s, "inside"));
    const foreign = path.join(f.dir, "elsewhere");
    mkdirSync(foreign);
    symlinkSync(foreign, path.join(s, "alias"));
    const taskOwned = slice("task_owned() {", "# lock (real shared flock");
    const check = (target: string) =>
      spawnSync("bash", [
        "-c",
        `SCRATCH="$0"\n${taskOwned}\ntask_owned "$1"`,
        s,
        target,
      ]).status;
    // owned path inside the canonical scratch is allowed
    expect(check(`${s}/inside`)).toBe(0);
    // a symlink alias inside the scratch refuses — even pointing within $FIX
    expect(check(`${s}/alias`)).toBe(1);
    // a foreign path outside the scratch refuses
    expect(check(foreign)).toBe(1);
    // and after the sentinel is removed even the owned path refuses
    const sentinel = path.join(s, ".task-owned");
    const saved = readFileSync(sentinel, "utf8");
    writeFileSync(sentinel, "x");
    expect(check(`${s}/inside`)).toBe(1);
    writeFileSync(sentinel, saved);
  });

  it("merge block runs the real receipt flow: reload → live revalidation → fresh gates → merge", () => {
    const f = fixtures();
    expect(runPrep(f).r.status).toBe(0);
    clearCalled(f);
    // NO HEADSHA/BASETIP/MERGETREE in the environment — the merge block must
    // take every identity from the validated receipt
    const { r, called } = runBlock(f, "REACQUIRE");
    expect(r.status).toBe(0);
    expect(called).toContain("gh pr merge 203");
    expect(called).toContain("gh pr ready 203");
    expect(called.indexOf("flock -x")).toBeGreaterThan(-1);
    expect(called.indexOf("flock -x")).toBeLessThan(
      called.indexOf("gh pr merge 203"),
    );
    // fresh gates re-ran before the merge: own worktree + ancestor checks for
    // both the recorded-commit binding and the fresh test merge
    expect(called.match(/worktree add/g)).toHaveLength(1);
    expect(called.match(/merge-base --is-ancestor/g)).toHaveLength(4);
  });

  const MERGE_NEGATIVES: Array<{
    name: string;
    act?: (f: ReturnType<typeof fixtures>) => void;
    env?: Record<string, string>;
    want?: RegExp;
    beforeGates?: boolean;
  }> = [
    {
      name: "missing receipt file",
      act: (f) => {
        const p = receiptPath(f);
        spawnSync("rm", [p]);
      },
      want: /missing prep receipt/,
    },
    {
      name: "missing integrity sidecar",
      act: (f) => spawnSync("rm", [`${receiptPath(f)}.sha256`]),
      want: /missing prep receipt/,
    },
    {
      name: "tampered receipt (stale digest) — integrity refusal",
      act: (f) => {
        const p = receiptPath(f);
        const j = JSON.parse(readFileSync(p, "utf8")) as Record<string, string>;
        j.head = "0".repeat(40);
        writeFileSync(p, JSON.stringify(j)); // sidecar left stale — digest must catch it
      },
      want: /digest mismatch/,
    },
    {
      name: "forged head — live revalidation refuses",
      act: (f) =>
        forge(
          f,
          (j) => void ((j as Record<string, string>).head = "0".repeat(40)),
        ),
      want: /head moved/,
    },
    {
      name: "forged baseTip — stale receipt refuses",
      act: (f) =>
        forge(
          f,
          (j) => void ((j as Record<string, string>).baseTip = "0".repeat(40)),
        ),
      want: /base moved/,
    },
    {
      name: "forged mergeTree — recorded commit/tree binding disproves it",
      act: (f) =>
        forge(
          f,
          (j) =>
            void ((j as Record<string, string>).mergeTree = "f".repeat(40)),
        ),
      want: /commit\/tree mismatch/,
    },
    {
      name: "extra field refuses",
      act: (f) =>
        forge(f, (j) => void ((j as Record<string, unknown>).injected = true)),
      want: /invalid prep receipt/,
    },
    {
      name: "missing gate evidence refuses",
      act: (f) =>
        forge(f, (j) => void delete (j as Record<string, unknown>).gates),
      want: /invalid prep receipt/,
    },
    {
      name: "failed gate evidence refuses",
      act: (f) =>
        forge(f, (j) => {
          (j.gates as { canonical: { observed: number } }).canonical.observed =
            0;
        }),
      want: /invalid prep receipt/,
    },
    {
      name: "recorded test-merge commit missing from the object store",
      act: (f) =>
        forge(f, (j) => {
          (j as Record<string, string>).testMergeCommit = "b".repeat(40);
        }),
      want: /test-merge commit.*missing/,
    },
    {
      name: "recorded commit resolves to a different tree (wrong commit/tree pair)",
      act: (f) =>
        forge(f, (j) => {
          (j as Record<string, string>).testMergeCommit = "c".repeat(40);
        }),
      env: {
        GIT_OBJECTS: `${SHAS.tmc} ${"c".repeat(40)}`,
        GIT_ANCESTORS: `${SHAS.h203}:HEAD ${SHAS.base}:HEAD ${SHAS.h203}:${"c".repeat(40)} ${SHAS.base}:${"c".repeat(40)}`,
        GIT_TREES: `HEAD:${SHAS.tree} ${SHAS.tmc}:${SHAS.tree} ${SHAS.merge}:${SHAS.tree} ${"c".repeat(40)}:${"f".repeat(40)}`,
      },
      want: /commit\/tree mismatch/,
    },
    {
      name: "unrelated commit — approved head/base are not its ancestors",
      act: (f) =>
        forge(f, (j) => {
          (j as Record<string, string>).testMergeCommit = "d".repeat(40);
        }),
      env: {
        GIT_OBJECTS: `${SHAS.tmc} ${"d".repeat(40)}`,
        // d… exists and its tree matches, but no ancestor pairs are recorded
        GIT_TREES: `HEAD:${SHAS.tree} ${SHAS.tmc}:${SHAS.tree} ${SHAS.merge}:${SHAS.tree} ${"d".repeat(40)}:${SHAS.tree}`,
      },
      want: /not an ancestor/,
    },
    {
      name: "forged bundle tree (recomputed digest) — refuses before gates or merge",
      act: (f) =>
        forge(f, (j) => {
          (j.toolBundle as { tree: string }).tree = "d".repeat(40);
        }),
      want: /authorized manifest/,
      beforeGates: true,
    },
    {
      name: "moved base — live revalidation refuses the untampered receipt",
      env: { GIT_BASETIP: "9".repeat(40) },
      want: /base moved/,
    },
  ];

  for (const c of MERGE_NEGATIVES) {
    it(`merge refuses: ${c.name}`, () => {
      const f = fixtures();
      expect(runPrep(f).r.status).toBe(0);
      c.act?.(f);
      clearCalled(f);
      const { r, called } = runBlock(f, "REACQUIRE", c.env ?? {});
      expect(r.status).not.toBe(0);
      if (c.want) expect(r.stderr + r.stdout).toMatch(c.want);
      expect(called).not.toContain("gh pr merge");
      if (c.beforeGates) expect(called).not.toContain("npm ci");
    });
  }

  // the published fences carry set -euo pipefail — the fixture injects nothing;
  // failures in fast gates, the combined capture and piped commands must die
  // before receipt issuance (prep) or the merge command (merge block)
  const PROPAGATION: Array<{
    name: string;
    env: Record<string, string>;
    target: "prep" | "merge";
  }> = [
    {
      name: "fast gate (npm run test) — prep",
      env: { FAIL_NPM: "run test" },
      target: "prep",
    },
    {
      name: "combined capture (npx run.mjs) — prep",
      env: { FAIL_NPX: "run.mjs" },
      target: "prep",
    },
    {
      name: "piped command (git archive | tar) — prep",
      env: { FAIL_TAR: "-x" },
      target: "prep",
    },
    {
      name: "fast gate (npm run test) — merge",
      env: { FAIL_NPM: "run test" },
      target: "merge",
    },
    {
      name: "combined capture (npx run.mjs) — merge",
      env: { FAIL_NPX: "run.mjs" },
      target: "merge",
    },
    {
      name: "piped command (git archive | tar) — merge",
      env: { FAIL_TAR: "-x" },
      target: "merge",
    },
  ];

  for (const p of PROPAGATION) {
    it(`published set -euo pipefail propagates: ${p.name}`, () => {
      const f = fixtures();
      if (p.target === "prep") {
        const { r, called } = runPrep(f, p.env);
        expect(r.status).not.toBe(0);
        expect(existsSync(receiptPath(f))).toBe(false); // died before issuance
        expect(called).not.toContain("gh pr merge");
      } else {
        expect(runPrep(f).r.status).toBe(0);
        clearCalled(f);
        const { r, called } = runBlock(f, "REACQUIRE", p.env);
        expect(r.status).not.toBe(0);
        expect(called).not.toContain("gh pr merge");
      }
    });
  }

  // regression for the incident where a fixture-less run wrote into the real
  // /tmp/p452-wt — the safeguards now live in the published runbook text itself
  it("sentinel: the refusal path never reaches cleanup or mutation", () => {
    const f = fixtures();
    // foreign scratch with a live file inside — refusal must not even create
    // the sentinel, let alone remove anything
    const foreign = path.join(f.dir, "preexisting");
    mkdirSync(foreign);
    writeFileSync(path.join(foreign, "victim"), "x");
    for (const marker of [
      "# #203 changes present",
      "REACQUIRE",
      "gh pr edit 206",
    ]) {
      const { r, called } = runBlock(f, marker, { SCRATCH: foreign });
      expect(r.status).toBe(4);
      expect(called).not.toContain("rm -rf");
    }
    expect(readFileSync(path.join(foreign, "victim"), "utf8")).toBe("x");
  });

  for (const s of STAGES) {
    it(`#${s.n} block reaches the changed-head checkpoint — retarget + forward update, no merge`, () => {
      const f = fixtures();
      prepScratch(f);
      const { r, called } = runBlock(f, s.marker, {
        GH_STATE: "MERGED",
        GH_HEAD: s.derived,
      });
      expect(r.status).toBe(0);
      // prerequisite check ran live under the fresh lock, then the retarget
      expect(called).toContain(`gh pr view ${s.prev}`);
      expect(called.indexOf("flock -x")).toBeGreaterThan(-1);
      expect(called.indexOf("flock -x")).toBeLessThan(
        called.indexOf(`gh pr edit ${s.n}`),
      );
      expect(called).toContain(
        `gh pr edit ${s.n} -R hanzlahsfc/vari8 -B Vari8-Beta`,
      );
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
      const f = fixtures();
      prepScratch(f);
      const { r, called } = runBlock(f, s.marker, { GH_STATE: "OPEN" });
      expect(r.status).toBe(4);
      expect(r.stdout).toContain(`#${s.prev} not merged`);
      expect(called).toContain("flock -x");
      expect(called).not.toContain("gh pr edit");
      expect(called).not.toContain("git push");
      expect(called).not.toContain("gh pr merge");
    });
  }
});
