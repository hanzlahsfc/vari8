// npm run parity: builds the root app for production (next build), serves it with next start on a loopback HTTP
// backend, terminates that backend through a disposable loopback HTTPS proxy, signs in through the real configured
// https origin, captures every screen at 1440x900 and 390x844, compares with tools/parity/baseline (captured from
// frontend/), writes tools/parity/out/report.html, then stops the server. Exit code: 0 match, 1 change or capture
// failure, 2 refused (bad env, port taken, or the listener is not the server this run started). Nothing is compared
// on 2. PARITY_PORT pins the public HTTPS port and requires <port+1> free for the backend. PARITY_URL compares a
// server you run yourself (not checked); root-app PARITY_URL must be https:.
// PARITY_DEV=1 uses next dev on the same private backend port (debugging only; dev timing noise makes the gate flaky).
// npm run parity -- --update-baseline   recaptures the baseline instead of comparing (needs PARITY_APP=frontend).
// PARITY_APP=frontend serves frontend/ (no session) instead of the root app; the baseline comes from there.
// Explicit isolated prep runs may set PARITY_REFERENCE_DIR + PARITY_OUT_DIR with
// PARITY_COMPARER=reference for the owner-adopted reference gate. External capture modules are unsupported.
// Sign-in (root app): PARITY_USER_EMAIL and PARITY_USER_PASSWORD name an existing account. Without a password the
// run upserts the dev user (icm/05-build/tools/dev-user.ts) with a fresh password on DATABASE_URL, a lane database.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { openSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createLocalTlsProxy } from "../local-tls-proxy.mjs";
import { captureAll as defaultCaptureAll, INDEX_PATH } from "./capture.mjs";
import { compareRuns, ConfigError, envThresholds } from "./compare.mjs";
import {
  browserCookies,
  createOwnedProcessGroup,
  httpsRequest,
  listenerPids,
  ownsPort,
  parityUrl,
  selectPortPair,
  stopOwnedProcessGroup,
} from "./local-https.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const FE = path.join(ROOT, "frontend");
const ROOT_APP = process.env.PARITY_APP !== "frontend";
const APP = ROOT_APP ? ROOT : FE;
const NEXT_BIN = path.join(ROOT, "node_modules/next/dist/bin/next");
const DEFAULT_OUT = path.join(HERE, "out");
const DEFAULT_BASE = path.join(HERE, "baseline");
let OUT = DEFAULT_OUT;
let CUR = path.join(OUT, "current");
let BASE = DEFAULT_BASE;
let LOG = path.join(OUT, "server.log");
const update = process.argv.includes("--update-baseline");
const DEV = process.env.PARITY_DEV === "1";
let captureAll = defaultCaptureAll;
let combinedAdapter = null;
let combinedPaths = null;
let combinedReferenceArtifacts = null;

class Refuse extends Error {}

// Signs in to the root app through Better Auth and returns the session cookies for the capture contexts.
async function signInCookies(baseUrl, ca = null) {
  const email = process.env.PARITY_USER_EMAIL ?? "owner@vari8.test";
  let password = process.env.PARITY_USER_PASSWORD;
  if (!password) {
    password = `Parity${randomBytes(12).toString("hex")}7`;
    const seed = spawnSync(
      "npx",
      ["tsx", path.join(ROOT, "icm/05-build/tools/dev-user.ts")],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          DEV_USER_EMAIL: email,
          DEV_USER_PASSWORD: password,
        },
        encoding: "utf8",
      },
    );
    if (seed.status !== 0)
      throw new Refuse(
        `dev user upsert failed (exit ${seed.status}): ${(seed.stderr || seed.stdout).trim().split("\n").pop()}`,
      );
  }
  const res = await httpsRequest(`${baseUrl}/api/auth/sign-in/email`, {
    ca,
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ email, password }),
  });
  if (res.status < 200 || res.status >= 300 || res.setCookie.length === 0)
    throw new Refuse(`sign-in as ${email} failed (HTTP ${res.status})`);
  return browserCookies(res.setCookie, baseUrl);
}

// Binds 127.0.0.1:port (0 = any free port) and reports the port, or rejects if it is taken.
const bind = (port) =>
  new Promise((ok, no) => {
    const s = createServer();
    s.once("error", no);
    s.listen(port, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => ok(p));
    });
  });

async function waitForHttp(url, server, checkUrl, ms = 180000) {
  const t0 = Date.now();
  for (;;) {
    if (server.exitCode !== null || server.signalCode !== null)
      throw new Refuse(`server exited before answering; see ${LOG}`);
    try {
      if (await checkUrl(url)) return;
    } catch {}
    if (Date.now() - t0 > ms)
      throw new Refuse(`server did not answer at ${url} within ${ms / 1000} s`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function ownsPortPid(port, pid) {
  const pids = listenerPids(port);
  return pids.length > 0 && pids.every((p) => p === String(pid));
}

function pinnedPort() {
  const raw = process.env.PARITY_PORT;
  if (raw === undefined) return null;
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 65535)
    throw new ConfigError(
      `PARITY_PORT="${raw}" must be a port from 1 to 65535`,
    );
  return Number(raw);
}

let th;
let pinned;
let externalUrl;
try {
  if (process.env.PARITY_CAPTURE_MODULE !== undefined)
    throw new ConfigError(
      "PARITY_CAPTURE_MODULE is unsupported; combined runs generate the pinned D32 adapter",
    );
  if (
    process.env.PARITY_COMPARER !== undefined &&
    process.env.PARITY_COMPARER !== "reference"
  )
    throw new ConfigError(`PARITY_COMPARER must be "reference" when set`);
  if (
    process.env.PARITY_COMPARER !== "reference" &&
    (process.env.PARITY_REFERENCE_DIR !== undefined ||
      process.env.PARITY_OUT_DIR !== undefined)
  )
    throw new ConfigError(
      "PARITY_REFERENCE_DIR/PARITY_OUT_DIR require PARITY_COMPARER=reference",
    );
  if (process.env.PARITY_COMPARER === "reference") {
    const {
      assertCombinedRunPaths,
      assertFreshOutputPath,
      prepareOwnedOutputDir,
    } = await import("./safe-paths.mjs");
    combinedPaths = assertCombinedRunPaths({
      root: ROOT,
      referenceDir: process.env.PARITY_REFERENCE_DIR,
      outDir: process.env.PARITY_OUT_DIR,
      update,
    });
    try {
      const { assertProposedReference } =
        await import("./reference/combined-run.mjs");
      const shots = JSON.parse(await readFile(INDEX_PATH, "utf8")).shots;
      combinedReferenceArtifacts = assertProposedReference({
        directory: combinedPaths.reference,
        shots,
      });
    } catch (e) {
      throw new ConfigError(`invalid proposed reference: ${e.message}`);
    }
    OUT = combinedPaths.out;
    BASE = combinedPaths.reference;
    CUR = path.join(OUT, "current");
    LOG = path.join(OUT, "server.log");
    assertFreshOutputPath(CUR, "combined capture output");
    assertFreshOutputPath(LOG, "combined server log");
    const adapterPath = assertFreshOutputPath(
      path.join(OUT, "d32-capture-adapter.mjs"),
      "combined capture adapter",
    );
    prepareOwnedOutputDir(OUT);
    const { createAdapter } = await import("./reference/reference.mjs");
    combinedAdapter = createAdapter({
      harnessRoot: ROOT,
      outputFile: adapterPath,
    });
    captureAll = (await import(pathToFileURL(adapterPath).href)).captureAll;
  }
  th = envThresholds();
  pinned = pinnedPort();
  externalUrl = process.env.PARITY_URL
    ? parityUrl(process.env.PARITY_URL, ROOT_APP)
    : null;
} catch (e) {
  if (!(e instanceof ConfigError)) throw e;
  console.error(`parity: ${e.message}`);
  process.exit(2);
}

await mkdir(OUT, { recursive: true });
let baseUrl = externalUrl;
let server = null;
let proxy = null;
let port = null;
let backendPort = null;
let ownership = null;
// Next dev and build append to AGENTS.md in the app they run in. Snapshot and restore so the tree stays untouched.
const agentsPath = path.join(APP, "AGENTS.md");
const agentsBefore = await readFile(agentsPath, "utf8");
let code = 1;
try {
  if (update && process.env.PARITY_REFERENCE_DIR)
    throw new Refuse(
      "--update-baseline must not target PARITY_REFERENCE_DIR; only the active baseline may be updated by its own reviewed flow",
    );
  if (update && ROOT_APP)
    throw new Refuse(
      "--update-baseline captures the frontend/ canvas; set PARITY_APP=frontend",
    );
  if (!baseUrl) {
    if (ROOT_APP) {
      let pair;
      try {
        pair = await selectPortPair(pinned, bind);
      } catch (e) {
        throw new Refuse(e.message);
      }
      port = pair.publicPort;
      backendPort = pair.backendPort;
      try {
        proxy = await createLocalTlsProxy({
          port,
          target: `http://127.0.0.1:${backendPort}`,
        });
      } catch (e) {
        throw new Refuse(`local TLS proxy failed: ${e.message}`);
      }
      baseUrl = proxy.url;
    } else {
      if (
        pinned !== null &&
        !(await bind(pinned).then(
          () => true,
          () => false,
        ))
      )
        throw new Refuse(
          `port ${pinned} is in use; PARITY_PORT must name a free port. Nothing was compared.`,
        );
      port = backendPort = pinned ?? (await bind(0));
      baseUrl = `http://127.0.0.1:${port}`;
    }
    // Production build by default: dev mode (HMR, overlay, on-demand compile) adds timing noise.
    // PARITY_DEV=1 falls back to next dev for debugging only.
    const logFd = openSync(LOG, "w");
    const stdio = ["ignore", logFd, logFd];
    // Better Auth trusts its own base URL only, so the root app must be told the address this run serves.
    const env = ROOT_APP
      ? { ...process.env, BETTER_AUTH_URL: baseUrl, AUTH_URL: baseUrl }
      : process.env;
    if (DEV) {
      server = spawn(
        process.execPath,
        [
          NEXT_BIN,
          "dev",
          "--webpack",
          "--hostname",
          "127.0.0.1",
          "--port",
          String(backendPort),
        ],
        { cwd: APP, env, detached: true, stdio },
      );
    } else {
      const build = spawnSync("npx", ["next", "build", "--webpack"], {
        cwd: APP,
        env,
        stdio,
      });
      if (build.status !== 0)
        throw new Refuse(
          `next build failed (exit ${build.status}); see ${LOG}`,
        );
      server = spawn(
        process.execPath,
        [
          NEXT_BIN,
          "start",
          "--hostname",
          "127.0.0.1",
          "--port",
          String(backendPort),
        ],
        { cwd: APP, env, detached: true, stdio },
      );
    }
    ownership = await createOwnedProcessGroup(server);
    const checkUrl = proxy
      ? async (url) => {
          const res = await httpsRequest(url, { ca: proxy.cert });
          return res.status >= 200 && res.status < 400;
        }
      : async (url) => (await fetch(url)).ok;
    await waitForHttp(`${baseUrl}/coach`, server, checkUrl);
    if (
      !ownsPort(backendPort, ownership) ||
      (proxy && !ownsPortPid(port, process.pid))
    )
      throw new Refuse(
        `port pair ${port}/${backendPort} answers from a process this run did not start. Refusing to compare it.`,
      );
  }
  const checkUrl = proxy
    ? async (url) => {
        const res = await httpsRequest(url, { ca: proxy.cert });
        return res.status >= 200 && res.status < 400;
      }
    : async (url) => (await fetch(url)).ok;
  // Re-checked by captureAll before every capture, before a retry, and once after the last
  // capture: a port that answers means nothing if this run's server died and another process
  // took it. null for PARITY_URL runs, where no spawned server exists to own the port.
  const serverMine = server
    ? () =>
        ownsPort(backendPort, ownership) &&
        (!proxy || ownsPortPid(port, process.pid))
    : null;
  const cookies = ROOT_APP ? await signInCookies(baseUrl, proxy?.cert) : [];
  if (update) {
    // Capture into a temp dir; the committed baseline is replaced only when every shot captured.
    const tmp = path.join(OUT, "baseline.tmp");
    await rm(tmp, { recursive: true, force: true });
    const m = await captureAll({
      baseUrl,
      outDir: tmp,
      serverMine,
      cookies,
      checkUrl,
      ignoreHTTPSErrors: Boolean(proxy),
    });
    const expected =
      JSON.parse(await readFile(INDEX_PATH, "utf8")).shots.length * 2;
    if (m.failures.length || m.screens.length !== expected) {
      console.log(
        `baseline NOT updated: ${m.failures.length} failure(s), ${m.screens.length}/${expected} screens. Kept ${BASE}; partial capture in ${tmp}`,
      );
      code = 1;
    } else {
      await rm(BASE, { recursive: true, force: true });
      await rename(tmp, BASE);
      console.log(`baseline: ${m.screens.length} screens -> ${BASE}`);
      code = 0;
    }
  } else {
    if (process.env.PARITY_COMPARER !== "reference")
      await rm(CUR, { recursive: true, force: true });
    const m = await captureAll({
      baseUrl,
      outDir: CUR,
      serverMine,
      cookies,
      checkUrl,
      ignoreHTTPSErrors: Boolean(proxy),
    });
    if (m.failures.length) {
      console.log(
        `capture: ${m.failures.length} failure(s), retried=${m.retried ?? 0}; see ${path.join(CUR, "manifest.json")}`,
      );
      code = 1;
    } else {
      if (process.env.PARITY_COMPARER === "reference") {
        const { compareRuns: compareReference } =
          await import("./reference/compare.mjs");
        const { validateCombinedRun } =
          await import("./reference/combined-run.mjs");
        const { CONTRACT, installedDependencies, snapshotSource, fileHash } =
          await import("./reference/reference.mjs");
        const { sourceIdentity } =
          await import("./reference/source-identity.mjs");
        const { environment } = await import("./reference/environment.mjs");
        const { execFileSync: gitExec } = await import("node:child_process");
        const git = (...args) =>
          gitExec("git", ["-C", ROOT, ...args], { encoding: "utf8" }).trim();
        const shots = JSON.parse(await readFile(INDEX_PATH, "utf8")).shots;
        const referenceArtifacts = combinedReferenceArtifacts;
        const head = git("rev-parse", "HEAD");
        const source = snapshotSource(ROOT, { expectedSha: head });
        const dependencies = installedDependencies(APP);
        const env = await environment();
        const provenance = {
          role: "combined",
          contract: CONTRACT,
          inputs: {
            vari8Beta: "d1c4081022f2ac21070b28f284248fad2ef04839",
            pr203: "90c16bee63e2609ebc4f09e91459332390562464",
            pr206: "43b63ed0f41e6e92e93ecf72065c0190c9ef3dea",
            prep: { branch: "beta/p203-p206-combined-verification", head },
          },
          source: { ...source, ...sourceIdentity(ROOT, head) },
          dependencies,
          environment: env,
          adapter: combinedAdapter,
          recipeIndexSha256: fileHash(INDEX_PATH),
          toolingSource: head,
          buildId: (
            await readFile(path.join(APP, ".next/BUILD_ID"), "utf8")
          ).trim(),
        };
        await writeFile(
          path.join(OUT, "combined-provenance.json"),
          JSON.stringify(provenance, null, 2) + "\n",
          { flag: "wx" },
        );
        const artifacts = validateCombinedRun({
          directory: CUR,
          manifest: m,
          shots,
          provenance,
        });
        const canonical = compareReference(BASE, CUR);
        const strict = compareReference(BASE, CUR, { strict: true });
        await writeFile(
          path.join(OUT, "proposed-canonical.json"),
          JSON.stringify(canonical, null, 2) + "\n",
          { flag: "wx" },
        );
        await writeFile(
          path.join(OUT, "proposed-strict.json"),
          JSON.stringify(strict, null, 2) + "\n",
          { flag: "wx" },
        );
        const receipt = {
          kind: "combined-proposed-reference-verification",
          commands: [
            {
              cwd: ".",
              argv: ["node", "tools/parity/run.mjs"],
              env: {
                PARITY_COMPARER: process.env.PARITY_COMPARER,
                PARITY_REFERENCE_DIR: process.env.PARITY_REFERENCE_DIR,
                PARITY_OUT_DIR: process.env.PARITY_OUT_DIR,
                PARITY_PORT: process.env.PARITY_PORT ?? null,
              },
            },
          ],
          environmentVariables: Object.fromEntries(
            [
              "NODE_ENV",
              "APP_ENV",
              "NEXT_TELEMETRY_DISABLED",
              "MEDIA_STORAGE_ADAPTER",
              "MEDIA_STORAGE_DIR",
              "PARITY_COMPARER",
              "PARITY_REFERENCE_DIR",
              "PARITY_OUT_DIR",
              "PARITY_PORT",
            ].map((name) => [name, process.env[name] ?? null]),
          ),
          exits: {
            capture: 0,
            canonical: canonical.failed ? 1 : 0,
            strict: strict.failed ? 1 : 0,
            parity: canonical.failed ? 1 : 0,
          },
          settings: {
            comparer: "reference",
            fixedNow: CONTRACT.clock,
            timezone: CONTRACT.timezone,
            viewports: CONTRACT.viewports,
            geometryPx: CONTRACT.geometryPx,
            pixelmatchThreshold: CONTRACT.pixelmatchThreshold,
            pixelmatchIncludeAA: CONTRACT.pixelmatchIncludeAA,
            maxChangedFraction: CONTRACT.maxChangedFraction,
          },
          inputs: provenance.inputs,
          source: provenance.source,
          productTree: {
            tree: source.tree,
            diffFromPr203: git(
              "diff",
              "--name-only",
              `${provenance.inputs.pr203}..HEAD`,
              "--",
              "app",
              "components",
              "db",
              "lib",
              "public",
              "scripts",
              "package.json",
              "package-lock.json",
              "next.config.ts",
            ),
          },
          tooling: {
            runner: fileHash(path.join(ROOT, "tools/parity/run.mjs")),
            comparer: fileHash(
              path.join(ROOT, "tools/parity/reference/compare.mjs"),
            ),
            legacyComparer: fileHash(
              path.join(ROOT, "tools/parity/compare.mjs"),
            ),
            validator: fileHash(
              path.join(ROOT, "tools/parity/reference/combined-run.mjs"),
            ),
            contract: fileHash(
              path.join(ROOT, "tools/parity/reference/contract.json"),
            ),
            comparerManifest: fileHash(
              path.join(ROOT, "tools/parity/reference/evidence/comparer.json"),
            ),
            locks: {
              root: fileHash(path.join(ROOT, "package-lock.json")),
              reference: fileHash(
                path.join(ROOT, "tools/parity/reference/package-lock.json"),
              ),
            },
            files: Object.fromEntries(
              [
                "tools/parity/run.mjs",
                "tools/parity/capture.mjs",
                "tools/parity/reference/capture-metadata.mjs",
                "tools/parity/safe-paths.mjs",
                "tools/parity/compare.mjs",
                "tools/parity/reference/reference.mjs",
                "tools/parity/reference/combined-run.mjs",
                "tools/parity/reference/compare.mjs",
                "tools/parity/reference/contract.json",
                "tools/parity/reference/environment.mjs",
                "tools/parity/reference/source-identity.mjs",
                "tools/parity/reference/combined-pins.mjs",
                "tools/parity/reference/package-combined.mjs",
                "tools/parity/reference/verify-combined.mjs",
                "tools/parity/reference/evidence/evidence-lib.mjs",
                "tools/parity/reference/evidence/comparer.json",
                "tools/parity/local-https.mjs",
                "tools/local-tls-proxy.mjs",
                "auth.ts",
                "package.json",
                "package-lock.json",
                "tools/parity/reference/package.json",
                "tools/parity/reference/package-lock.json",
                "icm/04-briefing/shots/index.json",
              ].map((file) => [file, fileHash(path.join(ROOT, file))]),
            ),
            adapter: combinedAdapter,
          },
          environment: env,
          dependencies,
          reference: {
            directory: BASE,
            manifestSha256: fileHash(path.join(BASE, "manifest.json")),
            provenanceSha256: fileHash(path.join(BASE, "provenance.json")),
            artifactCount: referenceArtifacts.length,
            artifacts: referenceArtifacts,
          },
          capture: {
            directory: CUR,
            manifestSha256: fileHash(path.join(CUR, "manifest.json")),
            screens: m.screens.length,
            failures: m.failures.length,
            retried: m.retried ?? 0,
            artifactCount: artifacts.length,
            artifacts,
          },
          results: {
            canonical: {
              passed: canonical.passed,
              failed: canonical.failed,
              total: canonical.total,
              sha256: fileHash(path.join(OUT, "proposed-canonical.json")),
            },
            strict: {
              passed: strict.passed,
              failed: strict.failed,
              total: strict.total,
              sha256: fileHash(path.join(OUT, "proposed-strict.json")),
            },
          },
        };
        await writeFile(
          path.join(OUT, "execution-receipt.json"),
          JSON.stringify(receipt, null, 2) + "\n",
          { flag: "wx" },
        );
        console.log(
          `proposed-reference canonical ${canonical.failed ? "FAIL" : "PASS"}: ${canonical.failed} problem(s), strict diagnostic ${strict.failed} problem(s), retried=${m.retried ?? 0}; receipts ${OUT}`,
        );
        code = canonical.failed ? 1 : 0;
      } else {
        const r = await compareRuns({
          baseline: BASE,
          current: CUR,
          report: path.join(OUT, "report.html"),
          th,
        });
        console.log(
          `parity ${r.failed ? "FAIL" : "PASS"}: ${r.failed} problem(s), retried=${m.retried ?? 0}; report ${r.report}`,
        );
        code = r.failed ? 1 : 0;
      }
    }
  }
} catch (e) {
  if (!(e instanceof Refuse)) throw e;
  console.error(`parity: ${e.message}`);
  code = 2;
} finally {
  const cleanupProblems = [];
  if (server)
    try {
      cleanupProblems.push(
        ...(await stopOwnedProcessGroup(server, backendPort, { ownership })),
      );
    } catch (e) {
      cleanupProblems.push(`server cleanup failed: ${e.message}`);
    }
  if (proxy) {
    await proxy.close().catch((e) => {
      cleanupProblems.push(`TLS proxy cleanup failed: ${e.message}`);
    });
    const pids = listenerPids(port);
    if (pids.length)
      cleanupProblems.push(
        pids.every((pid) => pid === String(process.pid))
          ? `TLS proxy listener ${port} did not close`
          : `listener ${port} is owned by process(es) ${pids.join(", ")} outside this run`,
      );
  }
  for (const problem of cleanupProblems)
    console.error(`parity: cleanup: ${problem}`);
  if (cleanupProblems.length) code = 2;
  const now = await readFile(agentsPath, "utf8").catch(() => null);
  if (now !== null && now !== agentsBefore)
    await writeFile(agentsPath, agentsBefore);
}
process.exit(code);
