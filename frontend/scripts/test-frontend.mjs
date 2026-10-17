import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const testPattern = /\.(?:test|checks)\.(?:mjs|js|cjs|ts|tsx)$/;

async function findTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findTests(entryPath);
      return testPattern.test(entry.name) ? [entryPath] : [];
    }),
  );
  return files.flat();
}

const testFiles = (
  await Promise.all([
    findTests(path.join(projectRoot, "src")),
    findTests(path.join(projectRoot, "scripts")),
  ])
)
  .flat()
  .sort();

if (testFiles.length === 0) {
  console.error("No frontend test files were found.");
  process.exitCode = 1;
} else {
  const loader = path.join(
    projectRoot,
    "src/components/coach/plans/test-loader.mjs",
  );
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--loader", loader, "--test", ...testFiles],
    { cwd: projectRoot, stdio: "inherit" },
  );

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
