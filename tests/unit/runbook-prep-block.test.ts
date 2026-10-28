// Executes the literal preparation block from the committed runbook inside a
// disposable Git fixture — proves real merge semantics, not an approximation.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RUNBOOK = readFileSync(
  path.join(
    process.cwd(),
    "icm/05-build/tools/transition/RUNBOOK-p203-p207.md",
  ),
  "utf8",
);

function extractBlock(): string {
  // the literal worktree/merge commands inside the runbook's prep fence
  const start = RUNBOOK.indexOf("git worktree add");
  const end = RUNBOOK.indexOf("# #203 changes present");
  const block = RUNBOOK.slice(start, RUNBOOK.indexOf("\n", end));
  expect(block).toContain('worktree add "$WT" --detach "$HEADSHA"');
  expect(block).toContain(
    'merge -q --no-ff --no-edit -m "test merge transition p203" "$BASETIP"',
  );
  return block;
}

function scratch() {
  const r = mkdtempSync(path.join(os.tmpdir(), "rb-"));
  const g = (...a: string[]) =>
    execFileSync("git", ["-C", r, ...a], { encoding: "utf8" });
  g("init", "-q", "-b", "Vari8-Beta");
  g("config", "user.email", "t@t");
  g("config", "user.name", "t");
  writeFileSync(path.join(r, "base.txt"), "base\n");
  g("add", "-A");
  g("commit", "-qm", "base");
  g("checkout", "-qb", "beta/parity-https");
  writeFileSync(path.join(r, "feature.txt"), "p203 change\n");
  g("add", "-A");
  g("commit", "-qm", "feature");
  const HEADSHA = g("rev-parse", "HEAD").trim();
  g("checkout", "-q", "Vari8-Beta");
  writeFileSync(path.join(r, "base2.txt"), "base moved\n");
  g("add", "-A");
  g("commit", "-qm", "base advance");
  return { r, HEADSHA };
}

const env = (r: string, HEADSHA: string) => ({
  ...process.env,
  REPO: "fixture",
  HEADSHA,
  BASE: "Vari8-Beta",
  WT: path.join(r, "wt"),
  HEAD: HEADSHA,
});

describe("literal runbook preparation block", () => {
  it("merges HEAD into base correctly — both ancestors, feature present", () => {
    const { r, HEADSHA } = scratch();
    const block = extractBlock();
    const script =
      `set -euo pipefail
cd "${r}"
export HEADSHA BASE WT
` +
      block
        .replaceAll('git -C "$WT" fetch -q origin', "true")
        .replaceAll('"origin/$BASE"', '"Vari8-Beta"')
        .replaceAll('git -C "$WT"', `git -C "${r}/wt"`)
        .replaceAll("gh pr view", ":");
    const res = spawnSync("bash", ["-c", script], {
      env: env(r, HEADSHA),
      encoding: "utf8",
    });
    expect(res.status).toBe(0);
    const wt = path.join(r, "wt");
    const tree = execFileSync("git", ["-C", wt, "rev-parse", "HEAD^{tree}"], {
      encoding: "utf8",
    }).trim();
    expect(tree).toMatch(/^[0-9a-f]{40}$/);
    // the merge produced a distinct tree — not the feature commit's own
    const featureTree = execFileSync(
      "git",
      ["-C", wt, "rev-parse", `${HEADSHA}^{tree}`],
      { encoding: "utf8" },
    ).trim();
    expect(tree).not.toBe(featureTree);
    expect(
      execFileSync("git", ["-C", wt, "cat-file", "-e", "HEAD:feature.txt"], {
        encoding: "utf8",
      }),
    ).toBeDefined();
    // both inputs are ancestors
    execFileSync("git", [
      "-C",
      wt,
      "merge-base",
      "--is-ancestor",
      HEADSHA,
      "HEAD",
    ]);
    const base = execFileSync("git", ["-C", r, "rev-parse", "Vari8-Beta"], {
      encoding: "utf8",
    }).trim();
    execFileSync("git", [
      "-C",
      wt,
      "merge-base",
      "--is-ancestor",
      base,
      "HEAD",
    ]);
  });

  it("base-into-base command fails the fixture", () => {
    const { r, HEADSHA } = scratch();
    // wrong form: checkout base, merge base — feature never arrives
    const script = `set -euo pipefail
WT=/tmp/rb-wrong-$$; git worktree add "$WT" --detach Vari8-Beta
cd "$WT"; git merge -q --no-ff --no-edit -m wrong Vari8-Beta
git merge-base --is-ancestor "${HEADSHA}" HEAD`;
    const res = spawnSync("bash", ["-c", script], {
      cwd: r,
      encoding: "utf8",
    });
    expect(res.status).not.toBe(0);
  });
});
