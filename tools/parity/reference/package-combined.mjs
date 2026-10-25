import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileHash } from "./reference.mjs";
import { walkFiles } from "./evidence/evidence-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`required ${name}`);
  return path.resolve(process.argv[i + 1]);
};
const git = (...args) =>
  execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" }).trim();

const run = arg("--run");
const out = arg("--out");
const refresh = process.argv.includes("--refresh-compatibility");
if (!fs.existsSync(path.join(run, "execution-receipt.json")))
  throw new Error("run is missing execution-receipt.json");
if (!refresh && fs.existsSync(out))
  throw new Error("package output must be new");
fs.mkdirSync(out, { recursive: true });
for (const dir of ["adapter", "current", "receipts"])
  fs.mkdirSync(path.join(out, dir), { recursive: true });

const copy = (from, to) => fs.copyFileSync(from, path.join(out, to));
if (!refresh) {
  copy(
    path.join(run, "d32-capture-adapter.mjs"),
    "adapter/d32-capture-adapter.mjs",
  );
  copy(
    path.join(run, "combined-provenance.json"),
    "receipts/combined-provenance.json",
  );
  copy(path.join(run, "execution-receipt.json"), "receipts/execution.json");
  copy(path.join(run, "proposed-canonical.json"), "receipts/canonical.json");
  copy(path.join(run, "proposed-strict.json"), "receipts/strict.json");
  copy(path.join(run, "server.log"), "receipts/server.log");
  for (const [from, to] of [
    ["old-reference-report.html", "receipts/old-reference-report.html"],
    ["old-reference-result.json", "receipts/old-reference-result.json"],
  ])
    if (fs.existsSync(path.join(run, from))) copy(path.join(run, from), to);
  for (const file of walkFiles(path.join(run, "current"))) {
    const from = path.join(run, "current", file);
    const to = path.join(out, "current", file);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}

const receipt = JSON.parse(
  fs.readFileSync(path.join(out, "receipts/execution.json"), "utf8"),
);
const committed = git(
  "diff",
  "--name-only",
  "--no-renames",
  `${receipt.source.sha}..HEAD`,
);
const statusPaths = git("status", "--porcelain=v1", "--untracked-files=all")
  .split("\n")
  .filter(Boolean)
  .map((line) => line.slice(3).split(" -> ").pop());
const packageRoot = path.relative(ROOT, out);
const status = statusPaths.flatMap((file) => {
  const absolute = path.join(ROOT, file);
  return fs.statSync(absolute).isDirectory()
    ? walkFiles(absolute).map((nested) => path.join(file, nested))
    : [file];
});
const postCapturePaths = [
  ...new Set([
    ...committed.split("\n").filter(Boolean),
    ...status,
    path.join(packageRoot, "receipts/source-compatibility.json"),
    path.join(packageRoot, "artifact-index.json"),
  ]),
].sort();
fs.writeFileSync(
  path.join(out, "receipts/source-compatibility.json"),
  JSON.stringify(
    {
      kind: "combined-source-compatibility-v1",
      capture: receipt.source,
      authority:
        "Git review of the listed commits/paths; package hashes bind checked-out inputs but do not prevent a coordinated rewrite of code and manifests",
      postCapturePaths,
    },
    null,
    2,
  ) + "\n",
);

const entries = walkFiles(out)
  .filter((file) => file !== "artifact-index.json")
  .map((file) => ({
    path: file,
    sha256: fileHash(path.join(out, file)),
  }));
fs.writeFileSync(
  path.join(out, "artifact-index.json"),
  JSON.stringify(
    {
      kind: "combined-run-artifact-index-v1",
      generatedFor: "PR #203 + #206 owner-authorized combined verification",
      artifacts: entries,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify({ package: out, artifacts: entries.length }));
