import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

// Load model.ts the same way model.test.mjs does: strip types, replace the
// legacy-clients import with seeded fixtures and point the remaining imports
// at module URLs.
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

// coach-theme.ts only needs react-style hooks for useSystemMode and the
// theme builders for coachThemeStyle; the pure resolution helpers under test
// use neither, so tiny stubs are enough.
const reactStub = asModule(
  `export const useState = (v) => [typeof v === "function" ? v() : v, () => {}];
   export const useEffect = () => {};`,
);
const themeSource = stripTypeScriptTypes(
  await readFile(new URL("./coach-theme.ts", import.meta.url), "utf8"),
  { mode: "strip" },
)
  .replaceAll('"react"', JSON.stringify(reactStub))
  .replaceAll(
    '"@/lib/ethereal-appearance"',
    JSON.stringify(asModule("export const themeVariables = () => ({});")),
  )
  .replaceAll(
    '"@/lib/vari8-theme"',
    JSON.stringify(asModule("export const vari8Theme = () => ({});")),
  )
  .replaceAll(
    '"./accent-contrast"',
    JSON.stringify(
      asModule(
        'export const accentControlColors = () => ({}); export const DEFAULT_ACCENT = "#C9CCD3";',
      ),
    ),
  );
const theme = await import(asModule(themeSource));
// accent-contrast.ts is dependency-free: test its real exports.
const accentContrast = await import(
  asModule(
    stripTypeScriptTypes(
      await readFile(new URL("./accent-contrast.ts", import.meta.url), "utf8"),
      { mode: "strip" },
    ),
  )
);

const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("legacy workspaces without any new preference fields load unchanged", () => {
  const a = m.seedState();
  const legacy = { ...a, preferences: { ...a.preferences } };
  for (const key of ["profile", "brand", "followSystemMode", "notify"])
    delete legacy.preferences[key];
  legacy.clients = a.clients.map(({ appMode, ...client }) => client);
  assert.equal(m.isCoachState(legacy), true);
  assert.equal(m.isCoachState(JSON.parse(JSON.stringify(legacy))), true);
  // The guard reports the data as-is; it does not invent defaults.
  assert.equal(legacy.preferences.profile, undefined);
  assert.equal(legacy.preferences.brand, undefined);
  assert.equal(legacy.preferences.followSystemMode, undefined);
  assert.equal(legacy.preferences.notify, undefined);
  assert.equal(legacy.clients[0].appMode, undefined);
});

test("optional settings fields validate and round-trip; invalid values are rejected", () => {
  const a = m.seedState();
  const photo = { name: "coach.png", dataUrl: tinyPng };
  const rich = {
    ...a,
    preferences: {
      ...a.preferences,
      profile: {
        name: "Rae Okonkwo",
        title: "Prep coach",
        photo,
        intro: "Here to help.",
      },
      brand: {
        name: "Rae Coaching",
        logoLight: photo,
      },
      followSystemMode: true,
      notify: { checkIns: false, taskReminders: true },
    },
    clients: a.clients.map((client, i) =>
      i === 0 ? { ...client, appMode: "light" } : client,
    ),
  };
  assert.equal(m.isCoachState(rich), true);
  const round = JSON.parse(JSON.stringify(rich));
  assert.equal(m.isCoachState(round), true);
  assert.equal(round.preferences.profile.name, "Rae Okonkwo");
  assert.equal(round.preferences.brand.logoLight.dataUrl, tinyPng);
  assert.equal(round.preferences.followSystemMode, true);
  assert.equal(round.preferences.notify.checkIns, false);
  assert.equal(round.clients[0].appMode, "light");
  const bad = [
    { ...a, preferences: { ...a.preferences, profile: { name: 7 } } },
    { ...a, preferences: { ...a.preferences, profile: "name" } },
    {
      ...a,
      preferences: {
        ...a.preferences,
        brand: { logoLight: { name: "x.png", dataUrl: "https://x/y.png" } },
      },
    },
    { ...a, preferences: { ...a.preferences, followSystemMode: "yes" } },
    { ...a, preferences: { ...a.preferences, notify: { checkIns: "no" } } },
    {
      ...a,
      clients: a.clients.map((c, i) =>
        i === 0 ? { ...c, appMode: "auto" } : c,
      ),
    },
  ];
  for (const candidate of bad)
    assert.equal(
      m.isCoachState(candidate),
      false,
      JSON.stringify(candidate).slice(0, 80),
    );
});

test("seed and demo reset use Platinum while saved accents survive untouched", () => {
  const seed = m.seedState();
  assert.equal(seed.preferences.accent, "#C9CCD3");
  assert.equal(theme.DEFAULT_ACCENT, "#C9CCD3");
  // A workspace saved before Platinum keeps its accent exactly.
  for (const saved of ["#EB91B8", "#12A594", "#3E63DD"]) {
    const state = {
      ...seed,
      preferences: { ...seed.preferences, accent: saved },
    };
    assert.equal(m.isCoachState(state), true);
    const round = JSON.parse(JSON.stringify(state));
    assert.equal(round.preferences.accent, saved);
  }
});

test("coach mode resolves independently of athlete app mode", () => {
  const prefs = {
    mode: "dark",
    followSystemMode: false,
  };
  assert.equal(theme.coachMode(prefs, "light"), "dark");
  assert.equal(
    theme.coachMode({ ...prefs, followSystemMode: true }, "light"),
    "light",
  );
  // The athlete's own choice wins over the phone; without one the phone decides.
  assert.equal(theme.athleteMode({ appMode: "light" }, "dark"), "light");
  assert.equal(theme.athleteMode({ appMode: "dark" }, "light"), "dark");
  assert.equal(theme.athleteMode({}, "dark"), "dark");
  assert.equal(theme.athleteMode({}, "light"), "light");
});

test("logo resolution picks the light logo on light surfaces and falls back", () => {
  const dark = { name: "dark.png", dataUrl: "data:image/png;base64,AAAA" };
  const light = { name: "light.png", dataUrl: "data:image/png;base64,BBBB" };
  const prefs = { logo: dark, brand: { logoLight: light } };
  assert.equal(theme.logoForMode(prefs, "dark"), dark);
  assert.equal(theme.logoForMode(prefs, "light"), light);
  assert.equal(theme.logoForMode({ logo: dark }, "light"), dark);
  assert.equal(theme.logoForMode({ logo: dark }, "dark"), dark);
  assert.equal(theme.logoForMode({}, "dark"), undefined);
});

test("priority messages first lifts flagged conversations, recency tiebreaks", () => {
  const a = m.seedState();
  const [one, two, three] = a.clients.filter((c) => !c.archived);
  const message = (clientId, date, priority = false) => ({
    id: `t-${clientId}`,
    clientId,
    from: "client",
    date,
    text: "x",
    read: true,
    priority,
  });
  const state = {
    ...a,
    clients: a.clients.map((c) =>
      c.id === one.id || c.id === two.id || c.id === three.id
        ? c
        : { ...c, archived: true },
    ),
    messages: [
      message(one.id, "2026-10-01T09:00:00Z"),
      message(two.id, "2026-10-03T09:00:00Z", true),
      message(three.id, "2026-10-02T09:00:00Z"),
    ],
    preferences: { ...a.preferences, priorityNotifications: true },
  };
  assert.deepEqual(
    m.sortedConversationClients(state).map((c) => c.id),
    [two.id, three.id, one.id],
  );
  const off = {
    ...state,
    preferences: { ...state.preferences, priorityNotifications: false },
  };
  assert.deepEqual(
    m.sortedConversationClients(off).map((c) => c.id),
    [two.id, three.id, one.id],
  );
  // With the flag off the same messages order purely by recency.
  const older = {
    ...state,
    messages: [
      message(one.id, "2026-10-01T09:00:00Z"),
      message(two.id, "2026-10-01T09:00:00Z", true),
      message(three.id, "2026-10-02T09:00:00Z"),
    ],
    preferences: { ...state.preferences, priorityNotifications: false },
  };
  assert.deepEqual(
    m.sortedConversationClients(older).map((c) => c.id),
    [three.id, one.id, two.id],
  );
});

// --- P808 review repairs -----------------------------------------------------
// Pure tab resolution (settings/tabs.ts has no React deps).

const tabsSource = stripTypeScriptTypes(
  await readFile(new URL("./settings/tabs.ts", import.meta.url), "utf8"),
  { mode: "strip" },
);
const tabs = await import(asModule(tabsSource));

test("invalid and missing tabs resolve the same way nav, breadcrumb and content do", () => {
  // Other layouts always land on a category, Profile when none applies.
  assert.equal(tabs.resolveSettingsTab(undefined, false), "profile");
  assert.equal(tabs.resolveSettingsTab("bogus", false), "profile");
  assert.equal(tabs.resolveSettingsTab("branding", false), "branding");
  // The phone shows the category index until a valid category is chosen.
  assert.equal(tabs.resolveSettingsTab(undefined, true), null);
  assert.equal(tabs.resolveSettingsTab("bogus", true), null);
  assert.equal(tabs.resolveSettingsTab("data", true), "data");
  assert.equal(tabs.settingsTabLabel("branding"), "Branding");
  assert.equal(tabs.isSettingsTab("profile"), true);
  assert.equal(tabs.isSettingsTab("templates"), false);
});

test("coach and shared theme defaults stay separate", async () => {
  // The coach default is Platinum and invalid accents fall back to it; the
  // shared vari8-theme module keeps its own legacy fallback for non-coach
  // surfaces (source inspection — the constant is not exported).
  assert.equal(accentContrast.DEFAULT_ACCENT, "#C9CCD3");
  assert.equal(
    accentContrast.accentControlColors("nope").background,
    "#C9CCD3",
  );
  const src = await readFile(
    new URL("../../lib/vari8-theme.ts", import.meta.url),
    "utf8",
  );
  assert.match(src, /FALLBACK_ACCENT = "#EB91B8"/);
});

test("the existing availability value round-trips to its Messages consumer", async () => {
  const a = m.seedState();
  const edited = {
    ...a,
    preferences: { ...a.preferences, availability: "Replies within a day" },
  };
  assert.equal(m.isCoachState(edited), true);
  const round = JSON.parse(JSON.stringify(edited));
  assert.equal(round.preferences.availability, "Replies within a day");
  // Source inspection: the coach Messages caption still renders the field
  // the settings field writes.
  const src = await readFile(
    new URL("./messages.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    src,
    /preferences\.availability/,
    "messages.tsx no longer reads preferences.availability",
  );
});
