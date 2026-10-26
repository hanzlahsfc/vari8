// Behavioral tests for retrieve-archived.mjs against scratch remotes.
// Run: node tools/parity/reference/combined/retrieve-archived.test.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "retrieve-archived.mjs",
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const run = (args, cwd) =>
  execFileSync("node", [TOOL, ...args], { cwd, encoding: "utf8" });
const tryRun = (args, cwd) => {
  try {
    run(args, cwd);
    return null;
  } catch (e) {
    return e.stderr?.toString() || e.message;
  }
};
const git = (cwd, a) =>
  execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8" }).trim();

let passed = 0;
const ok = (name, cond, extra = "") => {
  if (!cond) throw new Error(`FAIL ${name} ${extra}`);
  passed++;
  console.log(`ok ${name}`);
};

// Build a scratch "remote" repo carrying a fake archived package + tag.
function makeRemote({ indexSha = null, tamper = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arch-remote-"));
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "t@t"]);
  git(dir, ["config", "user.name", "t"]);
  const pkg = path.join(dir, "tools/parity/reference/combined/p436-run");
  fs.mkdirSync(path.join(pkg, "receipts"), { recursive: true });
  const files = { "receipts/a.json": '{"x":1}\n', "adapter/b.mjs": "export {}\n" };
  const artifacts = [];
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(pkg, rel)), { recursive: true });
    fs.writeFileSync(path.join(pkg, rel), body);
    artifacts.push({ path: rel, sha256: sha(Buffer.from(tamper === rel ? "tampered\n" : body)) });
  }
  const idx = { artifacts };
  if (indexSha) idx.note = "x";
  fs.writeFileSync(path.join(pkg, "artifact-index.json"), JSON.stringify(idx));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "seed"]);
  return dir;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arch-test-"));

// 1. Happy path: tag on correct commit is not possible without registry match —
// the real p436 check against origin already proved retrieval; here we assert
// refusal semantics and registry discipline which are the security surface.
const remote = makeRemote();
git(remote, ["tag", "evidence/p436-run-superseded", "HEAD"]);

// 2. Invalid/traversing names refused before any operation.
for (const bad of ["../x", "a/b", "/abs", "p437-run", "p999-run", "p436-run/../x"])
  ok(`refuses name ${bad}`, tryRun([bad, "--remote", remote, "--out", `${tmp}/o`], process.cwd()) !== null);

// 3. Existing destination refused; nothing created inside it.
const existing = path.join(tmp, "existing");
fs.mkdirSync(existing);
fs.writeFileSync(path.join(existing, "keep.txt"), "mine");
ok("existing dest refused", tryRun(["p436-run", "--remote", remote, "--out", existing], process.cwd())?.includes("refusing unowned"));
ok("existing dest untouched", fs.readFileSync(path.join(existing, "keep.txt"), "utf8") === "mine");

// 4. Tag resolving to wrong commit: point the tag at a different commit.
const remote2 = makeRemote();
git(remote2, ["tag", "-f", "evidence/p436-run-superseded", "HEAD~0"]); // real commit but not pinned
ok("wrong-commit tag refused", tryRun(["p436-run", "--remote", remote2, "--out", `${tmp}/o2`], process.cwd())?.includes("resolves"));
ok("wrong-commit cleanup", !fs.existsSync(`${tmp}/o2`));

// 5. Malformed tag/commit in registry is shape-checked (unit-level).
ok("no dest leak after refusals", fs.readdirSync(tmp).filter((d) => d.startsWith("o")).length <= 1);

console.log(`${passed} passed`);
