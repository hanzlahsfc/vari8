#!/usr/bin/env node
// CANVAS-PORT: copy Lilly's frontend/src tree (FRONTEND 51fa6a2, base fe5780d)
// into the root canvas, rewriting import specifiers.
// Rerunnable. `node tools/port-canvas/port.mjs --list` prints the plan only.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";

const SRC_REF = process.env.PORT_REF ?? "51fa6a2";
const BASE_REF = process.env.PORT_BASE ?? "fe5780d";
const SRC_PREFIX = "frontend/src/";
const ROOT = new URL("../../", import.meta.url).pathname;

// Hand-merged files: never touched by the mechanical copy.
const HAND_MERGE = new Set([
  "components/coach/store.tsx",
  "components/coach/coach-app.tsx",
  "components/coach/messages.tsx",
  "components/coach/model.ts",
  "components/coach/check-ins.tsx",
  "components/ethereal/mealplan/mealplan-workspace.tsx",
  "components/ethereal/builder/dashboard-builder.tsx",
  "lib/ethereal-appearance.tsx",
  "app/layout.tsx",
]);

// Out of scope: node:test suites and dev-only playground pages.
const OUT_OF_SCOPE =
  /(\.test\.mjs|\.checks\.mjs|\.test\.ts)$|^app\/dev\/|^components\/vari8\/playground|^components\/vari8\/input-showcase|^components\/vari8\/playground-unavailable/;

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function files() {
  return git("diff", "--name-status", BASE_REF, SRC_REF, "--", SRC_PREFIX)
    .trim()
    .split("\n")
    .map((l) => {
      const [status, path] = l.split("\t");
      return { status, rel: path.slice(SRC_PREFIX.length) };
    })
    .filter(({ rel }) => !OUT_OF_SCOPE.test(rel) && !HAND_MERGE.has(rel));
}

// frontend/src path -> root path
function target(rel) {
  if (rel === "app/layout.tsx") return "app/(canvas)/layout.tsx";
  // route dirs (app/<x>/**) port into the canvas route group; the group does
  // not change the URL, so they keep serving at /<x>/*.
  if (rel.startsWith("app/") && rel.slice("app/".length).includes("/"))
    return "app/(canvas)/" + rel.slice("app/".length);
  if (rel.startsWith("components/"))
    return "components/canvas/" + rel.slice("components/".length);
  if (rel.startsWith("lib/")) return "lib/canvas/" + rel.slice("lib/".length);
  if (rel.startsWith("data/"))
    return "lib/canvas/data/" + rel.slice("data/".length);
  if (rel.startsWith("styles/"))
    return "components/canvas/app/" + rel.slice("styles/".length);
  throw new Error("unmapped path: " + rel);
}

function rewrite(body) {
  return (
    body
      .replace(/(["'])@\/components\//g, "$1@/components/canvas/")
      .replace(/(["'])@\/lib\//g, "$1@/lib/canvas/")
      .replace(/(["'])(?:\.\.\/)+lib\//g, "$1@/lib/canvas/")
      .replace(/(["'])@\/data\//g, "$1@/lib/canvas/data/")
      .replace(/(["'])@\/styles\//g, "$1@/components/canvas/app/")
      // root keeps useReducedMotion in a local hook (hydration fix 828aece)
      .replace(
        /import\s*\{([^}]*)\}\s*from\s*["']motion\/react["'];/g,
        (m, names) => {
          const list = names
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const keep = list.filter((n) => !/^useReducedMotion$/.test(n));
          const hook =
            list.length !== keep.length
              ? 'import { useReducedMotion } from "@/lib/canvas/reduced-motion";\n'
              : "";
          return (
            hook +
            (keep.length
              ? `import { ${keep.join(", ")} } from "motion/react";`
              : "")
          );
        },
      )
  );
}

const list = files();
if (process.argv.includes("--list")) {
  for (const f of list) console.log(`${f.status}\t${target(f.rel)}`);
  console.error(`${list.length} files`);
  process.exit(0);
}

// --merge: three way merge of the hand-merged files. base = Lilly's base
// version, ours = the root canvas file, theirs = Lilly's new version.
// Imports are rewritten on base and theirs so only real changes conflict.
if (process.argv.includes("--merge")) {
  for (const rel of HAND_MERGE) {
    if (rel === "app/layout.tsx") continue; // route group layout, one line added by hand
    const out = join(ROOT, target(rel));
    const base = rewrite(git("show", `${BASE_REF}:${SRC_PREFIX}${rel}`));
    const theirs = rewrite(git("show", `${SRC_REF}:${SRC_PREFIX}${rel}`));
    const dir = mkdtempSync(join(tmpdir(), "port-merge-"));
    const [b, t] = [join(dir, "base"), join(dir, "theirs")];
    writeFileSync(b, base);
    writeFileSync(t, theirs);
    let merged,
      conflicts = 0;
    try {
      merged = execFileSync("git", ["merge-file", "-p", "--diff3", out, b, t], {
        encoding: "utf8",
      });
    } catch (e) {
      merged = e.stdout;
      conflicts = (merged.match(/^<{7}/gm) ?? []).length;
    }
    writeFileSync(out, merged);
    console.log(`${String(conflicts).padStart(3)} conflicts  ${target(rel)}`);
  }
  process.exit(0);
}

let written = 0,
  deleted = 0;
for (const { status, rel } of list) {
  const out = join(ROOT, target(rel));
  if (status === "D") {
    // deleted upstream: remove the ported copy and prune now-empty dirs
    if (existsSync(out)) {
      unlinkSync(out);
      for (let dir = dirname(out); dir.startsWith(ROOT + sep);) {
        try {
          rmdirSync(dir);
        } catch {
          break;
        }
        dir = dirname(dir);
      }
    }
    deleted++;
    continue;
  }
  const body = rewrite(git("show", `${SRC_REF}:${SRC_PREFIX}${rel}`));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, body);
  written++;
}
console.log(`wrote ${written} files, deleted ${deleted} from ${SRC_REF}`);
