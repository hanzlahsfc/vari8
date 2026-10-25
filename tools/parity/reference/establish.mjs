// Explicit CLI only. Never replaces tools/parity/baseline or starts Actions.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createLocalTlsProxy } from "../../local-tls-proxy.mjs";
import {
  createOwnedProcessGroup,
  stopOwnedProcessGroup,
  ownsPort,
  httpsRequest,
  browserCookies,
} from "../local-https.mjs";
import {
  CONTRACT,
  assertD32Text,
  snapshotSource,
  installedDependencies,
  createAdapter,
  validateRun,
  fileHash,
} from "./reference.mjs";
import { environment, fonts } from "./environment.mjs";
import { compareRuns } from "./compare.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLROOT = path.resolve(HERE, "../../..");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`required ${name}`);
  return path.resolve(process.argv[i + 1]);
};
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
const main = async () => {
  if (process.version !== "v24.22.1")
    throw new Error("approved runtime is Node v24.22.1");
  assertD32Text(
    fs.readFileSync(path.join(TOOLROOT, "icm/03-plan/DECISIONS.md"), "utf8"),
  );
  const historical = arg("--reference-source"),
    candidate = arg("--candidate-source"),
    out = arg("--out");
  if (fs.existsSync(out))
    throw new Error(
      "output directory must be new; prior evidence is never overwritten",
    );
  fs.mkdirSync(out, { recursive: true });
  const db = new URL(process.env.DATABASE_URL ?? "");
  if (
    !/^app_[a-z0-9_]+$/.test(db.pathname.slice(1)) ||
    db.pathname === "/app_dev" ||
    db.hostname !== "127.0.0.1"
  )
    throw new Error("task-owned loopback lane database required");
  const definitions = {
    historical: {
      root: historical,
      app: path.join(historical, "frontend"),
      sha: CONTRACT.referenceSource,
    },
    candidate: {
      root: candidate,
      app: candidate,
      sha: CONTRACT.candidateSource,
    },
  };
  for (const [role, d] of Object.entries(definitions)) {
    snapshotSource(d.root, {
      expectedSha: d.sha,
      frontend: role === "historical",
    });
    d.dependencies = installedDependencies(d.app);
  }
  const oldRoot = path.join(candidate, "tools/parity/baseline");
  const oldArtifacts = [];
  for (const file of execFileSync(
    "git",
    ["-C", candidate, "ls-files", "tools/parity/baseline"],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n"))
    oldArtifacts.push({
      path: file.replace("tools/parity/baseline/", ""),
      sha256: fileHash(path.join(candidate, file)),
    });
  write(path.join(out, "preserved-original-artifacts.json"), oldArtifacts);
  const logs = [],
    cleanups = [];
  const definitionsPublic = Object.fromEntries(
    Object.entries(definitions).map(([role, d]) => [
      role,
      {
        ...d,
        source: snapshotSource(d.root, {
          expectedSha: d.sha,
          frontend: role === "historical",
        }),
      },
    ]),
  );
  write(path.join(out, "inputs.json"), {
    contract: CONTRACT,
    definitions: definitionsPublic,
    toolingSource: execFileSync("git", ["-C", TOOLROOT, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    captureDependency: CONTRACT.candidateSource,
  });
  const results = { contract: CONTRACT, runs: [], cleanup: cleanups };
  async function run(label, role, publicPort, backendPort) {
    const d = definitions[role],
      dir = path.join(out, label);
    fs.mkdirSync(dir);
    const runId = randomUUID();
    const source = snapshotSource(d.root, {
      expectedSha: d.sha,
      frontend: role === "historical",
    });
    const env = await environment();
    const adapterPath = path.join(
      TOOLROOT,
      "tools/parity/out/reference-runtime",
      `${runId}.mjs`,
    );
    const adapter = createAdapter({
      harnessRoot: TOOLROOT,
      sourceRoot: d.root,
      outputFile: adapterPath,
    });
    const provenance = {
      runId,
      role,
      contract: CONTRACT,
      source,
      dependencies: d.dependencies,
      environment: env,
      fonts: fonts(d.app),
      adapter,
      recipeIndexSha256: fileHash(
        path.join(d.root, "icm/04-briefing/shots/index.json"),
      ),
      toolingSource: execFileSync(
        "git",
        ["-C", TOOLROOT, "rev-parse", "HEAD"],
        { encoding: "utf8" },
      ).trim(),
      startedAt: new Date().toISOString(),
      buildId: fs
        .readFileSync(path.join(d.app, ".next/BUILD_ID"), "utf8")
        .trim(),
    };
    write(path.join(dir, "provenance.json"), provenance);
    let child, owner, proxy;
    const log = [];
    try {
      proxy = await createLocalTlsProxy({
        port: publicPort,
        target: `http://127.0.0.1:${backendPort}`,
      });
      const logfd = fs.openSync(path.join(dir, "server.log"), "w");
      child = spawn(
        process.execPath,
        [
          path.join(d.app, "node_modules/next/dist/bin/next"),
          "start",
          "--hostname",
          "127.0.0.1",
          "--port",
          String(backendPort),
        ],
        {
          cwd: d.app,
          env: {
            ...process.env,
            BETTER_AUTH_URL: proxy.url,
            AUTH_URL: proxy.url,
          },
          stdio: ["ignore", logfd, logfd],
          detached: true,
        },
      );
      owner = await createOwnedProcessGroup(child);
      write(path.join(dir, "server-ownership.json"), {
        pid: child.pid,
        port: backendPort,
        ownership: owner,
      });
      let ready = false;
      for (let i = 0; i < 120; i++) {
        if (child.exitCode !== null) throw Error("owned server exited");
        try {
          const r = await httpsRequest(
            proxy.url + (role === "candidate" ? "/login" : "/coach"),
            { ca: proxy.cert },
          );
          if (r.status === 200) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!ready || !ownsPort(backendPort, owner))
        throw Error("owned server not ready");
      let cookies = [];
      if (role === "candidate") {
        const auth = await httpsRequest(proxy.url + "/api/auth/sign-in/email", {
          ca: proxy.cert,
          method: "POST",
          headers: { "content-type": "application/json", origin: proxy.url },
          body: JSON.stringify({
            email: process.env.SEED_OWNER_EMAIL,
            password: process.env.SEED_OWNER_PASSWORD,
          }),
        });
        if (auth.status !== 200 || !auth.setCookie?.length)
          throw Error(`real sign-in failed ${auth.status}`);
        cookies = browserCookies(auth.setCookie, proxy.url);
      }
      const module = await import(pathToFileURL(adapterPath).href);
      const manifest = await module.captureAll({
        baseUrl: proxy.url,
        outDir: dir,
        cookies,
        ignoreHTTPSErrors: true,
        serverMine: () => ownsPort(backendPort, owner),
        checkUrl: async (url) => {
          const r = await httpsRequest(url, { ca: proxy.cert });
          return r.status >= 200 && r.status < 400;
        },
        log: (x) => {
          log.push(x);
          console.log(label, x);
        },
      });
      provenance.finishedAt = new Date().toISOString();
      provenance.sourceAfter = snapshotSource(d.root, {
        expectedSha: d.sha,
        frontend: role === "historical",
      });
      write(path.join(dir, "provenance.json"), provenance);
      const shots = JSON.parse(
        fs.readFileSync(
          path.join(d.root, "icm/04-briefing/shots/index.json"),
          "utf8",
        ),
      ).shots;
      const artifacts = validateRun({
        directory: dir,
        manifest,
        shots,
        provenance,
      });
      write(path.join(dir, "validated-artifacts.json"), artifacts);
      results.runs.push({
        label,
        runId,
        role,
        screens: manifest.screens.length,
        failures: manifest.failures,
        retried: manifest.retried,
        validated: true,
      });
      return dir;
    } catch (e) {
      results.runs.push({
        label,
        runId,
        role,
        validated: false,
        error: e.stack,
      });
      throw e;
    } finally {
      fs.writeFileSync(path.join(dir, "capture.log"), log.join("\n") + "\n");
      if (proxy) await proxy.close();
      if (child && owner)
        cleanups.push({
          label,
          pid: child.pid,
          port: backendPort,
          problems: await stopOwnedProcessGroup(child, backendPort, {
            ownership: owner,
          }),
        });
      write(path.join(out, "progress.json"), results);
    }
  }
  try {
    const r1 = await run("reference-run-1", "historical", 55940, 55941);
    const r2 = await run("reference-run-2", "historical", 55942, 55943);
    const files1 = JSON.parse(
      fs.readFileSync(path.join(r1, "validated-artifacts.json"), "utf8"),
    );
    const files2 = JSON.parse(
      fs.readFileSync(path.join(r2, "validated-artifacts.json"), "utf8"),
    );
    const hashes = new Map(files2.map((x) => [x.path, x.sha256]));
    const mismatches = files1.filter((x) => hashes.get(x.path) !== x.sha256);
    results.stability = {
      hashMismatches: mismatches,
      strict: compareRuns(r1, r2, { strict: true }),
      canonical: compareRuns(r1, r2),
    };
    write(path.join(out, "stability.json"), results.stability);
    const cur = await run("candidate-run", "candidate", 55944, 55945);
    results.comparison = {
      canonical: compareRuns(r1, cur),
      strict: compareRuns(r1, cur, { strict: true }),
    };
    write(path.join(out, "all-70-comparison.json"), results.comparison);
    const oldMap = new Map(oldArtifacts.map((x) => [x.path, x.sha256])),
      newMap = new Map(files1.map((x) => [x.path, x.sha256]));
    const mapping = [...new Set([...oldMap.keys(), ...newMap.keys()])]
      .sort()
      .map((file) => ({
        path: file,
        oldSha256: oldMap.get(file) ?? null,
        proposedSha256: newMap.get(file) ?? null,
        reason: file.includes("s04-template-habits")
          ? "Intended Habits replaces faulty Tabs; historical authority, D32 clock, recorded environment and semantic metadata. No current-app expected pixels."
          : file.endsWith(".geom.json.gz")
            ? "Historical authority; D32 clock/recorded environment; role/name metadata added. No application evolution baselined."
            : "Historical authority recaptured with D32 clock and recorded environment; original-host residual is not attributed to a specific cause. No current-app expected pixels.",
      }));
    write(path.join(out, "old-proposed-artifact-map.json"), mapping);
    results.originalsUnchanged = oldArtifacts.every(
      (x) => fileHash(path.join(oldRoot, x.path)) === x.sha256,
    );
    results.referenceGeneration = "complete";
    results.stabilityStatus = mismatches.length ? "UNSTABLE" : "BIT_IDENTICAL";
    results.referenceReviewStatus = "PROPOSED; NOT ACCEPTED";
    write(path.join(out, "results.json"), results);
    if (mismatches.length) process.exitCode = 1;
  } catch (e) {
    results.error = e.stack;
    write(path.join(out, "results.json"), results);
    throw e;
  }
};
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
)
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
