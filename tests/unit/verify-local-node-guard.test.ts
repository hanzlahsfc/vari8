/**
 * Committed regressions for the verify-local.sh Node floor guard (O18).
 * Runs the REAL script in a scratch clean git lane with a stubbed `node`
 * binary, so the guard sees controlled `node --version` output.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const REPO = path.resolve(__dirname, "..", "..");
const SCRIPT = "icm/05-build/tools/verify-local.sh";

const lanes: string[] = [];

function makeLane() {
  const dir = mkdtempSync(path.join(tmpdir(), "vlg-"));
  lanes.push(dir);
  const tools = path.join(dir, "icm/05-build/tools");
  mkdirSync(tools, { recursive: true });
  copyFileSync(path.join(REPO, SCRIPT), path.join(tools, "verify-local.sh"));
  copyFileSync(
    path.join(REPO, "icm/05-build/tools/paths.sh"),
    path.join(tools, "paths.sh"),
  );
  copyFileSync(
    path.join(REPO, "icm/05-build/program-config.json"),
    path.join(dir, "icm/05-build/program-config.json"),
  );
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@test",
      "commit",
      "-qm",
      "init",
    ],
    { cwd: dir },
  );
  const base = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: dir,
    encoding: "utf8",
  }).trim();
  return { dir, base };
}

function stubBin(dir: string, version: string) {
  // Every infrastructure-capable command the script can reach is replaced by a
  // marker stub that never delegates to the real binary: `docker` would
  // drop/create the lane database, `npm`/`npx` would install and run real
  // toolchain steps — the guard contract under test is earlier than any of
  // them. The marker text proves interception in captured output.
  const bin = path.join(dir, "stubbin");
  mkdirSync(bin, { recursive: true });
  const nodePath = path.join(bin, "node");
  writeFileSync(nodePath, `#!/bin/sh\necho '${version}'\n`);
  chmodSync(nodePath, 0o755);
  for (const name of ["docker", "npm", "npx"]) {
    const stub = path.join(bin, name);
    writeFileSync(stub, `#!/bin/sh\necho 'STUB ${name}' \"$@\"\n`);
    chmodSync(stub, 0o755);
  }
  return bin;
}

function runGuard(version: string, extraEnv: Record<string, string> = {}) {
  const { dir, base } = makeLane();
  const bin = stubBin(dir, version);
  const result = spawnSync("bash", [SCRIPT], {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      BASE_SHA: base,
      LANE_DB: "app_vlgtest",
      POSTGRES_PASSWORD: "dummy",
      VARI8_WORKTREES: path.join(dir, "wt"),
      ...extraEnv,
    },
  });
  return `${result.stdout}\n${result.stderr}`;
}

afterAll(() => {
  for (const d of lanes) rmSync(d, { recursive: true, force: true });
});

describe("verify-local Node floor guard (26.12.1, O18)", () => {
  it("refuses a version below the floor under REQUIRE_NODE26=1", () => {
    const out = runGuard("v26.12.0", { REQUIRE_NODE26: "1" });
    expect(out).toMatch(
      /FAIL node: target 26\.12\.1 or newer \(O18\), running v26\.12\.0/,
    );
  });

  it.each(["v26.12.1", "v26.13.0"])(
    "accepts %s (at/above the floor) under REQUIRE_NODE26=1",
    (version) => {
      const out = runGuard(version, { REQUIRE_NODE26: "1" });
      expect(out).not.toMatch(/FAIL node/);
      expect(out).not.toMatch(/WARN node/);
    },
  );

  it.each(["v26.12", "v26.12.1-rc.1", "vgarbage"])(
    "rejects malformed/incomplete/prerelease %s under REQUIRE_NODE26=1",
    (version) => {
      const out = runGuard(version, { REQUIRE_NODE26: "1" });
      expect(out).toMatch(/FAIL node: malformed Node version/);
      expect(out).toContain(version.replace(/^v?/, "v"));
    },
  );

  it("keeps the optional-mode contract: malformed input warns and continues", () => {
    // Optional mode never hard-fails on the node check: the WARN lands in the
    // deferred SUMMARY (printed at finish). With infrastructure stubbed the
    // lane continues deterministically to finish — the stub markers prove the
    // script reached (and was stopped at) the stubbed boundary, not a host.
    const out = runGuard("vgarbage");
    expect(out).not.toMatch(/FAIL node/);
    expect(out).toMatch(/WARN node: target 26\.12\.1/);
    expect(out).toMatch(/== schema guard/);
    expect(out).toMatch(/STUB docker exec vari8-db-1 createdb -U app/);
    expect(out).toContain("VERIFY-LOCAL PASS");
  });

  it("keeps the optional-mode contract: below-floor warns and continues", () => {
    const out = runGuard("v26.12.0");
    expect(out).not.toMatch(/FAIL node/);
    expect(out).toMatch(/WARN node: target 26\.12\.1/);
    expect(out).toMatch(/== schema guard/);
    expect(out).toMatch(/STUB docker exec vari8-db-1 createdb -U app/);
    expect(out).toContain("VERIFY-LOCAL PASS");
  });

  it("keeps the REQUIRE_NODE24 migration error", () => {
    const out = runGuard("v26.12.1", { REQUIRE_NODE24: "1" });
    expect(out).toMatch(/FAIL node: REQUIRE_NODE24 is retired/);
    expect(out).toMatch(/use REQUIRE_NODE26=1/);
  });
});
