#!/usr/bin/env node
// Vari8 plan-to-issues generator. Contract: icm/03-plan/DECISIONS.md D9.
// Default mode is a dry run: prints the issue JSON array to stdout.
// --apply creates/edits issues in the tracker repo. Do not run it unattended.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PLAN_PATH = resolve(HERE, "..", "output", "PLAN.md");
export const REPO = "hanzlahsfc/The-great-tracker-";
const SOURCE_FOOTER = "Source: icm/03-plan/output/PLAN.md (TRACKER branch)";

export const LABELS = [
  "decision",
  "foundation",
  "model",
  "service",
  "wiring",
  "mobile",
];
const MILESTONE = {
  decision: "Decisions",
  foundation: "Foundation",
  model: "Model",
  service: "Service",
  wiring: "Wiring",
  mobile: "Mobile",
};

export function labelFor(id) {
  if (id === "PR-MSG" || id === "PR-MEDIA") return "wiring";
  if (/^PR-0[1-5]$/.test(id)) return "foundation";
  if (/^PR-M\d/.test(id)) return "model";
  if (/^PR-SV/.test(id)) return "service";
  if (/^PR-W/.test(id)) return "wiring";
  if (id === "PR-31") return "mobile";
  throw new Error(`no label rule for ${id}`);
}

// PR ids named in prose or a Depends on line. Handles the two shorthand forms the
// plan uses: "PR-W1 to PR-W10" (range) and "PR-W2/6" (same prefix, second number).
export function idsIn(text, known = new Set()) {
  const out = new Set();
  for (const m of text.matchAll(
    /PR-[A-Z0-9]+(?:\s+to\s+PR-[A-Z0-9]+)?(?:\/\d+)?/g,
  )) {
    const [head, tail] = m[0].split(/\s+to\s+/);
    if (tail) {
      for (const id of expandRange(head, tail, known)) out.add(id);
      continue;
    }
    const [id, slash] = head.split("/");
    out.add(id);
    if (slash) {
      const p = /^(PR-[A-Z]+)\d+$/.exec(id);
      if (p) out.add(`${p[1]}${slash}`);
    }
  }
  return [...out];
}

function expandRange(from, to, known) {
  const a = /^PR-([A-Z]+)(\d+)$/.exec(from);
  const b = /^PR-([A-Z]+)(\d+)$/.exec(to);
  if (!a || !b || a[1] !== b[1]) return [from, to];
  const ids = [];
  for (let n = Number(a[2]); n <= Number(b[2]); n++) ids.push(`PR-${a[1]}${n}`);
  return known.size ? ids.filter((id) => known.has(id)) : ids;
}

const HEADING = /^## (.+?)\((PR-[A-Z0-9]+)\)\s*$/;

export function parseBuilds(text) {
  const builds = [];
  let cur = null;
  for (const line of text.split("\n")) {
    const m = HEADING.exec(line);
    if (m) {
      if (cur) builds.push(cur);
      cur = { id: m[2], title: m[1].trim(), heading: line, lines: [] };
      continue;
    }
    if (/^## /.test(line)) {
      if (cur) builds.push(cur);
      cur = null;
      continue;
    }
    if (cur) cur.lines.push(line);
  }
  if (cur) builds.push(cur);

  const known = new Set(builds.map((b) => b.id));
  for (const b of builds) {
    b.body = b.lines.join("\n").replace(/\n+$/, "");
    b.section = `${b.heading}\n${b.body}`;
    const dep = /^\*\*Depends on\.\*\*\s*(.+?)\.?\s*$/m.exec(b.body);
    const raw = dep ? dep[1].replace(/\.$/, "").trim() : "";
    b.dependsOn = !raw || /^none$/i.test(raw) ? [] : idsIn(raw, known);
  }
  return builds;
}

export function parseDecisions(text) {
  const lines = text.split("\n");
  const start = lines.findIndex(
    (l) => l.trim() === "## Owner decisions needed",
  );
  if (start === -1) return [];
  const section = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) break;
    section.push(lines[i]);
  }
  // Split on the Q<n>. / AUTH. markers, not on the bullets: one bullet can hold two questions.
  const parts = section.join("\n").split(/(?=(?:^|[ \t])(?:Q\d+|AUTH)\.\s)/m);
  const decisions = [];
  for (const part of parts) {
    const raw = part.trim().replace(/^-[ \t]*/, "");
    const m = /^(Q\d+|AUTH)\.\s+([\s\S]*)$/.exec(raw);
    if (!m) continue;
    decisions.push({ id: m[1], key: m[1], text: m[2].trim(), section: raw });
  }
  return decisions;
}

function titleOf(decision) {
  const sentences = decision.text.split(/(?<=[.!?])\s+/);
  const pick =
    /^The evidence is /.test(sentences[0]) && sentences[1]
      ? sentences[1]
      : sentences[0];
  return pick.replace(/`/g, "").trim();
}

export function buildIssues(text) {
  const builds = parseBuilds(text);
  const decisions = parseDecisions(text);
  const known = new Set([
    ...builds.map((b) => b.id),
    ...decisions.map((d) => d.key),
  ]);

  const blockersByBuild = new Map(
    builds.map((b) => [b.id, new Set(b.dependsOn)]),
  );
  for (const d of decisions) {
    for (const id of idsIn(d.text, known)) {
      if (blockersByBuild.has(id)) blockersByBuild.get(id).add(d.key);
    }
  }

  const issues = [];
  for (const d of decisions) {
    issues.push({
      key: d.key,
      kind: "decision",
      title: `[DECISION ${d.id}] ${titleOf(d)}`,
      labels: ["decision"],
      milestone: MILESTONE.decision,
      blockedBy: [],
      section: d.section,
    });
  }
  for (const b of builds) {
    const label = labelFor(b.id);
    issues.push({
      key: b.id,
      kind: "build",
      title: `[${b.id}] ${b.title}`,
      labels: [label],
      milestone: MILESTONE[label],
      blockedBy: [...blockersByBuild.get(b.id)],
      section: b.section,
    });
  }
  return issues.map((i) => ({ ...i, body: issueBody(i, "dry") }));
}

export function issueBody(issue, mode, numbers = new Map()) {
  const items = issue.blockedBy.map((k) =>
    mode === "apply" ? `- #${numbers.get(k) ?? k}` : `- ${k}`,
  );
  return [
    `<!-- vari8:${issue.key} -->`,
    "",
    issue.section,
    "",
    "### Blocked by",
    ...(items.length ? items : ["None."]),
    "",
    SOURCE_FOOTER,
    "",
  ].join("\n");
}

function apply(issues) {
  const run = (args) => execFileSync("gh", args, { encoding: "utf8" });
  const json = (args) => JSON.parse(run(args));

  const haveLabels = new Set(
    json(["label", "list", "-R", REPO, "--limit", "200", "--json", "name"]).map(
      (l) => l.name,
    ),
  );
  for (const l of LABELS) {
    if (!haveLabels.has(l)) {
      run([
        "label",
        "create",
        l,
        "-R",
        REPO,
        "--color",
        "ededed",
        "--description",
        `vari8 ${l}`,
      ]);
      console.error(`label created: ${l}`);
    }
  }

  const haveMilestones = new Set(
    json(["api", `repos/${REPO}/milestones?state=all&per_page=100`]).map(
      (m) => m.title,
    ),
  );
  for (const m of new Set(Object.values(MILESTONE))) {
    if (!haveMilestones.has(m)) {
      run(["api", `repos/${REPO}/milestones`, "-f", `title=${m}`]);
      console.error(`milestone created: ${m}`);
    }
  }

  // Match markers locally on the full issue list: GitHub search lags behind new issues and
  // may not index HTML comments, so a search-based lookup would create duplicates on rerun.
  const all = json([
    "issue",
    "list",
    "-R",
    REPO,
    "--state",
    "all",
    "--limit",
    "1000",
    "--json",
    "number,body",
  ]);
  const numbers = new Map();
  for (const issue of issues) {
    const found = all.filter((f) =>
      (f.body ?? "").startsWith(`<!-- vari8:${issue.key} -->`),
    );
    if (found.length > 1)
      throw new Error(`${issue.key}: ${found.length} issues carry the marker`);
    if (found.length === 1) {
      numbers.set(issue.key, found[0].number);
    } else {
      const url = run([
        "issue",
        "create",
        "-R",
        REPO,
        "--title",
        issue.title,
        "--body",
        issueBody(issue, "dry"),
        "--label",
        issue.labels[0],
        "--milestone",
        issue.milestone,
      ]);
      numbers.set(issue.key, Number(url.trim().match(/\/(\d+)\s*$/)[1]));
      console.error(
        `issue created: ${issue.key} -> #${numbers.get(issue.key)}`,
      );
    }
  }

  // Second pass: bodies now carry real issue numbers. Edit only when something differs,
  // so a rerun leaves the tracker unchanged.
  for (const issue of issues) {
    const n = numbers.get(issue.key);
    const cur = json([
      "issue",
      "view",
      String(n),
      "-R",
      REPO,
      "--json",
      "title,body,labels,milestone",
    ]);
    const body = issueBody(issue, "apply", numbers);
    const labels = (cur.labels ?? [])
      .map((l) => l.name)
      .sort()
      .join(",");
    const same =
      cur.title === issue.title &&
      cur.body === body &&
      labels === [...issue.labels].sort().join(",") &&
      (cur.milestone?.title ?? "") === issue.milestone;
    if (same) continue;
    run([
      "issue",
      "edit",
      String(n),
      "-R",
      REPO,
      "--title",
      issue.title,
      "--body",
      body,
      "--add-label",
      issue.labels[0],
      "--milestone",
      issue.milestone,
    ]);
    console.error(`issue updated: ${issue.key} -> #${n}`);
  }

  console.log("key -> issue");
  for (const issue of issues)
    console.log(`${issue.key.padEnd(10)} #${numbers.get(issue.key)}`);
}

function main() {
  const issues = buildIssues(readFileSync(PLAN_PATH, "utf8"));
  if (process.argv.includes("--apply")) {
    apply(issues);
    return;
  }
  console.log(JSON.stringify(issues, null, 2));
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
