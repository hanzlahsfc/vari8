import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileHash, CONTRACT, assertContract } from "./reference.mjs";
import { validateCombinedRun } from "./combined-run.mjs";
import { compareRuns } from "./compare.mjs";
import { verifyArtifactIndex, walkFiles } from "./evidence/evidence-lib.mjs";
import {
  assertRecordedDependencies,
  assertRecordedTooling,
} from "./combined-pins.mjs";
import {
  assertCleanMaterialCheckout,
  assertCommitMatchesSource,
  assertCurrentMaterialInputs,
  assertPostCaptureDelta,
} from "./source-identity.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? path.resolve(process.argv[i + 1]) : dflt;
};
const PKG = arg("--package", path.join(HERE, "combined"));
const INDEX = path.join(PKG, "artifact-index.json");
const REFERENCE = path.join(ROOT, "tools/parity/reference/proposed");
const SHOTS = path.join(ROOT, "icm/04-briefing/shots/index.json");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const index = readJson(INDEX);
if (index.kind !== "combined-run-artifact-index-v1")
  throw new Error("combined artifact index kind differs");
const indexed = verifyArtifactIndex(PKG, index.artifacts, {
  exactRoots: ["adapter", "current", "receipts"],
});
const listed = new Set(index.artifacts.map((x) => x.path));
for (const file of walkFiles(PKG))
  if (file !== "artifact-index.json" && !listed.has(file))
    throw new Error(`unindexed package file: ${file}`);

const receipt = readJson(path.join(PKG, "receipts/execution.json"));
const provenance = readJson(
  path.join(PKG, "receipts/combined-provenance.json"),
);
const compatibility = readJson(
  path.join(PKG, "receipts/source-compatibility.json"),
);
const manifest = readJson(path.join(PKG, "current/manifest.json"));
const shots = readJson(SHOTS).shots;
assertContract(CONTRACT);
assertContract(provenance.contract);
if (
  receipt.kind !== "combined-proposed-reference-verification" ||
  provenance.role !== "combined" ||
  compatibility.kind !== "combined-source-compatibility-v1" ||
  provenance.source.sha !== provenance.inputs.prep.head ||
  receipt.source.sha !== provenance.source.sha ||
  receipt.inputs.prep.head !== provenance.inputs.prep.head ||
  compatibility.capture.sha !== provenance.source.sha ||
  compatibility.capture.tree !== provenance.source.tree
)
  throw new Error("combined receipt/provenance source mismatch");

assertCommitMatchesSource(ROOT, provenance.source);
assertCurrentMaterialInputs(ROOT, provenance.source);
assertPostCaptureDelta(ROOT, compatibility);
assertCleanMaterialCheckout(ROOT);

assertRecordedTooling({
  root: ROOT,
  receipt,
  adapterFile: path.join(PKG, "adapter/d32-capture-adapter.mjs"),
});
if (
  provenance.adapter.adapterSha256 !==
  fileHash(path.join(PKG, "adapter/d32-capture-adapter.mjs"))
)
  throw new Error("packaged adapter hash differs");
assertRecordedDependencies(ROOT, receipt);

const artifacts = validateCombinedRun({
  directory: path.join(PKG, "current"),
  manifest,
  shots,
  provenance,
});
if (
  artifacts.length !== receipt.capture.artifactCount ||
  receipt.capture.manifestSha256 !==
    fileHash(path.join(PKG, "current/manifest.json"))
)
  throw new Error("combined capture receipt mismatch");
for (const name of ["canonical", "strict"]) {
  const actual = compareRuns(REFERENCE, path.join(PKG, "current"), {
    strict: name === "strict",
  });
  const saved = readJson(path.join(PKG, `receipts/${name}.json`));
  if (
    actual.total !== 70 ||
    actual.passed !== saved.passed ||
    actual.failed !== saved.failed ||
    JSON.stringify(actual.results) !== JSON.stringify(saved.results)
  )
    throw new Error(`combined ${name} recomparison differs`);
  if (
    receipt.results[name].sha256 !==
    fileHash(path.join(PKG, `receipts/${name}.json`))
  )
    throw new Error(`combined ${name} receipt hash differs`);
}
console.log(
  JSON.stringify({
    package: PKG,
    indexedArtifacts: indexed,
    captureArtifacts: artifacts.length,
    captureSource: {
      sha: provenance.source.sha,
      tree: provenance.source.tree,
      materialTreeSha256: provenance.source.materialTreeSha256,
    },
    currentHead: process.env.GIT_COMMIT ?? null,
    canonical: { passed: receipt.results.canonical.passed, failed: 0 },
    strict: {
      passed: receipt.results.strict.passed,
      failed: receipt.results.strict.failed,
    },
    verified: true,
  }),
);
