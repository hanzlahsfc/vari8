import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const args = process.argv.slice(2);
const command = args[0];
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const rootFlag = args.indexOf("--root");
const root =
  rootFlag >= 0 && args[rootFlag + 1]
    ? path.resolve(args[rootFlag + 1])
    : defaultRoot;
const workflowPath = "docs/conductor-generic/SKILL.md";
const workflowSha256 =
  "11bd6ccbd8bcff1b8934c2cd689fef34af3d98e2b00a3378dfbace67e47a7ad7";
const requiredFiles = [
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
  "docs/references/icm.md",
  "docs/agent-workflow/CONTEXT.md",
  workflowPath,
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
const requiredSourcePaths = [
  "src",
  "public",
  "scripts",
  "prompts",
  "MEALPLANS.md",
  "TRACKER-REDESIGN.md",
];
const publicationMappings = [
  ["src/", "frontend/src/"],
  ["public/", "frontend/public/"],
  ["scripts/", "frontend/scripts/"],
  ["prompts/", "frontend/prompts/"],
  ["MEALPLANS.md", "frontend/MEALPLANS.md"],
  ["TRACKER-REDESIGN.md", "frontend/TRACKER-REDESIGN.md"],
];
const stageContexts = {
  intake: "docs/agent-workflow/01-intake/CONTEXT.md",
  scout: "docs/agent-workflow/02-scout/CONTEXT.md",
  plan: "docs/agent-workflow/03-plan/CONTEXT.md",
  build: "docs/agent-workflow/04-build/CONTEXT.md",
  validate: "docs/agent-workflow/05-validate/CONTEXT.md",
  review: "docs/agent-workflow/06-review/CONTEXT.md",
};
const roleContexts = {
  lead: "docs/agent-workflow/roles/lead.md",
  worker: "docs/agent-workflow/roles/worker.md",
  reviewer: "docs/agent-workflow/roles/reviewer.md",
};

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function exists(relativePath) {
  try {
    await stat(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function markdownFiles(directory) {
  const entries = await readdir(path.join(root, directory), {
    withFileTypes: true,
  }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(relativePath)));
    else if (entry.isFile() && entry.name.endsWith(".md"))
      files.push(relativePath);
  }
  return files;
}

async function check() {
  const errors = [];
  for (const file of requiredFiles) {
    if (!(await exists(file))) errors.push(`Missing required file: ${file}`);
  }
  for (const sourcePath of requiredSourcePaths) {
    if (!(await exists(sourcePath)))
      errors.push(
        `Missing source path used by publication mapping: ${sourcePath}`,
      );
  }

  const nodeRecommendation = (await read(".nvmrc").catch(() => "")).trim();
  const packageMetadata = await read("package.json")
    .then((content) => JSON.parse(content))
    .catch(() => null);
  const lockMetadata = await read("package-lock.json")
    .then((content) => JSON.parse(content))
    .catch(() => null);
  const nodeVersion = /^\d+(?:\.\d+){0,2}$/.test(nodeRecommendation)
    ? nodeRecommendation.split(".")
    : undefined;
  const expectedNodeEngine = nodeVersion
    ? `>=${[nodeVersion[0], nodeVersion[1] ?? "0", nodeVersion[2] ?? "0"].join(".")}`
    : undefined;
  if (!expectedNodeEngine) errors.push(".nvmrc must contain a Node version");
  if (packageMetadata && packageMetadata.engines?.node !== expectedNodeEngine)
    errors.push("package.json Node engine must match .nvmrc");
  if (
    lockMetadata &&
    lockMetadata.packages?.[""]?.engines?.node !== expectedNodeEngine
  )
    errors.push(
      "package-lock.json engine does not match package.json and .nvmrc",
    );

  const agents = await read("AGENTS.md").catch(() => "");
  const context = await read("PROJECT_CONTEXT.md").catch(() => "");
  const provenance = await read("docs/conductor-generic/PROVENANCE.md").catch(
    () => "",
  );
  const checks = [
    [
      agents.includes("PROJECT_CONTEXT.md"),
      "AGENTS.md must point to PROJECT_CONTEXT.md",
    ],
    [
      agents.includes(workflowPath),
      "AGENTS.md must point to the pinned workflow",
    ],
    [
      (await read("CLAUDE.md").catch(() => "")).includes("@AGENTS.md"),
      "CLAUDE.md must delegate to AGENTS.md",
    ],
    [
      (await read("DEVIN.md").catch(() => "")).includes("AGENTS.md") &&
        (await read("DEVIN.md").catch(() => "")).includes("PROJECT_CONTEXT.md"),
      "DEVIN.md must point to the shared entrypoint and context",
    ],
    [context.includes("/coach"), "PROJECT_CONTEXT.md must identify /coach"],
    [
      context.includes("local storage"),
      "PROJECT_CONTEXT.md must state browser storage boundary",
    ],
    [
      context.includes("frontend/"),
      "PROJECT_CONTEXT.md must document frontend/ publication mapping",
    ],
    [
      (await read("docs/references/icm.md").catch(() => "")).includes(
        "2603.16021v2",
      ),
      "ICM reference must pin the paper version",
    ],
    [
      (await read("docs/agent-workflow/CONTEXT.md").catch(() => "")).includes(
        "Layer 1",
      ),
      "Agent workflow router must identify its context layer",
    ],
    [
      (await read(".gitignore").catch(() => "")).includes("/.agent-runs/"),
      ".gitignore must exclude per-run evidence",
    ],
    [
      provenance.includes(workflowSha256),
      "PROVENANCE.md must contain the pinned workflow checksum",
    ],
    [
      provenance.includes("340f95ccf7f0cb8a0bfed969c4a2f6d339e221b1"),
      "PROVENANCE.md must identify the source commit",
    ],
  ];
  for (const [ok, message] of checks) if (!ok) errors.push(message);

  const workflowRouter = await read("docs/agent-workflow/CONTEXT.md").catch(
    () => "",
  );
  for (const [stageName, stagePath] of Object.entries(stageContexts)) {
    const stageContract = await read(stagePath).catch(() => "");
    if (!workflowRouter.includes(stagePath.split("/").at(-2)))
      errors.push(`Workflow router is missing the ${stageName} stage`);
    for (const section of ["## Inputs", "## Process", "## Outputs"]) {
      if (!stageContract.includes(section))
        errors.push(`${stageName} stage contract is missing ${section}`);
    }
  }

  const markdownContextFiles = [
    "AGENTS.md",
    "CLAUDE.md",
    "DEVIN.md",
    "PROJECT_CONTEXT.md",
    "README.md",
    ...(await markdownFiles("docs")),
  ];
  for (const file of markdownContextFiles) {
    const content = await read(file).catch(() => "");
    for (const [, target] of content.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^(?:[a-z]+:|#)/i.test(target)) continue;
      const relativeTarget = target.split("#", 1)[0];
      const resolvedTarget = path.resolve(
        root,
        path.dirname(file),
        relativeTarget,
      );
      const isInsideRoot =
        resolvedTarget === root ||
        resolvedTarget.startsWith(`${root}${path.sep}`);
      if (!isInsideRoot || !(await exists(path.relative(root, resolvedTarget))))
        errors.push(`${file} has a broken or non-local link: ${target}`);
    }
  }

  const mappingLines = await read("PROJECT_CONTEXT.md").catch(() => "");
  for (const [source, destination] of publicationMappings) {
    if (!mappingLines.includes(`\`${source}\` → \`${destination}\``))
      errors.push(
        `PROJECT_CONTEXT.md is missing publication mapping ${source} → ${destination}`,
      );
  }

  const workflow = await read(workflowPath).catch(() => "");
  if (workflow) {
    const actual = createHash("sha256").update(workflow).digest("hex");
    if (actual !== workflowSha256)
      errors.push(
        `Workflow checksum mismatch: expected ${workflowSha256}, got ${actual}`,
      );
  }

  for (const file of markdownContextFiles) {
    const content = await read(file).catch(() => "");
    if (
      /\/Users\/|\/private\/tmp\/|~\/|\/home\/|(?:^|[\s("'`])(?:[A-Za-z]:[\\/]|\\\\[^\\\s]+\\[^\\\s]+)/m.test(
        content,
      )
    )
      errors.push(`${file} contains a machine-specific absolute path`);
  }

  if (errors.length) {
    process.stderr.write(`${errors.map((error) => `- ${error}`).join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    "Agent context is complete; workflow pin and publication mapping are valid.\n",
  );
}

function handoff() {
  const stageName = option("--stage");
  const roleName = option("--role") ?? "lead";
  if (stageName && !(stageName in stageContexts)) {
    process.stderr.write(
      `Unknown stage: ${stageName}. Choose one of ${Object.keys(stageContexts).join(", ")}.\n`,
    );
    process.exitCode = 2;
    return;
  }
  if (!(roleName in roleContexts)) {
    process.stderr.write(
      `Unknown role: ${roleName}. Choose one of ${Object.keys(roleContexts).join(", ")}.\n`,
    );
    process.exitCode = 2;
    return;
  }
  process.stdout.write(
    `${[
      "Read AGENTS.md and the relevant sections of PROJECT_CONTEXT.md. This is a file-based ICM adaptation; follow the route in docs/agent-workflow/CONTEXT.md and load only the selected stage contract and role file, not all stages or history.",
      `Role: ${roleName} (${roleContexts[roleName]}).${stageName ? ` Stage: ${stageName} (${stageContexts[stageName]}).` : " Choose the stage from the task; do not preload every stage."}`,
      "For non-trivial software work, use docs/conductor-generic/SKILL.md as the process reference; source commit and checksum are in docs/conductor-generic/PROVENANCE.md. The ICM paper guides context structure, not CI or authorization.",
      "Product boundary: /coach is a standalone browser-only prototype; data is illustrative and persisted in local storage. No backend, credentials, account system, or server authorization is implemented.",
      "The target repository's database/RBAC/consent/audit gates and approved P1/P2/I4 integration scopes are separate; this preview does not pass those gates and those scopes do not authorize wiring or simulating authorization.",
      `Source map: ${publicationMappings.map(([source, destination]) => `${source}→${destination}`).join("; ")}. Keep publication-only tests/config additive; omit dependencies, build output, environment files, and local artifacts.`,
      "Preserve the existing UI style and interaction patterns unless the current task directs otherwise.",
    ].join("\n")}\n`,
  );
}

if (command === "--check") await check();
else if (command === "--handoff") handoff();
else {
  process.stderr.write(
    "Usage: node scripts/agent-context.mjs --check|--handoff [--stage intake|scout|plan|build|validate|review] [--role lead|worker|reviewer]\n",
  );
  process.exitCode = 2;
}
