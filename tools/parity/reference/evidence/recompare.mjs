import fs from "node:fs";
import path from "node:path";
import { CONTRACT, fileHash } from "../reference.mjs";
import { compareRuns } from "../compare.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const EVIDENCE = path.resolve(HERE);
const REFERENCE = path.resolve(EVIDENCE, "../proposed");
const CANDIDATE = path.resolve(EVIDENCE, "candidate");
const RECEIPTS = path.resolve(EVIDENCE, "receipts");
const CONTRACT_FILE = path.resolve(EVIDENCE, "../contract.json");
const ARTIFACT_INDEX = path.resolve(EVIDENCE, "artifact-hashes.json");
const COMPARE = path.resolve(EVIDENCE, "../compare.mjs");
const LEGACY_COMPARE = path.resolve(EVIDENCE, "../../compare.mjs");
const PACKAGE_LOCK = path.resolve(EVIDENCE, "../package-lock.json");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const lock = readJson(PACKAGE_LOCK);
const dependencies = Object.fromEntries(
  ["pixelmatch", "pngjs"].map((name) => {
    const entry = lock.packages[`node_modules/${name}`];
    if (!entry) throw new Error(`reference dependency ${name} is not pinned`);
    return [name, { version: entry.version, integrity: entry.integrity }];
  }),
);

const inputHashes = {
  referenceManifestSha256: fileHash(path.join(REFERENCE, "manifest.json")),
  referenceProvenanceSha256: fileHash(path.join(REFERENCE, "provenance.json")),
  candidateManifestSha256: fileHash(path.join(CANDIDATE, "manifest.json")),
  candidateProvenanceSha256: fileHash(path.join(CANDIDATE, "provenance.json")),
  artifactIndexSha256: fileHash(ARTIFACT_INDEX),
};

const metadata = {
  kind: "recomparison-not-original-capture",
  comparer: {
    id: "visual-reference-comparer-v1",
    referenceCompareSha256: fileHash(COMPARE),
    legacyCompareSha256: fileHash(LEGACY_COMPARE),
    referencePackageLockSha256: fileHash(PACKAGE_LOCK),
    dependencies,
  },
  contractId: CONTRACT.id,
  contractSha256: fileHash(CONTRACT_FILE),
  inputs: inputHashes,
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
      canonical: metadata.canonical,
      strict: metadata.strict,
      comparer: metadata.comparer.referenceCompareSha256,
      contract: metadata.contractSha256,
      inputs: metadata.inputs,
    },
    null,
    2,
  ),
);
