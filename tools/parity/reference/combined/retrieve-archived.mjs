// Executable retrieval + integrity check for archived combined packages.
// Usage: node tools/parity/reference/combined/retrieve-archived.mjs p436-run
// Verifies the archive tag exists on the remote, the package path is present in
// that tag, and the recorded artifact-index sha256 matches the pinned value.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const name = process.argv[2];
if (!name) throw new Error("usage: retrieve-archived.mjs <package-name>");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const git = (...a) => execFileSync("git", ["-C", ROOT, ...a], { encoding: "utf8" }).trim();
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const stub = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tools/parity/reference/combined", name, "ARCHIVED.json"), "utf8"),
);
if (stub.status !== "SUPERSEDED") throw new Error(`${name} is not archived`);
const tag = stub.archiveTag;
const remotes = git("ls-remote", "--tags", "origin", tag);
if (!remotes.includes(tag)) throw new Error(`archive tag missing on origin: ${tag}`);
const pkgPath = `tools/parity/reference/combined/${name}/artifact-index.json`;
const bytes = execFileSync(
  "git", ["-C", ROOT, "show", `${stub.packageAt}:${pkgPath}`],
);
if (sha256(bytes) !== stub.artifactIndexSha256)
  throw new Error("archived artifact-index hash mismatch");
console.log(JSON.stringify({
  package: name, tag, present: true,
  source: stub.source, artifactIndexSha256: stub.artifactIndexSha256,
  verified: true,
}));
