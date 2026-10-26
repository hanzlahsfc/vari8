import { validateTransitionManifest } from "../../icm/05-build/tools/transition-manifest.mjs";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, "icm/05-build/tools/integrate-transition.sh");
const SHA = {
  p203: "90c16bee63e2609ebc4f09e91459332390562464",
  p206: "43b63ed0f41e6e92e93ecf72065c0190c9ef3dea",
  p207: "04902f1dc3d317e0959ae533f2f4c479a8fc55f9",
  base: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  tree: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
};

// Fixture bins: gh (API+PR views), git (scripted commands), docker, npm/npx
// gate, openssl, flock. node/jq are real.
function fixtures(over: Record<string, string> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "tfix-"));
  const bin = path.join(dir, "bin");
  const state = path.join(dir, "state");
  mkdirSync(bin, { recursive: true });
  mkdirSync(state);
  const fx: Record<string, string> = {
    gh_head: SHA.p203,
    gh_base: "Vari8-Beta",
    gh_state: "OPEN",
    gh_draft: "true",
    gh_comments: "",
    gh_comments_auth: "90c16bee63e2609ebc4f09e91459332390562464",
    gh_auth_login: "hanzlahsfc",
    git_tree: SHA.tree,
    git_basetip: SHA.base,
    git_diff_files: "app/page.tsx\n",
    db_existing: "",
    gate_fail: "",
    docker_running: "true",
    merge_parents: `${SHA.base} ${SHA.p203}`,
    merge_sha: "cccccccccccccccccccccccccccccccccccccccc",
    ...over,
  };
  const defaults: Record<number, { h: string; b: string }> = {
    203: { h: SHA.p203, b: "Vari8-Beta" },
    206: { h: SHA.p206, b: "beta/parity-https" },
    207: { h: SHA.p207, b: "beta/visual-reference-establishment" },
  };
  for (const [pr, d] of Object.entries(defaults)) {
    writeFileSync(
      path.join(state, `gh-pr-${pr}.json`),
      JSON.stringify({
        headRefOid: pr === "203" ? fx.gh_head : (over[`gh_head_${pr}`] ?? d.h),
        baseRefName: pr === "203" ? fx.gh_base : (over[`gh_base_${pr}`] ?? d.b),
        state: fx.gh_state,
        isDraft: fx.gh_draft === "true",
        comments: fx.gh_comments ? [{ body: fx.gh_comments }] : [],
        mergeCommit: { oid: fx.merge_sha },
      }),
    );
  }
  writeFileSync(path.join(state, "diff-files"), fx.git_diff_files);
  writeFileSync(path.join(state, "dbs"), fx.db_existing);
  for (const [id, body] of Object.entries({
    "6417192584": "90c16bee63e2609ebc4f09e91459332390562464",
    "6412128271": "43b63ed0f41e6e92e93ecf72065c0190c9ef3dea",
  })) {
    writeFileSync(
      path.join(state, `auth-${id}.json`),
      JSON.stringify({
        l: fx.gh_auth_login,
        b: over[`auth_${id}`] ?? body,
      }),
    );
  }
  writeFileSync(path.join(state, "called"), "");
  writeFileSync(
    path.join(state, "docker-inspect"),
    JSON.stringify({ Running: fx.docker_running === "true" }),
  );
  const sh = (name: string, body: string) => {
    writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body}`);
    chmodSync(path.join(bin, name), 0o755);
  };
  sh(
    "gh",
    `echo "gh $*" >> "$FIX/state/called"
if [[ "$1" == api ]]; then
  cid="\${2##*/}"; cat "$FIX/state/auth-$cid.json" 2>/dev/null || exit 1; exit 0
fi
if [[ "$1" == pr && "$2" == view ]]; then cat "$FIX/state/gh-pr-$3.json" 2>/dev/null || { echo "{}"; exit 1; }; exit 0; fi
if [[ "$1" == pr && "$2" == ready ]]; then exit 0; fi
if [[ "$1" == pr && "$2" == merge ]]; then echo merged >> "$FIX/state/called"; exit 0; fi
if [[ "$1" == pr && "$2" == comment ]]; then exit 0; fi
exit 0`,
  );
  sh(
    "git",
    `echo "git $*" >> "$FIX/state/called"
case "$1" in
  rev-parse) case "$2" in
    --show-toplevel) echo "$HERE_REAL" ;;
    *\\:*) echo "$GIT_SNAP" ;;
    *HEAD*\\^\\{tree\\}) echo "$GIT_TREE" ;;
    origin/*) echo "$GIT_BASETIP" ;;
    *) echo "$GIT_BASETIP" ;; esac ;;
  fetch|checkout|worktree|merge) exit 0 ;;
  diff) cat "$FIX/state/diff-files"; exit 0 ;;
  cat-file) echo "parent $GIT_BASETIP"; echo "parent $GIT_HEAD" ;;
  -C) shift; exec git "$@" ;;
esac`,
  );
  sh(
    "docker",
    `echo "docker $*" >> "$FIX/state/called"
if [[ "$1" == inspect ]]; then cat "$FIX/state/docker-inspect"; exit 0; fi
if [[ "$1" == exec ]]; then
  if [[ "$*" == *"psql"*"-lqt"* ]]; then cat "$FIX/state/dbs"; exit 0; fi
  if [[ "$*" == *createdb* ]]; then echo created >> "$FIX/state/called"; exit 0; fi
  if [[ "$*" == *dropdb* ]]; then exit 0; fi
fi
exit 0`,
  );
  sh("npm", 'echo "npm $*" >> "$FIX/state/called"; [[ -z "$GATE_FAIL" ]]');
  sh("npx", 'echo "npx $*" >> "$FIX/state/called"; [[ -z "$GATE_FAIL" ]]');
  sh("openssl", 'echo "deadbeefdeadbeefdeadbeefdeadbeef"');
  sh("flock", "exit 0");
  const beta = path.join(dir, "beta");
  mkdirSync(beta, { recursive: true });
  const wt = path.join(dir, "wt");
  mkdirSync(wt, { recursive: true });
  return { dir, bin, state, beta, wt };
}

function manifest(over: Partial<Record<string, unknown>> = {}) {
  const m = JSON.parse(
    readFileSync(
      path.join(ROOT, "icm/05-build/tools/transition/p203-p207.json"),
      "utf8",
    ),
  );
  return { ...m, ...over };
}

// Executor tests run against a manifest where the pending owner-comment input
// has been fulfilled (a verifiable comment record), so behavior past the auth
// boundary is exercised. The real manifest keeps pendingInput until the owner
// posts the record.
function fulfilledManifest(tmp: string, over: Record<string, unknown> = {}) {
  const m = manifest();
  m.authorization.mergeAuthorization = {
    commentUrl:
      "https://github.com/hanzlahsfc/vari8/pull/207#issuecomment-6417192584",
    author: "hanzlahsfc",
    contains: "90c16bee63e2609ebc4f09e91459332390562464",
  };
  Object.assign(m, over);
  const f = path.join(tmp, "m.json");
  writeFileSync(f, JSON.stringify(m));
  return f;
}
const FMF = () => fulfilledManifest(mkdtempSync(path.join(tmpdir(), "fmf-")));

function run(
  args: string[],
  over: Record<string, string> = {},
  env: Record<string, string> = {},
) {
  const f = fixtures(over);
  rmSync(path.join(ROOT, "_transition"), { recursive: true, force: true });
  const r = spawnSync("bash", [SCRIPT, ...args], {
    cwd: ROOT,
    env: {
      ...process.env,
      PATH: `${f.bin}:${process.env.PATH}`,
      POSTGRES_PASSWORD: "x",
      FIX: f.dir,
      HERE_REAL: ROOT,
      GH_AUTH_LOGIN: "hanzlahsfc",
      GIT_SNAP: "snap111",
      GIT_TREE: SHA.tree,
      GIT_BASETIP: SHA.base,
      GIT_HEAD: SHA.p203,
      GATE_FAIL: over.gate_fail ?? "",
      INTEGRATE_BETA: f.beta,
      VARI8_WORKTREES: f.wt,
      INTEGRATE_DRY_RUN: "1",
      ...env,
    },
    encoding: "utf8",
  });
  const called = existsSync(path.join(f.state, "called"))
    ? readFileSync(path.join(f.state, "called"), "utf8")
    : "";
  if (r.status !== 0 && process.env.DEBUG_FIX)
    console.log("DBG", r.status, r.stderr.slice(0, 400), called.slice(0, 200));
  return { ...r, called, f };
}

const M = () => path.join(ROOT, "icm/05-build/tools/transition/p203-p207.json");

describe("integrate-transition single-step executor", () => {
  it("refuses an unlisted PR (#999) before any mutation", () => {
    const r = run([FMF(), "--pr", "999"]);
    expect(r.status).toBe(4);
    expect(r.stderr).toMatch(/unlisted/);
    expect(r.called).not.toContain("merged");
    expect(r.called).not.toContain("createdb");
  });

  it("refuses a wrong live head", () => {
    const r = run([FMF(), "--pr", "203"], { gh_head: SHA.p206 });
    expect(r.status).toBe(4);
    expect(r.stderr).toMatch(/head moved/);
    expect(r.called).not.toContain("merged");
  });

  it("refuses when live base differs from manifest (stacked base)", () => {
    const r = run([FMF(), "--pr", "203"], { gh_base: "beta/parity-https" });
    expect(r.status).toBe(4);
    expect(r.called).not.toContain("merged");
  });

  it("refuses a draft-state mismatch with the manifest", () => {
    const r = run([FMF(), "--pr", "203"], { gh_draft: "false" });
    expect(r.status).toBe(4);
    expect(r.called).not.toContain("merged");
  });

  it("refuses unresolved FIX findings on the pinned head", () => {
    const r = run([FMF(), "--pr", "203"], {
      gh_comments: `FIX transition #203 ${SHA.p203}: gate red`,
    });
    expect(r.status).toBe(4);
    expect(r.called).not.toContain("merged");
  });

  it("refuses forged authorization content", () => {
    const r = run([FMF(), "--pr", "203"], {
      auth_6417192584: "unrelated text",
    });
    expect(r.status).toBe(4);
    expect(r.stderr).toMatch(/pinned content|author/);
    expect(r.called).not.toContain("merged");
  });

  it("refuses while the owner-comment input is still pending", () => {
    const r = run([M(), "--pr", "203"]);
    expect(r.status).toBe(4);
    expect(r.stderr).toMatch(/pending/);
    expect(r.called).not.toContain("merged");
  });

  it("treats an already-MERGED selected step as complete, no merge", () => {
    const r = run([FMF(), "--pr", "203"], { gh_state: "MERGED" });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/already MERGED/);
    expect(r.called).not.toContain("merged");
  }, 20000);

  it("refuses when the authorization comment is unreachable", () => {
    const f = FMF();
    const m = JSON.parse(readFileSync(f, "utf8"));
    m.authorization.mergeAuthorization.commentUrl =
      "https://github.com/hanzlahsfc/vari8/pull/207#issuecomment-9999999";
    writeFileSync(f, JSON.stringify(m));
    const r = run([f, "--pr", "203"]);
    expect(r.status).toBe(4);
    expect(r.stderr).toMatch(/missing input|unreachable/);
    expect(r.called).not.toContain("merged");
  });

  it("refuses merges that touch baseline paths (activation boundary)", () => {
    const r = run([FMF(), "--pr", "203"], {
      git_diff_files: "tools/parity/baseline/active.json\n",
    });
    expect(r.status).toBe(6);
    expect(r.called).not.toContain("merged");
    expect(r.called).not.toContain("createdb");
  });

  it("refuses an existing database (no resource reuse)", () => {
    const r = run([FMF(), "--pr", "203"], {
      db_existing: "app_transition_p203\n",
    });
    expect(r.status).toBe(2);
    expect(r.called).not.toContain("createdb");
  });

  it("refuses when the DB container is not running", () => {
    const r = run([FMF(), "--pr", "203"], { docker_running: "false" });
    expect(r.status).toBe(2);
    expect(r.called).not.toContain("merged");
  });

  it("does not merge when the fast gate is red", () => {
    const r = run([FMF(), "--pr", "203"], { gate_fail: "1" });
    expect(r.status).toBe(5);
    expect(r.called).not.toContain("merged");
  });

  it("dry-run completes all gates and does not merge", () => {
    // Manifest fixture: fast fake combined-gate runner writing expected results.
    const dir = mkdtempSync(path.join(tmpdir(), "tmfx-"));
    const runner = path.join(dir, "fake-runner.mjs");
    writeFileSync(
      runner,
      'import fs from "node:fs";\n' +
        'fs.writeFileSync(process.env.PARITY_OUT_DIR + "/proposed-canonical.json", JSON.stringify({passed:70}));\n' +
        'fs.writeFileSync(process.env.PARITY_OUT_DIR + "/proposed-strict.json", JSON.stringify({passed:68}));\n',
    );
    const mp = FMF();
    const m = JSON.parse(readFileSync(mp, "utf8"));
    m.gates.combined.runner = ["node", runner];
    m.gates.combined.reference = "tools/parity/baseline";
    delete m.gates.combined.bundle; // fixture covers the no-bundle path
    writeFileSync(mp, JSON.stringify(m));
    const r = run([mp, "--pr", "203"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/DRY RUN/);
    expect(r.called).toContain("npm ci");
    expect(r.called).not.toContain("merged");
    // disposable DB is created for the gate; only the merge is withheld
    expect(r.called).toContain("createdb");
  });

  it("refuses baseline activation env", () => {
    const r = run(
      [M(), "--pr", "203"],
      {},
      { INTEGRATE_ACTIVATE_BASELINE: "1" },
    );
    expect(r.status).toBe(4);
    expect(r.called).not.toContain("merged");
  });
});

describe("transition manifest validator", () => {
  const M2 = () => manifest();
  it("accepts the recorded manifest", () =>
    expect(validateTransitionManifest(M2()).items).toHaveLength(3));
  it("rejects wrong kind / bypass flags / altered activation boundary", () => {
    for (const patch of [
      (m: Record<string, unknown>) => (m.kind = "ship"),
      (m: Record<string, unknown>) => (m.skipVerdict = true),
      (m: Record<string, unknown>) => (m.baselineActivation = "allowed"),
      (m: Record<string, unknown>) => delete m.baselineActivation,
    ]) {
      const m = M2();
      patch(m);
      expect(() => validateTransitionManifest(m)).toThrow();
    }
  });
  it("rejects malformed heads, bases, draft flags", () => {
    for (const head of [
      "dead",
      "g".repeat(40),
      "a".repeat(40).toUpperCase(),
      12,
    ]) {
      const m = M2();
      m.items[0].head = head;
      expect(() => validateTransitionManifest(m)).toThrow(/head/);
    }
    const m2 = M2();
    m2.items[0].isDraft = "yes";
    expect(() => validateTransitionManifest(m2)).toThrow(/isDraft/);
  });
  it("rejects missing authorization records and unpinned evidence", () => {
    for (const patch of [
      (m: { authorization: Record<string, unknown> }) =>
        delete m.authorization.mergeAuthorization,
      (m: { authorization: { mergeAuthorization: { contains: string } } }) =>
        (m.authorization.mergeAuthorization.contains = "ok"),
      (m: { authorization: { mergeAuthorization: { author: string } } }) =>
        (m.authorization.mergeAuthorization.author = ""),
    ]) {
      const m = M2();
      patch(m);
      expect(() => validateTransitionManifest(m)).toThrow();
    }
  });
  it("rejects missing mandatory gates and unordered sequences", () => {
    const m = M2();
    m.gates.fast = false;
    expect(() => validateTransitionManifest(m)).toThrow(/fast/);
    const m2 = M2();
    m2.items[1].order = 9;
    expect(() => validateTransitionManifest(m2)).toThrow(/order/);
  });
  it("requires dependsOn for stacked bases", () => {
    const m = M2();
    delete m.items[1].dependsOn;
    expect(() => validateTransitionManifest(m)).toThrow(/dependsOn/);
  });

  it("rejects items outside the authorized allowlist", () => {
    const m = M2();
    m.items[2].pr = 999;
    expect(() => validateTransitionManifest(m)).toThrow(/allowlist/);
    const m2 = M2();
    m2.authorizedPRs = [203];
    expect(() => validateTransitionManifest(m2)).toThrow(/allowlist/);
  });

  it("accepts a pending-input record only with named source + input", () => {
    const m = M2();
    expect(() => validateTransitionManifest(m)).not.toThrow();
    const bad = M2();
    bad.authorization.mergeAuthorization.pendingInput = "x";
    expect(() => validateTransitionManifest(bad)).toThrow(/pendingInput/);
    const bad2 = M2();
    bad2.authorization.mergeAuthorization.pendingInput =
      "github comment to be posted by owner";
    delete bad2.authorization.mergeAuthorization.source;
    expect(() => validateTransitionManifest(bad2)).toThrow(/source/);
  });

  it("pins the gate bundle commit/path/treeSha", () => {
    const m = M2();
    m.gates.combined.bundle.commit = "dead";
    expect(() => validateTransitionManifest(m)).toThrow(/bundle.commit/);
    const m2 = M2();
    m2.gates.combined.bundle.treeSha = "beef";
    expect(() => validateTransitionManifest(m2)).toThrow(/treeSha/);
  });
});
