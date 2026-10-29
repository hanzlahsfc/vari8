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
  // Canvas remote wiring hub: the provider takes a workspaceId, gates the
  // Amara fixture set behind ?demo= and persists through the canvas data
  // layer (readCoachState/writeCoachState); check-ins, messages,
  // nutrition, training and client detail read /api/v1, and
  // clientProfileIdFor/physiquePhotosFor resolve roster names.
  "components/coach/store.tsx",
  // CoachApp binds the signed-in viewer (name, initials, role,
  // workspaceName, workspaceId) into the account chip and the provider,
  // and adds the sign-out form.
  "components/coach/coach-app.tsx",
  // Staff messaging is remote (W2-A4): conversation/thread fetch,
  // mark-read, 500ms draft save and media upload run through
  // components/canvas/data.
  "components/coach/messages.tsx",
  // Media.mediaObjectId anchors PR-MEDIA uploads; seedState({demo}) keeps
  // the fixture chain behind adoptCanvasDemos so stored state can render
  // without demo content.
  "components/coach/model.ts",
  // The check-in board loads instances, submissions and schedules from
  // /api/v1 for the visible range (PR-W6), cancels/restores via the data
  // layer and renders the shared CheckInReviewPanel.
  "components/coach/check-ins.tsx",
  // Canvas carries local wiring deltas: ClientTrainingLogs in the Plans tab,
  // review-panel status chips in coach.css, the issue-169 activity-target
  // versions fetch in timeline-tab, the signed-in client session and
  // workspace appearance in client-route, backend data in overview, and
  // provider hydration hooks in setup-ui.
  "components/client-app/client-route.tsx",
  "components/coach/clients.tsx",
  "components/coach/coach.css",
  "components/coach/athlete/overview.tsx",
  "components/coach/athlete/timeline-tab.tsx",
  "components/coach/plans/setup-ui.tsx",
  // Meal plans persist via the canvas data layer (loadMealPlans /
  // saveMealPlans in components/canvas/data/nutrition) instead of the
  // twin's raw coaching-mealplans-v1 localStorage key.
  "components/ethereal/mealplan/mealplan-workspace.tsx",
  // Dashboard draft and records persist via components/canvas/data/
  // dashboard helpers instead of the twin's raw localStorage keys.
  "components/ethereal/builder/dashboard-builder.tsx",
  // Appearance types and the workspace merge live in
  // workspace-appearance; the provider merges the workspace-resolved
  // appearance over the local store, adds density and logoMediaId, and
  // persists via components/canvas/data/appearance.
  "lib/ethereal-appearance.tsx",
  // Route group layout (app/(canvas)/layout.tsx). Imports rewritten, html and body shell dropped, RootLayout renamed to CanvasLayout.
  "app/layout.tsx",
  // Canvas auth wiring: pages bind the signed in viewer into canvas apps.
  "app/client/page.tsx",
  "app/coach/page.tsx",
  // requireCanvasAccess gate; the viewer is not bound into EtherealApp.
  "app/ethereal/page.tsx",
  // Client app remote own surfaces (cards 05a, 08, 09): session bound data
  // flows through authored wrappers and plumbing the twin does not carry.
  "components/client-app/check-in.tsx",
  "components/client-app/client-app.css",
  "components/client-app/client-app.tsx",
  "components/client-app/views.tsx",
  // STATUS_META moved into model.ts so the canvas native remote logbook can
  // share it; session-logger carries the dirty guard beforeunload wiring.
  "components/client-app/training-log/model.ts",
  "components/client-app/training-log/session-logger.tsx",
  "components/client-app/training-log/training-logbook.tsx",
  // Canvas data layer and remote persistence wiring.
  "components/coach/media.tsx",
  "components/coach/notes.tsx",
  "components/coach/supplements/editor.tsx",
  "components/coach/targets/editor.tsx",
  // workspace-polish.css is not data layer wiring. It appends 27 lines of client detail training log styles.
  "components/coach/workspace-polish.css",
  // onRecordsChange persists record edits for an own bound caller.
  "components/coach/builder/dashboard-builder.tsx",
  // sender is a string for own bound messages instead of a fixture literal.
  "components/ethereal/builder/model.ts",
  // Remote mode for the own bound tracker surfaces (card 05a, issue 169).
  "components/ethereal/client-tracker/client-tracker.tsx",
  "components/ethereal/client-tracker/tracking-view.tsx",
  // Attention reasons and priority delegate to the shared attention module
  // (W2-T5); workspace persistence reads through the canvas data layer.
  "components/ethereal/clients/client-roster.tsx",
  "components/ethereal/clients/clients-workspace.tsx",
  "components/ethereal/clients/model.ts",
  // Root eslint (react/no-unescaped-entities, react-hooks/purity) requires
  // escapes and one suppression the twin text does not carry; the frontend
  // lints under a different config.
  "components/client-app/mobile/home.tsx",
  "components/client-app/mobile/logbook.tsx",
  "components/client-app/mobile/training.tsx",
  // Only the overlap notice (twin lines 359-360) is changed, with &quot; escapes and ASCII hyphens; the other two dashes (lines 3, 347) stay verbatim.
  "components/coach/plans/temporary-editor.tsx",
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
