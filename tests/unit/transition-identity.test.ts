import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  writeSync,
  openSync,
  readFileSync,
  writeFileSync as wf,
} from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  verifyDelta,
  verifyOverlay,
  verifyPackage,
} from "../../icm/05-build/tools/transition/identity.mjs";

const g = (repo: string, ...a: string[]) =>
  execFileSync("git", ["-C", repo, ...a], { encoding: "utf8" });

function fixture() {
  const r = mkdtempSync(path.join(os.tmpdir(), "idfx-"));
  g(r, "init", "-q", "-b", "main");
  g(r, "-C", ".", "config", "user.email", "t@t");
  g(r, "config", "user.email", "t@t");
  g(r, "config", "user.name", "t");
  mkdirSync(path.join(r, "app"), { recursive: true });
  writeFileSync(path.join(r, "app/x.ts"), "x");
  mkdirSync(path.join(r, "tools/parity"), { recursive: true });
  writeFileSync(path.join(r, "tools/parity/run.mjs"), "run");
  g(r, "add", "-A");
  g(r, "commit", "-qm", "base");
  return r;
}

function graft(r: string, extra: Record<string, string> = {}) {
  writeFileSync(path.join(r, "tools/parity/new-tool.mjs"), "tool");
  for (const [p, c] of Object.entries(extra)) {
    mkdirSync(path.join(r, path.dirname(p)), { recursive: true });
    writeFileSync(path.join(r, p), c);
  }
  g(r, "add", "-A");
  g(r, "commit", "-qm", "overlay");
  return g(r, "rev-parse", "HEAD").trim();
}

const BUNDLE_TREE = (r: string) =>
  g(r, "rev-parse", "HEAD:tools/parity").trim();

describe("separated identity model", () => {
  it("positive: valid overlay passes (bundle subtree + zero non-overlay diff)", () => {
    const r = fixture();
    const ov = graft(r);
    const res = verifyOverlay(r, ov, BUNDLE_TREE(r));
    expect(res.subtree).toMatch(/^[0-9a-f]{40}$/);
  });

  it("positive: bare capture has valid zero-delta", () => {
    const r = fixture();
    const cap = g(r, "rev-parse", "HEAD").trim();
    expect(verifyDelta(r, cap, [])).toEqual([]);
  });

  it("positive: descendant with only doc/receipt changes records exact delta", () => {
    const r = fixture();
    const cap = g(r, "rev-parse", "HEAD").trim();
    mkdirSync(path.join(r, "evidence"), { recursive: true });
    writeFileSync(path.join(r, "evidence/receipt.json"), "{}");
    g(r, "add", "-A");
    g(r, "commit", "-qm", "receipts");
    expect(verifyDelta(r, cap, ["evidence/receipt.json"])).toEqual([
      "evidence/receipt.json",
    ]);
  });

  it("negative: hidden non-overlay product change refuses", () => {
    const r = fixture();
    const ov = graft(r, { "app/x.ts": "tampered" });
    expect(() => verifyOverlay(r, ov, BUNDLE_TREE(r))).toThrow(
      /non-tools\/parity/,
    );
  });

  it("negative: wrong bundle tree sha refuses", () => {
    const r = fixture();
    const ov = graft(r);
    expect(() => verifyOverlay(r, ov, "0".repeat(40))).toThrow(/bundle/);
  });

  it("negative: package with unindexed file refuses", () => {
    const d = mkdtempSync(path.join(os.tmpdir(), "pkg-"));
    mkdirSync(path.join(d, "receipts"), { recursive: true });
    writeFileSync(path.join(d, "receipts/a.json"), "{}");
    writeFileSync(
      path.join(d, "artifact-index.json"),
      JSON.stringify({ artifacts: [] }),
    );
    writeFileSync(path.join(d, "stray.bin"), "x");
    expect(() => verifyPackage(d)).toThrow(/unindexed/);
  });

  it("negative: index entry missing on disk refuses", () => {
    const d = mkdtempSync(path.join(os.tmpdir(), "pkg2-"));
    writeFileSync(
      path.join(d, "artifact-index.json"),
      JSON.stringify({
        artifacts: [{ path: "gone.json", sha256: "0".repeat(64) }],
      }),
    );
    expect(() => verifyPackage(d)).toThrow(/missing/);
  });

  it("negative: forged delta paths refuse", () => {
    const r = fixture();
    const cap = g(r, "rev-parse", "HEAD").trim();
    writeFileSync(path.join(r, "sneaky.ts"), "x");
    g(r, "add", "-A");
    g(r, "commit", "-qm", "sneak");
    expect(() => verifyDelta(r, cap, ["evidence/receipt.json"])).toThrow(
      /delta mismatch/,
    );
  });
});
