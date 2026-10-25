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
  "tools/parity/** excluding tools/parity/reference/combined/**",
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
  "tools/parity/",
]);
const MATERIAL_FILES =
  /^(package\.json|package-lock\.json|next\.config\.[^/]*|playwright\.config\.[^/]*|tsconfig[^/]*\.json|vitest[^/]*\.config\.[^/]*|eslint\.config\.[^/]*|postcss\.config\.[^/]*|middleware\.ts|instrumentation\.ts)$/;

function isMaterialPath(file) {
  if (file.startsWith("tools/parity/reference/combined/")) return false;
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

export function assertPostCaptureDelta(root, compatibility) {
  const expected = [...(compatibility?.postCapturePaths ?? [])].sort();
  const actual = changedPathsSince(root, compatibility?.capture?.sha);
  if (!expected.length || JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `post-capture delta differs; expected explicit receipt paths, got ${JSON.stringify(actual)}`,
    );
}
