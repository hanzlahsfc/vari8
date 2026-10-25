import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACT, assertContract, fileHash } from "../reference.mjs";
import { compareRuns } from "../compare.mjs";
import { RULED } from "../../compare.mjs";
import {
  COMPARER_PATH,
  RECEIPT_VERSION,
  SHOTS_PATH,
  assertComparerManifest,
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
const countFiles = (directory) => walkFiles(directory).length;

assertContract(CONTRACT);
verifyAllowanceRules(CONTRACT.allowances, RULED);

const comparer = readJson(COMPARER_FILE);
assertComparerManifest(comparer);
verifyPinnedToolchain(REPO_ROOT, comparer);

const artifactIndex = readJson(ARTIFACT_INDEX);
const artifactCount = verifyArtifactIndex(ARTIFACT_ROOT, artifactIndex, {
  exactRoots: ["proposed", "evidence/candidate"],
});
const inputs = {
  referenceManifestSha256: fileHash(path.join(REFERENCE, "manifest.json")),
  referenceProvenanceSha256: fileHash(path.join(REFERENCE, "provenance.json")),
  candidateManifestSha256: fileHash(path.join(CANDIDATE, "manifest.json")),
  candidateProvenanceSha256: fileHash(path.join(CANDIDATE, "provenance.json")),
  artifactIndexSha256: fileHash(ARTIFACT_INDEX),
  shotIndexSha256: fileHash(SHOTS),
};
const packageCounts = {
  reference: countFiles(REFERENCE),
  candidate: countFiles(CANDIDATE),
  evidence: countFiles(EVIDENCE),
  artifactIndex: artifactCount,
};
const metadata = {
  kind: "recomparison-not-original-capture",
  receiptVersion: RECEIPT_VERSION,
  toolchain: {
    id: comparer.id,
    manifest: {
      path: COMPARER_PATH,
      sha256: fileHash(COMPARER_FILE),
    },
    components: comparer.components,
    locks: comparer.locks,
    dependencies: comparer.dependencies,
    contract: comparer.contract,
  },
  contractId: CONTRACT.id,
  contractVersion: CONTRACT.contractVersion,
  contractSha256: fileHash(CONTRACT_FILE),
  inputs,
  packageCounts,
};

fs.mkdirSync(RECEIPTS, { recursive: true });
for (const [name, strict] of [
  ["canonical", false],
  ["strict", true],
]) {
  const result = compareRuns(REFERENCE, CANDIDATE, { strict });
  fs.writeFileSync(
    path.join(RECEIPTS, `${name}.json`),
    JSON.stringify(result, null, 2) + "\n",
  );
  metadata[name] = {
    total: result.total,
    passed: result.passed,
    failed: result.failed,
    failedIds: result.results
      .filter((entry) => !entry.pass)
      .map((entry) => entry.id),
  };
}
fs.writeFileSync(
  path.join(RECEIPTS, "metadata.json"),
  JSON.stringify(metadata, null, 2) + "\n",
);

console.log(
  JSON.stringify(
    {
      receiptVersion: metadata.receiptVersion,
      canonical: metadata.canonical,
      strict: metadata.strict,
      toolchain: metadata.toolchain.id,
      comparerManifest: metadata.toolchain.manifest.sha256,
      contract: metadata.contractSha256,
      inputs: metadata.inputs,
      packageCounts: metadata.packageCounts,
    },
    null,
    2,
  ),
);
