import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTRACT,
  assertContract,
  validateRun,
  fileHash,
} from "../reference.mjs";
import { RULED } from "../../compare.mjs";
import {
  SHOTS_PATH,
  assertComparerManifest,
  assertReceiptToolchain,
  verifyAllowanceRules,
  verifyArtifactIndex,
  verifyPinnedToolchain,
  walkFiles,
} from "./evidence-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE = path.resolve(HERE);
const REPO_ROOT = path.resolve(EVIDENCE, "../../../..");
const REFERENCE = path.resolve(EVIDENCE, "../proposed");
const CANDIDATE = path.resolve(EVIDENCE, "candidate");
const RECEIPTS = path.resolve(EVIDENCE, "receipts");
const CONTRACT_FILE = path.resolve(EVIDENCE, "../contract.json");
const COMPARER_FILE = path.resolve(EVIDENCE, "comparer.json");
const ARTIFACT_INDEX = path.resolve(EVIDENCE, "artifact-hashes.json");
const ARTIFACT_ROOT = path.resolve(EVIDENCE, "..");
const SHOTS = path.join(REPO_ROOT, SHOTS_PATH);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const required = (label, file) => {
  if (!fs.existsSync(file)) throw new Error(`missing ${label}: ${file}`);
};
const countFiles = (directory) => walkFiles(directory).length;

for (const [label, file] of [
  ["contract", CONTRACT_FILE],
  ["comparer", COMPARER_FILE],
  ["artifact index", ARTIFACT_INDEX],
  ["shots index", SHOTS],
])
  required(label, file);

assertContract(CONTRACT);
const comparer = readJson(COMPARER_FILE);
assertComparerManifest(comparer);
verifyPinnedToolchain(REPO_ROOT, comparer);
verifyAllowanceRules(CONTRACT.allowances, RULED);
assertContract(readJson(path.join(REFERENCE, "provenance.json")).contract);
assertContract(readJson(path.join(CANDIDATE, "provenance.json")).contract);

const artifactIndex = readJson(ARTIFACT_INDEX);
const artifactCount = verifyArtifactIndex(ARTIFACT_ROOT, artifactIndex, {
  exactRoots: ["proposed", "evidence/candidate"],
});

// the package's recipe inventory is the pinned receipt set resolved
// against the EVIDENCE-TIME index — the recorded authority. The live
// index may grow or drift; it is checked for drift and reported below,
// never treated as the package's recipe source
const receiptStems = new Set(
  readJson(
    "tools/parity/reference/evidence/receipts/canonical.json",
  ).results.map((r) => r.id.split("@")[0]),
);
const evidenceByStem = new Map(
  JSON.parse(
    execFileSync(
      "git",
      ["-C", REPO_ROOT, "show", `${CONTRACT.candidateSource}:${SHOTS_PATH}`],
      { encoding: "utf8" },
    ),
  ).shots.map((sh) => [sh.file.replace(/\.(png|webp)$/, ""), sh]),
);
const shots = [...receiptStems].map((stem) => {
  const sh = evidenceByStem.get(stem);
  if (!sh)
    throw new Error(`pinned recipe ${stem} absent from evidence-time index`);
  return sh;
});
for (const [label, directory] of [
  ["reference", REFERENCE],
  ["candidate", CANDIDATE],
]) {
  for (const name of ["manifest.json", "provenance.json"])
    required(`${label} ${name}`, path.join(directory, name));
  validateRun({
    directory,
    manifest: readJson(path.join(directory, "manifest.json")),
    shots,
    provenance: readJson(path.join(directory, "provenance.json")),
  });
}

const metadata = readJson(path.join(RECEIPTS, "metadata.json"));
if (metadata.kind !== "recomparison-not-original-capture")
  throw new Error("receipt metadata does not identify a recomparison");
assertReceiptToolchain(metadata, comparer, fileHash(COMPARER_FILE));
if (metadata.contractId !== CONTRACT.id)
  throw new Error("receipt contract id differs");
if (metadata.contractVersion !== CONTRACT.contractVersion)
  throw new Error("receipt contract version differs");
if (metadata.contractSha256 !== fileHash(CONTRACT_FILE))
  throw new Error("receipt contract hash differs");
if (
  metadata.inputs.referenceManifestSha256 !==
  fileHash(path.join(REFERENCE, "manifest.json"))
)
  throw new Error("receipt reference manifest hash differs");
if (
  metadata.inputs.referenceProvenanceSha256 !==
  fileHash(path.join(REFERENCE, "provenance.json"))
)
  throw new Error("receipt reference provenance hash differs");
if (
  metadata.inputs.candidateManifestSha256 !==
  fileHash(path.join(CANDIDATE, "manifest.json"))
)
  throw new Error("receipt candidate manifest hash differs");
if (
  metadata.inputs.candidateProvenanceSha256 !==
  fileHash(path.join(CANDIDATE, "provenance.json"))
)
  throw new Error("receipt candidate provenance hash differs");
if (metadata.inputs.artifactIndexSha256 !== fileHash(ARTIFACT_INDEX))
  throw new Error("receipt artifact index hash differs");
// the index legitimately grows/drifts — report per-recipe drift of the
// pinned set against evidence-time bytes; the package's inventory was
// bound above, so live drift is a recorded fact, not a package defect
{
  const currentByStem = new Map(
    readJson(SHOTS).shots.map((sh) => [
      sh.file.replace(/\.(png|webp)$/, ""),
      sh,
    ]),
  );
  const drifted = [...receiptStems].filter((stem) => {
    const after = currentByStem.get(stem);
    return (
      !after ||
      JSON.stringify(evidenceByStem.get(stem)) !== JSON.stringify(after)
    );
  });
  if (drifted.length)
    console.warn(
      `index drift vs evidence-time for pinned recipes: ${drifted.join(", ")} (package inventory unchanged)`,
    );
}
const packageCounts = {
  reference: countFiles(REFERENCE),
  candidate: countFiles(CANDIDATE),
  evidence: countFiles(EVIDENCE),
  artifactIndex: artifactCount,
};
for (const [name, value] of Object.entries(packageCounts))
  if (metadata.packageCounts[name] !== value)
    throw new Error(`receipt package count differs: ${name}`);
for (const name of ["canonical", "strict"]) {
  const receipt = readJson(path.join(RECEIPTS, `${name}.json`));
  if (
    receipt.total !== metadata[name].total ||
    receipt.passed !== metadata[name].passed ||
    receipt.failed !== metadata[name].failed ||
    !Array.isArray(receipt.results)
  )
    throw new Error(`receipt ${name} counts differ from metadata`);
  const failedIds = receipt.results
    .filter((entry) => !entry.pass)
    .map((entry) => entry.id);
  if (JSON.stringify(failedIds) !== JSON.stringify(metadata[name].failedIds))
    throw new Error(`receipt ${name} failedIds differ from metadata`);
}
if (metadata.canonical.passed !== 70 || metadata.canonical.failed !== 0)
  throw new Error("canonical receipt is not 70/70");
if (metadata.strict.passed !== 68 || metadata.strict.failed !== 2)
  throw new Error("strict receipt is not the expected 68/70 diagnostic");

console.log(
  JSON.stringify(
    {
      evidence: EVIDENCE,
      artifactFiles: artifactCount,
      canonical: metadata.canonical,
      strict: metadata.strict,
      receiptVersion: metadata.receiptVersion,
      toolchain: metadata.toolchain.id,
      comparerManifest: metadata.toolchain.manifest.sha256,
      contract: metadata.contractSha256,
      referenceManifest: metadata.inputs.referenceManifestSha256,
      candidateManifest: metadata.inputs.candidateManifestSha256,
      packageCounts,
      verified: true,
    },
    null,
    2,
  ),
);
