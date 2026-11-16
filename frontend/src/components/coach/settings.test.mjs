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
const modelUrl = asModule(executable);
const m = await import(modelUrl);
const vacations = await import(
  asModule(
    stripTypeScriptTypes(
      await readFile(new URL("./vacations.ts", import.meta.url), "utf8"),
      { mode: "strip" },
    ).replaceAll('"./model"', JSON.stringify(modelUrl)),
  )
);
const replies = await import(
  asModule(
    stripTypeScriptTypes(
      await readFile(new URL("./settings/replies.ts", import.meta.url), "utf8"),
      { mode: "strip" },
    ),
  )
);

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
  // the settings field writes, and the athlete header no longer does
  // (deferred to Phase 1b).
  const src = await readFile(
    new URL("./messages.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    src,
    /preferences\.availability/,
    "messages.tsx no longer reads preferences.availability",
  );
  const athlete = await readFile(
    new URL("../client-app/mobile/messages.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    athlete,
    /preferences\.availability/,
    "athlete Messages header still reads preferences.availability",
  );
});

// --- P810 review repairs -----------------------------------------------------
// committed.ts is the pure reconciliation model behind CommittedInput.

const committed = await import(
  asModule(
    stripTypeScriptTypes(
      await readFile(
        new URL("./settings/committed.ts", import.meta.url),
        "utf8",
      ),
      { mode: "strip" },
    ),
  )
);
const { decideCommit, acknowledgeValue } = committed;
const NAME_NORM = (v) => v.trim() || "Liliana Mansfeld";

test("normalized Enter commit then a newer edit still saves", () => {
  // The reported P809 sequence: type "Liliana ", Enter, keep editing to
  // "LilianaX", blur — the second edit must still save.
  const enter = decideCommit({
    draft: "Liliana ",
    value: "Liliana Mansfeld",
    lastSent: null,
    external: false,
    normalize: NAME_NORM,
  });
  assert.deepEqual(enter, { action: "save", submitted: "Liliana" });
  const lastSent = enter.submitted;
  // The stored write echoes back through props and is recognised as ours.
  assert.equal(
    acknowledgeValue({ value: "Liliana", lastSent, focused: true }).kind,
    "own",
  );
  const blur = decideCommit({
    draft: "LilianaX",
    value: "Liliana",
    lastSent: null,
    external: false,
    normalize: NAME_NORM,
  });
  assert.deepEqual(blur, { action: "save", submitted: "LilianaX" });
});

test("debounced normalization including an empty draft that falls back", () => {
  const emptied = decideCommit({
    draft: "   ",
    value: "Rae Okonkwo",
    lastSent: null,
    external: false,
    normalize: NAME_NORM,
  });
  assert.deepEqual(emptied, {
    action: "save",
    submitted: "Liliana Mansfeld",
  });
  // The echo of that default acknowledges normally.
  assert.equal(
    acknowledgeValue({
      value: "Liliana Mansfeld",
      lastSent: emptied.submitted,
      focused: false,
    }).kind,
    "own",
  );
  // A newer edit after that echo still saves.
  const newer = decideCommit({
    draft: "Rae O",
    value: "Liliana Mansfeld",
    lastSent: null,
    external: false,
    normalize: NAME_NORM,
  });
  assert.equal(newer.action, "save");
});

test("Enter then blur with no further edit saves exactly once", () => {
  const enter = decideCommit({
    draft: "Liliana ",
    value: "Liliana Mansfeld",
    lastSent: null,
    external: false,
    normalize: NAME_NORM,
  });
  assert.equal(enter.action, "save");
  // Before the echo arrives, blur submits nothing new — the draft
  // normalizes to what we already sent.
  const blurBeforeEcho = decideCommit({
    draft: "Liliana ",
    value: "Liliana Mansfeld",
    lastSent: enter.submitted,
    external: false,
    normalize: NAME_NORM,
  });
  assert.equal(blurBeforeEcho.action, "noop");
  // After the echo, blur is a noop against the acknowledged value.
  const blurAfterEcho = decideCommit({
    draft: "Liliana ",
    value: "Liliana",
    lastSent: null,
    external: false,
    normalize: NAME_NORM,
  });
  assert.equal(blurAfterEcho.action, "noop");
});

test("an unchanged normalized value never triggers a duplicate save", () => {
  const out = decideCommit({
    draft: "  Liliana Mansfeld  ",
    value: "Liliana Mansfeld",
    lastSent: null,
    external: false,
    normalize: NAME_NORM,
  });
  assert.equal(out.action, "noop");
});

test("an external update or reset is never overwritten by an older draft", () => {
  // Focused field, stored value changes to something we did not send.
  assert.equal(
    acknowledgeValue({
      value: "Rae Okonkwo",
      lastSent: "Liliana",
      focused: true,
    }).kind,
    "external",
  );
  const out = decideCommit({
    draft: "LilianaX",
    value: "Rae Okonkwo",
    lastSent: "Liliana",
    external: true,
    normalize: NAME_NORM,
  });
  assert.equal(out.action, "discard");
  // Unfocused fields resync instead of flagging the draft stale.
  assert.equal(
    acknowledgeValue({
      value: "Rae Okonkwo",
      lastSent: "Liliana",
      focused: false,
    }).kind,
    "resync",
  );
});

/* ------------------------------------------------------------------ */
/* Phase 1b: region, working hours, deadline, replies                  */
/* ------------------------------------------------------------------ */

test("legacy workspaces without Phase 1b fields keep defaults", () => {
  const a = m.seedState();
  const legacy = { ...a, preferences: { ...a.preferences } };
  for (const key of [
    "region",
    "workingHours",
    "availabilityNote",
    "rules",
    "savedReplies",
  ])
    delete legacy.preferences[key];
  assert.equal(m.isCoachState(legacy), true);
  assert.equal(m.resolvedTimeZone(legacy.preferences), "Europe/Vienna");
  assert.equal(m.checkInDeadline(legacy.preferences), "23:59");
  assert.equal(m.resolvedWorkingHours(legacy.preferences).length, 5);
  assert.deepEqual(
    m.savedReplyTexts(legacy.preferences),
    m.DEFAULT_SAVED_REPLIES,
  );
});

test("displayConfigFor resolves defaults and keeps workspaces isolated", () => {
  // No module-global display state: each workspace resolves its own config
  // and absent fields fall back to the documented defaults.
  assert.deepEqual(m.displayConfigFor({}), {
    timeZone: "Europe/Vienna",
    locale: "en-GB",
    hourCycle: "24",
  });
  assert.deepEqual(m.displayConfigFor({ region: undefined }), {
    timeZone: "Europe/Vienna",
    locale: "en-GB",
    hourCycle: "24",
  });
  const ny = m.displayConfigFor({
    region: { timeZone: "America/New_York", locale: "en-US", hourCycle: "12" },
  });
  assert.deepEqual(ny, {
    timeZone: "America/New_York",
    locale: "en-US",
    hourCycle: "12",
  });
  // A bare workspace right after a configured one still gets defaults —
  // nothing leaks between workspaces because the config is pure.
  assert.deepEqual(m.displayConfigFor({}), m.DEFAULT_DISPLAY_CONFIG);
});

test("date-only values never shift with the configured time zone", () => {
  for (const zone of [
    "Europe/Vienna",
    "America/New_York",
    "Pacific/Auckland",
    "Pacific/Kiritimati",
  ]) {
    const cfg = m.displayConfigFor({ region: { timeZone: zone } });
    assert.equal(
      m.formatDate("2026-10-13", {}, cfg),
      m.formatDate("2026-10-13", {}, cfg),
    );
    // The rendered calendar day stays the 13th everywhere.
    assert.match(m.formatDate("2026-10-13", {}, cfg), /13/);
    // Naive message stamps keep their coach-zone wall time in every zone.
    assert.match(
      m.formatDate(
        "2026-10-05T08:47",
        { hour: "2-digit", minute: "2-digit" },
        cfg,
      ),
      /08:47/,
    );
  }
});

test("real instants with offsets format in the configured zone", () => {
  const vienna = m.displayConfigFor({ region: { timeZone: "Europe/Vienna" } });
  const out = m.formatDate(
    "2026-10-13T18:30:00Z",
    { hour: "2-digit", minute: "2-digit" },
    vienna,
  );
  assert.match(out, /20:30/); // 18:30 UTC = 20:30 CEST
  const ny = m.displayConfigFor({ region: { timeZone: "America/New_York" } });
  assert.match(
    m.formatDate(
      "2026-10-13T18:30:00Z",
      { hour: "2-digit", minute: "2-digit" },
      ny,
    ),
    /14:30/, // 18:30 UTC = 14:30 EDT
  );
});

test("deadline instant resolves across zones and DST", () => {
  // 20:00 on 2026-10-13 in Vienna (CEST, UTC+2) is 18:00 UTC.
  assert.equal(
    new Date(
      m.deadlineInstant("2026-10-13", "20:00", "Europe/Vienna"),
    ).toISOString(),
    "2026-10-13T18:00:00.000Z",
  );
  // Same wall time in New York (EDT, UTC-4) is 00:00 UTC next day.
  assert.equal(
    new Date(
      m.deadlineInstant("2026-10-13", "20:00", "America/New_York"),
    ).toISOString(),
    "2026-10-14T00:00:00.000Z",
  );
  // US falls back 2026-11-01: 01:30 wall time exists twice (05:30Z EDT and
  // 06:30Z EST). The deadline keeps the FIRST occurrence.
  const fold = m.deadlineInstant("2026-11-01", "01:30", "America/New_York");
  assert.equal(new Date(fold).toISOString(), "2026-11-01T05:30:00.000Z");
  const dst = m.deadlineInstant("2026-11-01", "09:00", "America/New_York");
  assert.equal(new Date(dst).toISOString(), "2026-11-01T14:00:00.000Z");
  // US springs forward 2026-03-08: 02:30 does not exist. It must not fall
  // back to an earlier wall time — it resolves to the first real time at
  // or after it (03:00 EDT = 07:00 UTC).
  const gap = m.deadlineInstant("2026-03-08", "02:30", "America/New_York");
  assert.equal(new Date(gap).toISOString(), "2026-03-08T07:00:00.000Z");
  // Same rule in Europe (2026-03-29 02:00–03:00 missing in Vienna).
  const gapEu = m.deadlineInstant("2026-03-29", "02:30", "Europe/Vienna");
  const gapEuWall = new Date(gapEu).toLocaleString("en-US", {
    timeZone: "Europe/Vienna",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  assert.equal(gapEuWall, "03:00");
});

test("check-in overdue honours the configured deadline and zone", () => {
  const prefs = {
    region: { timeZone: "Europe/Vienna" },
    rules: { checkInDeadline: "20:00" },
  };
  // Due through the whole 20:00 minute; overdue once 20:01 starts.
  const duringDeadline = new Date("2026-10-13T18:00:30Z"); // 20:00:30 CEST
  const boundary = new Date("2026-10-13T18:01:00Z"); // 20:01:00 CEST
  const before = new Date("2026-10-13T17:59:00Z"); // 19:59 CEST
  assert.equal(m.isCheckInOverdue(prefs, "2026-10-13", before), false);
  assert.equal(m.isCheckInOverdue(prefs, "2026-10-13", duringDeadline), false);
  assert.equal(m.isCheckInOverdue(prefs, "2026-10-13", boundary), true);
  // A far-ahead zone sees the day end sooner: Auckland (UTC+13) 20:00 is
  // 07:00 UTC, already past at 18:01 UTC.
  const auckland = {
    region: { timeZone: "Pacific/Auckland" },
    rules: { checkInDeadline: "20:00" },
  };
  assert.equal(m.isCheckInOverdue(auckland, "2026-10-13", boundary), true);
  // Legacy 23:59 keeps the day open almost until midnight.
  const legacy = { region: { timeZone: "Europe/Vienna" } };
  assert.equal(m.isCheckInOverdue(legacy, "2026-10-13", boundary), false);
});

test("working hours validation catches bad ranges and empty weeks", () => {
  const ok = [
    {
      weekday: 0,
      ranges: [
        { start: "09:00", end: "12:00" },
        { start: "14:00", end: "18:00" },
      ],
    },
  ];
  assert.deepEqual(m.validateWorkingHours(ok), { days: {} });
  const flipped = [{ weekday: 0, ranges: [{ start: "18:00", end: "09:00" }] }];
  assert.equal(
    m.validateWorkingHours(flipped).days[0],
    "End must be after start.",
  );
  const overlap = [
    {
      weekday: 0,
      ranges: [
        { start: "09:00", end: "13:00" },
        { start: "12:00", end: "15:00" },
      ],
    },
  ];
  assert.equal(
    m.validateWorkingHours(overlap).days[0],
    "Ranges must not overlap.",
  );
  const adjacent = [
    {
      weekday: 0,
      ranges: [
        { start: "09:00", end: "12:00" },
        { start: "12:00", end: "15:00" },
      ],
    },
  ];
  assert.deepEqual(m.validateWorkingHours(adjacent), { days: {} });
  assert.equal(
    m.validateWorkingHours([]).week,
    "Add at least one working day.",
  );
});

test("isWithinWorkingHours and working-day feedback count zone windows", () => {
  const hours = [
    { weekday: 0, ranges: [{ start: "09:00", end: "18:00" }] }, // Monday
    { weekday: 2, ranges: [{ start: "09:00", end: "12:00" }] }, // Wednesday
  ];
  const zone = "Europe/Vienna";
  // Monday 2026-10-12 10:00 CEST = 08:00 UTC -> inside; 19:00 -> outside.
  assert.equal(
    m.isWithinWorkingHours(hours, Date.parse("2026-10-12T08:00:00Z"), zone),
    true,
  );
  assert.equal(
    m.isWithinWorkingHours(hours, Date.parse("2026-10-12T17:00:00Z"), zone),
    false,
  );
  // 16 working hours from Monday 10:00 CEST (8h left Mon, 7h Wed morning
  // -> finishes Thursday? no: Mon 8h + Wed 3h + next Mon 5h).
  const due = m.addWorkingHours(
    hours,
    Date.parse("2026-10-12T08:00:00Z"),
    16,
    zone,
  );
  // Mon 09-18 = 9h window, starting 10:00 -> 8h. Wed 09-12 = 3h -> 11h.
  // Next Mon 09-18 needs 5h -> ends next Monday 14:00 CEST = 12:00 UTC.
  assert.equal(new Date(due).toISOString(), "2026-10-19T12:00:00.000Z");
});

test("feedback chip honours 24h/48h/working-days/none", () => {
  const prefs = {
    region: { timeZone: "Europe/Vienna" },
    rules: { feedbackTarget: "48h" },
    workingHours: [0, 1, 2, 3, 4].map((weekday) => ({
      weekday,
      ranges: [{ start: "09:00", end: "18:00" }],
    })),
  };
  const submission = {
    date: "2026-10-11",
    submittedAt: "2026-10-11T16:00:00Z",
  };
  // 47 h still to go at +1h.
  const chip = m.feedbackChipText(
    prefs,
    submission,
    new Date("2026-10-11T17:00:00Z"),
  );
  assert.equal(chip.text, "Reply due in 47 h");
  assert.equal(chip.late, false);
  // Past the target -> late.
  const late = m.feedbackChipText(
    prefs,
    submission,
    new Date("2026-10-13T17:00:00Z"),
  );
  assert.equal(late.text, "Late by 1 h");
  // Working-day target pauses outside hours: Sunday 18:00 CEST + 16 wh
  // -> Mon 7h + Tue 8h + Wed 1h = ends Wed 10:00 CEST = 08:00 UTC.
  const wd = m.feedbackDueAt(
    { ...prefs, rules: { feedbackTarget: "2-working-days" } },
    submission,
  );
  assert.equal(new Date(wd).toISOString(), "2026-10-13T14:00:00.000Z");
  // No target -> no chip.
  assert.equal(
    m.feedbackChipText(
      { ...prefs, rules: { feedbackTarget: "none" } },
      submission,
    ),
    null,
  );
});

test("new-template defaults apply units; existing templates keep theirs", () => {
  const lb = m.newTemplate("t1", { bodyWeightUnit: "lb", loadUnit: "lb" });
  const weight = lb.variants[0].fields.find((f) => f.id === "weight");
  assert.equal(weight.unit, "lb");
  assert.equal(lb.variants[0].training.loadUnit, "lb");
  const kg = m.newTemplate("t2");
  assert.equal(kg.variants[0].fields.find((f) => f.id === "weight").unit, "kg");
  assert.equal(kg.variants[0].training.loadUnit, "kg");
  // Seeded templates are untouched.
  const seed = m.seedState();
  assert.equal(
    seed.templates[0].variants[0].fields.find((f) => f.id === "weight").unit,
    "kg",
  );
});

test("saved replies: absent falls back, empty stays empty, list persists", () => {
  assert.deepEqual(m.savedReplyTexts({}), m.DEFAULT_SAVED_REPLIES);
  assert.deepEqual(m.savedReplyTexts({ savedReplies: [] }), []);
  const custom = {
    savedReplies: [
      { id: "r1", text: "First" },
      { id: "r2", text: "Second" },
    ],
  };
  assert.deepEqual(m.savedReplyTexts(custom), ["First", "Second"]);
  // The guard accepts a stored list and rejects malformed entries.
  const a = m.seedState();
  assert.equal(
    m.isCoachState({
      ...a,
      preferences: { ...a.preferences, savedReplies: [] },
    }),
    true,
  );
});

test("saved replies keep stable identities, even with duplicate text", () => {
  // Legacy fallbacks get fixed ids so composer entries key on identity,
  // not text.
  assert.deepEqual(
    m.savedReplies({}).map((r) => r.id),
    ["reply-default-1", "reply-default-2", "reply-default-3"],
  );
  // Two replies with identical text stay independently selectable.
  const dup = {
    savedReplies: [
      { id: "a", text: "Same text" },
      { id: "b", text: "Same text" },
    ],
  };
  const ids = m.savedReplies(dup).map((r) => r.id);
  assert.deepEqual(ids, ["a", "b"]);
  assert.equal(new Set(ids).size, 2);
});

test("working hours: a range inside a spring gap contributes zero", () => {
  const zone = "America/New_York";
  // Sunday 2026-03-08: 02:00–03:00 does not exist (spring forward).
  const sunGapOnly = [
    { weekday: 6, ranges: [{ start: "02:00", end: "03:00" }] },
    { weekday: 0, ranges: [{ start: "09:00", end: "10:00" }] },
  ];
  // One working hour from Friday 17:00 EST cannot be earned inside the
  // missing window, so it lands on Monday.
  const done = m.addWorkingHours(
    sunGapOnly,
    Date.parse("2026-03-06T22:00:00Z"),
    1,
    zone,
  );
  assert.equal(new Date(done).toISOString(), "2026-03-09T14:00:00.000Z");
  // A window crossing the transition counts only real elapsed time:
  // Sunday 01:00–04:00 covers two actual hours, so three working hours
  // spill one hour into Monday.
  const crossing = [
    { weekday: 6, ranges: [{ start: "01:00", end: "04:00" }] },
    { weekday: 0, ranges: [{ start: "09:00", end: "12:00" }] },
  ];
  const done2 = m.addWorkingHours(
    crossing,
    Date.parse("2026-03-08T05:30:00Z"), // 00:30 EST Sunday
    3,
    zone,
  );
  assert.equal(new Date(done2).toISOString(), "2026-03-09T14:00:00.000Z");
  // Split ranges either side of the gap both earn their real minutes.
  const split = [
    {
      weekday: 6,
      ranges: [
        { start: "01:00", end: "02:00" },
        { start: "03:00", end: "05:00" },
      ],
    },
  ];
  const done3 = m.addWorkingHours(
    split,
    Date.parse("2026-03-08T05:30:00Z"),
    3,
    zone,
  );
  assert.equal(new Date(done3).toISOString(), "2026-03-08T09:00:00.000Z");
});

test("athlete availability note migrates only a changed legacy value", () => {
  assert.equal(
    m.athleteAvailabilityNote({ availability: "Weekdays · 09:00–18:00" }),
    "",
  );
  assert.equal(
    m.athleteAvailabilityNote({ availability: "Replies within a day" }),
    "Replies within a day",
  );
  assert.equal(
    m.athleteAvailabilityNote({
      availability: "custom",
      availabilityNote: "note wins",
    }),
    "note wins",
  );
});

test("working hours summary groups consecutive matching days", () => {
  const hours = [
    { weekday: 0, ranges: [{ start: "09:00", end: "18:00" }] },
    { weekday: 1, ranges: [{ start: "09:00", end: "18:00" }] },
    { weekday: 2, ranges: [{ start: "09:00", end: "18:00" }] },
    { weekday: 3, ranges: [{ start: "09:00", end: "18:00" }] },
    { weekday: 4, ranges: [{ start: "09:00", end: "18:00" }] },
    { weekday: 5, ranges: [{ start: "10:00", end: "12:00" }] },
  ];
  assert.equal(
    m.workingHoursSummary(hours, "24"),
    "Mon to Fri, 09:00 to 18:00 · Sat, 10:00 to 12:00",
  );
  assert.equal(
    m.workingHoursSummary(hours, "12"),
    "Mon to Fri, 9:00 AM to 6:00 PM · Sat, 10:00 AM to 12:00 PM",
  );
});

// ── Phase 1c — vacations, check-in moves, away messages ──────────────────────
const fmtGB = (d, o) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...o }).format(
    new Date(`${d}T12:00:00Z`),
  );
const vacState = () => {
  const s = m.seedState();
  s.preferences.vacations = [
    { id: "v1", start: "2026-11-16", end: "2026-11-20", label: "Break" },
  ];
  return s;
};

test("vacationFor covers inclusive bounds only", () => {
  const prefs = vacState().preferences;
  assert.equal(m.vacationFor(prefs, "2026-11-15"), undefined);
  assert.equal(m.vacationFor(prefs, "2026-11-16")?.id, "v1");
  assert.equal(m.vacationFor(prefs, "2026-11-20")?.id, "v1");
  assert.equal(m.vacationFor(prefs, "2026-11-21"), undefined);
});

test("first working day back and last working day before respect the hours", () => {
  const prefs = vacState().preferences; // default Mon–Fri
  assert.equal(
    vacations.vacationBackDay(prefs, { end: "2026-11-20" }),
    "2026-11-23",
  );
  assert.equal(
    vacations.vacationBackDay(prefs, { end: "2026-11-22" }),
    "2026-11-23",
  );
  assert.equal(
    vacations.lastWorkingDayBefore(prefs, "2026-11-16"),
    "2026-11-13",
  );
  prefs.workingHours = [
    { weekday: 2, ranges: [{ start: "09:00", end: "17:00" }] },
  ]; // Wednesdays only
  assert.equal(
    vacations.vacationBackDay(prefs, { end: "2026-11-20" }),
    "2026-11-25",
  );
});

test("affectedCheckIns lists only in-range events and flags submitted ones", () => {
  const s = vacState();
  const inRange = vacations.affectedCheckIns(
    s,
    "2026-11-16",
    "2026-11-20",
    new Date("2026-11-13T12:00:00Z"),
  );
  assert.ok(inRange.length > 0);
  for (const { event } of inRange) {
    assert.ok(event.date >= "2026-11-16" && event.date <= "2026-11-20");
    assert.equal(
      !!event.submission,
      inRange.find((r) => r.event.id === event.id).submitted,
    );
  }
  const before = s.submissions.length;
  // Seed a submission on one in-range event: it is flagged, never moved.
  const target = inRange.find((r) => !r.submitted).event;
  s.submissions.push({
    id: "sub-test",
    eventId: target.id,
    clientId: target.clientId,
    date: target.date,
    type: "Full",
    submittedAt: "2026-11-18T08:00:00",
    note: "",
    metrics: {},
    media: [],
  });
  const again = vacations.affectedCheckIns(
    s,
    "2026-11-16",
    "2026-11-20",
    new Date("2026-11-13T12:00:00Z"),
  );
  assert.equal(again.find((r) => r.event.id === target.id).submitted, true);
  assert.equal(s.submissions.length, before + 1);
});

test("moves keep event ids, show movedFrom and respect range boundaries", () => {
  const s = vacState();
  const ev = m
    .eventsBetween(
      s,
      "2026-11-16",
      "2026-11-20",
      new Date("2026-11-13T12:00:00Z"),
    )
    .find((e) => e.date === "2026-11-16");
  assert.ok(ev, "demo seed has a Mon 16 Nov check-in");
  s.checkInMoves = [
    {
      eventId: ev.id,
      clientId: ev.clientId,
      from: "2026-11-16",
      to: "2026-11-23",
      vacationId: "v1",
    },
  ];
  const onDay = m.eventsBetween(
    s,
    "2026-11-16",
    "2026-11-16",
    new Date("2026-11-13T12:00:00Z"),
  );
  assert.equal(
    onDay.some((e) => e.id === ev.id),
    false,
  ); // left its day
  const dest = m.eventsBetween(
    s,
    "2026-11-23",
    "2026-11-23",
    new Date("2026-11-13T12:00:00Z"),
  );
  const moved = dest.find((e) => e.id === ev.id);
  assert.equal(moved.date, "2026-11-23");
  assert.equal(moved.movedFrom, "2026-11-16");
  assert.equal(moved.movedByVacation, "v1");
  // A move INTO the queried range from outside it is included.
  s.checkInMoves = [
    {
      eventId: ev.id,
      clientId: ev.clientId,
      from: "2026-11-16",
      to: "2026-11-14",
      vacationId: "v1",
    },
  ];
  const into = m.eventsBetween(
    s,
    "2026-11-14",
    "2026-11-14",
    new Date("2026-11-13T12:00:00Z"),
  );
  assert.equal(into.find((e) => e.id === ev.id)?.date, "2026-11-14");
  // to:null skips the occurrence entirely.
  s.checkInMoves = [
    {
      eventId: ev.id,
      clientId: ev.clientId,
      from: "2026-11-16",
      to: null,
      vacationId: "v1",
    },
  ];
  const all = m.eventsBetween(
    s,
    "2026-11-10",
    "2026-11-30",
    new Date("2026-11-13T12:00:00Z"),
  );
  assert.equal(
    all.some((e) => e.id === ev.id),
    false,
  );
});

test("a submission still attaches to its moved event; submitted events never move", () => {
  const s = vacState();
  const ev = m
    .eventsBetween(
      s,
      "2026-11-16",
      "2026-11-20",
      new Date("2026-11-13T12:00:00Z"),
    )
    .find((e) => e.date === "2026-11-16");
  s.checkInMoves = [
    {
      eventId: ev.id,
      clientId: ev.clientId,
      from: "2026-11-16",
      to: "2026-11-23",
      vacationId: "v1",
    },
  ];
  s.submissions.push({
    id: "sub-moved",
    eventId: ev.id,
    clientId: ev.clientId,
    date: "2026-11-23",
    type: "Full",
    submittedAt: "2026-11-23T09:00:00",
    note: "",
    metrics: {},
    media: [],
  });
  const moved = m
    .eventsBetween(
      s,
      "2026-11-23",
      "2026-11-23",
      new Date("2026-11-23T10:00:00Z"),
    )
    .find((e) => e.id === ev.id);
  assert.equal(moved.submission?.id, "sub-moved");
  assert.equal(moved.status, "Awaiting feedback");
  // A move record pointing at an already-submitted occurrence is inert.
  const s2 = vacState();
  const ev2 = m
    .eventsBetween(
      s2,
      "2026-11-16",
      "2026-11-20",
      new Date("2026-11-13T12:00:00Z"),
    )
    .find((e) => e.date === "2026-11-17" || e.date === "2026-11-16");
  s2.submissions.push({
    id: "sub-early",
    eventId: ev2.id,
    clientId: ev2.clientId,
    date: ev2.date,
    type: "Full",
    submittedAt: "2026-11-17T09:00:00",
    note: "",
    metrics: {},
    media: [],
  });
  s2.checkInMoves = [
    {
      eventId: ev2.id,
      clientId: ev2.clientId,
      from: ev2.date,
      to: "2026-11-24",
      vacationId: "v1",
    },
  ];
  const stayed = m
    .eventsBetween(s2, ev2.date, ev2.date, new Date("2026-11-13T12:00:00Z"))
    .find((e) => e.id === ev2.id);
  assert.equal(stayed.date, ev2.date);
  assert.equal(stayed.movedFrom, undefined);
  // It also does not appear on the stale move's destination.
  assert.equal(
    m
      .eventsBetween(
        s2,
        "2026-11-24",
        "2026-11-24",
        new Date("2026-11-13T12:00:00Z"),
      )
      .some((e) => e.id === ev2.id),
    false,
  );
});

test("moveClashes blocks occupied destinations and proposals onto one day", () => {
  const s = vacState();
  const now = new Date("2026-11-13T12:00:00Z");
  const ev = m
    .eventsBetween(s, "2026-11-16", "2026-11-20", now)
    .find((e) => e.date === "2026-11-16");
  // Another check-in already lives on the destination for this client.
  const occupied = m
    .eventsBetween(s, "2026-11-23", "2026-11-27", now)
    .find((e) => e.clientId === ev.clientId);
  const clashes = vacations.moveClashes(
    s,
    [{ event: ev, to: occupied.date }],
    fmtGB,
    now,
  );
  assert.match(clashes.get(ev.id) ?? "", /Already has a check-in/);
  // Two proposals for the same client onto the same day clash with each other.
  const sameDay = m
    .eventsBetween(s, "2026-11-16", "2026-11-20", now)
    .filter((e) => e.clientId === ev.clientId);
  if (sameDay.length > 1) {
    const duo = vacations.moveClashes(
      s,
      sameDay.slice(0, 2).map((event) => ({ event, to: "2026-12-01" })),
      fmtGB,
      now,
    );
    assert.match(duo.get(sameDay[1].id) ?? "", /Two check-ins/);
  }
  // A free destination reports nothing.
  const free = vacations.moveClashes(
    s,
    [{ event: ev, to: "2026-12-24" }],
    fmtGB,
    now,
  );
  assert.equal(free.size, 0);
});

test("undoVacationSave reverts only that save's record, moves and notices", () => {
  const s = vacState();
  const savedVacation = s.preferences.vacations[0];
  const savedMove = {
    eventId: "recurring:c1:2026-11-16",
    clientId: "c1",
    from: "2026-11-16",
    to: "2026-11-23",
    vacationId: "v1",
  };
  s.checkInMoves = [
    savedMove,
    {
      eventId: "recurring:c1:2026-11-23",
      clientId: "c1",
      from: "2026-11-23",
      to: "2026-11-25",
      vacationId: "v2",
    },
  ];
  s.messages.push(
    {
      id: "n1",
      clientId: "c1",
      text: "rescheduling notice",
      from: "coach",
      date: "2026-11-17",
      read: false,
      priority: false,
      attachments: [],
      vacationId: "v1",
    },
    {
      id: "am2",
      clientId: "c1",
      text: "later note",
      from: "coach",
      date: "2026-11-18",
      read: false,
      priority: false,
      attachments: [],
    },
  );
  const undone = vacations.undoVacationSave(s, {
    vacation: savedVacation,
    savedMoves: [savedMove],
    priorMoves: [],
    messageIds: new Set(["n1"]),
  });
  // Undo-of-add removes the record it wrote; another vacation's move and
  // later messages stay.
  assert.equal(undone.preferences.vacations.length, 0);
  assert.deepEqual(
    undone.checkInMoves.map((mv) => mv.vacationId),
    ["v2"],
  );
  assert.equal(
    undone.messages.some((msg) => msg.id === "n1"),
    false,
  );
  assert.ok(undone.messages.some((msg) => msg.id === "am2"));
  assert.ok(undone.messages.some((msg) => msg.id === "seed-coach-0"));
  // The original state is untouched (pure).
  assert.equal(s.checkInMoves.length, 2);
});

test("undo preserves a later inline reschedule and automatic reply", () => {
  const s = vacState();
  const savedVacation = s.preferences.vacations[0];
  const savedMove = {
    eventId: "recurring:c1:2026-11-16",
    clientId: "c1",
    from: "2026-11-16",
    to: "2026-11-23",
    vacationId: "v1",
  };
  s.checkInMoves = [
    {
      ...savedMove,
      to: "2026-11-24", // a later inline reschedule, same vacation id
    },
    {
      eventId: "recurring:c1:2026-11-17",
      clientId: "c1",
      from: "2026-11-17",
      to: "2026-11-25",
      vacationId: "v1",
    },
  ];
  s.messages.push(
    {
      id: "n1",
      clientId: "c1",
      text: "rescheduling notice",
      from: "coach",
      date: "2026-11-14",
      read: false,
      priority: false,
      attachments: [],
      vacationId: "v1",
    },
    {
      id: "ar1",
      clientId: "c1",
      text: "auto reply",
      from: "coach",
      date: "2026-11-16",
      read: false,
      priority: false,
      attachments: [],
      auto: "vacation",
      vacationId: "v1",
    },
  );
  const undone = vacations.undoVacationSave(s, {
    vacation: savedVacation,
    savedMoves: [savedMove],
    priorMoves: [],
    messageIds: new Set(["n1"]),
  });
  // The vacation record goes, but the later reschedules (even tagged with
  // the same vacation id) and the auto-reply all survive; only the exact
  // notice this save created is removed.
  assert.equal(undone.preferences.vacations.length, 0);
  assert.equal(undone.checkInMoves.length, 2);
  assert.equal(
    undone.checkInMoves.find((mv) => mv.eventId === "recurring:c1:2026-11-16")
      .to,
    "2026-11-24",
  );
  assert.equal(
    undone.messages.some((msg) => msg.id === "n1"),
    false,
  );
  assert.ok(undone.messages.some((msg) => msg.id === "ar1"));
});

test("undo of an edit restores the prior record and replaced moves", () => {
  const s = vacState();
  const priorVacation = s.preferences.vacations[0];
  const savedVacation = { ...priorVacation, end: "2026-11-19" };
  s.preferences.vacations = [savedVacation];
  const priorMove = {
    eventId: "e1",
    clientId: "c1",
    from: "2026-11-17",
    to: "2026-11-23",
    vacationId: "v1",
  };
  const savedMove = { ...priorMove, to: "2026-11-24" };
  s.checkInMoves = [savedMove];
  const undone = vacations.undoVacationSave(s, {
    vacation: savedVacation,
    priorVacation,
    savedMoves: [savedMove],
    priorMoves: [priorMove],
  });
  assert.equal(undone.preferences.vacations[0].end, "2026-11-20");
  assert.equal(
    undone.checkInMoves.find((mv) => mv.eventId === "e1").to,
    "2026-11-23",
  );
});

test("undo leaves the record alone when it was edited after the save", () => {
  const s = vacState();
  const savedVacation = s.preferences.vacations[0];
  s.preferences.vacations = [{ ...savedVacation, label: "edited later" }];
  const undone = vacations.undoVacationSave(s, {
    vacation: savedVacation,
    savedMoves: [],
    priorMoves: [],
  });
  assert.equal(undone.preferences.vacations[0].label, "edited later");
});

test("submissions file against moved recurring and extra occurrences", () => {
  const s = vacState();
  const now = new Date("2026-11-13T12:00:00Z");
  const ev = m
    .eventsBetween(s, "2026-11-16", "2026-11-20", now)
    .find((e) => e.date === "2026-11-16");
  s.checkInMoves = [
    {
      eventId: ev.id,
      clientId: ev.clientId,
      from: "2026-11-16",
      to: "2026-11-23",
      vacationId: "v1",
    },
  ];
  s.submissions.push({
    id: "sub-m1",
    eventId: ev.id,
    clientId: ev.clientId,
    date: "2026-11-23",
    type: "Full",
    submittedAt: "2026-11-23T09:00:00",
    note: "",
    metrics: {},
    media: [],
  });
  const shown = m
    .eventsBetween(
      s,
      "2026-11-23",
      "2026-11-23",
      new Date("2026-11-23T10:00:00Z"),
    )
    .find((e) => e.id === ev.id);
  assert.equal(shown.submission.id, "sub-m1");
  assert.equal(shown.date, "2026-11-23");
  assert.equal(shown.status, "Awaiting feedback");
  // The following occurrence for that client is untouched.
  const nextWeek = m
    .eventsBetween(s, "2026-11-30", "2026-12-04", now)
    .filter((e) => e.clientId === ev.clientId);
  assert.equal(
    nextWeek.every((e) => e.movedFrom === undefined),
    true,
  );
  // Extras move through the same path: an extra on a vacation day moved to
  // a clear date links its submission by stable id.
  s.extras.push({
    id: "extra-mv",
    clientId: ev.clientId,
    date: "2026-11-18",
    type: "Full",
    note: "",
  });
  s.checkInMoves.push({
    eventId: "extra-mv",
    clientId: ev.clientId,
    from: "2026-11-18",
    to: "2026-11-25",
    vacationId: "v1",
  });
  s.submissions.push({
    id: "sub-x1",
    eventId: "extra-mv",
    clientId: ev.clientId,
    date: "2026-11-25",
    type: "Full",
    submittedAt: "2026-11-25T09:00:00",
    note: "",
    metrics: {},
    media: [],
  });
  const extra = m
    .eventsBetween(
      s,
      "2026-11-25",
      "2026-11-25",
      new Date("2026-11-25T10:00:00Z"),
    )
    .find((e) => e.id === "extra-mv");
  assert.equal(extra.submission.id, "sub-x1");
  assert.equal(extra.date, "2026-11-25");
});

test("the away reply resolves on the coach day across zone boundaries", () => {
  const s = vacState();
  s.preferences.vacations[0].autoMessage = {
    enabled: true,
    text: "Away {start}-{end}, back {return}.",
  };
  // Same instant: still the vacation's last day in Vienna but the next
  // day in Karachi — the reply follows the configured (coach) zone.
  const instant = new Date("2026-11-20T22:30:00Z");
  assert.equal(m.zonedToday("Europe/Vienna", instant), "2026-11-20");
  assert.equal(m.zonedToday("Asia/Karachi", instant), "2026-11-21");
  const coachDay = m.zonedToday(m.resolvedTimeZone(s.preferences), instant);
  assert.equal(coachDay, "2026-11-20");
  const reply = vacations.vacationAutoReply(s, "client-002", coachDay, fmtGB);
  assert.equal(reply.auto, "vacation");
  // A browser day outside the range does not fire even while inside it
  // locally, and once past the end the reply stops.
  s.messages.push(reply);
  assert.equal(
    vacations.vacationAutoReply(s, "client-002", "2026-11-21", fmtGB),
    null,
  );
});

test("the away reply fires once per conversation per vacation, filled dates", () => {
  const s = vacState();
  s.preferences.vacations[0].autoMessage = {
    enabled: true,
    text: "Away {start}–{end}, back {return}.",
  };
  const first = vacations.vacationAutoReply(
    s,
    "client-002",
    "2026-11-17",
    fmtGB,
  );
  assert.equal(first.auto, "vacation");
  assert.equal(first.vacationId, "v1");
  assert.equal(first.from, "coach");
  assert.match(first.text, /Away Mon 16 Nov/);
  assert.match(first.text, /Fri 20 Nov/);
  assert.match(first.text, /back Mon 23 Nov/);
  s.messages.push(first);
  // Second athlete message in the same vacation: no second reply.
  assert.equal(
    vacations.vacationAutoReply(s, "client-002", "2026-11-18", fmtGB),
    null,
  );
  // Another athlete's conversation gets its own copy.
  assert.equal(
    vacations.vacationAutoReply(s, "client-003", "2026-11-18", fmtGB)
      ?.vacationId,
    "v1",
  );
  // A second vacation is a fresh allowance.
  s.preferences.vacations.push({
    id: "v2",
    start: "2026-12-21",
    end: "2026-12-25",
    autoMessage: { enabled: true, text: "Away {start}–{end}, back {return}." },
  });
  assert.equal(
    vacations.vacationAutoReply(s, "client-002", "2026-12-22", fmtGB)
      ?.vacationId,
    "v2",
  );
  // Disabled template and days outside the vacation send nothing.
  s.preferences.vacations[0].autoMessage.enabled = false;
  assert.equal(
    vacations.vacationAutoReply(s, "client-002", "2026-11-19", fmtGB),
    null,
  );
});

test("auto replies stay deduplicated after a save/reload round-trip", () => {
  const s = vacState();
  s.preferences.vacations[0].autoMessage = {
    enabled: true,
    text: "Away {start}–{end}, back {return}.",
  };
  s.messages.push(
    vacations.vacationAutoReply(s, "client-002", "2026-11-17", fmtGB),
  );
  const reloaded = JSON.parse(JSON.stringify(s));
  assert.equal(m.isCoachState(reloaded), true);
  assert.equal(
    vacations.vacationAutoReply(reloaded, "client-002", "2026-11-18", fmtGB),
    null,
  );
});

test("reschedulingMessages sends one coach note per affected athlete", () => {
  const s = vacState();
  const vac = s.preferences.vacations[0];
  const now = new Date("2026-11-13T12:00:00Z");
  const pair = m
    .eventsBetween(s, "2026-11-16", "2026-11-20", now)
    .filter((e) => e.clientId === "client-002")
    .slice(0, 2);
  const proposals = [
    { event: pair[0], to: "2026-11-23" },
    ...(pair[1] ? [{ event: pair[1], to: null }] : []),
  ];
  const msgs = vacations.reschedulingMessages(
    s,
    vac,
    proposals,
    fmtGB,
    "2026-11-13",
  );
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].clientId, "client-002");
  assert.equal(msgs[0].vacationId, "v1");
  assert.equal(msgs[0].auto, undefined);
  assert.match(msgs[0].text, /moves to Mon 23 Nov/);
  if (pair[1]) assert.match(msgs[0].text, /is skipped while I'm away/);
});

test("vacation and move preference shapes validate; bad data is rejected", () => {
  const s = vacState();
  s.checkInMoves = [
    {
      eventId: "e1",
      clientId: "c1",
      from: "2026-11-16",
      to: "2026-11-23",
      vacationId: "v1",
    },
  ];
  s.messages.push({
    id: "a1",
    clientId: "c1",
    text: "x",
    from: "coach",
    date: "2026-11-17",
    read: false,
    priority: false,
    attachments: [],
    auto: "vacation",
    vacationId: "v1",
  });
  assert.equal(m.isCoachState(JSON.parse(JSON.stringify(s))), true);
  const badVac = JSON.parse(JSON.stringify(s));
  badVac.preferences.vacations = [{ id: "v9", start: "16 Nov" }];
  assert.equal(m.isCoachState(badVac), false);
  const badMove = JSON.parse(JSON.stringify(s));
  badMove.checkInMoves = [{ eventId: "e1", to: "2026-11-23" }];
  assert.equal(m.isCoachState(badMove), false);
  const badMsg = JSON.parse(JSON.stringify(s));
  badMsg.messages[badMsg.messages.length - 1].auto = "spam";
  assert.equal(m.isCoachState(badMsg), false);
});

test("vacation days pause the feedback target", () => {
  const s = vacState();
  s.preferences.rules = { feedbackTarget: "24h" };
  const submission = {
    date: "2026-11-16",
    submittedAt: "2026-11-16T10:00:00",
  };
  const paused = m.feedbackDueAt(s.preferences, submission);
  const plain = m.feedbackDueAt(
    { ...s.preferences, vacations: [] },
    submission,
  );
  // The 5-day vacation starting the same day pushes the due instant out by
  // roughly five days versus the uninterrupted target.
  assert.ok(paused - plain >= 4 * 86_400_000);
});

test("a rejected blank reply remounts only its own field", () => {
  // The restore key drives each CommittedInput's remount: bumping one
  // reply must change only that reply's key — every other row keeps its
  // component, its uncommitted draft and its focus.
  let ticks = {};
  const before = {
    r1: replies.replyInputKey("r1", ticks),
    r2: replies.replyInputKey("r2", ticks),
    r3: replies.replyInputKey("r3", ticks),
  };
  ticks = replies.bumpReplyRestore(ticks, "r1");
  assert.notEqual(replies.replyInputKey("r1", ticks), before.r1);
  assert.equal(replies.replyInputKey("r2", ticks), before.r2);
  assert.equal(replies.replyInputKey("r3", ticks), before.r3);
  // A second rejection on a different reply still leaves r3 alone.
  ticks = replies.bumpReplyRestore(ticks, "r2");
  assert.equal(replies.replyInputKey("r3", ticks), before.r3);
});

test("a blank picked date stays an invalid proposal, never keep", () => {
  const s = vacState();
  // "" is the in-progress UI value: proposedDate surfaces it verbatim so
  // the row and the editor can demand a real date. Normalizing it to
  // "keep" would silently treat an unpicked date as Keep, and passing it
  // to clash checks or writes would corrupt the schedule.
  assert.equal(
    vacations.proposedDate(
      { choice: "date", date: "" },
      {},
      { start: "2026-11-16", end: "2026-11-20" },
      s.preferences,
    ),
    "",
  );
});
