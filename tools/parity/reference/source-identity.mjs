import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const git = (root, args) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
export const DEFAULT_ROOT = path.resolve(HERE, "../../..");

export const MATERIAL_PATHSPEC = Object.freeze([
  "app/**",
  "components/**",
  "db/**",
  "frontend/**",
  "icm/04-briefing/**",
  "lib/**",
  "public/**",
  "scripts/**",
  "tests/**",
  "themes/**",
  "tools/parity/** excluding tools/parity/out/** and tools/parity/reference/combined/**",
  "tools/local-tls-proxy.mjs",
  "auth.ts",
  "package.json",
  "package-lock.json",
  "next.config.*",
  "playwright.config.*",
  "tsconfig*.json",
  "vitest*.config.*",
  "eslint.config.*",
  "postcss.config.*",
  "middleware.ts",
  "instrumentation.ts",
]);

const MATERIAL_PREFIXES = Object.freeze([
  "app/",
  "components/",
  "db/",
  "frontend/",
  "icm/04-briefing/",
  "lib/",
  "public/",
  "scripts/",
  "tests/",
  "themes/",
  "tools/parity/",
]);
const MATERIAL_FILES =
  /^(package\.json|package-lock\.json|next\.config\.[^/]*|playwright\.config\.[^/]*|tsconfig[^/]*\.json|vitest[^/]*\.config\.[^/]*|eslint\.config\.[^/]*|postcss\.config\.[^/]*|middleware\.ts|instrumentation\.ts|auth\.ts|tools\/local-tls-proxy\.mjs)$/;

// Explicit, justified exclusions inside otherwise-material prefixes. These are
// generated outputs or packaged evidence, never runtime/build/capture inputs;
// hashing them would be circular (evidence hashing itself).
export const MATERIAL_EXCLUSIONS = Object.freeze([
  "tools/parity/out/", // generated capture output (gitignored anyway)
  "tools/parity/reference/combined/", // packaged evidence + receipts
  "tools/parity/reference/node_modules/", // installed deps, pinned via lockfile
]);

function isMaterialPath(file) {
  if (MATERIAL_EXCLUSIONS.some((prefix) => file.startsWith(prefix)))
    return false;
  return (
    MATERIAL_PREFIXES.some((prefix) => file.startsWith(prefix)) ||
    MATERIAL_FILES.test(file)
  );
}

export function assertCommitMatchesSource(root, source) {
  if (!/^[0-9a-f]{40}$/.test(source?.sha ?? ""))
    throw new Error("capture source commit is malformed");
  git(root, ["cat-file", "-e", `${source.sha}^{commit}`]);
  const tree = git(root, ["rev-parse", `${source.sha}^{tree}`]).trim();
  if (tree !== source.tree)
    throw new Error("capture source tree does not match its commit");
  execFileSync("git", [
    "-C",
    root,
    "merge-base",
    "--is-ancestor",
    source.sha,
    "HEAD",
  ]);
}

export function materialTreeSha256(root, ref = "HEAD") {
  const listing = git(root, [
    "ls-tree",
    "-r",
    "--format=%(objectname)%x09%(path)",
    ref,
  ])
    .split("\n")
    .filter(Boolean)
    .filter((line) => isMaterialPath(line.split("\t")[1]));
  return createHash("sha256")
    .update(listing.join("\n") + "\n")
    .digest("hex");
}

export function changedPathsSince(root, ref) {
  const out = git(root, [
    "diff",
    "--name-only",
    "--no-renames",
    `${ref}..HEAD`,
  ]);
  return out ? out.split("\n").filter(Boolean).sort() : [];
}

export function sourceIdentity(root = DEFAULT_ROOT, ref = "HEAD") {
  return {
    pathspec: MATERIAL_PATHSPEC,
    materialTreeSha256: materialTreeSha256(root, ref),
  };
}

export function assertCurrentMaterialInputs(root, source) {
  const actual = materialTreeSha256(root, "HEAD");
  if (actual !== source.materialTreeSha256)
    throw new Error(
      `material inputs changed since capture (${actual} != ${source.materialTreeSha256}); rerun the combined gate`,
    );
}

/** Material inputs dirty in the working tree (modified, staged, or untracked).
 * Verification and capture must refuse these: certifying committed HEAD while
 * execution reads different bytes would be a silent identity mix-up. */
export function dirtyMaterialPaths(root) {
  const out = git(root, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "-z",
  ]);
  return out
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(3))
    .filter((file) => file && isMaterialPath(file))
    .sort();
}

export function assertCleanMaterialCheckout(root) {
  const dirty = dirtyMaterialPaths(root);
  if (dirty.length)
    throw new Error(
      `dirty material inputs; a clean checkout is required: ${dirty.join(", ")}`,
    );
}

export function assertPostCaptureDelta(root, compatibility) {
  const expected = [...(compatibility?.postCapturePaths ?? [])].sort();
  const actual = changedPathsSince(root, compatibility?.capture?.sha);
  // Identity model: a bare capture commit (HEAD == capture.sha) has a valid
  // zero-delta state by identity — both lists empty. A descendant must record
  // exactly the paths it adds. Mismatch (forged or missing paths) refuses.
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `post-capture delta differs; expected explicit receipt paths, got ${JSON.stringify(actual)}`,
    );
}
