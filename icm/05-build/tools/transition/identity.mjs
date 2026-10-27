// Separated-identity checks for the supervised p203 transition preparation.
// Models four distinct identities — ungrafted merge, overlay capture,
// evidence storage, intended remote merge — without requiring ancestry
// between unrelated storage and capture branches.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const git = (repo, ...args) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

// Overlay invariant: the graft commit must differ from its parent ONLY under
// tools/parity, and its tools/parity subtree must equal the pinned bundle tree.
export function verifyOverlay(repo, overlaySha, bundleTree) {
  const tree = git(repo, "rev-parse", `${overlaySha}^{tree}`);
  const sub = git(repo, "rev-parse", `${overlaySha}:tools/parity`);
  if (sub !== bundleTree)
    throw new Error(`overlay subtree ${sub} != pinned bundle ${bundleTree}`);
  const parents = git(repo, "cat-file", "-p", overlaySha)
    .split("\n")
    .filter((l) => l.startsWith("parent "))
    .map((l) => l.split(" ")[1]);
  if (parents.length !== 1)
    throw new Error(
      `overlay must have exactly one parent, got ${parents.length}`,
    );
  const outside = git(
    repo,
    "diff",
    "--name-only",
    `${overlaySha}^`,
    overlaySha,
    "--",
    ":!tools/parity",
  );
  if (outside !== "")
    throw new Error(`overlay touches non-tools/parity files: ${outside}`);
  return { tree, parent: parents[0], subtree: sub };
}

// Package accounting: every committed file hashed, index covered, no extras.
export function verifyPackage(dir) {
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      e.isDirectory() ? walk(p) : files.push(p);
    }
  };
  walk(dir);
  const index = JSON.parse(
    fs.readFileSync(`${dir}/artifact-index.json`, "utf8"),
  );
  const entries = index.artifacts ?? index.files ?? [];
  const indexed = new Set(entries.map((e) => e.path));
  const rel = files.map((f) => f.slice(dir.length + 1));
  const missing = rel.filter(
    (f) => f !== "artifact-index.json" && !indexed.has(f),
  );
  if (missing.length)
    throw new Error(`unindexed package files: ${missing.join(",")}`);
  const absent = entries.filter((e) => !fs.existsSync(`${dir}/${e.path}`));
  if (absent.length)
    throw new Error(
      `index entries missing on disk: ${absent.map((e) => e.path).join(",")}`,
    );
  return { files: rel.length, indexed: entries.length };
}

// Bare-capture zero-delta: when HEAD == capture commit, changedPathsSince is
// identity-empty — valid state, not an empty-delta bypass.
export function verifyDelta(root, captureSha, recordedPaths) {
  const actual = git(root, "diff", "--name-only", captureSha, "HEAD")
    .split("\n")
    .filter(Boolean)
    .sort();
  const expected = [...recordedPaths].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `post-capture delta mismatch: ${JSON.stringify(actual)} vs recorded`,
    );
  return actual;
}
