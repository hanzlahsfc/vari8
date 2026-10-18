#!/usr/bin/env node
// Check for plan-to-issues.mjs against the real PLAN.md.
// Run: node 04_PROJECTS/Vari8/icm/03-plan/tools/plan-to-issues.check.mjs
import { readFileSync } from 'node:fs';
import { buildIssues, parseDecisions, PLAN_PATH } from './plan-to-issues.mjs';

const text = readFileSync(PLAN_PATH, 'utf8');
const issues = buildIssues(text);
const builds = issues.filter((i) => i.kind === 'build');
const decisions = issues.filter((i) => i.kind === 'decision');

let failed = false;
const check = (name, ok, detail) => {
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const headingCount = [...text.matchAll(/^## .+?\(PR-[A-Z0-9]+\)\s*$/gm)].length;
check('build issues equal ## (PR-...) headings', builds.length === headingCount, `${builds.length} = ${headingCount}`);
check('build issues expected 31', builds.length === 31, `${builds.length}`);

const decisionText = parseDecisions(text).map((d) => d.section).join('\n');
const markers = new Set([...decisionText.matchAll(/(?:^|\s)(Q\d+)\./g)].map((m) => m[1]));
check('decision issues equal distinct Q<n>. markers', decisions.length === markers.size, `${decisions.length} = ${markers.size}`);
check('decision issues expected 15', decisions.length === 15, `${decisions.length}`);

const keys = new Set(issues.map((i) => i.key));
const dangling = issues.flatMap((i) => i.blockedBy.filter((k) => !keys.has(k)).map((k) => `${i.key}->${k}`));
check('every blockedBy key exists', dangling.length === 0, dangling.join(' ') || 'none dangling');

const adj = new Map(issues.map((i) => [i.key, i.blockedBy]));
const state = new Map();
const cycles = [];
const visit = (k, path) => {
  if (state.get(k) === 'done') return;
  if (state.get(k) === 'open') { cycles.push([...path, k].join(' -> ')); return; }
  state.set(k, 'open');
  for (const next of adj.get(k) ?? []) if (adj.has(next)) visit(next, [...path, k]);
  state.set(k, 'done');
};
for (const k of adj.keys()) visit(k, []);
check('no dependency cycles', cycles.length === 0, cycles.join(' | ') || 'acyclic');

const badMarker = issues.filter((i) => !i.body.startsWith(`<!-- vari8:${i.key} -->\n`));
check('every body starts with its marker', badMarker.length === 0, badMarker.map((i) => i.key).join(' ') || 'all marked');

const tally = {};
for (const i of issues) for (const l of i.labels) tally[l] = (tally[l] ?? 0) + 1;
console.log(`\nby label: ${JSON.stringify(tally)}`);
console.log(`milestones: ${JSON.stringify([...new Set(issues.map((i) => i.milestone))])}`);
console.log(`\n${issues.length} issues (${builds.length} build, ${decisions.length} decision)`);
console.log(failed ? 'RESULT FAIL' : 'RESULT PASS');
process.exit(failed ? 1 : 0);
