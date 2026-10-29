// Deterministic demo-state export for backend seeding.
//
// Builds the fully populated coach state with a pinned anchor date, splits it
// into a workspace file plus one file per client, rewrites every calendar
// date as a `day <n>` offset from the anchor, and verifies the result by
// re-anchoring and deep-comparing against the pre-conversion serialization.
//
// Run with: npm run export:demo
// (package.json wires the TS strip-types loader used by the test suite.)
//
// Determinism: ANCHOR pins every derived date; crypto.randomUUID is replaced
// with a counter so generated ids (plan versions, meal variants, temporary
// plans) are stable across runs. No wall-clock reads contribute to output.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ANCHOR = "2026-10-25";
const SCHEMA = 1;

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outDir = path.join(projectRoot, "src", "data", "demo-export");
const publicDir = path.join(projectRoot, "public");

// --- Deterministic ids ------------------------------------------------------
// The seed path generates ids through crypto.randomUUID (uid(), domain.ts
// id(), mealplan makeId()). Install a counter-based replacement before any
// of the seed modules execute so the same code path yields the same ids on
// every run and in every environment.
let uuidCounter = 0;
const realRandomUUID = crypto.randomUUID.bind(crypto);
crypto.randomUUID = () => {
  uuidCounter += 1;
  return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, "0")}`;
};

const { isCoachState, seedState } = await import(
  "../src/components/coach/model.ts"
);
const { migrateCoachState } = await import(
  "../src/components/coach/plans/domain.ts"
);
const { normalizeTemplateSetups } = await import(
  "../src/components/coach/template-setup.ts"
);

// --- Day-offset encoding ----------------------------------------------------
// `YYYY-MM-DD`            -> `day <n>`
// `YYYY-MM-DDTHH:mm:ss`   -> `day <n>THH:mm:ss`   (local-style, no zone suffix)
// `YYYY-MM-DDTHH:mm:ssZ`  -> `day <n>THH:mm:ssZ`
// `YYYY-MM-DDTHH:mm:ss.mmmZ` keeps its fractional seconds in the tail.
// Re-anchor rule: `day <n>` resolves to ANCHOR + n days; a `T<time>` tail is
// reattached verbatim.
const DAY_RE = /^day (-?\d+)(T.*)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)$/;

// Keys whose date-looking values are inherent metadata, not timeline content:
// `updated` stamps templates (and the per-client assignment snapshots cloned
// from them); `referenceDate`/`birthDate`/`dateOfBirth` are whitelisted per
// the export contract even though the current seed carries none.
const FIXED_DATE_KEYS = new Set([
  "updated",
  "referenceDate",
  "birthDate",
  "dateOfBirth",
]);

// Free-text keys: their entire subtree stays verbatim, even when the text
// mentions a calendar date (coach notes, question answers, labels…).
const FREE_TEXT_KEYS = new Set([
  "answer",
  "note",
  "text",
  "name",
  "label",
  "title",
  "description",
  "instructions",
  "reason",
  "goal",
  "message",
  "subject",
  "visuals",
]);

function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayOffset(date) {
  return Math.round(
    (new Date(`${date}T12:00:00Z`) - new Date(`${ANCHOR}T12:00:00Z`)) /
      86400000,
  );
}

function toDayToken(value) {
  if (DATE_RE.test(value)) return `day ${dayOffset(value)}`;
  const match = DATETIME_RE.exec(value);
  if (match) return `day ${dayOffset(match[1])}${match[2]}`;
  return value;
}

function fromDayToken(value) {
  const match = DAY_RE.exec(value);
  if (!match) return value;
  return `${addDays(ANCHOR, Number(match[1]))}${match[2] ?? ""}`;
}

function encodeOffsets(value, key) {
  if (typeof value === "string")
    return key !== undefined &&
      (FIXED_DATE_KEYS.has(key) || FREE_TEXT_KEYS.has(key))
      ? value
      : toDayToken(value);
  if (Array.isArray(value))
    return value.map((item) => encodeOffsets(item, key));
  if (value && typeof value === "object") {
    if (key !== undefined && FREE_TEXT_KEYS.has(key))
      return structuredClone(value);
    if (key !== undefined && FIXED_DATE_KEYS.has(key))
      return structuredClone(value);
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        DATE_RE.test(k) ? toDayToken(k) : k,
        encodeOffsets(v, k),
      ]),
    );
  }
  return value;
}

function decodeOffsets(value) {
  if (typeof value === "string") return fromDayToken(value);
  if (Array.isArray(value)) return value.map(decodeOffsets);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        fromDayToken(k),
        decodeOffsets(v),
      ]),
    );
  return value;
}

// Asset references keep the form browsers use (`/demo/...`); the export
// stores them relative (`demo/...`) and maps them to `public/`. Only `src`
// keys carry asset paths in the seeded state.
function encodeAssetPaths(value, key, assets) {
  if (typeof value === "string") {
    if (key === "src" && value.startsWith("/")) {
      const relative = value.slice(1);
      assets.add(relative);
      return relative;
    }
    return value;
  }
  if (Array.isArray(value))
    return value.map((item) => encodeAssetPaths(item, key, assets));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        encodeAssetPaths(v, k, assets),
      ]),
    );
  return value;
}

function decodeAssetPaths(value, key) {
  if (typeof value === "string")
    return key === "src" && value.startsWith("demo/") ? `/${value}` : value;
  if (Array.isArray(value))
    return value.map((item) => decodeAssetPaths(item, key));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, decodeAssetPaths(v, k)]),
    );
  return value;
}

// --- Build ------------------------------------------------------------------
const seeded = normalizeTemplateSetups(
  migrateCoachState(seedState({ today: ANCHOR })),
);
crypto.randomUUID = realRandomUUID;
assert(
  isCoachState(seeded),
  "seeded state did not pass the isCoachState guard",
);
// Serialize once up front; this is the pre-conversion reference for the
// round-trip verification below.
const state = JSON.parse(JSON.stringify(seeded));

const { clients, ...workspace } = state;
assert.equal(clients.length, 15, "expected 15 seeded clients");

const relatedFor = (client) => {
  const submissionIds = new Set(
    state.submissions.filter((s) => s.clientId === client.id).map((s) => s.id),
  );
  const related = {
    submissions: state.submissions.filter((s) => s.clientId === client.id),
    messages: state.messages.filter((m) => m.clientId === client.id),
    extras: state.extras.filter((e) => e.clientId === client.id),
    trainingLogs: (state.trainingLogs ?? []).filter(
      (l) => l.clientId === client.id,
    ),
    coachTodos: (state.coachTodos ?? []).filter(
      (t) => t.clientId === client.id,
    ),
    reviewDrafts: Object.fromEntries(
      Object.entries(state.reviewDrafts ?? {}).filter(([id]) =>
        submissionIds.has(id),
      ),
    ),
  };
  if (state.drafts?.[client.id] !== undefined)
    related.draft = state.drafts[client.id];
  return related;
};

const clientFiles = clients.map((client) => ({
  id: client.id,
  file: `clients/${client.id}.json`,
  content: { ...client, related: relatedFor(client) },
}));

const assets = new Set();
const encode = (v) =>
  encodeAssetPaths(encodeOffsets(v, undefined), undefined, assets);
const decode = (v) => decodeAssetPaths(decodeOffsets(v), undefined);

const index = {
  generatedAt: ANCHOR,
  schema: SCHEMA,
  anchorNote:
    "Demo coaching state for backend seeding. Re-anchor every `day <n>` token to ANCHOR + n days before use.",
  dayOffsetFormat: {
    day: "day <n> -> YYYY-MM-DD equal to generatedAt + n days (n may be negative)",
    timestamp:
      "day <n>T<HH:mm:ss[.mmm][Z]> -> resolved date plus the original time tail",
    fixedKeys: [...FIXED_DATE_KEYS],
    verbatimTextKeys: [...FREE_TEXT_KEYS],
  },
  files: ["workspace.json", ...clientFiles.map((c) => c.file)],
  clients: clientFiles.map((c) => ({
    id: c.id,
    name: clients.find((client) => client.id === c.id)?.name ?? c.id,
    file: c.file,
  })),
};

// --- Verify before writing --------------------------------------------------
// 1. Re-anchoring must reproduce the pre-conversion serialization exactly.
const decodedWorkspace = decode(encode(structuredClone(workspace)));
assert.deepEqual(
  decodedWorkspace,
  workspace,
  "workspace re-anchor mismatch — day-offset conversion is not lossless",
);
const decodedClients = clientFiles.map((c) =>
  decode(encode(structuredClone(c.content))),
);
decodedClients.forEach((decoded, i) => {
  const original = clientFiles[i].content;
  assert.deepEqual(
    decoded,
    original,
    `client ${clientFiles[i].id} re-anchor mismatch`,
  );
});

// 2. The re-anchored workspace + raw clients must still pass the state guard.
assert(
  isCoachState({ ...decodedWorkspace, clients }),
  "re-anchored export did not pass the isCoachState guard",
);

// 3. Every referenced asset must exist under public/.
for (const asset of assets)
  assert(
    existsSync(path.join(publicDir, asset)),
    `referenced asset missing from public/: ${asset}`,
  );

// --- Write ------------------------------------------------------------------
await rm(path.join(outDir, "clients"), { recursive: true, force: true });
await mkdir(path.join(outDir, "clients"), { recursive: true });
const write = (file, value) =>
  writeFile(path.join(outDir, file), `${JSON.stringify(value, null, 2)}\n`);

await write("index.json", index);
await write("workspace.json", encode(workspace));
for (const client of clientFiles)
  await write(client.file, encode(client.content));

console.log(
  `demo-export: ${1 + 1 + clientFiles.length} files written to ${path.relative(projectRoot, outDir)} (anchor ${ANCHOR}, ${assets.size} assets verified)`,
);
