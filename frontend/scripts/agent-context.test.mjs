import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts/agent-context.mjs");
const workflow = await readFile(
  path.join(root, "docs/conductor-generic/SKILL.md"),
  "utf8",
);

async function createFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-context-"));
  const files = [
    "AGENTS.md",
    "CLAUDE.md",
    "DEVIN.md",
    "PROJECT_CONTEXT.md",
    "README.md",
    "docs/PR-WORKFLOW.md",
    ".nvmrc",
    "package.json",
    "package-lock.json",
    "docs/conductor-generic/PROVENANCE.md",
    "docs/conductor-generic/SKILL.md",
    "docs/references/icm.md",
    "docs/agent-workflow/CONTEXT.md",
    "docs/agent-workflow/01-intake/CONTEXT.md",
    "docs/agent-workflow/02-scout/CONTEXT.md",
    "docs/agent-workflow/03-plan/CONTEXT.md",
    "docs/agent-workflow/04-build/CONTEXT.md",
    "docs/agent-workflow/05-validate/CONTEXT.md",
    "docs/agent-workflow/06-review/CONTEXT.md",
    "docs/agent-workflow/roles/lead.md",
    "docs/agent-workflow/roles/worker.md",
    "docs/agent-workflow/roles/reviewer.md",
  ];
  const mapping = [
    ["src/", "frontend/src/"],
    ["public/", "frontend/public/"],
    ["scripts/", "frontend/scripts/"],
    ["prompts/", "frontend/prompts/"],
    ["MEALPLANS.md", "frontend/MEALPLANS.md"],
    ["TRACKER-REDESIGN.md", "frontend/TRACKER-REDESIGN.md"],
  ]
    .map(([source, target]) => `- \`${source}\` → \`${target}\``)
    .join("\n");
  for (const file of files) {
    const destination = path.join(directory, file);
    await mkdir(path.dirname(destination), { recursive: true });
    const content =
      file === "AGENTS.md"
        ? "Read PROJECT_CONTEXT.md and docs/conductor-generic/SKILL.md."
        : file === "CLAUDE.md"
          ? "@AGENTS.md"
          : file === "DEVIN.md"
            ? "Read AGENTS.md and PROJECT_CONTEXT.md."
            : file === "PROJECT_CONTEXT.md"
              ? `The /coach prototype persists in local storage and maps to frontend/.\n${mapping}`
              : file === "docs/PR-WORKFLOW.md"
                ? "See [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) for mappings."
                : file === "docs/conductor-generic/PROVENANCE.md"
                  ? "Source 340f95ccf7f0cb8a0bfed969c4a2f6d339e221b1; SHA-256 11bd6ccbd8bcff1b8934c2cd689fef34af3d98e2b00a3378dfbace67e47a7ad7."
                  : file.endsWith("SKILL.md")
                    ? workflow
                    : file === "docs/references/icm.md"
                      ? "arXiv:2603.16021v2"
                      : file === "docs/agent-workflow/CONTEXT.md"
                        ? "Layer 1 router 01-intake 02-scout 03-plan 04-build 05-validate 06-review"
                        : file.startsWith("docs/agent-workflow/0")
                          ? "## Inputs\n\n## Process\n\n## Outputs"
                          : "fixture";
    await writeFile(destination, content);
  }
  await writeFile(path.join(directory, ".nvmrc"), "24\n");
  await writeFile(
    path.join(directory, "package.json"),
    `${JSON.stringify({
      name: "agent-context-fixture",
      engines: { node: ">=24.0.0" },
    })}\n`,
  );
  await writeFile(
    path.join(directory, "package-lock.json"),
    `${JSON.stringify({
      name: "agent-context-fixture",
      lockfileVersion: 3,
      packages: {
        "": {
          name: "agent-context-fixture",
          engines: { node: ">=24.0.0" },
        },
      },
    })}\n`,
  );
  for (const directoryName of ["src", "public", "scripts", "prompts"])
    await mkdir(path.join(directory, directoryName));
  await writeFile(path.join(directory, "MEALPLANS.md"), "fixture");
  await writeFile(path.join(directory, "TRACKER-REDESIGN.md"), "fixture");
  await writeFile(path.join(directory, ".gitignore"), "/.agent-runs/\n");
  return directory;
}

function run(command, directory) {
  return spawnSync(process.execPath, [script, command, "--root", directory], {
    encoding: "utf8",
  });
}

test("context check rejects a missing required entrypoint", async () => {
  const directory = await createFixture();
  try {
    await rm(path.join(directory, "AGENTS.md"));
    const result = run("--check", directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing required file: AGENTS\.md/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const requiredRuntimeFile of [
  ".nvmrc",
  "package.json",
  "package-lock.json",
]) {
  test(`context check requires ${requiredRuntimeFile}`, async () => {
    const directory = await createFixture();
    try {
      await rm(path.join(directory, requiredRuntimeFile));
      const result = run("--check", directory);
      assert.notEqual(result.status, 0);
      assert.ok(
        result.stderr.includes(`Missing required file: ${requiredRuntimeFile}`),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("context check rejects a Node engine mismatch with the npm lock", async () => {
  const directory = await createFixture();
  try {
    const lockPath = path.join(directory, "package-lock.json");
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    lock.packages[""].engines.node = ">=22.0.0";
    await writeFile(lockPath, `${JSON.stringify(lock)}\n`);
    const result = run("--check", directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /package-lock\.json engine does not match/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("context check rejects a changed pinned Conductor snapshot", async () => {
  const directory = await createFixture();
  try {
    await writeFile(
      path.join(directory, "docs/conductor-generic/SKILL.md"),
      `${workflow}\nchanged`,
    );
    const result = run("--check", directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Workflow checksum mismatch/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("context check rejects a broken local reference link", async () => {
  const directory = await createFixture();
  try {
    await writeFile(
      path.join(directory, "AGENTS.md"),
      "[Missing context](missing-context.md)",
    );
    const result = run("--check", directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /broken or non-local link/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("context check validates links throughout workflow context docs", async () => {
  const directory = await createFixture();
  try {
    const file = path.join(
      directory,
      "docs/agent-workflow/02-scout/CONTEXT.md",
    );
    await writeFile(
      file,
      "## Inputs\n\n## Process\n\n## Outputs\n\n[Missing](./missing.md)\n",
    );
    const result = run("--check", directory);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /02-scout\/CONTEXT\.md has a broken or non-local link/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("context check accepts a local link that resolves exactly to repo root", async () => {
  const directory = await createFixture();
  try {
    const file = path.join(
      directory,
      "docs/agent-workflow/02-scout/CONTEXT.md",
    );
    await writeFile(
      file,
      "## Inputs\n\n## Process\n\n## Outputs\n\n[Project root](../../..)\n",
    );
    const result = run("--check", directory);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const machinePath of [
  "/Users/person/project",
  "/private/tmp/worktree",
  "~/project",
  "/home/person/project",
  "C:\\Users\\person\\project",
]) {
  test(`context check rejects machine-specific path ${machinePath}`, async () => {
    const directory = await createFixture();
    try {
      const file = path.join(
        directory,
        "docs/agent-workflow/02-scout/CONTEXT.md",
      );
      await writeFile(
        file,
        `## Inputs\n\n## Process\n\n## Outputs\n\nExample: ${machinePath}\n`,
      );
      const result = run("--check", directory);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /machine-specific absolute path/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("context check rejects an incomplete stage contract", async () => {
  const directory = await createFixture();
  try {
    await writeFile(
      path.join(directory, "docs/agent-workflow/02-scout/CONTEXT.md"),
      "## Inputs\n",
    );
    const result = run("--check", directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /scout stage contract is missing ## Process/);
    assert.match(result.stderr, /scout stage contract is missing ## Outputs/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("valid scoped handoff stays portable and contains no credentials", async () => {
  const directory = await createFixture();
  try {
    const check = execFileSync(
      process.execPath,
      [script, "--check", "--root", directory],
      { encoding: "utf8" },
    );
    assert.match(check, /publication mapping are valid/);
    const result = spawnSync(
      process.execPath,
      [
        script,
        "--handoff",
        "--stage",
        "scout",
        "--role",
        "worker",
        "--root",
        directory,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0);
    assert.match(result.stdout, /docs\/agent-workflow\/02-scout\/CONTEXT\.md/);
    assert.match(result.stdout, /docs\/agent-workflow\/roles\/worker\.md/);
    assert.doesNotMatch(
      result.stdout,
      /\/Users\/|\/private\/tmp\/|~\/|\/home\/|[A-Za-z]:[\\/]/,
    );
    assert.doesNotMatch(
      result.stdout,
      /(?:api[_-]?key|password|secret|token)\s*[:=]/i,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
