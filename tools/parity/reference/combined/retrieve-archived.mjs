// Retrieval + integrity check for archived combined packages.
// Usage: node retrieve-archived.mjs [--remote <name|url|path>] [--out <dir>] <package>
// Modes:
//   --check   verify archive ref availability + pinned index only (no extract)
//   default   fetch the pinned tag, verify commit + index, extract every indexed
//             artifact into a new task-owned destination, verify each sha256.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const PACKAGE_PREFIX = "tools/parity/reference/combined";

// Trusted registry: the only archives this tool will ever fetch. Editable
// metadata (ARCHIVED.json stubs) is informational, never authority.
const ARCHIVES = Object.freeze({
  "p436-run": Object.freeze({
    tag: "evidence/p436-run-superseded",
    commit: "0293c69ca38549684d94ccf96a70bca8e62242d5",
    artifactIndexSha256:
      "5a8790c36439926c4033663b616f65771f0eadd2d22d147975448e9c16d9457f",
    source: Object.freeze({
      commit: "a7a8a54cc3efe0aadedb34963e6fcebf8a02fd99",
      tree: "612bff34c8f3fcf2581f887bb378ff88abf1fa14",
      materialTreeSha256:
        "d59f4cef1a9a269958169409271ec5cb4e8b82b5e100851fa87bf463c00c7691",
    }),
  }),
});

const HEX40 = /^[0-9a-f]{40}$/;
const SAFE_NAME = /^[a-zA-Z0-9._-]+$/;

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const git = (cwd, args) =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", maxBuffer: 64 << 20 });
const gitBuf = (cwd, args) =>
  execFileSync("git", ["-C", cwd, ...args], { maxBuffer: 256 << 20 });

function usage() {
  throw new Error(
    "usage: retrieve-archived.mjs [--check] [--remote <remote>] [--out <dir>] <package>",
  );
}

const args = process.argv.slice(2);
const opts = {
  check: false,
  remote: null, // resolved below to origin's URL
  out: null,
};
while (args.length) {
  const a = args.shift();
  if (a === "--check") opts.check = true;
  else if (a === "--remote") opts.remote = args.shift() ?? usage();
  else if (a === "--out") opts.out = args.shift() ?? usage();
  else if (a.startsWith("-")) usage();
  else opts.name = a;
}
const name = opts.name;
if (!name || !Object.hasOwn(ARCHIVES, name))
  throw new Error(`unsupported archive package: ${name ?? "(none)"}`);
// Registry values are trusted but still shape-checked before any git call.
const spec = ARCHIVES[name];
if (!SAFE_NAME.test(spec.tag.replaceAll("/", "")) || !HEX40.test(spec.commit))
  throw new Error("registry entry malformed");
const packagePath = `${PACKAGE_PREFIX}/${name}`;
// Any editable stub present must agree with the registry.
const stubFile = path.join(ROOT, packagePath, "ARCHIVED.json");
if (fs.existsSync(stubFile)) {
  const stub = JSON.parse(fs.readFileSync(stubFile, "utf8"));
  if (
    stub.status !== "SUPERSEDED" ||
    stub.archiveTag !== spec.tag ||
    stub.packageAt !== spec.commit ||
    stub.artifactIndexSha256 !== spec.artifactIndexSha256 ||
    stub.source?.commit !== spec.source.commit
  )
    throw new Error(`${name}: editable stub disagrees with trusted registry`);
}

// Fetch scratch repo lives entirely inside the destination we own.
const outDir = opts.out
  ? path.resolve(opts.out)
  : path.join(ROOT, "tools/parity/out/retrieve", name);
if (path.parse(outDir).root === outDir && outDir.length < 6)
  throw new Error("refusing unsafe destination");
if (fs.existsSync(outDir))
  throw new Error(`destination exists; refusing unowned path: ${outDir}`);
fs.mkdirSync(outDir, { recursive: true });
const fetchDir = path.join(outDir, ".fetch");
fs.mkdirSync(fetchDir);
const cleanup = () => {
  try {
    fs.rmSync(outDir, { recursive: true, force: true });
  } catch {}
};
try {
  git(fetchDir, ["init", "-q"]);
  const remote = opts.remote ?? git(ROOT, ["remote", "get-url", "origin"]).trim();
  git(fetchDir, ["fetch", "-q", "--depth", "1", remote, `refs/tags/${spec.tag}`]);
  const resolved = git(fetchDir, ["rev-parse", "FETCH_HEAD^{commit}"]).trim();
  if (!HEX40.test(resolved) || resolved !== spec.commit)
    throw new Error(
      `tag ${spec.tag} resolves to ${resolved}, expected ${spec.commit}`,
    );
  const indexBytes = gitBuf(fetchDir, [
    "show",
    `${spec.commit}:${packagePath}/artifact-index.json`,
  ]);
  if (sha256(indexBytes) !== spec.artifactIndexSha256)
    throw new Error("archived artifact-index hash differs from pinned value");
  const index = JSON.parse(indexBytes.toString("utf8"));
  if (!Array.isArray(index.artifacts)) throw new Error("index has no artifacts");
  const retrieved = [];
  for (const entry of index.artifacts) {
    const rel = entry.path;
    if (
      typeof rel !== "string" ||
      rel.startsWith("/") ||
      rel.includes("..") ||
      rel.includes("\\") ||
      rel.split("/").some((p) => !p || p === "." || p === "..")
    )
      throw new Error(`unsafe indexed path: ${rel}`);
    const bytes = gitBuf(fetchDir, [
      "show",
      `${spec.commit}:${packagePath}/${rel}`,
    ]);
    if (sha256(bytes) !== entry.sha256)
      throw new Error(`archived artifact hash differs: ${rel}`);
    if (!opts.check) {
      const dest = path.join(outDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, bytes);
    }
    retrieved.push(rel);
  }
  fs.rmSync(fetchDir, { recursive: true, force: true });
  if (opts.check) fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    JSON.stringify({
      package: name,
      status: "SUPERSEDED",
      tag: spec.tag,
      commit: spec.commit,
      source: spec.source,
      artifacts: retrieved.length,
      retrieved: opts.check ? [] : outDir,
      verified: true,
    }),
  );
} catch (e) {
  cleanup();
  throw e;
}
