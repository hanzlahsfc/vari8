import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const fixture = JSON.parse(
  await readFile(new URL("../../data/mock-data.json", import.meta.url), "utf8"),
);
const legacySource = await readFile(
  new URL("../ethereal/clients/model.ts", import.meta.url),
  "utf8",
);
const legacyExecutable = stripTypeScriptTypes(
  legacySource.replace(
    /import \{[\s\S]*?\} from "@\/lib\/coaching-data";/,
    `const seedClients = ${JSON.stringify(fixture.clients)}; const clientProfile = ${JSON.stringify(fixture.clientProfile)};`,
  ),
  { mode: "strip" },
);
const legacy = await import(
  `data:text/javascript;base64,${Buffer.from(legacyExecutable).toString("base64")}`
);
const asModule = (code) =>
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const builderModel = asModule(
  stripTypeScriptTypes(
    await readFile(
      new URL("../ethereal/builder/model.ts", import.meta.url),
      "utf8",
    ),
    { mode: "strip" },
  ),
);
const builderGrid = asModule(
  stripTypeScriptTypes(
    await readFile(
      new URL("../ethereal/builder/grid.ts", import.meta.url),
      "utf8",
    ),
    { mode: "strip" },
  ),
);
const schemaSource = stripTypeScriptTypes(
  await readFile(new URL("./builder/schema.ts", import.meta.url), "utf8"),
  { mode: "strip" },
)
  .replaceAll('"./model"', JSON.stringify(builderModel))
  .replaceAll('"./grid"', JSON.stringify(builderGrid));
const source = await readFile(new URL("./model.ts", import.meta.url), "utf8");
const shimmed = source.replace(
  /import \{[^}]*\} from "..\/ethereal\/clients\/model";/,
  `const createInitialClients = () => (${JSON.stringify(legacy.createInitialClients())});`,
);
const domainUrl = new URL("./plans/domain.ts", import.meta.url).href;
const targetsUrl = new URL("./targets/model.ts", import.meta.url).href;
const executable = stripTypeScriptTypes(shimmed, { mode: "strip" })
  .replaceAll('"./builder/schema"', JSON.stringify(asModule(schemaSource)))
  .replaceAll('"./plans/domain"', JSON.stringify(domainUrl))
  .replaceAll('"./targets/model"', JSON.stringify(targetsUrl));
const m = await import(asModule(executable));
test("complete seed envelope validates and is independently cloned", () => {
  const a = m.seedState();
  assert.equal(m.isCoachState(a), true);
  assert.equal(m.isCoachState(JSON.parse(JSON.stringify(a))), true);
  a.clients[0].internalNotes[0].text = "changed";
  a.templates[0].variants[0].fields[0].unit = "lb";
  const b = m.seedState();
  assert.notEqual(b.clients[0].internalNotes[0].text, "changed");
  assert.equal(b.templates[0].variants[0].fields[0].unit, "kg");
  assert.equal(
    m.isCoachState({ ...b, templates: [{ ...b.templates[0], variants: [] }] }),
    false,
  );
  assert.equal(m.isCoachState({ ...b, messages: [{ clientId: "x" }] }), false);
});
test("assignment takes an isolated configuration snapshot", () => {
  const a = m.seedState();
  const b = m.assignTemplate(a, a.clients[0].id, a.templates[0], "meal-plan");
  a.templates[0].variants[0].fields[0].unit = "lb";
  assert.equal(
    b.clients[0].assignment.snapshot.variants[0].fields[0].unit,
    "kg",
  );
  assert.deepEqual(a.clients[0].entries, b.clients[0].entries);
});
test("variant switches retain athlete identity, entries, plans and submissions", () => {
  const a = m.seedState();
  const b = m.switchVariant(a, a.clients[0].id, "iifym");
  assert.equal(b.clients[0].id, a.clients[0].id);
  assert.equal(b.clients[0].assignment.variantId, "iifym");
  assert.deepEqual(b.clients[0].entries, a.clients[0].entries);
  assert.deepEqual(b.clients[0].plan, a.clients[0].plan);
  assert.deepEqual(b.submissions, a.submissions);
});
test("Monday-first date arithmetic stays stable across month, year and DST", () => {
  assert.equal(m.monday("2026-10-13"), "2026-10-12");
  assert.equal(m.addDays("2026-10-25", 1), "2026-10-26");
  assert.equal(m.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(m.addDays("2028-02-28", 1), "2028-02-29");
});
test("recurrence merges additional requests by explicit association without duplicate IDs", () => {
  const a = m.seedState();
  const events = m.eventsBetween(a, "2026-10-12", "2026-10-18");
  assert.equal(new Set(events.map((e) => e.id)).size, events.length);
  assert.ok(
    events.some((e) => e.id === "extra-maya" && e.origin === "Additional"),
  );
  assert.equal(
    events.find((e) => e.id === "recurring:client-001:2026-10-12").status,
    "Awaiting feedback",
  );
  const x = {
    id: "extra-same-day",
    clientId: "client-001",
    date: "2026-10-12",
    type: "Custom",
    note: "Separate request",
  };
  const b = m.addExtra(a, x);
  assert.equal(
    m.eventsBetween(b, x.date, x.date).find((e) => e.id === x.id).status,
    "Overdue",
  );
  assert.equal(m.addExtra(b, { ...x, id: "another" }), b);
});
test("schedule changes preserve submitted history", () => {
  const a = m.seedState();
  a.clients[0].schedules = [{ effective: "2026-10-01", weekdays: [] }];
  const events = m.eventsBetween(a, "2026-10-12", "2026-10-18");
  assert.equal(
    events.find((e) => e.id === a.submissions[0].eventId).submission.id,
    a.submissions[0].id,
  );
});
test("opening a conversation changes only unread state for that athlete", () => {
  const a = m.seedState();
  const b = m.readConversation(a, a.clients[0].id);
  assert.equal(m.unreadCount(b, a.clients[0].id), 0);
  assert.equal(
    m.unreadCount(b, a.clients[1].id),
    m.unreadCount(a, a.clients[1].id),
  );
  assert.equal(b.submissions[0].response, undefined);
});
test("feedback is atomic, linked, preserves private notes and cannot be submitted twice", () => {
  const a = m.seedState();
  const sub = a.submissions[0];
  a.reviewDrafts[sub.id] = {
    text: "Focus on controlled reps.",
    changes: [{ field: "calories", before: 2200, after: 2300 }],
  };
  const pending = a.submissions.filter((s) => !s.response).length;
  const b = m.submitFeedback(a, sub.id, "2026-10-13T10:00:00Z");
  assert.equal(b.submissions.filter((s) => !s.response).length, pending - 1);
  const msg = b.messages.at(-1);
  assert.equal(msg.clientId, sub.clientId);
  assert.equal(msg.link.route.client, sub.clientId);
  assert.match(msg.text, /2200 → 2300/);
  assert.ok(!msg.text.includes(a.clients[0].internalNotes[0].text));
  assert.equal(m.submitFeedback(b, sub.id, "2026-10-13T11:00:00Z"), b);
});
test("plan activations become explicit review changes linked to the correct client module", () => {
  const a = m.seedState();
  const sub = a.submissions[0];
  a.reviewDrafts[sub.id] = {
    text: "Your new block is ready.",
    changes: [],
    activations: [
      {
        kind: "training",
        versionId: "version-training",
        name: "Strength base",
        startDate: "2026-10-20",
      },
    ],
  };
  const b = m.submitFeedback(a, sub.id, "2026-10-13T10:00:00Z");
  const message = b.messages.at(-1);
  assert.match(
    message.text,
    /Training plan activated: Strength base · starts 2026-10-20/,
  );
  assert.deepEqual(message.link.route, {
    section: "clients",
    client: sub.clientId,
    plan: "training",
  });
  assert.deepEqual(
    b.submissions.find((item) => item.id === sub.id).response.changes,
    ["Training plan activated: Strength base · starts 2026-10-20"],
  );
});
test("week-based instructions carry forward without rewriting earlier weeks", () => {
  assert.deepEqual(
    Array.from({ length: 8 }, (_, i) => m.trainingSets(i + 1)),
    [3, 3, 3, 4, 4, 4, 4, 4],
  );
});
test("optional raster logo validates, survives round-trip and preserves all collections", () => {
  const a = m.seedState();
  assert.equal(m.isCoachState(a), true);
  const logo = {
    name: "studio.png",
    dataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  };
  const withLogo = { ...a, preferences: { ...a.preferences, logo } };
  assert.equal(m.isCoachState(withLogo), true);
  const round = JSON.parse(JSON.stringify(withLogo));
  assert.equal(m.isCoachState(round), true);
  assert.deepEqual(round.preferences.logo, logo);
  const stored = JSON.parse(JSON.stringify(a));
  assert.deepEqual(round.templates, stored.templates);
  assert.deepEqual(round.clients, stored.clients);
  assert.deepEqual(round.submissions, stored.submissions);
  assert.deepEqual(round.messages, stored.messages);
  assert.deepEqual(round.drafts, stored.drafts);
  const removed = { ...withLogo, preferences: { ...withLogo.preferences } };
  delete removed.preferences.logo;
  assert.equal(m.isCoachState(removed), true);
  assert.equal(removed.preferences.logo, undefined);
});
test("invalid logo values are rejected without affecting other preferences", () => {
  const a = m.seedState();
  const tiny =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const bad = [
    { name: "x.png", dataUrl: "https://evil.example/logo.png" },
    { name: "x.png", dataUrl: "data:text/html;base64,PGI+Pg==" },
    { name: "x.svg", dataUrl: "data:image/svg+xml;base64,PHN2Zy8+" },
    { name: "x.png", dataUrl: "data:image/png;base64," },
    { name: "x.png", dataUrl: "data:image/png;base64,AAA" },
    { name: "x.png", dataUrl: `data:image/png;base64,${"A".repeat(700000)}` },
    { name: "", dataUrl: `data:image/png;base64,${tiny}` },
    { dataUrl: `data:image/png;base64,${tiny}` },
    { name: "x.png", dataUrl: "not-a-data-url" },
  ];
  for (const logo of bad)
    assert.equal(
      m.isCoachState({ ...a, preferences: { ...a.preferences, logo } }),
      false,
      logo.dataUrl.slice(0, 60),
    );
  assert.equal(
    m.isCoachState({
      ...a,
      preferences: {
        ...a.preferences,
        logo: { name: "x.webp", dataUrl: `data:image/webp;base64,${tiny}` },
      },
    }),
    true,
  );
});
test("optional sidebarCollapsed persists with logo/accent and all collections intact", () => {
  const a = m.seedState();
  assert.equal(m.isCoachState(a), true);
  assert.equal(a.preferences.sidebarCollapsed, undefined);
  const logo = {
    name: "s.png",
    dataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  };
  const on = {
    ...a,
    preferences: {
      ...a.preferences,
      sidebarCollapsed: true,
      logo,
      accent: "#123ABC",
    },
  };
  assert.equal(m.isCoachState(on), true);
  const round = JSON.parse(JSON.stringify(on));
  assert.equal(m.isCoachState(round), true);
  assert.equal(round.preferences.sidebarCollapsed, true);
  assert.deepEqual(round.preferences.logo, logo);
  const stored = JSON.parse(JSON.stringify(a));
  assert.deepEqual(round.templates, stored.templates);
  assert.deepEqual(round.clients, stored.clients);
  assert.deepEqual(round.submissions, stored.submissions);
  const off = {
    ...on,
    preferences: { ...on.preferences, sidebarCollapsed: false },
  };
  assert.equal(m.isCoachState(off), true);
});
test("invalid sidebarCollapsed values are rejected", () => {
  const a = m.seedState();
  for (const v of [null, "yes", 1, [], {}])
    assert.equal(
      m.isCoachState({
        ...a,
        preferences: { ...a.preferences, sidebarCollapsed: v },
      }),
      false,
      JSON.stringify(v),
    );
});
test("activity target planning selections accept only steps and cardio", () => {
  const a = m.seedState();
  const variant = a.templates[0].variants[0];
  assert.equal(variant.roadmapActivityTargets, undefined);
  assert.equal(m.isCoachState(a), true);
  const withSelection = {
    ...a,
    templates: [
      {
        ...a.templates[0],
        variants: [{ ...variant, roadmapActivityTargets: ["steps", "cardio"] }],
      },
    ],
  };
  assert.equal(m.isCoachState(withSelection), true);
  assert.equal(m.isCoachState(JSON.parse(JSON.stringify(withSelection))), true);
  for (const bad of [
    ["steps", "sleep"],
    ["cardio-sessions"],
    "steps",
    [null],
    [5],
    [["steps"]],
    ["steps", null],
  ])
    assert.equal(
      m.isCoachState({
        ...a,
        templates: [
          {
            ...a.templates[0],
            variants: [{ ...variant, roadmapActivityTargets: bad }],
          },
        ],
      }),
      false,
      JSON.stringify(bad),
    );
});
test("structured activity prescriptions drive summary labels and suppress scalar comparisons", () => {
  const a = m.seedState();
  const plans = {
    nutrition: { mealPlan: { history: [] }, iifym: { history: [] } },
    training: { history: [] },
    goals: [
      {
        id: "g-legacy",
        fieldId: "steps",
        value: 7000,
        unit: "steps",
        date: "2026-10-01",
      },
      {
        id: "g-weight",
        fieldId: "weight",
        value: 64,
        unit: "kg",
        date: "2026-10-01",
      },
    ],
    activityTargets: [
      {
        id: "steps-v1",
        effectiveFrom: "2026-10-01",
        metric: "steps",
        target: { kind: "minimum", value: 8000 },
      },
      {
        id: "cardio-v1",
        effectiveFrom: "2026-10-01",
        metric: "cardio",
        target: { sessionsPerWeek: 5, minutesPerSession: 20 },
      },
    ],
  };
  const client = { ...a.clients[0], plans };
  const steps = m.summaryPreview(
    { id: "steps", unit: "steps" },
    "Weekly average",
    client,
  );
  assert.equal(steps.target, "Minimum 8,000 steps/day");
  assert.equal(
    m.summaryPreview({ id: "steps", unit: "steps" }, "Adherence", client).value,
    "—",
  );
  assert.equal(
    m.summaryPreview(
      { id: "cardio-duration", unit: "min" },
      "Weekly average",
      client,
    ).target,
    "5 x 20 min/week",
  );
  const stopped = {
    ...client,
    plans: {
      ...plans,
      activityTargets: [
        ...plans.activityTargets,
        {
          id: "steps-stop",
          effectiveFrom: "2026-10-10",
          metric: "steps",
          target: null,
        },
      ],
    },
  };
  assert.equal(
    m.summaryPreview({ id: "steps", unit: "steps" }, "Weekly average", stopped)
      .target,
    "No target prescribed",
  );
  const legacy = { ...a.clients[0], plans: { ...plans, activityTargets: [] } };
  assert.equal(
    m.summaryPreview({ id: "steps", unit: "steps" }, "Weekly average", legacy)
      .target,
    "7000 steps",
  );
  const weight = m.summaryPreview(
    { id: "weight", unit: "kg" },
    "Weekly average",
    client,
  );
  assert.match(weight.target, /kg$/);
});
test("activity summary resolves prescriptions at the requested as-of date", () => {
  const a = m.seedState();
  const plans = {
    nutrition: { mealPlan: { history: [] }, iifym: { history: [] } },
    training: { history: [] },
    goals: [],
    activityTargets: [
      {
        id: "steps-future",
        effectiveFrom: "2026-10-21",
        metric: "steps",
        target: { kind: "minimum", value: 9000 },
      },
    ],
  };
  const client = { ...a.clients[0], plans };
  const field = { id: "steps", unit: "steps" };
  assert.equal(
    m.summaryPreview(field, "Weekly average", client, { asOf: "2026-10-22" })
      .target,
    "Minimum 9,000 steps/day",
  );
  assert.equal(
    m.summaryPreview(field, "Weekly average", client, { asOf: "2026-10-20" })
      .target,
    "No target prescribed",
  );
  const activityFree = m.summaryPreview(
    { id: "weight", unit: "kg" },
    "Weekly average",
    client,
    { asOf: "2026-10-22" },
  );
  assert.equal(activityFree.target, "No target defined");
});
