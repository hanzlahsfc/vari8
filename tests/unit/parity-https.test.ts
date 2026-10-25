import {
  execFileSync,
  spawn,
  spawnSync,
  type ChildProcess,
} from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { createLocalTlsProxy } from "../../tools/local-tls-proxy.mjs";
import {
  captureProblem,
  expectedCaptureMarker,
} from "../../tools/parity/capture.mjs";
import {
  assertCombinedRunPaths,
  canonicalizePath,
  prepareOwnedOutputDir,
} from "../../tools/parity/safe-paths.mjs";
import { assertRecordedTooling } from "../../tools/parity/reference/combined-pins.mjs";
import {
  createAdapter,
  fileHash,
} from "../../tools/parity/reference/reference.mjs";
import {
  assertCommitMatchesSource,
  assertCurrentMaterialInputs,
  assertPostCaptureDelta,
  materialTreeSha256,
} from "../../tools/parity/reference/source-identity.mjs";
import {
  browserCookies,
  httpsRequest,
  createOwnedProcessGroup,
  listenerPids,
  ownsPort,
  parityPortPair,
  registerOwnedProcess,
  stopOwnedProcessGroup,
  parityUrl,
  selectPortPair,
} from "../../tools/parity/local-https.mjs";

let proxy: Awaited<ReturnType<typeof createLocalTlsProxy>> | null = null;
let backend: http.Server | null = null;
let ownedChild: ChildProcess | null = null;

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = http.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = (probe.address() as AddressInfo).port;
      probe.close(() => resolve(port));
    });
  });

afterEach(async () => {
  await proxy?.close().catch(() => {});
  await new Promise<void>(
    (resolve) => backend?.close(() => resolve()) ?? resolve(),
  );
  if (ownedChild && ownedChild.exitCode === null)
    try {
      process.kill(-ownedChild.pid!, "SIGKILL");
    } catch {}
  proxy = null;
  backend = null;
  ownedChild = null;
});

describe("parity runner configuration", () => {
  const spawnParity = (env: Record<string, string | undefined>) =>
    spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../../tools/parity/run.mjs", import.meta.url))],
      { env: { ...process.env, ...env }, encoding: "utf8" },
    );
  const proposed = path.resolve("tools/parity/reference/proposed");
  const baseline = path.resolve("tools/parity/baseline");
  const candidate = path.resolve("tools/parity/reference/evidence/candidate");

  it("refuses to update a non-baseline reference directory", () => {
    const run = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("../../tools/parity/run.mjs", import.meta.url)),
        "--update-baseline",
      ],
      {
        env: {
          ...process.env,
          PARITY_COMPARER: "reference",
          PARITY_REFERENCE_DIR: "tools/parity/reference/proposed",
          PARITY_OUT_DIR: fs.mkdtempSync("/tmp/parity-out-"),
        },
        encoding: "utf8",
      },
    );
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("--update-baseline");
  });

  it("rejects empty or whitespace path values before output setup", () => {
    for (const out of ["", "   "]) {
      const run = spawnParity({
        PARITY_COMPARER: "reference",
        PARITY_REFERENCE_DIR: proposed,
        PARITY_OUT_DIR: out,
      });
      expect(run.status).toBe(2);
      expect(run.stderr).toContain("non-empty path");
    }
    expect(() => canonicalizePath("   ")).toThrow(/non-empty path/);
  });

  it("rejects protected equal, nested, ancestor and symlink output aliases", () => {
    const out = fs.mkdtempSync("/tmp/parity-protected-");
    const alias = path.join(out, "baseline-link");
    fs.symlinkSync(baseline, alias, "dir");
    for (const target of [
      baseline,
      path.join(baseline, "nested"),
      path.dirname(baseline),
      alias,
      proposed,
      path.join(candidate, "nested"),
    ]) {
      expect(() =>
        assertCombinedRunPaths({
          root: process.cwd(),
          referenceDir: proposed,
          outDir: target,
          update: false,
        }),
      ).toThrow(/overlaps|broad/);
    }
    expect(fs.existsSync(path.join(baseline, "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(proposed, "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(candidate, "manifest.json"))).toBe(true);

    const root = fs.mkdtempSync("/tmp/parity-root-");
    for (const dir of [
      "tools/parity/reference/proposed",
      "tools/parity/baseline",
      "tools/parity/reference/evidence/candidate",
    ])
      fs.mkdirSync(path.join(root, dir), { recursive: true });
    for (const dir of [
      "tools/parity/reference/proposed",
      "tools/parity/baseline",
      "tools/parity/reference/evidence/candidate",
    ])
      fs.writeFileSync(path.join(root, dir, "SENTINEL"), "protected");
    const nested = path.join(root, "tools/parity/reference/proposed/nested");
    const disposableAlias = path.join(root, "alias");
    fs.symlinkSync(
      path.join(root, "tools/parity/reference/proposed"),
      disposableAlias,
      "dir",
    );
    for (const target of [
      path.join(root, "tools/parity/reference/proposed"),
      nested,
      path.dirname(nested),
      disposableAlias,
      path.join(root, "tools/parity/baseline/nested"),
      path.join(root, "tools/parity/reference/evidence/candidate/nested"),
    ])
      expect(() =>
        assertCombinedRunPaths({
          root,
          referenceDir: path.join(root, "tools/parity/reference/proposed"),
          outDir: target,
          update: false,
        }),
      ).toThrow(/overlaps|broad/);
    for (const rel of [
      "tools/parity/reference/proposed/SENTINEL",
      "tools/parity/baseline/SENTINEL",
      "tools/parity/reference/evidence/candidate/SENTINEL",
    ])
      expect(fs.readFileSync(path.join(root, rel), "utf8")).toBe("protected");
  });

  it("marks an empty output directory and refuses an unowned populated one", () => {
    const fresh = path.join(fs.mkdtempSync("/tmp/parity-owned-"), "run");
    const prepared = prepareOwnedOutputDir(fresh);
    expect(fs.existsSync(prepared.ownerFile)).toBe(true);
    const foreign = fs.mkdtempSync("/tmp/parity-foreign-");
    fs.writeFileSync(path.join(foreign, "sentinel"), "keep");
    expect(() => prepareOwnedOutputDir(foreign)).toThrow(/not owned|non-empty/);
    expect(fs.readFileSync(path.join(foreign, "sentinel"), "utf8")).toBe(
      "keep",
    );
  });

  it("refuses unsupported modes and arbitrary capture modules before any run", () => {
    const out = fs.mkdtempSync("/tmp/parity-safe-");
    for (const env of [
      {
        PARITY_COMPARER: "bogus",
        PARITY_REFERENCE_DIR: proposed,
        PARITY_OUT_DIR: out,
      },
      {
        PARITY_CAPTURE_MODULE: "/tmp/fake.mjs",
        PARITY_COMPARER: "reference",
        PARITY_REFERENCE_DIR: proposed,
        PARITY_OUT_DIR: out,
      },
      { PARITY_REFERENCE_DIR: proposed, PARITY_OUT_DIR: out },
    ]) {
      const run = spawnParity(env);
      expect(run.status).toBe(2);
      expect(run.stderr).toMatch(
        /PARITY_(COMPARER|CAPTURE_MODULE|REFERENCE_DIR)/,
      );
    }
    expect(fs.readdirSync(out)).toEqual([]);
  });
});

describe("combined-run artifact validation", () => {
  it("rejects malformed reference manifests and fake 70-screen captures", async () => {
    const { assertProposedReference, validateCombinedRun } =
      await import("../../tools/parity/reference/combined-run.mjs");
    const { CONTRACT } =
      await import("../../tools/parity/reference/reference.mjs");
    const bad = fs.mkdtempSync("/tmp/parity-bad-reference-");
    fs.writeFileSync(path.join(bad, "manifest.json"), "not-json");
    fs.writeFileSync(path.join(bad, "provenance.json"), "{}");
    expect(() =>
      assertProposedReference({ directory: bad, shots: [] }),
    ).toThrow();

    const shots = JSON.parse(
      fs.readFileSync("icm/04-briefing/shots/index.json", "utf8"),
    ).shots;
    const screens = Array.from({ length: 70 }, (_, i) => ({ id: `fake-${i}` }));
    expect(() =>
      validateCombinedRun({
        directory: "/tmp/fake-combined-run",
        manifest: {
          fixedNow: CONTRACT.clock,
          timezone: CONTRACT.timezone,
          failures: [],
          screens,
        },
        shots,
        provenance: {
          role: "combined",
          contract: CONTRACT,
          inputs: { prep: { head: "0".repeat(40) } },
          source: {
            sha: "0".repeat(40),
            tree: "0".repeat(40),
            dirtyTracked: "",
            untracked: "",
            appLock: "0".repeat(64),
          },
          environment: {
            browser: { sha256: "0".repeat(64) },
            nodeSha256: "0".repeat(64),
          },
          dependencies: {
            installedTreeSha256: "0".repeat(64),
            mismatches: [],
          },
          adapter: { adapterSha256: "0".repeat(64) },
        },
      }),
    ).toThrow(/unexpected|missing capture artifact/);
  });
});

describe("combined-run source and pin enforcement", () => {
  it("generates byte-identical location-independent adapters", () => {
    const dir = fs.mkdtempSync("/tmp/parity-adapter-");
    const a = path.join(dir, "first/d32-capture-adapter.mjs");
    const b = path.join(dir, "second location/d32-capture-adapter.mjs");
    const first = createAdapter({ harnessRoot: process.cwd(), outputFile: a });
    const second = createAdapter({ harnessRoot: process.cwd(), outputFile: b });
    expect(first.adapterSha256).toBe(second.adapterSha256);
    expect(fs.readFileSync(a, "utf8")).toBe(fs.readFileSync(b, "utf8"));
    expect(fs.readFileSync(a, "utf8")).not.toContain(process.cwd());
    expect(fs.readFileSync(a, "utf8")).toContain("while (!existsSync(");
  });

  it("rejects comparer and receipt-hash tampering independent of artifact indexing", () => {
    const root = fs.mkdtempSync("/tmp/parity-pins-");
    const files = [
      "tools/parity/run.mjs",
      "tools/parity/capture.mjs",
      "tools/parity/capture-metadata.mjs",
      "tools/parity/safe-paths.mjs",
      "tools/parity/compare.mjs",
      "tools/parity/reference/reference.mjs",
      "tools/parity/reference/combined-run.mjs",
      "tools/parity/reference/combined-pins.mjs",
      "tools/parity/reference/compare.mjs",
      "tools/parity/reference/contract.json",
      "tools/parity/reference/environment.mjs",
      "tools/parity/reference/source-identity.mjs",
      "tools/parity/reference/package-combined.mjs",
      "tools/parity/reference/verify-combined.mjs",
      "package.json",
      "package-lock.json",
      "tools/parity/reference/package.json",
      "tools/parity/reference/package-lock.json",
      "icm/04-briefing/shots/index.json",
    ];
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), `${file}\n`);
    }
    const adapter = path.join(root, "adapter/d32-capture-adapter.mjs");
    fs.mkdirSync(path.dirname(adapter), { recursive: true });
    fs.writeFileSync(adapter, "while (!existsSync(\n");
    fs.mkdirSync(path.join(root, "tools/parity/reference/evidence"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, "tools/parity/reference/evidence/comparer.json"),
      "manifest\n",
    );
    const receipt = {
      tooling: {
        runner: fileHash(path.join(root, "tools/parity/run.mjs")),
        comparer: fileHash(
          path.join(root, "tools/parity/reference/compare.mjs"),
        ),
        legacyComparer: fileHash(path.join(root, "tools/parity/compare.mjs")),
        validator: fileHash(
          path.join(root, "tools/parity/reference/combined-run.mjs"),
        ),
        contract: fileHash(
          path.join(root, "tools/parity/reference/contract.json"),
        ),
        comparerManifest: fileHash(
          path.join(root, "tools/parity/reference/evidence/comparer.json"),
        ),
        locks: {
          root: fileHash(path.join(root, "package-lock.json")),
          reference: fileHash(
            path.join(root, "tools/parity/reference/package-lock.json"),
          ),
        },
        files: Object.fromEntries(
          files.map((file) => [file, fileHash(path.join(root, file))]),
        ),
        adapter: { adapterSha256: fileHash(adapter) },
      },
      commands: [{ cwd: ".", argv: ["node", "tools/parity/run.mjs"] }],
    };
    expect(() =>
      assertRecordedTooling({ root, receipt, adapterFile: adapter }),
    ).not.toThrow();

    fs.appendFileSync(
      path.join(root, "tools/parity/reference/compare.mjs"),
      "// no-op\n",
    );
    expect(() =>
      assertRecordedTooling({ root, receipt, adapterFile: adapter }),
    ).toThrow(
      /recorded tool\/input pin differs|recorded comparer hash differs/,
    );
    fs.writeFileSync(
      path.join(root, "tools/parity/reference/compare.mjs"),
      "tools/parity/reference/compare.mjs\n",
    );
    receipt.tooling.runner = "0".repeat(64);
    expect(() =>
      assertRecordedTooling({ root, receipt, adapterFile: adapter }),
    ).toThrow(/recorded runner hash differs/);
  });

  it("binds capture identity while allowing only explicitly recorded post-capture paths", () => {
    const root = fs.mkdtempSync("/tmp/parity-source-id-");
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "config", "user.name", "test"]);
    execFileSync("git", [
      "-C",
      root,
      "config",
      "user.email",
      "test@example.com",
    ]);
    fs.mkdirSync(path.join(root, "app"), { recursive: true });
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.writeFileSync(path.join(root, "app/a.txt"), "capture input\n");
    fs.writeFileSync(path.join(root, "docs/a.txt"), "before\n");
    git("add", ".");
    git("commit", "-qm", "capture");
    const source = {
      sha: git("rev-parse", "HEAD"),
      tree: git("rev-parse", "HEAD^{tree}"),
      materialTreeSha256: materialTreeSha256(root, "HEAD"),
    };
    fs.writeFileSync(path.join(root, "docs/a.txt"), "after\n");
    git("add", "docs/a.txt");
    git("commit", "-qm", "docs only");
    expect(() => assertCommitMatchesSource(root, source)).not.toThrow();
    expect(() => assertCurrentMaterialInputs(root, source)).not.toThrow();
    expect(() =>
      assertPostCaptureDelta(root, {
        capture: source,
        postCapturePaths: ["docs/a.txt"],
      }),
    ).not.toThrow();
    fs.writeFileSync(path.join(root, "app/a.txt"), "changed\n");
    git("add", "app/a.txt");
    git("commit", "-qm", "material");
    expect(() => assertCurrentMaterialInputs(root, source)).toThrow(
      /material inputs changed/,
    );
    expect(() =>
      assertPostCaptureDelta(root, {
        capture: source,
        postCapturePaths: ["docs/a.txt"],
      }),
    ).toThrow(/post-capture delta differs/);
    expect(() =>
      assertCommitMatchesSource(root, { ...source, tree: "0".repeat(40) }),
    ).toThrow(/source tree/);
  });
});

describe("local TLS proxy", () => {
  it("terminates loopback HTTPS and forwards to the backend", async () => {
    const backendPort = await freePort();
    backend = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(
        `${req.headers["x-forwarded-proto"]}:${req.headers.host}:${req.url}`,
      );
    });
    await new Promise<void>((resolve) =>
      backend!.listen(backendPort, "127.0.0.1", resolve),
    );

    const proxyPort = await freePort();
    proxy = await createLocalTlsProxy({
      port: proxyPort,
      target: `http://127.0.0.1:${backendPort}`,
    });

    const res = await httpsRequest(`${proxy.url}/coach?x=1`, {
      ca: proxy.cert,
    });
    expect(res.status).toBe(200);
    expect(res.body).toBe(`https:127.0.0.1:${proxyPort}:/coach?x=1`);
    expect(fs.existsSync(proxy.materialDir)).toBe(false);
  });

  it("refuses a non-loopback HTTP backend", async () => {
    await expect(
      createLocalTlsProxy({
        port: await freePort(),
        target: "http://example.com:8080",
      }),
    ).rejects.toThrow("http://127.0.0.1");
  });

  it("fails closed when the public port is taken before proxy startup", async () => {
    const port = await freePort();
    backend = http.createServer((_req, res) => res.end("occupant"));
    await new Promise<void>((resolve) =>
      backend!.listen(port, "127.0.0.1", resolve),
    );

    const backendPort = await freePort();
    await expect(
      createLocalTlsProxy({
        port,
        target: `http://127.0.0.1:${backendPort}`,
      }),
    ).rejects.toThrow();

    expect(listenerPids(port)).toEqual([String(process.pid)]);
  });
});

describe("task-owned process lifecycle", () => {
  it("terminates only the spawned listener and verifies the port is released", async () => {
    const port = await freePort();
    ownedChild = spawn(
      process.execPath,
      [
        "-e",
        `require("node:http").createServer((_q,r)=>r.end("ok")).listen(${port},"127.0.0.1",()=>setInterval(()=>{},1000))`,
      ],
      { detached: true, stdio: "ignore" },
    );
    const ownership = await createOwnedProcessGroup(ownedChild);
    for (let i = 0; i < 100 && !listenerPids(port).length; i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    expect(listenerPids(port)).toEqual([String(ownedChild.pid)]);

    await expect(
      stopOwnedProcessGroup(ownedChild, port, { ownership }),
    ).resolves.toEqual([]);
    expect(listenerPids(port)).toEqual([]);
    expect(ownedChild.exitCode ?? ownedChild.signalCode).not.toBeNull();
  });

  it("cleans a registered descendant listener after the group leader exits", async () => {
    const port = await freePort();
    const unrelatedPort = await freePort();
    backend = http.createServer((_req, res) => res.end("unrelated"));
    await new Promise<void>((resolve) =>
      backend!.listen(unrelatedPort, "127.0.0.1", resolve),
    );
    expect(listenerPids(unrelatedPort)).toEqual([String(process.pid)]);

    ownedChild = spawn(
      process.execPath,
      [
        "-e",
        `const {spawn}=require("node:child_process");const c=spawn(process.execPath,["-e","require('node:http').createServer((_q,r)=>r.end('ok')).listen(${port},'127.0.0.1',()=>setInterval(()=>{},1000))"],{stdio:"ignore"});c.unref();process.on("message",()=>process.exit(0));`,
      ],
      { detached: true, stdio: ["ignore", "ignore", "ignore", "ipc"] },
    );
    const ownership = await createOwnedProcessGroup(ownedChild);
    for (let i = 0; i < 100 && !listenerPids(port).length; i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    expect(listenerPids(port)).toHaveLength(1);
    expect(registerOwnedProcess(ownership, Number(listenerPids(port)[0]))).toBe(
      true,
    );
    ownedChild.send("exit");
    await new Promise<void>((resolve) => ownedChild!.once("exit", resolve));

    await expect(
      stopOwnedProcessGroup(ownedChild, port, { ownership }),
    ).resolves.toEqual([]);
    expect(listenerPids(port)).toEqual([]);
    expect(listenerPids(unrelatedPort)).toEqual([String(process.pid)]);
  });
});

describe("owned-process identity", () => {
  type Identity = {
    pid: number;
    ppid?: number;
    pgid: number;
    start: string;
    argv?: string;
  };
  const child = { pid: 500, exitCode: 0, signalCode: null };
  const leader = { pid: 500, pgid: 500, start: "leader" };
  const owner = { pid: 501, ppid: 500, pgid: 500, start: "start-1" };
  const ownership = { pgid: "500", processes: [leader] };
  const descendantOwnership = { pgid: "500", processes: [leader, owner] };

  const inspectorFor = (
    group: Array<Identity | null>,
    listeners: Array<Identity | null>,
  ) => ({
    group: () => group.map((entry) => (entry ? { ...entry } : null)),
    listeners: () => listeners.map((entry) => (entry ? { ...entry } : null)),
    process: (pid: number) => {
      const found = [...group, ...listeners].find(
        (entry) => entry?.pid === pid,
      );
      return found ? { ...found } : null;
    },
  });

  it("requires listener PGID as well as matching PID and start identity", () => {
    expect(
      ownsPort(40000, ownership, {
        inspector: inspectorFor([leader], [leader]),
      }),
    ).toBe(true);
    expect(
      ownsPort(40000, ownership, {
        inspector: inspectorFor([], [{ ...leader, pgid: 999 }]),
      }),
    ).toBe(false);
  });

  it("returns an explicit problem when ownership is unavailable", async () => {
    const sent: [number, string][] = [];
    const problems = await stopOwnedProcessGroup(child, 40000, {
      signal: (pid: number, name: string) => sent.push([pid, name]),
    });
    expect(sent).toEqual([]);
    expect(problems).toEqual([
      "process ownership is unavailable; cleanup refused",
    ]);
  });

  it("never signals a same-PGID argv-only or unverified process", async () => {
    const group = [
      {
        pid: 700,
        pgid: 500,
        start: "s1",
        argv: "PARITY_OWNERSHIP_TOKEN=tok",
      },
    ];
    const listeners = [
      {
        pid: 200,
        pgid: 500,
        start: "s1",
        argv: "PARITY_OWNERSHIP_TOKEN=tok",
      },
    ];
    const sent: [number, string][] = [];
    const problems = await stopOwnedProcessGroup(child, 40000, {
      ownership,
      inspector: inspectorFor(group, listeners),
      signal: (pid: number, name: string) => sent.push([pid, name]),
      terminateMs: 0,
      killMs: 0,
    });
    expect(sent).toEqual([]);
    expect(problems.join(" ")).toContain("unverified");
    expect(problems.join(" ")).toContain("listener 40000");
  });

  it("fails closed on malformed inspection records", async () => {
    const sent: [number, string][] = [];
    const problems = await stopOwnedProcessGroup(child, 40000, {
      ownership,
      inspector: inspectorFor([null], [null]),
      signal: (pid: number, name: string) => sent.push([pid, name]),
      terminateMs: 0,
      killMs: 0,
    });
    expect(sent).toEqual([]);
    expect(problems.join(" ")).toContain("malformed-record");
    expect(problems.join(" ")).toContain("unverified");
  });

  it("cleans an owned descendant after the leader exits", async () => {
    const group = [owner];
    const listeners = [owner];
    const sent: [number, string][] = [];
    const problems = await stopOwnedProcessGroup(child, 40000, {
      ownership: descendantOwnership,
      inspector: inspectorFor(group, listeners),
      signal: (pid: number, name: string) => {
        sent.push([pid, name]);
        group.length = 0;
        listeners.length = 0;
      },
      terminateMs: 0,
      killMs: 0,
    });
    expect(sent).toEqual([[501, "SIGTERM"]]);
    expect(problems).toEqual([]);
  });

  it("rechecks identity before escalation and never signals a reused process", async () => {
    const member = { pid: 700, pgid: 500, start: "old" };
    const reused = { pid: 700, pgid: 500, start: "new" };
    const memberOwnership = { pgid: "500", processes: [member] };
    let recheckForeign = false;
    const sent: [number, string][] = [];
    const problems = await stopOwnedProcessGroup(child, 40000, {
      ownership: memberOwnership,
      inspector: {
        group: () => [{ ...member }],
        listeners: () => [{ ...member }],
        process: () => ({ ...(recheckForeign ? reused : member) }),
      },
      signal: (pid: number, name: string) => {
        sent.push([pid, name]);
        if (name === "SIGTERM") recheckForeign = true;
      },
      terminateMs: 0,
      killMs: 0,
    });
    expect(sent).toEqual([[700, "SIGTERM"]]);
    expect(problems.join(" ")).toContain("ownership no longer verifies");
  });

  it("fails closed when process inspection fails", async () => {
    const sent: [number, string][] = [];
    const problems = await stopOwnedProcessGroup(child, 40000, {
      ownership,
      inspector: {
        group: () => {
          throw new Error("ps unavailable");
        },
        listeners: () => [],
        process: () => null,
      },
      signal: (pid: number, name: string) => sent.push([pid, name]),
      terminateMs: 0,
      killMs: 0,
    });
    expect(sent).toEqual([]);
    expect(problems.join(" ")).toContain("inspection failed");
  });
});

describe("authenticated capture validation", () => {
  const shot = {
    file: "s01-roster.png",
    route: "/coach",
    screen: "Clients roster",
    clicks: ["Clients"],
  };
  const page = {
    url: "https://127.0.0.1:55880/coach?section=clients",
    text: "Clients roster Filter athletes CP Chloe Park Lifestyle",
  };

  it("rejects redirected, unauthenticated, wrong-state and generic captures", () => {
    expect(
      captureProblem(shot, { ...page, url: "https://x.test/login" }),
    ).toContain("expected capture route");
    expect(captureProblem(shot, { ...page, text: "Please sign in" })).toContain(
      "authentication",
    );
    expect(
      captureProblem(shot, { ...page, text: "Missing navigation" }),
    ).toContain('content marker "Filter athletes"');
    expect(captureProblem(shot, page)).toBeNull();

    const profile = {
      file: "s01-profile-overview.png",
      route: "/coach",
      screen: "Client profile, Overview tab",
      clicks: ["Clients", "CP Chloe Park Lifestyle"],
    };
    expect(
      captureProblem(profile, {
        url: "https://127.0.0.1:55880/coach?section=messages&client=wrong",
        text: "Clients Client setup generic client text",
        state: [],
      }),
    ).toContain("expected capture query section=clients");
    expect(
      captureProblem(profile, {
        url: "https://127.0.0.1:55880/coach?section=clients&client=wrong",
        text: "Clients Client setup generic client text",
        state: [],
      }),
    ).toContain("expected capture query client=client-013");
  });

  it("keeps a screen-specific state marker for captures without click recipes", () => {
    const studio = {
      file: "s10-clients-studio.png",
      route: "/ethereal#clients",
      screen: "Clients studio",
      clicks: [],
    };
    expect(expectedCaptureMarker(studio)).toBe("active clients");
    expect(
      captureProblem(studio, {
        url: "https://127.0.0.1:55880/ethereal#clients",
        text: "Clients 12 active clients shared roster",
        state: ["Clients"],
      }),
    ).toBeNull();
    expect(
      captureProblem(studio, {
        url: "https://127.0.0.1:55880/ethereal#clients",
        text: "Clients",
        state: ["Clients"],
      }),
    ).toContain('content marker "active clients"');
    expect(
      captureProblem(studio, {
        url: "https://127.0.0.1:55880/ethereal#clients",
        text: "Clients 12 active clients",
        state: [],
      }),
    ).toContain('selected capture state "Clients"');
    expect(
      captureProblem(studio, {
        url: "https://127.0.0.1:55880/ethereal",
        text: "Clients 12 active clients",
        state: ["Clients"],
      }),
    ).toContain("#clients");
  });
});

describe("parity HTTPS origin configuration", () => {
  it("requires a free second port for the backend pair", () => {
    expect(parityPortPair("55880")).toEqual({
      publicPort: 55880,
      backendPort: 55881,
    });
    for (const raw of ["", "abc", "0", "65535", "65536"])
      expect(() => parityPortPair(raw)).toThrow("PARITY_PORT");
  });

  it("refuses an occupied pinned backend port", async () => {
    const bind = async (port: number) => {
      if (port === 55881) throw new Error("address in use");
      return port;
    };
    await expect(selectPortPair(55880, bind)).rejects.toThrow(
      "port 55881 is in use",
    );
  });

  it("keeps allocating until the public and backend ports are distinct", async () => {
    const allocations = [55880, 55880, 55890, 55891];
    let calls = 0;
    const bind = async () => allocations[calls++];
    await expect(selectPortPair(null, bind)).resolves.toEqual({
      publicPort: 55890,
      backendPort: 55891,
    });
    expect(calls).toBe(4);
  });

  it("requires the external root-app URL to be HTTPS", () => {
    expect(() => parityUrl("not-a-url", true)).toThrow("PARITY_URL");
    expect(() => parityUrl("http://127.0.0.1:3000", true)).toThrow("https");
    expect(parityUrl("https://127.0.0.1:3000", true)).toBe(
      "https://127.0.0.1:3000",
    );
    expect(parityUrl("http://127.0.0.1:3000", false)).toBe(
      "http://127.0.0.1:3000",
    );
  });

  it("preserves Secure and SameSite cookie semantics for browser contexts", () => {
    const cookies = browserCookies(
      [
        "better-auth.session_token=abc; Path=/; HttpOnly; Secure; SameSite=Lax",
        "other=value; Path=/; SameSite=Strict",
      ],
      "https://127.0.0.1:55880",
    );
    expect(cookies).toMatchObject([
      {
        name: "better-auth.session_token",
        value: "abc",
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
      {
        name: "other",
        value: "value",
        secure: false,
        sameSite: "Strict",
      },
    ]);
    expect(cookies[0]).not.toHaveProperty("expires");
    expect(cookies[1]).not.toHaveProperty("expires");
  });

  it("preserves Max-Age and Expires semantics with a controlled clock", () => {
    const now = Date.UTC(2026, 9, 24, 12, 0, 0);
    const cookies = browserCookies(
      [
        "session=now; Max-Age=60; Expires=Wed, 21 Oct 2030 00:00:00 GMT; Secure; HttpOnly; SameSite=Lax; Path=/app; Domain=127.0.0.1",
        "expired=old; Max-Age=0",
        "dated=expiry; Expires=Wed, 21 Oct 2030 00:00:00 GMT",
        "fallback=expires; Max-Age=garbage; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      ],
      "https://127.0.0.1:55880",
      now,
    );

    expect(cookies[0]).toMatchObject({
      name: "session",
      expires: now / 1000 + 60,
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
      domain: "127.0.0.1",
      path: "/app",
    });
    expect(cookies[1]).toMatchObject({ name: "expired", expires: now / 1000 });
    expect(cookies[2]).toMatchObject({
      name: "dated",
      expires: Date.UTC(2030, 9, 21) / 1000,
    });
    expect(cookies[3]).toMatchObject({ name: "fallback", expires: 0 });
  });
});
