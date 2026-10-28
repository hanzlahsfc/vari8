import fs from "node:fs";
import path from "node:path";
import { fileHash, installedDependencies } from "./reference.mjs";

const EXPECTED_TOOLS = Object.freeze({
  runner: "tools/parity/run.mjs",
  comparer: "tools/parity/reference/compare.mjs",
  legacyComparer: "tools/parity/compare.mjs",
  validator: "tools/parity/reference/combined-run.mjs",
  contract: "tools/parity/reference/contract.json",
  comparerManifest: "tools/parity/reference/evidence/comparer.json",
});

export function assertRecordedTooling({ root, receipt, adapterFile }) {
  for (const [key, file] of Object.entries(EXPECTED_TOOLS))
    if (receipt.tooling?.[key] !== fileHash(path.join(root, file)))
      throw new Error(`recorded ${key} hash differs`);
  if (
    receipt.tooling?.locks?.root !==
      fileHash(path.join(root, "package-lock.json")) ||
    receipt.tooling?.locks?.reference !==
      fileHash(path.join(root, "tools/parity/reference/package-lock.json"))
  )
    throw new Error("recorded lock hash differs");
  const files = receipt.tooling?.files ?? {};
  if (Object.keys(files).length < 15)
    throw new Error("receipt lacks the complete tool/input pin set");
  for (const [file, sha] of Object.entries(files))
    if (fileHash(path.join(root, file)) !== sha)
      throw new Error(`recorded tool/input pin differs: ${file}`);
  const adapter = fs.readFileSync(adapterFile, "utf8");
  if (
    receipt.tooling?.adapter?.adapterSha256 !== fileHash(adapterFile) ||
    !adapter.includes("while (!existsSync(") ||
    adapter.includes(root)
  )
    throw new Error("packaged adapter is not the recorded portable adapter");
  if (
    JSON.stringify(receipt.commands ?? []).includes(root) ||
    receipt.commands?.[0]?.cwd !== "." ||
    receipt.commands?.[0]?.argv?.[1] !== "tools/parity/run.mjs"
  )
    throw new Error("execution command is not checkout-relative");
}

export function assertRecordedDependencies(root, receipt) {
  const dependencies = installedDependencies(root);
  for (const key of ["lockSha256", "installedLockSha256"])
    if (receipt.dependencies?.[key] !== dependencies[key])
      throw new Error(`recorded dependency pin differs: ${key}`);
  if (dependencies.mismatches.length)
    throw new Error("installed dependencies do not match lockfile");
}
