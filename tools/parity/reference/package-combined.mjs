import fs from "node:fs";
import path from "node:path";
import { fileHash } from "./reference.mjs";
import { walkFiles } from "./evidence/evidence-lib.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`required ${name}`);
  return path.resolve(process.argv[i + 1]);
};

const run = arg("--run");
const out = arg("--out");
if (!fs.existsSync(path.join(run, "execution-receipt.json")))
  throw new Error("run is missing execution-receipt.json");
if (fs.existsSync(out)) throw new Error("package output must be new");
fs.mkdirSync(out, { recursive: true });
for (const dir of ["adapter", "current", "receipts"])
  fs.mkdirSync(path.join(out, dir), { recursive: true });

const copy = (from, to) => fs.copyFileSync(from, path.join(out, to));
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
for (const file of walkFiles(path.join(run, "current"))) {
  const from = path.join(run, "current", file);
  const to = path.join(out, "current", file);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}
const entries = walkFiles(out).map((file) => ({
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
