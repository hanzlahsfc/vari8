import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");
export const fileHash = (p) => sha256(fs.readFileSync(p));

export const RECEIPT_VERSION = 2;
export const COMPARER_ID = "visual-reference-comparer-v2";
export const COMPARER_PATH = "tools/parity/reference/evidence/comparer.json";
export const SHOTS_PATH = "icm/04-briefing/shots/index.json";

// This is the reviewed execution closure. The comparer manifest pins every
// path below; the receipt metadata pins the manifest itself.
export const COMPONENT_PATHS = Object.freeze({
  reference: "tools/parity/reference/reference.mjs",
  referenceCompare: "tools/parity/reference/compare.mjs",
  legacyCompare: "tools/parity/compare.mjs",
  capture: "tools/parity/capture.mjs",
  captureMetadata: "tools/parity/reference/capture-metadata.mjs",
  recompare: "tools/parity/reference/evidence/recompare.mjs",
  verifyEvidence: "tools/parity/reference/evidence/verify-evidence.mjs",
  evidenceLib: "tools/parity/reference/evidence/evidence-lib.mjs",
});

export const LOCK_PATHS = Object.freeze({
  root: "package-lock.json",
  reference: "tools/parity/reference/package-lock.json",
});

export const CONTRACT_PATH = "tools/parity/reference/contract.json";

export const COMPARER_COMMANDS = Object.freeze([
  "node tools/parity/reference/evidence/verify-evidence.mjs",
  "node tools/parity/reference/evidence/recompare.mjs",
]);

export const APPROVED_ALLOWANCE_RULES = Object.freeze({
  "S11-03": "S11-03 sign-out in the preferences dialog",
  D18: "D18 real role in the account block",
  "S11-04": "S11-04 real workspace name in the shell label (O15)",
  "S03-18": "S03-18 real video feedback copy and width (Prompt 417)",
});

const SHA256 = /^[a-f0-9]{64}$/;
const plain = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function exactKeys(value, expected, label) {
  if (!plain(value)) throw new Error(`${label} is missing or malformed`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  const missing = wanted.filter((key) => !actual.includes(key));
  const unknown = actual.filter((key) => !wanted.includes(key));
  if (missing.length)
    throw new Error(`${label} missing fields: ${missing.join(",")}`);
  if (unknown.length)
    throw new Error(`${label} unknown fields: ${unknown.join(",")}`);
}

function assertHash(value, label) {
  if (typeof value !== "string" || !SHA256.test(value))
    throw new Error(`${label} is not a SHA-256`);
}

export function assertComparerManifest(manifest) {
  exactKeys(
    manifest,
    [
      "id",
      "receiptVersion",
      "hashPolicy",
      "components",
      "locks",
      "dependencies",
      "contract",
      "commands",
    ],
    "comparer manifest",
  );
  if (manifest.id !== COMPARER_ID)
    throw new Error(`comparer manifest id differs: ${manifest.id}`);
  if (manifest.receiptVersion !== RECEIPT_VERSION)
    throw new Error(
      `comparer manifest receiptVersion differs: ${manifest.receiptVersion}`,
    );
  exactKeys(
    manifest.hashPolicy,
    ["included", "excluded", "note"],
    "hashPolicy",
  );
  for (const field of ["included", "excluded"])
    if (
      !Array.isArray(manifest.hashPolicy[field]) ||
      manifest.hashPolicy[field].some((v) => typeof v !== "string")
    )
      throw new Error(`hashPolicy ${field} is malformed`);
  if (typeof manifest.hashPolicy.note !== "string" || !manifest.hashPolicy.note)
    throw new Error("hashPolicy note is missing");

  exactKeys(
    manifest.components,
    Object.keys(COMPONENT_PATHS),
    "comparer components",
  );
  for (const [name, relative] of Object.entries(COMPONENT_PATHS)) {
    const component = manifest.components[name];
    exactKeys(component, ["path", "sha256"], `component ${name}`);
    if (component.path !== relative)
      throw new Error(`component ${name} path differs`);
    assertHash(component.sha256, `component ${name} hash`);
  }

  exactKeys(manifest.locks, Object.keys(LOCK_PATHS), "comparer locks");
  for (const [name, relative] of Object.entries(LOCK_PATHS)) {
    const lock = manifest.locks[name];
    exactKeys(lock, ["path", "sha256"], `lock ${name}`);
    if (lock.path !== relative) throw new Error(`lock ${name} path differs`);
    assertHash(lock.sha256, `lock ${name} hash`);
  }

  exactKeys(
    manifest.dependencies,
    ["root", "reference"],
    "comparer dependencies",
  );
  const dependencyKeys = {
    root: ["@playwright/test"],
    reference: ["pixelmatch", "pngjs"],
  };
  for (const [group, names] of Object.entries(dependencyKeys)) {
    exactKeys(manifest.dependencies[group], names, `dependency group ${group}`);
    for (const name of names) {
      const pin = manifest.dependencies[group][name];
      exactKeys(pin, ["version", "integrity"], `dependency ${group}/${name}`);
      if (typeof pin.version !== "string" || !pin.version)
        throw new Error(`dependency ${group}/${name} version is missing`);
      if (
        typeof pin.integrity !== "string" ||
        !pin.integrity.startsWith("sha512-")
      )
        throw new Error(`dependency ${group}/${name} integrity is missing`);
    }
  }

  exactKeys(manifest.contract, ["path", "sha256"], "comparer contract");
  if (manifest.contract.path !== CONTRACT_PATH)
    throw new Error("comparer contract path differs");
  assertHash(manifest.contract.sha256, "comparer contract hash");

  if (
    !Array.isArray(manifest.commands) ||
    !isDeepStrictEqual(manifest.commands, COMPARER_COMMANDS)
  )
    throw new Error("comparer commands differ");
  return true;
}

export function verifyComponentPins(root, components) {
  for (const [name, pin] of Object.entries(components)) {
    const file = path.resolve(root, pin.path);
    if (!file.startsWith(path.resolve(root) + path.sep))
      throw new Error(`component ${name} path escapes repository`);
    if (!fs.existsSync(file))
      throw new Error(`component ${name} is missing: ${pin.path}`);
    if (fileHash(file) !== pin.sha256)
      throw new Error(`component ${name} hash differs: ${pin.path}`);
  }
  return true;
}

export function verifyPinnedToolchain(root, manifest) {
  assertComparerManifest(manifest);
  verifyComponentPins(root, manifest.components);
  for (const [name, pin] of Object.entries(manifest.locks)) {
    const file = path.resolve(root, pin.path);
    if (fileHash(file) !== pin.sha256)
      throw new Error(`lock ${name} hash differs: ${pin.path}`);
  }
  const contract = path.resolve(root, manifest.contract.path);
  if (fileHash(contract) !== manifest.contract.sha256)
    throw new Error(`contract hash differs: ${manifest.contract.path}`);
  for (const [group, names] of Object.entries(manifest.dependencies)) {
    const lock = JSON.parse(
      fs.readFileSync(path.resolve(root, manifest.locks[group].path), "utf8"),
    );
    for (const [name, pin] of Object.entries(names)) {
      const entry = lock.packages[`node_modules/${name}`];
      if (!entry) throw new Error(`dependency ${group}/${name} is not pinned`);
      if (entry.version !== pin.version || entry.integrity !== pin.integrity)
        throw new Error(`dependency ${group}/${name} pin differs`);
    }
  }
  return true;
}

export function assertReceiptToolchain(metadata, manifest, manifestSha256) {
  if (metadata.receiptVersion !== RECEIPT_VERSION)
    throw new Error(`receipt version differs: ${metadata.receiptVersion}`);
  exactKeys(
    metadata.toolchain,
    ["id", "manifest", "components", "locks", "dependencies", "contract"],
    "receipt toolchain",
  );
  if (metadata.toolchain.id !== manifest.id)
    throw new Error("receipt toolchain id differs");
  exactKeys(
    metadata.toolchain.manifest,
    ["path", "sha256"],
    "receipt toolchain manifest",
  );
  if (metadata.toolchain.manifest.path !== COMPARER_PATH)
    throw new Error("receipt comparer path differs");
  if (metadata.toolchain.manifest.sha256 !== manifestSha256)
    throw new Error("receipt comparer manifest hash differs");
  exactKeys(
    metadata.toolchain.components,
    Object.keys(manifest.components),
    "receipt components",
  );
  exactKeys(
    metadata.toolchain.locks,
    Object.keys(manifest.locks),
    "receipt locks",
  );
  exactKeys(
    metadata.toolchain.dependencies,
    Object.keys(manifest.dependencies),
    "receipt dependency groups",
  );
  for (const field of ["components", "locks", "dependencies", "contract"])
    if (!isDeepStrictEqual(metadata.toolchain[field], manifest[field]))
      throw new Error(`receipt toolchain ${field} differs from comparer pins`);
  return true;
}

export function verifyAllowanceRules(allowances, rules) {
  if (!Array.isArray(allowances) || allowances.length === 0)
    throw new Error("contract allowance set is empty or malformed");
  if (!Array.isArray(rules) || rules.length !== allowances.length)
    throw new Error("comparer allowance rules differ from contract");
  const seen = new Set();
  for (const rule of rules) {
    const id =
      typeof rule?.rule === "string" ? rule.rule.split(" ")[0] : "<invalid>";
    if (!Object.prototype.hasOwnProperty.call(APPROVED_ALLOWANCE_RULES, id))
      throw new Error(`unknown comparer allowance: ${id}`);
    if (!allowances.includes(id))
      throw new Error(`comparer allowance not in contract: ${id}`);
    if (seen.has(id)) throw new Error(`duplicate comparer allowance: ${id}`);
    if (rule.rule !== APPROVED_ALLOWANCE_RULES[id])
      throw new Error(`comparer allowance content differs: ${id}`);
    seen.add(id);
  }
  for (const id of allowances) {
    if (!seen.has(id)) throw new Error(`missing comparer allowance: ${id}`);
    if (
      typeof id !== "string" ||
      !Object.prototype.hasOwnProperty.call(APPROVED_ALLOWANCE_RULES, id)
    )
      throw new Error(`unknown contract allowance: ${id}`);
  }
  return true;
}

export function walkFiles(root, current = root, result = []) {
  for (const entry of fs
    .readdirSync(current, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(current, entry.name);
    if (entry.isDirectory()) walkFiles(root, file, result);
    else if (entry.isFile()) result.push(path.relative(root, file));
  }
  return result;
}

/**
 * @param {string} root
 * @param {{path: string, sha256: string}[]} entries
 * @param {{exactRoots?: string[]}} [options]
 */
export function verifyArtifactIndex(root, entries, { exactRoots = [] } = {}) {
  if (!Array.isArray(entries) || entries.length === 0)
    throw new Error("artifact index is empty or malformed");
  const base = path.resolve(root);
  const indexed = new Set();
  for (const entry of entries) {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      typeof entry.sha256 !== "string"
    )
      throw new Error("artifact index entry is malformed");
    if (indexed.has(entry.path))
      throw new Error(`duplicate artifact index entry: ${entry.path}`);
    indexed.add(entry.path);
    const file = path.resolve(base, entry.path);
    if (!file.startsWith(base + path.sep))
      throw new Error(`artifact path escapes evidence root: ${entry.path}`);
    if (!fs.existsSync(file))
      throw new Error(`missing artifact: ${entry.path}`);
    const actual = fileHash(file);
    if (actual !== entry.sha256)
      throw new Error(`tampered artifact: ${entry.path}`);
  }
  for (const dir of exactRoots) {
    const directory = path.resolve(base, dir);
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory())
      throw new Error(`artifact root is missing: ${dir}`);
    for (const relative of walkFiles(directory)) {
      const indexedPath = path.relative(base, path.join(directory, relative));
      if (!indexed.has(indexedPath))
        throw new Error(`unindexed artifact: ${indexedPath}`);
    }
  }
  return entries.length;
}
