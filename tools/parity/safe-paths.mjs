import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigError } from "./compare.mjs";

const OWNER_FILE = ".parity-output-owner.json";
const OWNER = Object.freeze({
  owner: "tools/parity/run.mjs",
  version: 1,
});

export function canonicalizePath(
  value,
  { mustExist = false, label = "path" } = {},
) {
  if (typeof value !== "string" || !value.trim())
    throw new ConfigError(`${label} must be a non-empty path`);
  const resolved = path.resolve(value);
  if (fs.existsSync(resolved)) return fs.realpathSync(resolved);
  if (mustExist) throw new ConfigError(`${label} does not exist: ${value}`);

  const tail = [];
  let cursor = resolved;
  while (!fs.existsSync(cursor)) {
    tail.unshift(path.basename(cursor));
    const parent = path.dirname(cursor);
    if (parent === cursor)
      throw new ConfigError(`${label} has no existing parent: ${value}`);
    cursor = parent;
  }
  return path.join(fs.realpathSync(cursor), ...tail);
}

export function isWithin(child, parent) {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export function assertNoOverlap(a, b, aLabel, bLabel) {
  if (isWithin(a, b) || isWithin(b, a))
    throw new ConfigError(
      `${aLabel} overlaps ${bLabel}: ${a} cannot equal or contain ${b}`,
    );
}

export function protectedInputPaths(root) {
  const candidates = [
    "app",
    "components",
    "db",
    "docs",
    "frontend",
    "icm",
    "lib",
    "public",
    "scripts",
    "tests",
    "tools/parity/baseline",
    "tools/parity/reference/proposed",
    "tools/parity/reference/evidence",
  ];
  const paths = candidates
    .filter((relative) => fs.existsSync(path.join(root, relative)))
    .map((relative) =>
      canonicalizePath(path.join(root, relative), {
        mustExist: true,
        label: relative,
      }),
    );
  paths.push(
    canonicalizePath(path.join(root, "tools/parity/reference/combined"), {
      label: "combined evidence package",
    }),
  );
  return paths;
}

export function assertCombinedRunPaths({ root, referenceDir, outDir, update }) {
  if (update)
    throw new ConfigError(
      "--update-baseline is forbidden in combined proposed-reference verification",
    );
  const canonicalRoot = fs.realpathSync(root);
  const proposed = canonicalizePath(
    path.join(canonicalRoot, "tools/parity/reference/proposed"),
    { mustExist: true, label: "proposed reference" },
  );
  const reference = canonicalizePath(referenceDir, {
    mustExist: true,
    label: "PARITY_REFERENCE_DIR",
  });
  if (reference !== proposed)
    throw new ConfigError(
      `PARITY_REFERENCE_DIR must resolve to ${proposed}; got ${reference}`,
    );
  if (!fs.statSync(reference).isDirectory())
    throw new ConfigError("PARITY_REFERENCE_DIR must be a directory");

  const out = canonicalizePath(outDir, { label: "PARITY_OUT_DIR" });
  const broad = new Set([
    canonicalRoot,
    path.dirname(canonicalRoot),
    os.homedir(),
    os.tmpdir(),
    path.parse(out).root,
  ]);
  if (broad.has(out) || isWithin(canonicalRoot, out))
    throw new ConfigError(
      `PARITY_OUT_DIR resolves to a broad directory: ${out}`,
    );
  for (const protectedPath of protectedInputPaths(canonicalRoot))
    assertNoOverlap(out, protectedPath, "PARITY_OUT_DIR", "protected input");
  return { root: canonicalRoot, reference, out };
}

export function prepareOwnedOutputDir(out) {
  const resolved = canonicalizePath(out, { label: "output directory" });
  const marker = path.join(resolved, OWNER_FILE);
  if (fs.existsSync(resolved)) {
    if (!fs.statSync(resolved).isDirectory())
      throw new ConfigError("PARITY_OUT_DIR exists and is not a directory");
    if (fs.existsSync(marker)) {
      const stat = fs.lstatSync(marker);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new ConfigError(
          "parity output owner marker is not a regular file",
        );
      const actual = JSON.parse(fs.readFileSync(marker, "utf8"));
      if (actual.owner !== OWNER.owner || actual.version !== OWNER.version)
        throw new ConfigError("PARITY_OUT_DIR is not owned by this parity run");
    } else if (fs.readdirSync(resolved).length) {
      throw new ConfigError(
        "PARITY_OUT_DIR is non-empty and not owned by this parity run",
      );
    }
  } else {
    fs.mkdirSync(resolved, { recursive: true });
  }
  if (!fs.existsSync(marker))
    fs.writeFileSync(marker, JSON.stringify(OWNER, null, 2) + "\n", {
      flag: "wx",
    });
  return { path: resolved, ownerFile: marker };
}

export function assertFreshOutputPath(file, label) {
  const resolved = canonicalizePath(file, { label });
  if (fs.existsSync(resolved))
    throw new ConfigError(`${label} already exists: ${resolved}`);
  return resolved;
}
