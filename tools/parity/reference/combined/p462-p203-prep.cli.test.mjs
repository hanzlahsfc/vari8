// CLI-level tests for verify-combined.mjs against the p462 package.
// Runs standalone: node tools/parity/reference/combined/p462-p203-prep.cli.test.mjs
// Lives under reference/combined/ (material-excluded) so committing it does NOT
// change the material identity the package verifies against.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
const VERIFIER = path.join(ROOT, "tools/parity/reference/verify-combined.mjs");
const PKG = path.join(ROOT, "tools/parity/reference/combined/p462-p203-prep");
const CAP_SHA = "e8c7a74a626539d48ed79fc270fc5468c0b4f937";

let pass = 0, fail = 0;
const check = (name, ok, info = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " — " + info}`);
};

const cli = (pkg) =>
  spawnSync(process.execPath, [VERIFIER, "--package", pkg], {
    cwd: ROOT, encoding: "utf8", timeout: 180_000,
  });

function variant(mutate, rehash = true) {
  const d = mkdtempSync(path.join(os.tmpdir(), "v462-"));
  cpSync(PKG, d, { recursive: true });
  mutate(d);
  if (rehash) {
    // keep artifact-index consistent for mutated receipt files
    const idx = JSON.parse(readFileSync(path.join(d, "artifact-index.json"), "utf8"));
    for (const e of idx.artifacts ?? [])
      e.sha256 = existsSync(path.join(d, e.path))
        ? createHash("sha256").update(readFileSync(path.join(d, e.path))).digest("hex")
        : e.sha256;
    writeFileSync(path.join(d, "artifact-index.json"), JSON.stringify(idx, null, 2) + "\n");
  }
  return d;
}

// positive: real exit 0
{
  const r = cli(PKG);
  const j = r.status === 0 ? JSON.parse(r.stdout.trim().split("\n").pop()) : {};
  check("positive verified:true 70/70+68/70", r.status === 0 && j.verified === true
    && j.canonical?.passed === 70 && j.strict?.passed === 68 && j.captureSource?.sha === CAP_SHA,
    `exit ${r.status} ${r.stderr.slice(0, 200)}`);
}
// negatives: mutate the passing package, assert refusal at intended stage
{
  const r = cli(variant((d) => {
    const cp = path.join(d, "receipts/source-compatibility.json");
    const c = JSON.parse(readFileSync(cp, "utf8"));
    c.postCapturePaths = ["forged/evidence.json"];
    writeFileSync(cp, JSON.stringify(c, null, 2) + "\n");
  }));
  check("forged postCapturePaths refused", r.status !== 0 && /post-capture delta/i.test(r.stderr + r.stdout), r.stderr.slice(0, 150));
}
{
  const r = cli(variant((d) => {
    const cp = path.join(d, "receipts/source-compatibility.json");
    const c = JSON.parse(readFileSync(cp, "utf8"));
    c.capture.sha = "0".repeat(40);
    writeFileSync(cp, JSON.stringify(c, null, 2) + "\n");
  }));
  check("wrong capture sha refused", r.status !== 0 && /mismatch|delta|commit/i.test(r.stderr + r.stdout), r.stderr.slice(0, 150));
}
{
  // dirty a real tracked material file in the current checkout
  const mf = path.join(ROOT, "package.json");
  cpSync(mf, mf + ".bak462");
  writeFileSync(mf, readFileSync(mf, "utf8") + " ");
  const r = cli(PKG);
  if (existsSync(mf + ".bak462")) execFileSync("mv", [mf + ".bak462", mf]);
  check("changed material refused", r.status !== 0 && /material|dirty/i.test(r.stderr + r.stdout), `exit ${r.status} ` + r.stderr.slice(0, 150));
}
{
  const r = cli(variant((d) => {
    // tamper an indexed non-JSON artifact; no index re-hash → hash mismatch
    const p = path.join(d, "current/390/s01-roster.png");
    writeFileSync(p, readFileSync(p, "utf8") + " ");
  }, false));
  check("tampered artifact refused", r.status !== 0 && /tampered artifact/i.test(r.stderr + r.stdout), r.stderr.slice(0, 150));
}
{
  const r = cli(variant((d) => rmSync(path.join(d, "receipts/canonical.json"))));
  check("missing artifact refused", r.status !== 0 && /missing|tampered|ENOENT/i.test(r.stderr + r.stdout), r.stderr.slice(0, 150));
}
console.log(`${pass}/${pass + fail} CLI assertions pass`);
process.exit(fail ? 1 : 0);
